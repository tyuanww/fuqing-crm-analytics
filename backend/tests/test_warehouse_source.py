from dataclasses import replace
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import threading

import duckdb
import pytest

from backend.services.warehouse_source import (
    SourceState, VerifiedWarehouseSource, WarehouseSourceSpec,
    WarehouseSourceUnavailableError,
)


@pytest.fixture
def fixture_source(tmp_path):
    path = tmp_path / "business.duckdb"
    state_dir = tmp_path / "state"
    state_dir.mkdir(mode=0o700)
    with duckdb.connect(str(path)) as conn:
        conn.execute(
            "CREATE TABLE orders (pay_time TIMESTAMP_NS, user_id VARCHAR, "
            "actual_amount DECIMAL(18,2), category VARCHAR, channel VARCHAR, is_member BOOLEAN, note VARCHAR)"
        )
        conn.execute(
            "INSERT INTO orders VALUES "
            "('2020-01-01', 'synthetic-1', 100, 'A', '货架', true, NULL), "
            "('2026-07-05 23:59:58.000000001', 'synthetic-2', 20, 'B', '直播', false, '')"
        )
        conn.execute("CREATE TABLE user_first_purchase (user_id VARCHAR, first_pay_date DATE)")
        conn.execute("INSERT INTO user_first_purchase VALUES ('synthetic-1', '2020-01-01')")
    spec = WarehouseSourceSpec(path, "synthetic-fixture", "synthetic")
    return spec, state_dir


def seal(spec, directory, *, read_only=True):
    return VerifiedWarehouseSource.seal(
        spec, directory,
        connect=lambda: duckdb.connect(
            str(spec.database_path), read_only=read_only,
            config={"memory_limit": "128MB", "threads": "1"},
        ),
    )


def identity_and_close(spec, directory):
    source = seal(spec, directory)
    with source.pin() as snapshot:
        identity, epoch = snapshot.identity, snapshot.source_epoch
    source.close()
    return identity, epoch


def test_identity_is_stable_after_reopen_and_receipt_is_not_a_live_lease(fixture_source):
    spec, directory = fixture_source
    first, first_epoch = identity_and_close(spec, directory)
    receipt = json.loads((directory / "warehouse-source.json").read_text())
    assert receipt["status"] == "SEALED_RECEIPT"
    assert receipt["revision"] == first.revision
    assert receipt["identity"]["relations"][0]["rows"] == 2
    assert (directory / "warehouse-source.json").stat().st_mode & 0o077 == 0
    (directory / "warehouse-source.json").write_text('{"revision":"forged-old-version"}')
    second, second_epoch = identity_and_close(spec, directory)
    assert first == second
    assert first_epoch != second_epoch
    assert second.metadata()["data_version"].startswith("warehouse-v1:")
    assert second.data_cutoff == "2026-07-05"
    assert second.orders_count == 2


@pytest.mark.parametrize("sql", [
    "UPDATE orders SET category='changed' WHERE user_id='synthetic-1'",
    "UPDATE orders SET channel='微博' WHERE user_id='synthetic-1'",
    "UPDATE orders SET is_member=false WHERE user_id='synthetic-1'",
    "UPDATE user_first_purchase SET first_pay_date='2019-12-31'",
    "UPDATE orders SET note='' WHERE note IS NULL",
    "UPDATE orders SET pay_time=TIMESTAMP_NS '2026-07-05 23:59:58.000000002' WHERE user_id='synthetic-2'",
    "UPDATE orders SET actual_amount=CASE WHEN user_id='synthetic-1' THEN 99.99 ELSE 20.01 END",
])
def test_same_totals_do_not_hide_changes_to_business_inputs(fixture_source, sql):
    spec, directory = fixture_source
    before, _ = identity_and_close(spec, directory)
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute(sql)
    after, _ = identity_and_close(spec, directory)
    assert before.revision != after.revision
    assert before.orders_count == after.orders_count
    assert before.data_start == after.data_start and before.data_cutoff == after.data_cutoff


def test_row_reordering_is_stable_but_duplicate_rows_change_identity(fixture_source):
    spec, directory = fixture_source
    before, _ = identity_and_close(spec, directory)
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("CREATE TABLE reordered AS SELECT * FROM orders ORDER BY user_id DESC")
        conn.execute("DELETE FROM orders")
        conn.execute("INSERT INTO orders SELECT * FROM reordered")
        conn.execute("DROP TABLE reordered")
    reordered, _ = identity_and_close(spec, directory)
    assert reordered.revision == before.revision
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("INSERT INTO orders SELECT * FROM orders WHERE user_id='synthetic-1'")
    duplicated, _ = identity_and_close(spec, directory)
    assert duplicated.revision != before.revision
    assert duplicated.orders_count == before.orders_count + 1


