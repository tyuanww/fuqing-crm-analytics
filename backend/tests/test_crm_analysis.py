"""Actual HTTP/auth, tiny DuckDB, private SQLite and fresh-process persistence."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import duckdb
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from backend.contracts.crm_analysis import (
    CrmAddReference, CrmBindCitations, CrmBoardComponentDraft, CrmBoardLayout, CrmBoardPatch,
    CrmBoardWrite, CrmKnowledgeCitation, CrmPatchAnalysis, CrmSaveAnalysis, CrmSnapshotRequest,
)
from backend.services.crm_analysis import CrmAnalysisStore
from backend.db import connection
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases

FILTERS = CrmSnapshotRequest(start_date="2026-01-01", end_date="2026-01-02")


@pytest.fixture
def assets(tmp_path, monkeypatch):
    directory = tmp_path / "assets"
    directory.mkdir(mode=0o700)
    con = duckdb.connect(":memory:")
    con.execute("""CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, actual_amount DOUBLE, channel VARCHAR,
        pay_time TIMESTAMP, is_refund BOOLEAN, is_goujinjin BOOLEAN, order_status VARCHAR)""")
    con.execute("""INSERT INTO orders VALUES ('o1','u1',10.01,'货架','2026-01-01',false,false,'交易成功'),
        ('o1','u1',20,'货架','2026-01-01',false,false,'交易成功'),
        ('o2','u2',50,'货架','2026-01-01',false,false,'交易成功'),
        ('o3','u1',0,'货架','2026-01-01',false,false,'交易成功')""")
    monkeypatch.setattr(connection, "get_connection", lambda: con)
    store = CrmAnalysisStore(directory, "synthetic")
    yield store, con
    con.close()


def compute(filters):
    return query_dashboard_purchases(connection.get_connection(), filters)


def chain(store):
    snapshot = store.capture("alice", "query-1", FILTERS, compute)
    analysis = store.save("alice", "save-1", CrmSaveAnalysis(snapshot_id=snapshot.snapshot_id, title="销售分析"))
    ref = store.pin("alice", "pin-1", CrmAddReference(analysis_id=analysis.analysis_id))
    return snapshot, analysis, ref


def test_snapshot_is_fixed_and_reference_survives_new_process(assets):
    store, con = assets
    snapshot, analysis, ref = chain(store)
    assert snapshot.result.gsv_amount_fen == 8001
    assert snapshot.result.coverage.orders == 2
    assert snapshot.result.coverage.zero_amount_orders == 1
    assert snapshot.result.aov.amount_fen == 4001
    con.execute("UPDATE orders SET actual_amount=100")
    assert store.library("alice").references[0].analysis.snapshot == snapshot
    reopened = CrmAnalysisStore(store.directory, "synthetic")
    assert reopened.read("alice", "reference", ref.reference_id) == ref
    root = Path(__file__).resolve().parents[2]
    code = """import json,sys
