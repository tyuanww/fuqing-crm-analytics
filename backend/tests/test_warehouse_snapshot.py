from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import replace
from datetime import date
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from types import MappingProxyType
from unittest.mock import Mock

import duckdb
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from backend.middleware.query_router import QueryRouterMiddleware
from backend.routers.warehouse_snapshots import router
from backend.services import warehouse_snapshot as snapshots
from backend.services.category_service.product_customer import get_product_customer_overview
from backend.services.health.rfm_analysis.analysis import get_rfm_analysis
from backend.services.rfm import _shared, get_rfm_r_flow, get_rfm_f_flow, get_rfm_m_flow
from backend.services.warehouse_runtime import purchases_semantic_revision, rfm_semantic_revision
from backend.services.warehouse_source import VerifiedWarehouseSource
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case


PATH = "/api/v1/metrics/warehouse-snapshots"
DATES = MappingProxyType({"start_date": "2026-07-01", "end_date": "2026-07-05"})


def body(family):
    filters = {**DATES} if family in {"product", "purchases"} else {"window": {"kind": "dates", **DATES}}
    return {"family": family, "filters": filters}


@pytest.fixture
def snapshot_case(runtime_case, tmp_path):
    runtime, spec, source_dir = runtime_case
    runtime = replace(runtime, semantic_revisions={**runtime.semantic_revisions,
                                                  "rfm": rfm_semantic_revision(), "purchases": purchases_semantic_revision()})
    directory = tmp_path / "snapshots"
    directory.mkdir(mode=0o700)
    store = snapshots.WarehouseSnapshotStore.create(directory, "synthetic")
    app = FastAPI()
    app.state.warehouse_runtime, app.state.warehouse_snapshots = runtime, store
    app.include_router(router)
    app.add_middleware(QueryRouterMiddleware)

    @app.middleware("http")
    async def test_actor(request, call_next):
        request.state.username = request.headers.get("X-Test-Owner", "alice")
        return await call_next(request)

    try:
        with TestClient(app) as client:
            yield app, client, store, spec, source_dir
    finally:
        app.state.warehouse_runtime.source.close()


@pytest.mark.parametrize("family", ["purchases", "product", "analysis", "r", "f", "m"])
def test_each_family_persists_real_aggregate_and_owned_source_proof(snapshot_case, family):
    app, client, store, _, _ = snapshot_case
    if family != "purchases":
        with app.state.warehouse_runtime.read(mode="compute"):
            function = {"product": get_product_customer_overview, "analysis": get_rfm_analysis,
                        "r": get_rfm_r_flow, "f": get_rfm_f_flow, "m": get_rfm_m_flow}[family]
            function(**DATES)
    response = client.post(PATH, json=body(family), headers={"Idempotency-Key": "capture"})
    assert response.status_code == 200, response.text
    value = response.json()
    assert response.headers["Cache-Control"] == "no-store"
    assert value["warehouse"]["data_kind"] == "synthetic"
    assert value["warehouse"]["data_version"].startswith("warehouse-v1:")
    assert value["payload"]["family"] == family
    assert value["payload"]["periods"][0] == {"start": "2026-07-01", "end": "2026-07-05", "cutoff": "2026-06-30"}
    if family == "purchases":
        assert value["payload"]["result"]["gsv_amount_fen"] == 17000
    if family == "product":
        product = next(item for item in value["payload"]["result"]["products"] if item["display_name"] == "爆款面膜F")
        assert product["current"]["gsv"] == 120
        assert value["payload"]["result"]["data_version"] == value["warehouse"]["data_version"]
    assert client.post(PATH, json=body(family), headers={"Idempotency-Key": "capture"}).json() == value
    assert client.get(PATH + "/" + value["snapshot_id"]).json() == value
    assert client.get(PATH + "/" + value["snapshot_id"], headers={"X-Test-Owner": "bob"}).status_code == 404
    assert store.read_owned_snapshot("alice", value["snapshot_id"]).model_dump(mode="json") == value


@pytest.mark.parametrize("family", ["product", "analysis", "r", "f", "m"])
def test_missing_cache_never_computes_or_saves_a_snapshot(snapshot_case, monkeypatch, family):
    from backend.services.health.rfm_analysis import period
    from backend.services.rfm import _flow_engine
    from backend.services.category_service import product_customer

    _, client, store, _, _ = snapshot_case
    forbidden = Mock(side_effect=AssertionError("snapshot cache miss ran business SQL"))
    monkeypatch.setattr(period, "_run_rfm_period_live", forbidden)
    monkeypatch.setattr(_flow_engine, "run_flow_period", forbidden)
    monkeypatch.setattr(product_customer, "_period_metrics", forbidden)
    response = client.post(PATH, json=body(family), headers={"Idempotency-Key": "cold"})
    assert response.status_code == 503 and response.headers["X-Aggregate-Cache-Status"] == "miss"
    with closing(sqlite3.connect(store.path)) as conn:
        assert conn.execute("SELECT COUNT(*) FROM snapshots").fetchone() == (0,)
    forbidden.assert_not_called()


