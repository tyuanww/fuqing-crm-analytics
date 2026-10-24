from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, contextmanager
from dataclasses import asdict, replace
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import duckdb
from fastapi import HTTPException
import pytest

from backend.contracts.crm_analysis import CrmSaveAnalysis, CrmSnapshotRequest
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.asset_state import now_ms
from backend.services.crm_analysis import CrmAnalysisStore, canonical, digest
from backend.services.crm_native_snapshot_source import (
    NativeCrmIdentity, NativeCrmLease, NativeCrmSnapshotSource,
)
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def source_case(tmp_path):
    assets = tmp_path / "assets"
    refs = tmp_path / "refs"
    assets.mkdir(mode=0o700)
    refs.mkdir(mode=0o700)
    store = CrmAnalysisStore(assets, "synthetic")
    with duckdb.connect(":memory:") as con:
        con.execute("""CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, actual_amount DOUBLE,
            channel VARCHAR, pay_time TIMESTAMP, is_refund BOOLEAN, is_goujinjin BOOLEAN, order_status VARCHAR)""")
        con.execute("INSERT INTO orders VALUES ('order1','user1',80.01,'货架','2026-01-01',false,false,'交易成功')")
        filters = CrmSnapshotRequest(start_date="2026-01-01", end_date="2026-01-02")
        snapshot = store.capture("alice", "source-fixture", filters, lambda value: query_dashboard_purchases(con, value))
    clock = {"now": now_ms()}
    identity = NativeCrmIdentity("alice", "native_session_1", "connection_1", clock["now"] + 10000, "synthetic")
    state = {"identity": identity, "connected": True}

    def provider():
        current = state["identity"]
        if current is None:
            return None
        return NativeCrmLease(current, lambda: state["connected"] and state["identity"] == current)

    source = NativeCrmSnapshotSource.create(directory=refs, store=store, provider=provider, clock=lambda: clock["now"])
    return source, store, snapshot, state, clock, provider


def reopen(source_case):
    source, store, _, _, clock, provider = source_case
    return NativeCrmSnapshotSource(directory=source.directory, store=store, provider=provider, clock=lambda: clock["now"])


def assert_code(code, action):
    with pytest.raises(AnalyticsError) as failure:
        action()
    assert failure.value.code == code


def test_source_rereads_actual_owned_snapshot_without_copying_numbers(source_case):
    source, store, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    assert source.register(snapshot.snapshot_id) == ref
    assert source.read(ref.ref_id) == snapshot
    assert snapshot.result.gsv_amount_fen == 8001
    changed = source.read(ref.ref_id)
    changed.result.gsv_amount_fen = -1
    assert reopen(source_case).read(ref.ref_id).result.gsv_amount_fen == 8001
    assert store.read_owned_snapshot("alice", snapshot.snapshot_id) == snapshot
    with closing(sqlite3.connect(source.path)) as con:
        rows = con.execute("SELECT payload FROM refs").fetchall()
        assert len(rows) == 1
        assert json.loads(rows[0][0]) == asdict(ref)
        assert "gsv_amount_fen" not in rows[0][0]
        assert "rows" not in rows[0][0]
        assert dict(con.execute("SELECT key,value FROM metadata"))["data_kind"] == "synthetic"
        assert "finite_mock" not in dict(con.execute("SELECT key,value FROM metadata"))


def test_shared_snapshot_is_readable_by_existing_api_but_not_native_source(source_case):
    source, store, snapshot, state, _, _ = source_case
    analysis = store.save("alice", "save", CrmSaveAnalysis(snapshot_id=snapshot.snapshot_id, title="销售分析"))
    store.share("alice", "share", analysis.analysis_id, "bob", known=lambda value: value == "bob")
    assert store.read("bob", "snapshot", snapshot.snapshot_id) == snapshot
    with pytest.raises(HTTPException) as denied:
        store.read_owned_snapshot("bob", snapshot.snapshot_id)
    assert denied.value.status_code == 404
    state["identity"] = replace(state["identity"], username="bob")
    assert_code("NOT_FOUND", lambda: source.register(snapshot.snapshot_id))