def test_duplicate_updates_preserve_column_totals_but_change_row_relationships(fixture_source):
    spec, directory = fixture_source
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("INSERT INTO orders SELECT * FROM orders")
    before, _ = identity_and_close(spec, directory)
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("UPDATE orders SET category=CASE WHEN category='A' THEN 'B' ELSE 'A' END")
    after, _ = identity_and_close(spec, directory)
    assert before.orders_count == after.orders_count == 4
    assert before.revision != after.revision


def test_decimal_content_identity_preserves_digits_beyond_double_precision(fixture_source):
    spec, directory = fixture_source
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("ALTER TABLE orders ALTER actual_amount TYPE DECIMAL(38,12)")
        conn.execute("UPDATE orders SET actual_amount=12345678901234567890.000000000001 WHERE user_id='synthetic-1'")
    before, _ = identity_and_close(spec, directory)
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("UPDATE orders SET actual_amount=12345678901234567890.000000000002 WHERE user_id='synthetic-1'")
    after, _ = identity_and_close(spec, directory)
    assert before.revision != after.revision


def test_pin_uses_only_readonly_native_cursors(fixture_source):
    spec, directory = fixture_source
    source = seal(spec, directory)
    try:
        with source.pin() as snapshot:
            assert isinstance(snapshot.connection, duckdb.DuckDBPyConnection)
            assert snapshot.connection.execute("SELECT current_setting('access_mode')").fetchone() == ("read_only",)
            with pytest.raises(duckdb.InvalidInputException):
                snapshot.connection.execute("DELETE FROM orders")
            with pytest.raises(duckdb.ConnectionException):
                duckdb.connect(str(spec.database_path))
    finally:
        source.close()


@pytest.mark.parametrize("sql", [
    "ALTER TABLE orders ADD COLUMN payload JSON",
    "ALTER TABLE orders ADD COLUMN payload STRUCT(value JSON)",
    "ALTER TABLE orders ADD COLUMN payload FLOAT",
    "ALTER TABLE orders ADD COLUMN payload DOUBLE",
])
def test_unsupported_column_values_are_rejected(fixture_source, sql):
    spec, directory = fixture_source
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute(sql)
    owner = None
    try:
        with pytest.raises(WarehouseSourceUnavailableError, match="unsupported column type"):
            owner = seal(spec, directory)
    finally:
        if owner is not None:
            owner.close()


def test_column_collation_changes_source_identity(fixture_source):
    spec, directory = fixture_source
    before, _ = identity_and_close(spec, directory)
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("ALTER TABLE orders RENAME TO original")
        conn.execute("CREATE TABLE orders (pay_time TIMESTAMP_NS, user_id VARCHAR, actual_amount DECIMAL(18,2), category VARCHAR COLLATE NOCASE, channel VARCHAR, is_member BOOLEAN, note VARCHAR)")
        conn.execute("INSERT INTO orders SELECT * FROM original")
        conn.execute("DROP TABLE original")
    after, _ = identity_and_close(spec, directory)
    assert before.revision != after.revision


def test_generated_column_cannot_escape_the_sealed_snapshot(fixture_source):
    spec, directory = fixture_source
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("ALTER TABLE orders RENAME TO original")
        conn.execute("CREATE TABLE orders (pay_time TIMESTAMP_NS, user_id VARCHAR, actual_amount DECIMAL(18,2), category VARCHAR, channel VARCHAR, is_member BOOLEAN, note VARCHAR, stamp AS (now()))")
        conn.execute("INSERT INTO orders SELECT * FROM original")
        conn.execute("DROP TABLE original")
    owner = None
    try:
        with pytest.raises(WarehouseSourceUnavailableError, match="generated columns"):
            owner = seal(spec, directory)
    finally:
        if owner is not None:
            owner.close()


