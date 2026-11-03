from contextlib import closing
from dataclasses import asdict, replace
import json
import hashlib
from pathlib import Path
import runpy
import shutil
import sqlite3
import subprocess
from types import SimpleNamespace
from unittest.mock import Mock

import duckdb
from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from backend.services.analytics.access import AnalyticsError
from backend.services.crm_analysis import digest
from backend.services.crm_native_snapshot_source import (
    NativeCrmSnapshotSource, NativeSnapshotCatalog, PROJECTION, WAREHOUSE_PROJECTION,
)
from backend.services.category_service.product_customer import get_product_customer_overview
from backend.services.health.rfm_analysis.analysis import get_rfm_analysis
from backend.services.rfm import get_rfm_r_flow, get_rfm_f_flow, get_rfm_m_flow
from backend.services.warehouse_snapshot import WarehouseSnapshotStore
from backend.services.warehouse_source import VerifiedWarehouseSource
from backend.contracts.native_warehouse_snapshot import NativeWarehouseSnapshotRead
from backend.tests.test_crm_native_snapshot_source import source_case as source_case
from backend.tests.test_crm_native_snapshot_host import host_case as host_case, call
from backend.tests.test_warehouse_snapshot import snapshot_case as snapshot_case, body, PATH, warm_purchases
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case


def native_source(source_case, snapshot_case):
    source, legacy, _, _, clock, provider = source_case
    _, _, warehouse, _, _ = snapshot_case
    return NativeCrmSnapshotSource(directory=source.directory, store=NativeSnapshotCatalog(legacy, warehouse),
                                   provider=provider, clock=lambda: clock["now"])


def capture(snapshot_case, family="purchases"):
    app, client, _, _, _ = snapshot_case
    if family == "purchases":
        warm_purchases(app)
    else:
        with app.state.warehouse_runtime.read(mode="compute"):
            function = {"product": get_product_customer_overview, "analysis": get_rfm_analysis,
                        "r": get_rfm_r_flow, "f": get_rfm_f_flow, "m": get_rfm_m_flow}[family]
            function(start_date="2026-07-01", end_date="2026-07-05")
    response = client.post(PATH, json=body(family), headers={"Idempotency-Key": "native"})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("family", ["purchases", "product", "analysis", "r", "f", "m"])
def test_warehouse_family_uses_owned_snapshot_and_versioned_native_ref(source_case, snapshot_case, family):
    snapshot = capture(snapshot_case, family)
    source = native_source(source_case, snapshot_case)
    ref = source.register(snapshot["snapshot_id"])
    assert ref.projection_version == WAREHOUSE_PROJECTION
    assert ref.result_sha256 == snapshot["result_sha256"]
    assert source.read(ref.ref_id).model_dump(mode="json") == snapshot
    assert source.register(snapshot["snapshot_id"]) == ref
    source.revoke(ref.ref_id)
    with pytest.raises(AnalyticsError) as denied:
        source.read(ref.ref_id)
    assert denied.value.code == "RESULT_REVOKED"


def test_catalog_keeps_legacy_ref_payload_and_projection_unchanged(source_case, snapshot_case):
    old, _, snapshot, _, _, _ = source_case
    ref = old.register(snapshot.snapshot_id)
    with closing(sqlite3.connect(old.path)) as conn:
        before = conn.execute("SELECT payload,sha256 FROM refs WHERE ref_id=?", (ref.ref_id,)).fetchone()
    source = native_source(source_case, snapshot_case)
    assert source.read(ref.ref_id) == snapshot
    assert source.register(snapshot.snapshot_id) == ref
    assert ref.projection_version == PROJECTION
    assert ref.source_sha256 == digest(snapshot.model_dump(mode="json"))
    with closing(sqlite3.connect(old.path)) as conn:
        assert conn.execute("SELECT payload,sha256 FROM refs WHERE ref_id=?", (ref.ref_id,)).fetchone() == before