@pytest.mark.parametrize("change", ["username", "native_session_id", "connection_generation"])
def test_reference_cannot_move_to_another_account_session_or_connection(source_case, change):
    source, _, snapshot, state, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    state["identity"] = replace(state["identity"], **{change: "other"})
    assert_code("NOT_FOUND", lambda: source.read(ref.ref_id))


@pytest.mark.parametrize("operation", ["register", "read", "revoke"])
@pytest.mark.parametrize("condition", ["disconnected", "missing_identity", "expired", "missing_provider"])
def test_each_operation_requires_a_current_trusted_lease(source_case, operation, condition):
    source, _, snapshot, state, clock, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    if condition == "disconnected":
        state["connected"] = False
    elif condition == "missing_identity":
        state["identity"] = None
    elif condition == "expired":
        clock["now"] = state["identity"].expires_at_ms
    else:
        source.provider = None
    argument = snapshot.snapshot_id if operation == "register" else ref.ref_id
    assert_code("IDENTITY_UNAVAILABLE" if condition == "missing_provider" else "UNAUTHENTICATED",
                lambda: getattr(source, operation)(argument))


def test_provider_failure_never_exposes_its_message(source_case):
    source, _, snapshot, _, _, _ = source_case

    def broken():
        raise AnalyticsError(403, "FORBIDDEN", "credential-sentinel")

    source.provider = broken
    with pytest.raises(AnalyticsError) as failure:
        source.register(snapshot.snapshot_id)
    assert failure.value.code == "IDENTITY_UNAVAILABLE"
    assert "credential-sentinel" not in failure.value.message


def test_email_style_crm_account_keeps_its_exact_identity(source_case):
    source, store, snapshot, state, _, _ = source_case
    username = "ops@example.test"
    other = store.capture(username, "email-owner", snapshot.result.filters, lambda value: snapshot.result)
    state["identity"] = replace(state["identity"], username=username)
    ref = source.register(other.snapshot_id)
    assert ref.identity.username == username
    assert source.read(ref.ref_id) == other


def test_late_current_check_failure_uses_a_safe_error(source_case):
    source, _, snapshot, state, _, _ = source_case
    calls = {"count": 0}

    def current():
        calls["count"] += 1
        if calls["count"] >= 2:
            raise RuntimeError("credential-sentinel")
        return True

    source.provider = lambda: NativeCrmLease(state["identity"], current)
    with pytest.raises(AnalyticsError) as failure:
        source.register(snapshot.snapshot_id)
    assert failure.value.code == "IDENTITY_UNAVAILABLE"
    assert "credential-sentinel" not in failure.value.message
    with closing(sqlite3.connect(source.path)) as con:
        assert con.execute("SELECT count(*) FROM refs").fetchone()[0] == 0


@pytest.mark.parametrize("operation", ["register", "read"])
def test_late_identity_change_drops_result_and_rolls_back_registration(source_case, monkeypatch, operation):
    source, store, snapshot, state, _, _ = source_case
    ref = source.register(snapshot.snapshot_id) if operation == "read" else None
    original = store.read_owned_snapshot

    def changed(owner, snapshot_id):
        result = original(owner, snapshot_id)
        state["identity"] = replace(state["identity"], connection_generation="replacement")
        return result

    monkeypatch.setattr(store, "read_owned_snapshot", changed)
    argument = ref.ref_id if ref else snapshot.snapshot_id
    assert_code("UNAUTHENTICATED", lambda: getattr(source, operation)(argument))
    with closing(sqlite3.connect(source.path)) as con:
        assert con.execute("SELECT count(*) FROM refs").fetchone()[0] == (1 if ref else 0)