def test_ordinary_default_is_supported_but_default_collation_is_not(fixture_source):
    spec, directory = fixture_source
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("ALTER TABLE orders ADD COLUMN is_refund BOOLEAN DEFAULT false")
        conn.execute("ALTER TABLE orders ADD COLUMN label VARCHAR DEFAULT 'generated always as'")
    identity_and_close(spec, directory)

    def connect():
        conn = duckdb.connect(str(spec.database_path), read_only=True)
        conn.execute("SET default_collation='nocase'")
        return conn

    owner = None
    try:
        with pytest.raises(WarehouseSourceUnavailableError, match="default collation"):
            owner = VerifiedWarehouseSource.seal(spec, directory, connect=connect)
    finally:
        if owner is not None:
            owner.close()


def test_temporary_relation_cannot_shadow_a_registered_physical_table(fixture_source):
    spec, directory = fixture_source

    def connect():
        conn = duckdb.connect(str(spec.database_path), read_only=True)
        conn.execute("CREATE TEMP TABLE orders AS SELECT * FROM main.orders WHERE false")
        return conn

    owner = None
    try:
        with pytest.raises(WarehouseSourceUnavailableError, match="temporary"):
            owner = VerifiedWarehouseSource.seal(spec, directory, connect=connect)
    finally:
        if owner is not None:
            owner.close()


def test_close_defers_owner_release_until_last_reader_exits(fixture_source):
    spec, directory = fixture_source
    source = seal(spec, directory)
    acquired = threading.Event()
    release = threading.Event()
    errors = []

    def read():
        try:
            with source.pin() as snapshot:
                acquired.set()
                assert release.wait(5)
                assert snapshot.connection.execute("SELECT COUNT(*) FROM orders").fetchone() == (2,)
        except BaseException as exc:
            errors.append(exc)

    worker = threading.Thread(target=read)
    worker.start()
    try:
        assert acquired.wait(5)
        source.close()
        assert source.state == SourceState.CLOSING
        with pytest.raises(WarehouseSourceUnavailableError):
            with source.pin():
                raise AssertionError("closed source accepted a new reader")
    finally:
        release.set()
        worker.join(5)
    assert not worker.is_alive() and not errors
    assert source.state == SourceState.CLOSED
    source.close()


def test_path_replacement_invalidates_source_and_reseal_checks_new_content(fixture_source):
    spec, directory = fixture_source
    source = seal(spec, directory)
    with source.pin() as snapshot:
        old_revision = snapshot.identity.revision
    path = spec.database_path
    replacement = path.with_name("replacement.duckdb")
    with duckdb.connect(str(replacement)) as conn:
        conn.execute("CREATE TABLE orders (pay_time TIMESTAMP_NS, user_id VARCHAR, actual_amount DECIMAL(18,2), category VARCHAR, channel VARCHAR, is_member BOOLEAN, note VARCHAR)")
        conn.execute("CREATE TABLE user_first_purchase (user_id VARCHAR, first_pay_date DATE)")
    os.replace(replacement, path)
    with pytest.raises(WarehouseSourceUnavailableError, match="path changed"):
        with source.pin():
            raise AssertionError("replaced path was accepted")
    assert source.state == SourceState.CLOSED
    new, _ = identity_and_close(spec, directory)
    assert old_revision != new.revision


def test_state_directory_has_one_owner_until_lease_closes(fixture_source):
    spec, directory = fixture_source
    first = seal(spec, directory)
    try:
        with pytest.raises(WarehouseSourceUnavailableError, match="cannot acquire source state directory lock"):
            seal(spec, directory)
    finally:
        first.close()
    second = seal(spec, directory)
    second.close()


def test_retargeted_registration_symlink_invalidates_source(fixture_source, tmp_path):
    spec, directory = fixture_source
    alias = tmp_path / "active.duckdb"
    alias.symlink_to(spec.database_path)
    source = seal(replace(spec, database_path=alias), directory)
    replacement = tmp_path / "replacement.duckdb"
    duckdb.connect(str(replacement)).close()
    alias.unlink()
    alias.symlink_to(replacement)
    try:
        with pytest.raises(WarehouseSourceUnavailableError, match="path changed"):
            with source.pin():
                raise AssertionError("retargeted registration was accepted")
        assert source.state == SourceState.CLOSED
    finally:
        source.close()


def test_registration_retargeted_to_directory_closes_owner_and_releases_lock(fixture_source, tmp_path):
    spec, directory = fixture_source
    alias = tmp_path / "active.duckdb"
    alias.symlink_to(spec.database_path)
    source = seal(replace(spec, database_path=alias), directory)
    alias.unlink()
    alias.symlink_to(tmp_path, target_is_directory=True)
    try:
        with pytest.raises(WarehouseSourceUnavailableError):
            with source.pin():
                raise AssertionError("non-file registration was accepted")
        assert source.state == SourceState.CLOSED
        replacement = seal(spec, directory)
        replacement.close()
    finally:
        source.close()