@pytest.mark.parametrize("family", ["purchases", "product", "analysis", "r", "f", "m"])
def test_any_uncovered_snapshot_range_is_explicit_and_not_persisted(snapshot_case, family):
    _, client, store, _, _ = snapshot_case
    request = body(family)
    values = request["filters"] if family in {"purchases", "product"} else request["filters"]["window"]
    values.update(start_date="2026-07-06", end_date="2026-07-07")
    response = client.post(PATH, json=request, headers={"Idempotency-Key": "future"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INSUFFICIENT_COVERAGE"
    with closing(sqlite3.connect(store.path)) as conn:
        assert conn.execute("SELECT COUNT(*) FROM snapshots").fetchone() == (0,)


def test_source_kind_mismatch_refuses_capture_before_any_computation(snapshot_case, tmp_path, monkeypatch):
    app, client, _, _, _ = snapshot_case
    directory = tmp_path / "real-state"
    directory.mkdir(mode=0o700)
    store = snapshots.WarehouseSnapshotStore.create(directory, "real")
    app.state.warehouse_snapshots = store
    forbidden = Mock(side_effect=AssertionError("mismatched source was computed"))
    monkeypatch.setattr(snapshots, "_compute", forbidden)
    assert client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "wrong-kind"}).status_code == 503
    with closing(sqlite3.connect(store.path)) as conn:
        assert conn.execute("SELECT COUNT(*) FROM snapshots").fetchone() == (0,)
    forbidden.assert_not_called()


def test_changed_source_cannot_replay_an_old_key_as_current_data(snapshot_case):
    app, client, _, spec, source_dir = snapshot_case
    first = client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "same"}).json()
    runtime = app.state.warehouse_runtime
    runtime.source.close()
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("UPDATE orders SET channel='直播' WHERE order_id='s3'")
    source = VerifiedWarehouseSource.seal(spec, source_dir, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    app.state.warehouse_runtime = replace(runtime, source=source)
    assert client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "same"}).status_code == 409
    new = client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "new-source"}).json()
    assert new["warehouse"]["data_version"] != first["warehouse"]["data_version"]
    assert new["payload"]["result"]["gsv_amount_fen"] == first["payload"]["result"]["gsv_amount_fen"]
    source.close()
    assert client.get(PATH + "/" + first["snapshot_id"]).json() == first
    assert client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "closed"}).status_code == 503


def test_changed_semantics_cannot_replay_an_old_key(snapshot_case, monkeypatch):
    app, client, _, _, _ = snapshot_case
    assert client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "same"}).status_code == 200
    runtime = app.state.warehouse_runtime
    app.state.warehouse_runtime = replace(runtime, semantic_revisions={**runtime.semantic_revisions, "purchases": "f" * 64})
    forbidden = Mock(side_effect=AssertionError("conflicting semantic revision ran computation"))
    monkeypatch.setattr(snapshots, "_compute", forbidden)
    assert client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "same"}).status_code == 409
    forbidden.assert_not_called()


def test_fixed_period_uses_one_request_date_and_receipt_contains_actual_ranges(snapshot_case, monkeypatch):
    app, client, _, _, _ = snapshot_case
    runtime = app.state.warehouse_runtime
    for day in (date(2026, 7, 5), date(2026, 7, 6)):
        with runtime.read(mode="compute", period_today=day):
            get_rfm_r_flow(period="mtd")
    calls = []

    class BusinessDate(date):
        @classmethod
        def today(cls):
            calls.append(True)
            return cls(2026, 7, 5 if len(calls) == 1 else 6)

    monkeypatch.setattr(_shared, "date", BusinessDate)
    app.state.warehouse_runtime = replace(runtime, business_today=BusinessDate.today)
    request = {"family": "r", "filters": {"window": {"kind": "period", "period": "mtd"}}}
    response = client.post(PATH, json=request, headers={"Idempotency-Key": "one-period"})
    assert response.status_code == 200, response.text
    assert response.json()["payload"]["periods"][0]["end"] == "2026-07-04"
    assert len(calls) == 1
    assert client.post(PATH, json=request, headers={"Idempotency-Key": "one-period"}).status_code == 409


@pytest.mark.parametrize("extra", ["result", "warehouse", "data_kind", "sql"])
def test_client_cannot_supply_authoritative_result_or_source(snapshot_case, extra):
    _, client, _, _, _ = snapshot_case
    assert client.post(PATH, json={**body("purchases"), extra: "forged"}, headers={"Idempotency-Key": "forged"}).status_code == 422