def test_revocation_survives_restart_and_same_grant_reregistration(source_case):
    source, _, snapshot, state, _, _ = source_case
    old = source.register(snapshot.snapshot_id)
    reopen(source_case).revoke(old.ref_id)
    source.revoke(old.ref_id)
    assert_code("RESULT_REVOKED", lambda: reopen(source_case).read(old.ref_id))
    assert_code("RESULT_REVOKED", lambda: source.register(snapshot.snapshot_id))
    state["identity"] = replace(state["identity"], connection_generation="new_login")
    new = source.register(snapshot.snapshot_id)
    assert new.ref_id != old.ref_id
    assert source.read(new.ref_id) == snapshot
    source.revoke(old.ref_id)
    assert source.read(new.ref_id) == snapshot
    with closing(sqlite3.connect(source.path)) as con:
        assert con.execute("SELECT count(*) FROM revocations WHERE ref_id=?", (old.ref_id,)).fetchone()[0] == 1


def test_same_grant_cannot_extend_an_existing_reference(source_case):
    source, _, snapshot, state, clock, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    clock["now"] = ref.identity.expires_at_ms
    state["identity"] = replace(state["identity"], expires_at_ms=clock["now"] + 10000)
    assert_code("RESULT_STALE", lambda: source.register(snapshot.snapshot_id))
    assert_code("RESULT_STALE", lambda: source.read(ref.ref_id))


def test_reread_cannot_outlive_the_reference_when_current_lease_was_extended(source_case, monkeypatch):
    source, store, snapshot, state, clock, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    state["identity"] = replace(state["identity"], expires_at_ms=ref.identity.expires_at_ms + 10000)
    clock["now"] = ref.identity.expires_at_ms - 1
    original = store.read_owned_snapshot

    def slow_read(owner, snapshot_id):
        result = original(owner, snapshot_id)
        clock["now"] = ref.identity.expires_at_ms
        return result

    monkeypatch.setattr(store, "read_owned_snapshot", slow_read)
    assert_code("RESULT_STALE", lambda: source.read(ref.ref_id))


def test_source_storage_503_remains_retryable_without_upstream_details(source_case, monkeypatch):
    source, store, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)

    def unavailable(owner, snapshot_id):
        raise HTTPException(503, {"code": "STATE_UNAVAILABLE", "message": "credential-sentinel"})

    monkeypatch.setattr(store, "read_owned_snapshot", unavailable)
    with pytest.raises(AnalyticsError) as failure:
        source.read(ref.ref_id)
    assert failure.value.status == 503
    assert failure.value.retryable is True
    assert "credential-sentinel" not in failure.value.message


@pytest.mark.parametrize("field", ["native_session_id", "connection_generation"])
def test_native_identity_accepts_the_hosts_160_character_boundary(source_case, field):
    source, _, snapshot, state, _, _ = source_case
    state["identity"] = replace(state["identity"], **{field: "s" * 160})
    ref = source.register(snapshot.snapshot_id)
    assert source.read(ref.ref_id) == snapshot


@pytest.mark.parametrize("field", ["native_session_id", "connection_generation"])
def test_native_identity_rejects_161_characters(source_case, field):
    source, _, snapshot, state, _, _ = source_case
    state["identity"] = replace(state["identity"], **{field: "s" * 161})
    assert_code("IDENTITY_UNAVAILABLE", lambda: source.register(snapshot.snapshot_id))


def test_reference_expiring_only_after_transaction_exit_is_not_delivered(source_case, monkeypatch):
    source, _, snapshot, state, clock, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    state["identity"] = replace(state["identity"], expires_at_ms=ref.identity.expires_at_ms + 10000)
    clock["now"] = ref.identity.expires_at_ms - 1
    original = source._state

    @contextmanager
    def expire_on_exit():
        with original() as con:
            yield con
        clock["now"] = ref.identity.expires_at_ms

    monkeypatch.setattr(source, "_state", expire_on_exit)
    assert_code("RESULT_STALE", lambda: source.read(ref.ref_id))