from pathlib import Path
from backend.services.crm_analysis import CrmAnalysisStore
store=CrmAnalysisStore(Path(sys.argv[1]), 'synthetic')
print(store.read('alice','reference',sys.argv[2]).model_dump_json())
"""
    proc = subprocess.run([sys.executable, "-c", code, str(store.directory), ref.reference_id], cwd=root,
                          env={"PATH": os.environ["PATH"], "PYTHONPATH": str(root), "PYTHON_DOTENV_DISABLED": "1"},
                          capture_output=True, text=True, check=True, timeout=15)
    assert json.loads(proc.stdout) == ref.model_dump(mode="json")
    assert store.library("bob").snapshots == []
    assert analysis.snapshot.result.data_through is None


def test_owner_scope_applies_to_reads_writes_and_receipt_replays(assets):
    store, _ = assets
    snapshot, analysis, ref = chain(store)
    for kind, asset_id in [("snapshot", snapshot.snapshot_id), ("analysis", analysis.analysis_id), ("reference", ref.reference_id)]:
        with pytest.raises(HTTPException) as failure:
            store.read("bob", kind, asset_id)
        assert failure.value.status_code == 404
    for request in [lambda: store.save("bob", "save-1", CrmSaveAnalysis(snapshot_id=snapshot.snapshot_id, title="销售分析")),
                    lambda: store.pin("bob", "pin-1", CrmAddReference(analysis_id=analysis.analysis_id))]:
        with pytest.raises(HTTPException) as failure:
            request()
        assert failure.value.status_code == 404
    with pytest.raises(HTTPException) as failure:
        store.library("")
    assert failure.value.status_code == 401


def test_receipts_and_source_uniqueness_make_retries_safe(assets):
    store, _ = assets
    snapshot, analysis, ref = chain(store)
    def should_not_query(_):
        pytest.fail("same capture receipt must not re-query changing data")
    assert store.capture("alice", "query-1", FILTERS, should_not_query) == snapshot
    for key in ["save-1", "new-key"]:
        assert store.save("alice", key, CrmSaveAnalysis(snapshot_id=snapshot.snapshot_id, title="销售分析")) == analysis
    assert store.pin("alice", "pin-1", CrmAddReference(analysis_id=analysis.analysis_id)) == ref
    for key in ["save-1", "new-title-key"]:
        with pytest.raises(HTTPException) as failure:
            store.save("alice", key, CrmSaveAnalysis(snapshot_id=snapshot.snapshot_id, title="不同标题"))
        assert failure.value.status_code == 409
    with pytest.raises(HTTPException):
        store.pin("alice", "query-1", CrmAddReference(analysis_id=analysis.analysis_id))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: store.pin("alice", "parallel", CrmAddReference(analysis_id=analysis.analysis_id)), range(2)))
    assert results == [ref, ref]
    assert len(store.library("alice").references) == 1


@pytest.mark.parametrize("key", [None, "", "a b", "x" * 101, "中文"])
def test_invalid_receipt_key_writes_nothing(assets, key):
    store, _ = assets
    with pytest.raises(HTTPException):
        store.capture("alice", key, FILTERS, compute)
    assert store.library("alice").snapshots == []


@pytest.mark.parametrize("kind", ["snapshot", "analysis", "reference"])
def test_corruption_is_rejected_even_via_existing_references_and_receipts(assets, kind):
    store, _ = assets
    snapshot, analysis, ref = chain(store)
    with sqlite3.connect(store.path) as con:
        con.execute("UPDATE assets SET payload='{}' WHERE kind=?", (kind,))
    with pytest.raises(HTTPException) as failure:
        store.read("alice", "reference", ref.reference_id)
    assert failure.value.detail["code"] == "STATE_UNAVAILABLE"
    with pytest.raises(HTTPException):
        store.pin("alice", "pin-1", CrmAddReference(analysis_id=analysis.analysis_id))


def test_storage_boundaries_and_source_kind_cannot_be_relabelled(assets, tmp_path):
    store, _ = assets
    with pytest.raises(HTTPException):
        CrmAnalysisStore(store.directory, "real")
    assert CrmAnalysisStore(store.directory, "synthetic").library("alice").data_kind == "synthetic"
    public = tmp_path / "public"
    public.mkdir(mode=0o755)
    with pytest.raises(ValueError):
        CrmAnalysisStore(public, "synthetic")
    linked = tmp_path / "linked"
    linked.symlink_to(store.directory)
    with pytest.raises(ValueError):
        CrmAnalysisStore(linked, "synthetic")
    store.path.chmod(0o644)
    with pytest.raises(HTTPException):
        store.library("alice")


def test_rollback_lock_failure_and_list_truncation(assets):
    store, _ = assets
    def failed(_):
        raise RuntimeError("isolated query failure")
    with pytest.raises(RuntimeError):
        store.capture("alice", "failure", FILTERS, failed)
    assert store.library("alice").snapshots == []
    with sqlite3.connect(store.path) as other:
        other.execute("BEGIN IMMEDIATE")
        with pytest.raises(HTTPException) as failure:
            store.capture("alice", "locked", FILTERS, compute)
        assert failure.value.detail["code"] == "STATE_UNAVAILABLE"
    for index in range(21):
        store.capture("alice", f"capture-{index}", FILTERS, compute)
    listing = store.library("alice")
    assert len(listing.snapshots) == 20 and listing.snapshots_truncated


def test_real_router_requires_authentication_and_server_generated_facts(assets, monkeypatch):
    from backend.main import auth_middleware
    from backend.middleware.query_router import QueryRouterMiddleware
    from backend.routers import auth
    from backend.routers.metrics import router
    store, _ = assets
    monkeypatch.setenv("FQ_CRM_ANALYSIS_STATE_DIR", str(store.directory))
    monkeypatch.setenv("FQ_CRM_ANALYSIS_DATA_KIND", "synthetic")
    tokens = {"test-alice": "alice", "test-bob": "bob"}
    monkeypatch.setattr(auth, "_verify_token", lambda token: tokens.get(token))
    app = FastAPI()
    app.middleware("http")(auth_middleware)
    app.include_router(router)
    prefix = "/api/v1/metrics/"
    headers = {"Authorization": "Bearer test-alice", "Idempotency-Key": "capture-http"}
    with TestClient(app) as client:
        assert client.get(prefix + "crm-library").status_code == 401
        for extra in [{"owner": "bob"}, {"result": {}}, {"data_kind": "real"}, {"sql": "SELECT 1"}]:
            assert client.post(prefix + "dashboard-snapshots", json={**FILTERS.model_dump(mode="json"), **extra}, headers=headers).status_code == 422
        captured = client.post(prefix + "dashboard-snapshots", json=FILTERS.model_dump(mode="json"), headers=headers)
        assert captured.status_code == 200, captured.text
        assert captured.headers["cache-control"] == "no-store"
        snap = captured.json()
        headers["Idempotency-Key"] = "save-http"
        body = {"snapshot_id": snap["snapshot_id"], "title": "HTTP 分析"}
        assert client.post(prefix + "crm-analyses", json={**body, "facts": {"gsv": 999}}, headers=headers).status_code == 422
        saved = client.post(prefix + "crm-analyses", json=body, headers=headers).json()
        assert saved["snapshot"] == snap
        headers["Idempotency-Key"] = "pin-http"
        pinned = client.post(prefix + "crm-cockpit-references", json={"analysis_id": saved["analysis_id"]}, headers=headers).json()
        assert pinned["analysis"] == saved
        for path in ["dashboard-snapshots/" + snap["snapshot_id"], "crm-analyses/" + saved["analysis_id"], "crm-cockpit-references/" + pinned["reference_id"]]:
            assert client.get(prefix + path, headers=headers).status_code == 200
            assert client.get(prefix + path, headers={"Authorization": "Bearer test-bob"}).status_code == 404
        tokens.clear()
        assert client.post(prefix + "crm-cockpit-references", json={"analysis_id": saved["analysis_id"]}, headers=headers).status_code == 401
    assert QueryRouterMiddleware(app).classify(prefix + "dashboard-snapshots", "POST") == "read"
    for path in ["crm-library", "crm-analyses", "crm-cockpit-references", "dashboard-snapshots/" + snap["snapshot_id"]]:
        assert QueryRouterMiddleware(app).classify(prefix + path, "GET") == "default"


def test_missing_configuration_does_not_create_implicit_state(assets, monkeypatch):
    from backend.routers.crm_dashboard import library_context
    from starlette.requests import Request
    from starlette.responses import Response
    monkeypatch.delenv("FQ_CRM_ANALYSIS_STATE_DIR", raising=False)
    request = Request({"type": "http", "state": {"username": "alice"}})
    with pytest.raises(HTTPException) as failure:
        library_context(request, Response())
    assert failure.value.detail["code"] == "STATE_NOT_CONFIGURED"


def saved(store, title, key):
    snapshot = store.capture("alice", f"q-{key}", FILTERS, compute)
    return store.save("alice", f"s-{key}", CrmSaveAnalysis(snapshot_id=snapshot.snapshot_id, title=title, description=f"说明 {title}"))


def board_write(analysis, title="销售组板", metric="gsv", snapshot_id=None):
    return CrmBoardWrite(title=title, description="固定窗口", components=[CrmBoardComponentDraft(
        block_id="m1", title=metric.upper(), analysis_id=analysis.analysis_id,
        snapshot_id=snapshot_id or analysis.snapshot.snapshot_id, metric=metric,
        layout=CrmBoardLayout(x=0, y=0, w=4, h=4))])


def test_search_pages_beyond_twenty_and_locates_old_titles(assets):
    store, _ = assets
    titles = [f"窗口 {index:02d}" for index in range(25)]
    records = [saved(store, title, f"{index:02d}") for index, title in enumerate(titles)]
    page = store.search_analyses("alice", limit=20)
    assert len(page.items) == 20 and page.next_cursor
    older = store.search_analyses("alice", cursor=page.next_cursor, limit=20)
    seen = {item.analysis_id for item in page.items} | {item.analysis_id for item in older.items}
    assert len(older.items) == 5 and seen == {item.analysis_id for item in records}
    hit = store.search_analyses("alice", q="窗口 00")
    assert [item.title for item in hit.items] == ["窗口 00"]
    located = store.read("alice", "analysis", records[0].analysis_id)
    assert located.title == "窗口 00" and located.snapshot.result.gsv_amount_fen == 8001


def test_patch_keeps_snapshot_immutable_and_conflicts_on_stale_revision(assets):
    store, con = assets
    analysis = saved(store, "原标题", "edit")
    snapshot = analysis.snapshot
    patched = store.patch_analysis("alice", "edit-1", analysis.analysis_id,
                                   CrmPatchAnalysis(title="新标题", description="新说明", base_revision=1))
    assert patched.title == "新标题" and patched.description == "新说明" and patched.revision == 2
    assert patched.snapshot == snapshot
    con.execute("UPDATE orders SET actual_amount=100")
    assert store.read("alice", "analysis", analysis.analysis_id).snapshot.result.gsv_amount_fen == 8001
    assert store.patch_analysis("alice", "edit-1", analysis.analysis_id,
                                CrmPatchAnalysis(title="新标题", description="新说明", base_revision=1)) == patched
    with pytest.raises(HTTPException) as failure:
        store.patch_analysis("alice", "edit-2", analysis.analysis_id,
                             CrmPatchAnalysis(title="冲突", description="", base_revision=1))
    assert failure.value.status_code == 409 and failure.value.detail["code"] == "VERSION_CONFLICT"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(
            lambda _: store.patch_analysis("alice", "parallel-edit", analysis.analysis_id,
                                           CrmPatchAnalysis(title="新标题", description="新说明", base_revision=2)),
            range(2)))
    assert results[0] == results[1]


def test_patch_analysis_keeps_pinned_reference_readable(assets):
    store, _ = assets
    analysis = saved(store, "原标题", "pin-edit")
    ref = store.pin("alice", "pin-before-edit", CrmAddReference(analysis_id=analysis.analysis_id))
    patched = store.patch_analysis(
        "alice", "edit-after-pin", analysis.analysis_id,
        CrmPatchAnalysis(title="新标题", description="已编辑", base_revision=1))
    assert patched.title == "新标题" and patched.revision == 2
    listed = store.library("alice")
    assert listed.references[0].analysis.title == "新标题"
    assert listed.references[0].analysis.snapshot == analysis.snapshot
    reopened = store.read("alice", "reference", ref.reference_id)
    assert reopened.analysis.title == "新标题"
    assert reopened.analysis.revision == 2
    assert reopened.analysis.snapshot.result.gsv_amount_fen == 8001
    assert store.patch_analysis(
        "alice", "edit-after-pin", analysis.analysis_id,
        CrmPatchAnalysis(title="新标题", description="已编辑", base_revision=1)) == patched


def test_share_is_account_bound_and_revoke_stops_existing_tokens(assets, monkeypatch):
    from backend.routers import auth
    store, _ = assets
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    analysis = saved(store, "可分享", "share")
    with pytest.raises(HTTPException) as missing:
        store.share("alice", "share-unknown", analysis.analysis_id, "carol", known=lambda name: name in auth.VALID_CREDENTIALS)
    assert missing.value.detail["code"] == "ACCOUNT_NOT_FOUND"
    listed = store.share("alice", "share-bob", analysis.analysis_id, "bob", known=lambda name: name in auth.VALID_CREDENTIALS)
    assert [grant.username for grant in listed.grants] == ["bob"]
    assert store.read("bob", "analysis", analysis.analysis_id).title == "可分享"
    shared = store.search_analyses("bob", scope="all")
    assert [item.access for item in shared.items] == ["shared"]
    assert shared.items[0].analysis_id == analysis.analysis_id
    with pytest.raises(HTTPException):
        store.patch_analysis("bob", "steal", analysis.analysis_id,
                             CrmPatchAnalysis(title="篡改", description="", base_revision=1))
    store.unshare("alice", "revoke-bob", analysis.analysis_id, "bob")
    with pytest.raises(HTTPException) as revoked:
        store.read("bob", "analysis", analysis.analysis_id)
    assert revoked.value.status_code == 404
    assert store.search_analyses("bob", scope="shared").items == []
    replayed = store.share("alice", "share-bob", analysis.analysis_id, "bob", known=lambda name: name in auth.VALID_CREDENTIALS)
    assert replayed.grants == []
    with pytest.raises(HTTPException):
        store.read("bob", "analysis", analysis.analysis_id)


def test_board_binds_server_facts_and_rejects_client_amounts(assets):
    store, con = assets
    analysis = saved(store, "组板来源", "board")
    draft = CrmBoardWrite(title="销售组板", description="固定窗口", components=[CrmBoardComponentDraft(
        block_id="gsvCard", title="GSV", analysis_id=analysis.analysis_id, snapshot_id=analysis.snapshot.snapshot_id,
        metric="gsv", layout=CrmBoardLayout(x=0, y=0, w=4, h=4))])
    board = store.save_board("alice", "board-1", draft)
    assert board.components[0].value.amount_fen == 8001
    assert board.components[0].filters == analysis.snapshot.result.filters
    con.execute("UPDATE orders SET actual_amount=1")
    reopened = CrmAnalysisStore(store.directory, "synthetic")
    assert reopened.read("alice", "board", board.board_id).components[0].value.amount_fen == 8001
    with pytest.raises(HTTPException) as stale:
        store.patch_board("alice", "board-stale", board.board_id, CrmBoardPatch(
            title="销售组板", description="固定窗口", base_revision=99, components=draft.components))
    assert stale.value.detail["code"] == "VERSION_CONFLICT"
    with pytest.raises(HTTPException):
        store.read("bob", "board", board.board_id)


def test_http_search_share_and_board_do_not_accept_client_facts(assets, monkeypatch):
    from backend.main import auth_middleware
    from backend.routers import auth
    from backend.routers.metrics import router
    store, _ = assets
    monkeypatch.setenv("FQ_CRM_ANALYSIS_STATE_DIR", str(store.directory))
    monkeypatch.setenv("FQ_CRM_ANALYSIS_DATA_KIND", "synthetic")
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    monkeypatch.setattr(auth, "_verify_token", lambda token: {"test-alice": "alice", "test-bob": "bob"}.get(token))
    app = FastAPI()
    app.middleware("http")(auth_middleware)
    app.include_router(router)
    prefix = "/api/v1/metrics/"
    alice = {"Authorization": "Bearer test-alice", "Idempotency-Key": "http-search"}
    bob = {"Authorization": "Bearer test-bob"}
    with TestClient(app) as client:
        for index in range(21):
            alice["Idempotency-Key"] = f"cap-{index}"
            snap = client.post(prefix + "dashboard-snapshots", json=FILTERS.model_dump(mode="json"), headers=alice).json()
            alice["Idempotency-Key"] = f"save-{index}"
            client.post(prefix + "crm-analyses", json={"snapshot_id": snap["snapshot_id"], "title": f"HTTP {index:02d}"}, headers=alice)
        page = client.get(prefix + "crm-analyses", params={"limit": 20}, headers=alice).json()
        assert len(page["items"]) == 20 and page["next_cursor"]
        rest = client.get(prefix + "crm-analyses", params={"cursor": page["next_cursor"]}, headers=alice).json()
        assert len(rest["items"]) == 1
        found = client.get(prefix + "crm-analyses", params={"q": "HTTP 00"}, headers=alice).json()
        analysis_id = found["items"][0]["analysis_id"]
        snapshot_id = found["items"][0]["snapshot_id"]
        alice["Idempotency-Key"] = "patch"
        patched = client.patch(prefix + "crm-analyses/" + analysis_id,
                               json={"title": "HTTP 00", "description": "已核对", "base_revision": 1, "gsv": 1},
                               headers=alice)
        assert patched.status_code == 422
        patched = client.patch(prefix + "crm-analyses/" + analysis_id,
                               json={"title": "HTTP 00", "description": "已核对", "base_revision": 1}, headers=alice)
        assert patched.json()["description"] == "已核对" and patched.json()["snapshot"]["result"]["gsv_amount_fen"] == 8001
        alice["Idempotency-Key"] = "share"
        assert client.post(prefix + f"crm-analyses/{analysis_id}/shares", json={"username": "bob"}, headers=alice).status_code == 200
        assert client.get(prefix + "crm-analyses/" + analysis_id, headers=bob).status_code == 200
        alice["Idempotency-Key"] = "revoke"
        client.post(prefix + f"crm-analyses/{analysis_id}/shares/bob/revoke", headers=alice)
        assert client.get(prefix + "crm-analyses/" + analysis_id, headers=bob).status_code == 404
        alice["Idempotency-Key"] = "board"
        forged = {"title": "组板", "components": [{"block_id": "m1", "title": "GSV", "analysis_id": analysis_id,
                   "snapshot_id": snapshot_id, "metric": "gsv", "layout": {"x": 0, "y": 0, "w": 4, "h": 4},
                   "value": {"amount_fen": 1}}]}
        assert client.post(prefix + "crm-boards", json=forged, headers=alice).status_code == 422
        created = client.post(prefix + "crm-boards", json={"title": "组板", "components": [{
            "block_id": "m1", "title": "GSV", "analysis_id": analysis_id, "snapshot_id": snapshot_id,
            "metric": "gsv", "layout": {"x": 0, "y": 0, "w": 4, "h": 4}}]}, headers=alice)
        assert created.status_code == 200
        assert created.json()["components"][0]["value"]["amount_fen"] == 8001
        assert client.get(prefix + "crm-boards/" + created.json()["board_id"], headers=bob).status_code == 404
        alice["Idempotency-Key"] = "save-forged-citations"
        forged_save = client.post(prefix + "crm-analyses", json={
            "snapshot_id": snapshot_id, "title": "伪造引用",
            "knowledge_citations": [{"knowledge_id": "22222222-2222-2222-2222-222222222222"}]}, headers=alice)
        assert forged_save.status_code == 422
        alice["Idempotency-Key"] = "bind-http"
        bound = client.post(prefix + f"crm-analyses/{analysis_id}/knowledge-citations",
                            json={"citations": [sample_citation().model_dump(mode="json")]}, headers=alice)
        assert bound.status_code in {403, 404, 422}
        alice["Idempotency-Key"] = "bind-owner-field"
        assert client.post(prefix + f"crm-analyses/{analysis_id}/knowledge-citations",
                           json={"citations": [sample_citation().model_dump(mode="json")], "owner": "bob"},
                           headers=alice).status_code == 422
        assert client.post(prefix + f"crm-analyses/{analysis_id}/knowledge-citations",
                           json={"citations": [sample_citation().model_dump(mode="json")]},
                           headers={**bob, "Idempotency-Key": "bob-bind"}).status_code == 404


DOC = "22222222-2222-2222-2222-222222222222"
KB = "11111111-1111-1111-1111-111111111111"
CHUNK = "33333333-3333-3333-3333-333333333333"


def sample_citation():
    return CrmKnowledgeCitation(
        knowledge_id=DOC, knowledge_base_id=KB, chunk_id=CHUNK,
        content_sha256="a" * 64, title="合成教材", updated_at="v1", processed_at="v1")


def write_acl(directory, grants):
    path = directory / "graph-acl.json"
    path.write_text(json.dumps({"schema": "crm-graph-acl/v1", "knowledge_base_id": KB, "grants": grants}), encoding="utf-8")
    os.chmod(path, 0o600)
    return path


def test_metric_only_analysis_does_not_require_textbook_acl(assets):
    store, _ = assets
    analysis = saved(store, "纯指标", "metric-only")
    assert analysis.knowledge_citations == []
    assert store.read("alice", "analysis", analysis.analysis_id).title == "纯指标"


def test_knowledge_citations_are_host_bound_and_rechecked(assets, monkeypatch, tmp_path):
    from backend.routers import auth
    store, _ = assets
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    acl = write_acl(tmp_path, [
        {"username": "alice", "knowledge_ids": [DOC]},
        {"username": "bob", "knowledge_ids": []},
    ])
    monkeypatch.setenv("FQ_CRM_GRAPH_ACL_FILE", str(acl))
    analysis = saved(store, "带引用", "cite")
    bound = store.bind_citations("alice", "bind-1", analysis.analysis_id, CrmBindCitations(citations=[sample_citation()]))
    assert bound.knowledge_citations[0].chunk_id == CHUNK
    assert bound.snapshot.result.gsv_amount_fen == 8001
    with pytest.raises(HTTPException) as denied:
        store.share("alice", "share-bob-cite", analysis.analysis_id, "bob", known=lambda name: name in auth.VALID_CREDENTIALS)
    assert denied.value.status_code == 403 and denied.value.detail["code"] == "ACCESS_DENIED"
    grants = json.loads(acl.read_text(encoding="utf-8"))
    grants["grants"][1]["knowledge_ids"] = [DOC]
    acl.write_text(json.dumps(grants), encoding="utf-8")
    os.chmod(acl, 0o600)
    listed = store.share("alice", "share-bob-cite-ok", analysis.analysis_id, "bob", known=lambda name: name in auth.VALID_CREDENTIALS)
    assert [item.username for item in listed.grants] == ["bob"]
    assert store.read("bob", "analysis", analysis.analysis_id).knowledge_citations[0].chunk_id == CHUNK
    grants["grants"][1]["knowledge_ids"] = []
    acl.write_text(json.dumps(grants), encoding="utf-8")
    os.chmod(acl, 0o600)
    with pytest.raises(HTTPException) as hidden:
        store.read("bob", "analysis", analysis.analysis_id)
    assert hidden.value.status_code == 404
    assert store.search_analyses("bob", scope="all").items == []
    with pytest.raises(HTTPException) as replay_denied:
        store.share("alice", "share-bob-cite-ok", analysis.analysis_id, "bob", known=lambda name: name in auth.VALID_CREDENTIALS)
    assert replay_denied.value.status_code == 403
    later = saved(store, "后绑定", "later-bind")
    pinned_first = store.pin("alice", "pin-first", CrmAddReference(analysis_id=later.analysis_id))
    assert pinned_first.analysis.knowledge_citations == []
    store.bind_citations("alice", "bind-later", later.analysis_id, CrmBindCitations(citations=[sample_citation()]))
    assert store.read("alice", "reference", pinned_first.reference_id).analysis.knowledge_citations[0].chunk_id == CHUNK
    pinned = store.pin("alice", "pin-replay", CrmAddReference(analysis_id=analysis.analysis_id))
    assert pinned.analysis.knowledge_citations[0].chunk_id == CHUNK
    grants["grants"][0]["knowledge_ids"] = []
    acl.write_text(json.dumps(grants), encoding="utf-8")
    os.chmod(acl, 0o600)
    with pytest.raises(HTTPException):
        store.read("alice", "analysis", analysis.analysis_id)
    with pytest.raises(HTTPException) as pin_replay:
        store.pin("alice", "pin-replay", CrmAddReference(analysis_id=analysis.analysis_id))
    assert pin_replay.value.status_code == 404
    metric = saved(store, "仍可指标", "still-metric")
    assert store.read("alice", "analysis", metric.analysis_id).knowledge_citations == []
    with pytest.raises(HTTPException) as save_after_revoke:
        store.save("alice", "save-after-revoke", CrmSaveAnalysis(
            snapshot_id=analysis.snapshot.snapshot_id, title="带引用", description="说明 带引用"))
    assert save_after_revoke.value.status_code == 404


def test_bind_after_share_drops_grants_that_cannot_read_citations(assets, monkeypatch, tmp_path):
    from backend.routers import auth
    store, _ = assets
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    acl = write_acl(tmp_path, [
        {"username": "alice", "knowledge_ids": [DOC]},
        {"username": "bob", "knowledge_ids": []},
    ])
    monkeypatch.setenv("FQ_CRM_GRAPH_ACL_FILE", str(acl))
    analysis = saved(store, "先分享", "share-then-bind")
    store.share("alice", "share-first", analysis.analysis_id, "bob", known=lambda name: name in auth.VALID_CREDENTIALS)
    assert store.read("bob", "analysis", analysis.analysis_id).knowledge_citations == []
    store.bind_citations("alice", "bind-after-share", analysis.analysis_id, CrmBindCitations(citations=[sample_citation()]))
    assert store.list_shares("alice", analysis.analysis_id).grants == []
    with pytest.raises(HTTPException) as hidden:
        store.read("bob", "analysis", analysis.analysis_id)
    assert hidden.value.status_code == 404


def test_stored_analysis_without_citation_field_still_reads(assets):
    store, _ = assets
    analysis = saved(store, "旧载荷", "legacy-payload")
    con = sqlite3.connect(store.path)
    payload = json.loads(con.execute("SELECT payload FROM assets WHERE id=?", (analysis.analysis_id,)).fetchone()[0])
    con.close()
    assert "knowledge_citations" not in payload
    assert store.read("alice", "analysis", analysis.analysis_id).knowledge_citations == []


def test_user_version_one_migrates_grants_and_command_receipts(assets, monkeypatch):
    from backend.routers import auth
    from backend.services.crm_analysis import CrmAnalysisStore
    store, _ = assets
    with sqlite3.connect(store.path) as con:
        con.execute("DROP TABLE grants")
        con.execute("DROP TABLE command_receipts")
        con.execute("PRAGMA user_version=1")
    reopened = CrmAnalysisStore(store.directory, "synthetic")
    with sqlite3.connect(reopened.path) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 2
        names = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "grants" in names and "command_receipts" in names
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    analysis = saved(reopened, "迁移后可分享", "after-migrate")
    listed = reopened.share("alice", "share-after-migrate", analysis.analysis_id, "bob",
                            known=lambda name: name in auth.VALID_CREDENTIALS)
    assert [grant.username for grant in listed.grants] == ["bob"]
    assert reopened.read("bob", "analysis", analysis.analysis_id).title == "迁移后可分享"


def test_search_and_patch_board_cover_paging_acl_and_metrics(assets, monkeypatch, tmp_path):
    from backend.routers import auth
    store, _ = assets
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    analysis = saved(store, "组板来源", "board-search")
    boards = [store.save_board("alice", f"page-{index:02d}", board_write(analysis, title=f"组板 {index:02d}"))
              for index in range(21)]
    page = store.search_boards("alice", limit=20)
    assert len(page.items) == 20 and page.next_cursor
    rest = store.search_boards("alice", cursor=page.next_cursor, limit=20)
    assert len(rest.items) == 1
    seen = {item.board_id for item in page.items} | {item.board_id for item in rest.items}
    assert seen == {item.board_id for item in boards}
    named = store.search_boards("alice", q="组板 00")
    assert [item.title for item in named.items] == ["组板 00"]
    located = store.search_boards("alice", q=boards[0].board_id)
    assert [item.board_id for item in located.items] == [boards[0].board_id]
    patched = store.patch_board("alice", "board-edit", boards[0].board_id, CrmBoardPatch(
        title="新组板", description="已核对", base_revision=1, components=board_write(analysis).components))
    assert patched.title == "新组板" and patched.description == "已核对" and patched.revision == 2
    assert patched.components[0].value.amount_fen == 8001
    assert store.patch_board("alice", "board-edit", boards[0].board_id, CrmBoardPatch(
        title="新组板", description="已核对", base_revision=1, components=board_write(analysis).components)) == patched
    other = store.capture("alice", "other-snap", FILTERS, compute)
    with pytest.raises(HTTPException) as mismatch:
        store.save_board("alice", "bad-snap", board_write(analysis, snapshot_id=other.snapshot_id))
    assert mismatch.value.status_code == 422 and mismatch.value.detail["code"] == "INVALID_BOARD"
    aov = store.save_board("alice", "aov-board", board_write(analysis, title="AOV组板", metric="aov"))
    aus = store.save_board("alice", "aus-board", board_write(analysis, title="AUS组板", metric="aus"))
    orders = store.save_board("alice", "orders-board", board_write(analysis, title="订单组板", metric="orders"))
    assert aov.components[0].value.amount_fen == analysis.snapshot.result.aov.amount_fen
    assert aus.components[0].value.amount_fen == analysis.snapshot.result.aus.amount_fen
    assert orders.components[0].value.count == analysis.snapshot.result.coverage.orders
    acl = write_acl(tmp_path, [{"username": "alice", "knowledge_ids": [DOC]}])
    monkeypatch.setenv("FQ_CRM_GRAPH_ACL_FILE", str(acl))
    cited = saved(store, "带引用组板", "cited-board")
    store.bind_citations("alice", "bind-board", cited.analysis_id, CrmBindCitations(citations=[sample_citation()]))
    hidden = store.save_board("alice", "hidden-board", board_write(cited, title="引用组板"))
    grants = json.loads(acl.read_text(encoding="utf-8"))
    grants["grants"][0]["knowledge_ids"] = []
    acl.write_text(json.dumps(grants), encoding="utf-8")
    os.chmod(acl, 0o600)
    remaining = store.search_boards("alice", q="引用组板")
    assert remaining.items == []
    with pytest.raises(HTTPException) as blocked:
        store.read("alice", "board", hidden.board_id)
    assert blocked.value.status_code == 404


def test_share_limits_bind_conflict_shared_snapshot_and_invalid_cursor(assets, monkeypatch, tmp_path):
    from backend.routers import auth
    store, _ = assets
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    analysis = saved(store, "可分享快照", "share-limits")
    with pytest.raises(HTTPException) as self_share:
        store.share("alice", "share-self", analysis.analysis_id, "alice", known=lambda name: True)
    assert self_share.value.status_code == 409 and self_share.value.detail["code"] == "CONFLICT"
    for index in range(20):
        store.share("alice", f"cap-{index:02d}", analysis.analysis_id, f"user{index:02d}", known=lambda name: True)
    with pytest.raises(HTTPException) as capped:
        store.share("alice", "cap-20", analysis.analysis_id, "user20", known=lambda name: True)
    assert capped.value.status_code == 409 and capped.value.detail["code"] == "STATE_LIMIT"
    store.unshare("alice", "drop-user00", analysis.analysis_id, "user00")
    listed = store.share("alice", "share-bob-snap", analysis.analysis_id, "bob",
                         known=lambda name: name in auth.VALID_CREDENTIALS)
    assert "bob" in [grant.username for grant in listed.grants]
    shared_snapshot = store.read("bob", "snapshot", analysis.snapshot.snapshot_id)
    assert shared_snapshot.result.gsv_amount_fen == 8001
    with pytest.raises(HTTPException) as bad_cursor:
        store.search_analyses("alice", cursor="%%%")
    assert bad_cursor.value.status_code == 404
    with pytest.raises(HTTPException) as bad_board_cursor:
        store.search_boards("alice", cursor="%%%")
    assert bad_board_cursor.value.status_code == 404
    acl = write_acl(tmp_path, [{"username": "alice", "knowledge_ids": [DOC]}])
    monkeypatch.setenv("FQ_CRM_GRAPH_ACL_FILE", str(acl))
    cited = saved(store, "冲突绑定", "bind-conflict")
    store.bind_citations("alice", "bind-first", cited.analysis_id, CrmBindCitations(citations=[sample_citation()]))
    other = CrmKnowledgeCitation(
        knowledge_id=DOC, knowledge_base_id=KB, chunk_id="44444444-4444-4444-4444-444444444444",
        content_sha256="b" * 64, title="合成教材", updated_at="v1", processed_at="v1")
    with pytest.raises(HTTPException) as conflict:
        store.bind_citations("alice", "bind-other", cited.analysis_id, CrmBindCitations(citations=[other]))
    assert conflict.value.status_code == 409 and conflict.value.detail["code"] == "CONFLICT"


def test_load_graph_acl_rejects_mode_symlink_and_oversize(tmp_path, monkeypatch):
    from backend.services.crm_document_acl import load_graph_acl
    monkeypatch.delenv("FQ_CRM_GRAPH_ACL_FILE", raising=False)
    assert load_graph_acl() is None
    with pytest.raises(ValueError):
        load_graph_acl("graph-acl.json")
    acl = write_acl(tmp_path, [{"username": "alice", "knowledge_ids": [DOC]}])
    os.chmod(acl, 0o644)
    with pytest.raises(ValueError):
        load_graph_acl(acl)
    os.chmod(acl, 0o600)
    linked = tmp_path / "acl-link.json"
    linked.symlink_to(acl)
    with pytest.raises(ValueError):
        load_graph_acl(linked)
    huge = tmp_path / "huge-acl.json"
    huge.write_bytes(b"{" + b" " * 65536 + b"}")
    os.chmod(huge, 0o600)
    with pytest.raises(ValueError):
        load_graph_acl(huge)


def test_http_lists_shares_boards_and_shared_snapshot(assets, monkeypatch):
    from backend.main import auth_middleware
    from backend.routers import auth
    from backend.routers.metrics import router
    store, _ = assets
    monkeypatch.setenv("FQ_CRM_ANALYSIS_STATE_DIR", str(store.directory))
    monkeypatch.setenv("FQ_CRM_ANALYSIS_DATA_KIND", "synthetic")
    monkeypatch.setattr(auth, "VALID_CREDENTIALS", {"alice": "hash", "bob": "hash"})
    monkeypatch.setattr(auth, "_verify_token", lambda token: {"test-alice": "alice", "test-bob": "bob"}.get(token))
    app = FastAPI()
    app.middleware("http")(auth_middleware)
    app.include_router(router)
    prefix = "/api/v1/metrics/"
    alice = {"Authorization": "Bearer test-alice", "Idempotency-Key": "http-board"}
    bob = {"Authorization": "Bearer test-bob"}
    with TestClient(app) as client:
        snap = client.post(prefix + "dashboard-snapshots", json=FILTERS.model_dump(mode="json"), headers=alice).json()
        alice["Idempotency-Key"] = "http-save"
        saved = client.post(prefix + "crm-analyses", json={"snapshot_id": snap["snapshot_id"], "title": "HTTP 组板"},
                            headers=alice).json()
        alice["Idempotency-Key"] = "http-share"
        assert client.post(prefix + f"crm-analyses/{saved['analysis_id']}/shares", json={"username": "bob"},
                           headers=alice).status_code == 200
        shares = client.get(prefix + f"crm-analyses/{saved['analysis_id']}/shares", headers=alice)
        assert shares.status_code == 200 and [item["username"] for item in shares.json()["grants"]] == ["bob"]
        assert client.get(prefix + "dashboard-snapshots/" + snap["snapshot_id"], headers=bob).status_code == 200
        alice["Idempotency-Key"] = "http-board-save"
        created = client.post(prefix + "crm-boards", json={"title": "组板", "components": [{
            "block_id": "m1", "title": "GSV", "analysis_id": saved["analysis_id"],
            "snapshot_id": snap["snapshot_id"], "metric": "gsv", "layout": {"x": 0, "y": 0, "w": 4, "h": 4}}]},
            headers=alice)
        assert created.status_code == 200
        listed = client.get(prefix + "crm-boards", headers=alice)
        assert listed.status_code == 200 and listed.json()["items"][0]["board_id"] == created.json()["board_id"]
        alice["Idempotency-Key"] = "http-board-patch"
        patched = client.patch(prefix + "crm-boards/" + created.json()["board_id"], json={
            "title": "新组板", "description": "已核对", "base_revision": 1, "components": [{
                "block_id": "m1", "title": "GSV", "analysis_id": saved["analysis_id"],
                "snapshot_id": snap["snapshot_id"], "metric": "aov", "layout": {"x": 0, "y": 0, "w": 4, "h": 4}}]},
            headers=alice)
        assert patched.status_code == 200
        assert patched.json()["title"] == "新组板"
        assert patched.json()["components"][0]["value"]["amount_fen"] == snap["result"]["aov"]["amount_fen"]
        assert client.get(prefix + "crm-boards/" + created.json()["board_id"], headers=bob).status_code == 404