def test_snapshot_survives_a_new_process_and_parallel_receipt_retries(snapshot_case):
    _, client, store, _, _ = snapshot_case

    def capture(_):
        response = client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "parallel"})
        assert response.status_code == 200, response.text
        return response.json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        values = list(pool.map(capture, range(2)))
    assert values[0] == values[1]
    root = Path(__file__).resolve().parents[2]
    code = """import sys
from pathlib import Path
from backend.services.warehouse_snapshot import WarehouseSnapshotStore
print(WarehouseSnapshotStore(Path(sys.argv[1]), 'synthetic').read_owned_snapshot('alice', sys.argv[2]).model_dump_json())
"""
    result = subprocess.run([sys.executable, "-c", code, str(store.directory), values[0]["snapshot_id"]], cwd=root,
                            env={"PATH": os.environ["PATH"], "PYTHONPATH": str(root), "PYTHON_DOTENV_DISABLED": "1"},
                            capture_output=True, text=True, check=True, timeout=20)
    assert json.loads(result.stdout) == values[0]
    with closing(sqlite3.connect(store.path)) as conn:
        assert conn.execute("SELECT COUNT(*) FROM snapshots").fetchone() == (1,)
        assert conn.execute("SELECT COUNT(*) FROM receipts").fetchone() == (1,)


def test_corrupt_snapshot_is_rejected_in_reads_and_receipt_replay(snapshot_case, monkeypatch):
    _, client, store, _, _ = snapshot_case
    first = client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "corrupt"}).json()
    with closing(sqlite3.connect(store.path)) as conn:
        conn.execute("UPDATE snapshots SET payload='{}'")
        conn.commit()
    forbidden = Mock(side_effect=AssertionError("corrupt receipt was silently recomputed"))
    monkeypatch.setattr(snapshots, "_compute", forbidden)
    assert client.get(PATH + "/" + first["snapshot_id"]).status_code == 503
    assert client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "corrupt"}).status_code == 503
    forbidden.assert_not_called()


@pytest.mark.parametrize("rehash_record", [False, True])
def test_receipt_cannot_point_to_another_valid_query_result(snapshot_case, rehash_record):
    _, client, store, _, _ = snapshot_case
    first = client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "all-shop"}).json()
    other = body("purchases")
    other["filters"]["channel"] = "直播"
    second = client.post(PATH, json=other, headers={"Idempotency-Key": "live"}).json()
    assert first["payload"]["result"]["gsv_amount_fen"] != second["payload"]["result"]["gsv_amount_fen"]
    with closing(sqlite3.connect(store.path)) as conn:
        conn.execute("UPDATE receipts SET snapshot_id=? WHERE owner='alice' AND key='all-shop'", (second["snapshot_id"],))
        if rehash_record:
            request_hash = conn.execute("SELECT request_hash FROM receipts WHERE owner='alice' AND key='all-shop'").fetchone()[0]
            checksum = snapshots.digest([snapshots.KIND, "receipt", store.namespace, "alice", "all-shop", request_hash, second["snapshot_id"]])
            conn.execute("UPDATE receipts SET sha256=? WHERE owner='alice' AND key='all-shop'", (checksum,))
        conn.commit()
    response = client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "all-shop"})
    assert response.status_code == 503
    assert "payload" not in response.json()


def test_reassigned_snapshot_owner_fails_integrity_instead_of_disclosing(snapshot_case):
    _, client, store, _, _ = snapshot_case
    first = client.post(PATH, json=body("purchases"), headers={"Idempotency-Key": "owned"}).json()
    with closing(sqlite3.connect(store.path)) as conn:
        conn.execute("UPDATE snapshots SET owner='bob'")
        conn.commit()
    response = client.get(PATH + "/" + first["snapshot_id"], headers={"X-Test-Owner": "bob"})
    assert response.status_code == 503
    assert "payload" not in response.json()


def test_foreign_or_public_state_is_rejected_without_altering_it(tmp_path):
    directory = tmp_path / "foreign"
    directory.mkdir(mode=0o700)
    path = directory / "warehouse_snapshots.sqlite3"
    with closing(sqlite3.connect(path)) as conn:
        conn.execute("CREATE TABLE unrelated(value TEXT)")
        conn.commit()
    path.chmod(0o600)
    before = path.read_bytes()
    with pytest.raises(HTTPException) as error:
        snapshots.WarehouseSnapshotStore.create(directory, "synthetic")
    assert error.value.status_code == 503
    assert path.read_bytes() == before
    assert not Path(str(path) + "-wal").exists()
    directory.chmod(0o755)
    with pytest.raises(ValueError, match="private"):
        snapshots.WarehouseSnapshotStore.create(directory, "synthetic")


@pytest.mark.parametrize("key,status", [(None, 428), ("", 400), ("contains space", 400), ("x" * 101, 400)])
def test_invalid_key_never_computes_a_snapshot(snapshot_case, monkeypatch, key, status):
    _, client, _, _, _ = snapshot_case
    forbidden = Mock(side_effect=AssertionError("invalid receipt key computed a snapshot"))
    monkeypatch.setattr(snapshots, "_compute", forbidden)
    headers = {} if key is None else {"Idempotency-Key": key}
    assert client.post(PATH, json=body("purchases"), headers=headers).status_code == status
    forbidden.assert_not_called()