def test_source_checksum_pins_the_whole_snapshot_not_just_numbers(source_case):
    source, store, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    with closing(sqlite3.connect(store.path)) as con:
        row = con.execute("SELECT source,payload FROM assets WHERE id=?", (snapshot.snapshot_id,)).fetchone()
        raw = json.loads(row[1])
        raw["captured_at"] = "2026-01-01T00:00:00+00:00"
        con.execute("UPDATE assets SET payload=?, sha256=? WHERE id=?", (
            canonical(raw), digest(["alice", "snapshot", snapshot.snapshot_id, row[0], raw]), snapshot.snapshot_id,
        ))
        con.commit()
    assert store.read_owned_snapshot("alice", snapshot.snapshot_id).result == snapshot.result
    assert_code("RESULT_STALE", lambda: source.read(ref.ref_id))
    assert_code("RESULT_STALE", lambda: source.register(snapshot.snapshot_id))


@pytest.mark.parametrize("field,value", [("data_kind", "real"), ("expires_at_ms", True), ("username", "bad user")])
def test_incomplete_or_wrong_kind_provider_never_grants_access(source_case, field, value):
    source, _, snapshot, state, _, _ = source_case
    state["identity"] = replace(state["identity"], **{field: value})
    assert_code("IDENTITY_UNAVAILABLE", lambda: source.register(snapshot.snapshot_id))


def test_reference_integrity_and_forged_handle_fail_closed(source_case):
    source, _, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    assert_code("NOT_FOUND", lambda: source.read("crm_ref_" + "0" * 32))
    assert_code("INVALID_REQUEST", lambda: source.read("not a reference"))
    with closing(sqlite3.connect(source.path)) as con:
        con.execute("UPDATE refs SET payload='{}' WHERE ref_id=?", (ref.ref_id,))
        con.commit()
    assert_code("STATE_UNAVAILABLE", lambda: source.read(ref.ref_id))


def test_concurrent_registration_uses_one_reference_across_instances(source_case):
    source, _, snapshot, _, _, _ = source_case
    second = reopen(source_case)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(item.register, snapshot.snapshot_id) for item in (source, second)]
        refs = [item.result() for item in futures]
    assert refs[0] == refs[1]
    second.revoke(refs[0].ref_id)
    assert_code("RESULT_REVOKED", lambda: source.read(refs[0].ref_id))


def test_new_process_rereads_provenance_without_recovering_a_login(source_case):
    source, store, snapshot, state, clock, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    code = """import json,sys
from pathlib import Path
from backend.services.crm_analysis import CrmAnalysisStore
from backend.services.crm_native_snapshot_source import NativeCrmIdentity,NativeCrmLease,NativeCrmSnapshotSource
identity=NativeCrmIdentity(**json.loads(sys.argv[3]))
source=NativeCrmSnapshotSource(directory=Path(sys.argv[1]),store=CrmAnalysisStore(Path(sys.argv[2]),'synthetic'),provider=lambda:NativeCrmLease(identity,lambda:True),clock=lambda:int(sys.argv[5]))
print(source.read(sys.argv[4]).model_dump_json())
"""
    result = subprocess.run([sys.executable, "-c", code, str(source.directory), str(store.directory),
                             json.dumps(asdict(state["identity"])), ref.ref_id, str(clock["now"])],
                            cwd=ROOT, env={"PATH": os.environ["PATH"], "PYTHONPATH": str(ROOT),
                                           "PYTHON_DOTENV_DISABLED": "1"},
                            capture_output=True, text=True, timeout=15, check=True)
    assert json.loads(result.stdout) == snapshot.model_dump(mode="json")
    unbound = NativeCrmSnapshotSource(directory=source.directory, store=store)
    assert_code("IDENTITY_UNAVAILABLE", lambda: unbound.read(ref.ref_id))