def test_failed_seal_releases_state_directory_and_keeps_previous_receipt(fixture_source):
    spec, directory = fixture_source
    identity_and_close(spec, directory)
    receipt = (directory / "warehouse-source.json").read_bytes()

    def fail_connect():
        raise RuntimeError("synthetic connection failed")

    with pytest.raises(RuntimeError, match="synthetic connection failed"):
        VerifiedWarehouseSource.seal(spec, directory, connect=fail_connect)
    assert (directory / "warehouse-source.json").read_bytes() == receipt
    source = seal(spec, directory)
    source.close()


def test_timezone_is_preserved_for_pinned_queries_and_date_boundaries(fixture_source):
    spec, directory = fixture_source
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("ALTER TABLE orders ALTER pay_time TYPE TIMESTAMPTZ")
        conn.execute("UPDATE orders SET pay_time=TIMESTAMPTZ '2026-07-05 20:00:00+00' WHERE user_id='synthetic-2'")

    def connect():
        conn = duckdb.connect(str(spec.database_path), read_only=True)
        conn.execute("SET TimeZone='Asia/Shanghai'")
        return conn

    source = VerifiedWarehouseSource.seal(spec, directory, connect=connect)
    try:
        with source.pin() as snapshot:
            assert snapshot.identity.timezone == "Asia/Shanghai"
            assert snapshot.identity.data_cutoff == "2026-07-06"
            assert snapshot.connection.execute("SELECT current_setting('TimeZone')").fetchone() == ("Asia/Shanghai",)
    finally:
        source.close()


def test_process_exit_releases_lease_owner_lock(fixture_source):
    spec, directory = fixture_source
    root = Path(__file__).resolve().parents[2]
    script = """
import sys, time
from pathlib import Path
sys.path.insert(0, sys.argv[3])
import duckdb
from backend.services.warehouse_source import VerifiedWarehouseSource, WarehouseSourceSpec
path = Path(sys.argv[1])
source = VerifiedWarehouseSource.seal(
    WarehouseSourceSpec(path, 'synthetic-child', 'synthetic'), Path(sys.argv[2]),
    connect=lambda: duckdb.connect(str(path), read_only=True),
)
print('READY', flush=True)
time.sleep(60)
"""
    process = subprocess.Popen(
        [sys.executable, "-B", "-c", script, str(spec.database_path), str(directory), str(root)],
        cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            assert selector.select(10), "synthetic source child did not become ready"
        assert process.stdout.readline().strip() == "READY"
        with pytest.raises(WarehouseSourceUnavailableError, match="cannot acquire source state directory lock"):
            seal(spec, directory)
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
    source = seal(spec, directory)
    source.close()


@pytest.mark.parametrize("unsupported", ["write", "view", "attached", "wrong_path", "public_state"])
def test_unsupported_registration_is_rejected(fixture_source, tmp_path, unsupported):
    spec, directory = fixture_source
    if unsupported == "view":
        with duckdb.connect(str(spec.database_path)) as conn:
            conn.execute("ALTER TABLE orders RENAME TO orders_data")
            conn.execute("CREATE VIEW orders AS SELECT * FROM orders_data")
    if unsupported == "public_state":
        directory.chmod(0o755)
    if unsupported == "attached":
        other = tmp_path / "other.duckdb"
        duckdb.connect(str(other)).close()

        def connect():
            conn = duckdb.connect(str(spec.database_path), read_only=True)
            conn.execute("ATTACH '" + str(other).replace("'", "''") + "' AS extra (READ_ONLY)")
            return conn

        with pytest.raises(WarehouseSourceUnavailableError):
            VerifiedWarehouseSource.seal(spec, directory, connect=connect)
        return
    if unsupported == "wrong_path":
        actual_path = spec.database_path
        other = tmp_path / "other.duckdb"
        duckdb.connect(str(other)).close()
        with pytest.raises(WarehouseSourceUnavailableError):
            VerifiedWarehouseSource.seal(replace(spec, database_path=other), directory,
                                         connect=lambda: duckdb.connect(str(actual_path), read_only=True))
        return
    with pytest.raises(WarehouseSourceUnavailableError):
        seal(spec, directory, read_only=unsupported != "write")