@pytest.mark.parametrize("prefix", ["s", "w"])
def test_catalog_dispatch_does_not_fall_back_on_missing_result(source_case, snapshot_case, monkeypatch, prefix):
    source = native_source(source_case, snapshot_case)
    catalog = source.store
    forbidden = Mock(side_effect=AssertionError("catalog read another source after a miss"))
    wrong = catalog.warehouse if prefix == "s" else catalog.legacy
    monkeypatch.setattr(wrong, "read_owned_snapshot", forbidden)
    snapshot_id = f"crm_{prefix}_" + "0" * 32
    with pytest.raises(HTTPException) as missing:
        catalog.read_owned_snapshot("alice", snapshot_id)
    assert missing.value.status_code == 404
    with pytest.raises(AnalyticsError) as missing:
        source.register(snapshot_id)
    assert missing.value.code == "NOT_FOUND"
    forbidden.assert_not_called()


def test_catalog_rejects_mixed_data_kinds(source_case, tmp_path):
    _, legacy, _, _, _, _ = source_case
    directory = tmp_path / "real-warehouse"
    directory.mkdir(mode=0o700)
    real = WarehouseSnapshotStore.create(directory, "real")
    with pytest.raises(ValueError, match="data kinds"):
        NativeSnapshotCatalog(legacy, real)


@pytest.mark.parametrize("field", ["username", "native_session_id", "connection_generation"])
def test_new_ref_cannot_cross_identity_or_generation(source_case, snapshot_case, field):
    snapshot = capture(snapshot_case)
    source = native_source(source_case, snapshot_case)
    ref = source.register(snapshot["snapshot_id"])
    state = source_case[3]
    state["identity"] = replace(state["identity"], **{field: "other"})
    with pytest.raises(AnalyticsError) as denied:
        source.read(ref.ref_id)
    assert denied.value.code == "NOT_FOUND"


def test_projection_cannot_be_relabelled_as_legacy_even_with_a_valid_ref_digest(source_case, snapshot_case):
    snapshot = capture(snapshot_case)
    source = native_source(source_case, snapshot_case)
    ref = source.register(snapshot["snapshot_id"])
    raw = {**asdict(ref), "projection_version": PROJECTION}
    with closing(sqlite3.connect(source.path)) as conn:
        conn.execute("UPDATE refs SET payload=?,sha256=? WHERE ref_id=?", (json.dumps(raw), digest(raw), ref.ref_id))
        conn.commit()
    with pytest.raises(AnalyticsError) as denied:
        source.read(ref.ref_id)
    assert denied.value.code == "STATE_UNAVAILABLE"


@pytest.mark.parametrize("change", ["id", "schema", "kind"])
def test_owned_adapter_cannot_mislabel_snapshot_identity(source_case, snapshot_case, change):
    snapshot = capture(snapshot_case)
    warehouse = snapshot_case[2].read_owned_snapshot("alice", snapshot["snapshot_id"])
    if change == "id":
        warehouse = warehouse.model_copy(update={"snapshot_id": "crm_w_" + "0" * 32})
    elif change == "schema":
        warehouse = warehouse.model_copy(update={"schema_version": "unregistered/v1"})
    else:
        warehouse = warehouse.model_copy(update={"warehouse": warehouse.warehouse.model_copy(update={"data_kind": "real"})})
    source = native_source(source_case, snapshot_case)
    source.store = SimpleNamespace(data_kind="synthetic", read_owned_snapshot=lambda owner, snapshot_id: warehouse)
    with pytest.raises(AnalyticsError) as denied:
        source.register(snapshot["snapshot_id"])
    assert denied.value.code == "RESULT_UNAVAILABLE"