@pytest.mark.parametrize("damage", ["missing", "foreign", "permissions", "symlink", "partial"])
def test_open_never_recreates_missing_or_unsafe_state(source_case, tmp_path, damage):
    source, store, _, _, _, provider = source_case
    target = tmp_path / "damaged"
    target.mkdir(mode=0o700)
    path = target / source.path.name
    if damage == "foreign":
        with closing(sqlite3.connect(path)) as con:
            con.execute("CREATE TABLE valuable(value TEXT)")
            con.execute("INSERT INTO valuable VALUES ('keep')")
            con.commit()
        path.chmod(0o600)
    elif damage == "permissions":
        target.chmod(0o755)
    elif damage == "symlink":
        path.symlink_to(source.path)
    elif damage == "partial":
        path.touch(mode=0o600)
    before = path.read_bytes() if path.is_file() else None
    assert_code("STATE_UNAVAILABLE", lambda: NativeCrmSnapshotSource(directory=target, store=store, provider=provider))
    assert path.exists() == (damage in {"foreign", "symlink", "partial"})
    if before is not None:
        assert path.read_bytes() == before


def test_create_cannot_overwrite_existing_revocation_ledger(source_case):
    source, store, snapshot, _, _, provider = source_case
    ref = source.register(snapshot.snapshot_id)
    source.revoke(ref.ref_id)
    with pytest.raises(FileExistsError):
        NativeCrmSnapshotSource.create(directory=source.directory, store=store, provider=provider)
    assert_code("RESULT_REVOKED", lambda: reopen(source_case).read(ref.ref_id))


def test_open_rejects_a_missing_revocation_table(source_case):
    source, _, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    source.revoke(ref.ref_id)
    with closing(sqlite3.connect(source.path)) as con:
        con.execute("DROP TABLE revocations")
        con.commit()
    assert_code("STATE_UNAVAILABLE", lambda: reopen(source_case))


def test_incompatible_revocation_schema_cannot_silently_ignore_a_tombstone(source_case):
    source, _, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    with closing(sqlite3.connect(source.path)) as con:
        con.execute("DROP TABLE revocations")
        con.execute("CREATE TABLE revocations(ref_id TEXT PRIMARY KEY, revoked_at_ms INTEGER CHECK(revoked_at_ms < 0))")
        con.commit()
    assert_code("STATE_UNAVAILABLE", lambda: reopen(source_case))
    assert_code("STATE_UNAVAILABLE", lambda: source.revoke(ref.ref_id))


def test_extra_sqlite_like_named_trigger_cannot_skip_revocation(source_case):
    source, _, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    with closing(sqlite3.connect(source.path)) as con:
        con.execute("""CREATE TRIGGER sqliteX_skip_revoke BEFORE INSERT ON revocations
            BEGIN SELECT RAISE(IGNORE); END""")
        con.commit()
    assert_code("STATE_UNAVAILABLE", lambda: reopen(source_case))
    assert_code("STATE_UNAVAILABLE", lambda: source.revoke(ref.ref_id))


def test_revoke_requires_an_actual_tombstone_when_sqlite_ignores_insert(source_case, monkeypatch):
    source, _, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    original = source._state

    @contextmanager
    def ignoring_insert():
        with original() as con:
            con.set_authorizer(lambda action, table, *args: sqlite3.SQLITE_IGNORE
                               if action == sqlite3.SQLITE_INSERT and table == "revocations" else sqlite3.SQLITE_OK)
            yield con

    monkeypatch.setattr(source, "_state", ignoring_insert)
    assert_code("STATE_UNAVAILABLE", lambda: source.revoke(ref.ref_id))
    assert source.read(ref.ref_id) == snapshot


def test_open_state_is_rechecked_and_lock_contention_fails_safely(source_case):
    source, _, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    with closing(sqlite3.connect(source.path)) as con:
        con.execute("BEGIN IMMEDIATE")
        assert_code("STATE_UNAVAILABLE", lambda: source.read(ref.ref_id))
        con.rollback()
    source.path.chmod(0o644)
    assert_code("STATE_UNAVAILABLE", lambda: source.read(ref.ref_id))
    source.path.chmod(0o600)
    assert source.read(ref.ref_id) == snapshot
