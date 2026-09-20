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

from backend.contracts.crm_analysis import CrmAddReference, CrmSaveAnalysis
from backend.contracts.crm_analysis import CrmSnapshotRequest
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