@pytest.mark.skipif(shutil.which("node") is None, reason="JavaScript snapshot transport requires Node")
@pytest.mark.parametrize("unsafe_money", [False, True])
def test_private_host_round_trip_keeps_exact_warehouse_json(host_case, snapshot_case, unsafe_money):
    from backend.services.crm_native_snapshot_host import create_native_crm_source_app

    app, client, store, spec, source_dir = snapshot_case
    if unsafe_money:
        runtime = app.state.warehouse_runtime
        runtime.source.close()
        with duckdb.connect(str(spec.database_path)) as conn:
            conn.execute("UPDATE orders SET actual_amount=90071992547409.95 WHERE order_id='s3'")
        source = VerifiedWarehouseSource.seal(spec, source_dir, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
        app.state.warehouse_runtime = replace(runtime, source=source)
    warm_purchases(app)
    snapshot = client.post(PATH, json=body("purchases"),
                           headers={"Idempotency-Key": "private-host", "X-Test-Owner": "fixture-user"}).json()
    assert snapshot["snapshot_id"].startswith("crm_w_")
    handle = "crm_op_" + "c" * 32
    host_case["state"]["handles"][handle] = {
        "schema_version": "native-crm-snapshot-observation/v1", "handle": handle,
        "identity": asdict(host_case["identity"]), "snapshot_id": snapshot["snapshot_id"],
        "result_sha256": snapshot["result_sha256"],
    }
    source_app = create_native_crm_source_app(store=NativeSnapshotCatalog(host_case["store"], store),
                                       directory=host_case["root"] / "refs", host_origin=host_case["origin"],
                                       token_file=host_case["token_file"])
    with TestClient(source_app) as source_client:
        registered = call(source_client, host_case, handle=handle)
        assert registered.status_code == 200, registered.text
        receipt = registered.json()
        assert receipt["snapshot_id"] == snapshot["snapshot_id"]
        read = call(source_client, host_case, "read", handle=handle, ref_id=receipt["ref_id"])
        assert read.status_code == 200, read.text
        envelope = NativeWarehouseSnapshotRead.model_validate(read.json())
        assert json.loads(envelope.snapshot_json) == snapshot
        assert envelope.snapshot_json_sha256 == hashlib.sha256(envelope.snapshot_json.encode()).hexdigest()
        echo = "process.stdout.write(JSON.stringify(JSON.parse(require('node:fs').readFileSync(0,'utf8'))))"
        result = subprocess.run(["node", "-e", echo], input=read.text, capture_output=True, text=True, check=True, timeout=5,
                                cwd=Path(__file__).resolve().parents[2])
        forwarded = NativeWarehouseSnapshotRead.model_validate_json(result.stdout)
        assert forwarded.snapshot_json == envelope.snapshot_json
        assert json.loads(forwarded.snapshot_json) == snapshot
        if unsafe_money:
            assert snapshot["payload"]["result"]["gsv_amount_fen"] > 2**53
            lossy = subprocess.run(["node", "-e", echo], input=envelope.snapshot_json, capture_output=True, text=True, check=True,
                                   timeout=5, cwd=Path(__file__).resolve().parents[2])
            assert json.loads(lossy.stdout)["payload"]["result"]["gsv_amount_fen"] != snapshot["payload"]["result"]["gsv_amount_fen"]
        revoked = call(source_client, host_case, "revoke", handle=handle, ref_id=receipt["ref_id"])
        assert revoked.status_code == 200
        assert call(source_client, host_case, "read", handle=handle, ref_id=receipt["ref_id"]).status_code == 403


def test_explicit_warehouse_only_configuration_never_opens_legacy_state(snapshot_case, monkeypatch, tmp_path):
    path = Path(__file__).resolve().parents[2] / "scripts/crm-calibration/run_native_snapshot_source.py"
    load = runpy.run_path(str(path))["configured_snapshot_store"]
    forbidden = Mock(side_effect=AssertionError("warehouse-only source initialized legacy state"))
    monkeypatch.setitem(load.__globals__, "CrmAnalysisStore", forbidden)
    snapshot = capture(snapshot_case)
    store = load(None, snapshot_case[2].directory, "synthetic")
    assert store.read_owned_snapshot("alice", snapshot["snapshot_id"]).model_dump(mode="json") == snapshot
    with pytest.raises(ValueError):
        load(None, None, "synthetic")
    legacy = tmp_path / "unused-legacy"
    legacy.mkdir(mode=0o700)
    (legacy / "crm-analyses.sqlite3").touch()
    with pytest.raises(ValueError):
        load(legacy, tmp_path / "missing-warehouse", "synthetic")
    forbidden.assert_not_called()
