from dataclasses import asdict, replace
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Event, Lock
from time import monotonic, sleep

import duckdb
import pytest
from fastapi.testclient import TestClient

from backend.services.crm_native_snapshot_source import NativeCrmLease, NativeCrmSnapshotSource
from backend.services import crm_native_snapshot_host
from backend.contracts.crm_analysis import CrmSnapshotRequest
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases
from backend.tests.test_crm_native_snapshot_host import host_case as host_case, call


def registered(client, case):
    return [{"handle": handle, "ref_id": call(client, case, handle=handle).json()["ref_id"]}
            for handle in case["state"]["handles"]]


def read_many(client, case, items, budget=5000, session="native-session"):
    return client.post("/native-crm-source", json={"operation": "read_many", "items": items,
                       "session_id": session, "budget_ms": budget},
                       headers={"Authorization": "Bearer " + case["token_file"].read_text()})


def test_batch_reads_owned_snapshots_with_one_set_of_live_identity_checks(host_case):
    case = host_case
    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        before = case["state"]["calls"]
        response = read_many(client, case, items)
        assert response.status_code == 200, response.text
        assert response.json()["schema_version"] == "native-crm-source-read-many/v1"
        assert case["state"]["calls"] - before == 7
        values = {value["ref_id"]: value["snapshot"] for value in response.json()["items"]}
        for item, snapshot in zip(items, case["snapshots"]):
            assert values[item["ref_id"]] == snapshot.model_dump(mode="json")


@pytest.mark.parametrize("damage", ["empty", "duplicate-ref", "duplicate-handle", "too-many", "wrong-pair", "unknown-ref"])
def test_batch_refuses_invalid_or_mismatched_items_without_partial_results(host_case, damage):
    case = host_case
    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        expected = 400
        if damage == "empty":
            items = []
        elif damage == "duplicate-ref":
            items[1]["ref_id"] = items[0]["ref_id"]
        elif damage == "duplicate-handle":
            items[1]["handle"] = items[0]["handle"]
        elif damage == "too-many":
            items = (items * 9)[:17]
        elif damage == "wrong-pair":
            items[0]["ref_id"], items[1]["ref_id"] = items[1]["ref_id"], items[0]["ref_id"]
            expected = 404
        else:
            items[1]["ref_id"] = "crm_ref_" + "c" * 32
            expected = 404
        response = read_many(client, case, items)
        assert response.status_code == expected, response.text
        assert "items" not in response.json()


@pytest.mark.parametrize("field,value", [("username", "other"), ("native_session_id", "other-session"),
                                         ("connection_generation", "other-generation")])
def test_batch_never_combines_different_grants(host_case, field, value):
    case = host_case
    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        case["state"]["handles"][items[-1]["handle"]]["identity"][field] = value
        response = read_many(client, case, items)
        assert response.status_code == 401, response.text
        assert "items" not in response.json()


def test_batch_rechecks_revocation_after_the_last_snapshot_read(host_case, monkeypatch):
    case = host_case
    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        lease = NativeCrmLease(case["identity"], lambda: True)
        revoker = NativeCrmSnapshotSource(directory=case["root"] / "refs", store=case["store"], provider=lambda: lease)
        original = case["store"].read_owned_snapshot

        def read(owner, snapshot_id):
            snapshot = original(owner, snapshot_id)
            if snapshot_id == case["snapshots"][-1].snapshot_id:
                revoker.revoke(items[0]["ref_id"])
            return snapshot

        monkeypatch.setattr(case["store"], "read_owned_snapshot", read)
        response = read_many(client, case, items)
        assert response.status_code == 403, response.text
        assert response.json()["code"] == "RESULT_REVOKED"
        assert "items" not in response.json()


@pytest.mark.parametrize("damage,expected", [("revoked", "UNAUTHENTICATED"),
                                           ("unavailable", "IDENTITY_UNAVAILABLE"),
                                           ("generation", "UNAUTHENTICATED")])
def test_batch_rechecks_live_grant_after_constructing_the_result(host_case, monkeypatch, damage, expected):
    case = host_case
    original = crm_native_snapshot_host.snapshot_value

    def changed(ref_id, snapshot):
        value = original(ref_id, snapshot)
        if snapshot.snapshot_id == case["snapshots"][-1].snapshot_id:
            if damage == "generation":
                for observation in case["state"]["handles"].values():
                    observation["identity"]["connection_generation"] = "replacement"
            else:
                case["state"]["status"] = 401 if damage == "revoked" else 503
        return value

    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        monkeypatch.setattr(crm_native_snapshot_host, "snapshot_value", changed)
        response = read_many(client, case, items)
        assert response.status_code == (503 if damage == "unavailable" else 401), response.text
        assert response.json()["code"] == expected
        assert "items" not in response.json()


def test_batch_new_generation_cannot_read_old_registered_refs(host_case):
    case = host_case
    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        changed = replace(case["identity"], connection_generation="replacement")
        for observation in case["state"]["handles"].values():
            observation["identity"]["connection_generation"] = changed.connection_generation
        response = read_many(client, case, items)
        assert response.status_code == 404, response.text
        assert "items" not in response.json()


def test_batch_uses_one_deadline_for_all_items(host_case):
    case = host_case
    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        case["state"]["delay"] = 0.012
        response = read_many(client, case, items, budget=50)
        assert response.status_code == 503, response.text
        assert "items" not in response.json()


def test_batch_accepts_sixteen_distinct_authoritative_snapshots(host_case):
    case = host_case
    with TestClient(case["app"]()) as client, duckdb.connect(str(case["root"] / "fixture.duckdb")) as con:
        items = []
        for index in range(16):
            snapshot = case["store"].capture("fixture-user", f"batch-{index}",
                CrmSnapshotRequest(start_date="2026-01-01", end_date=f"2026-01-{index + 2:02d}"),
                lambda value: query_dashboard_purchases(con, value))
            handle = f"crm_op_{index:032x}"
            case["state"]["handles"][handle] = {"schema_version": "native-crm-snapshot-observation/v1",
                "handle": handle, "identity": asdict(case["identity"]), "snapshot_id": snapshot.snapshot_id,
                "result_sha256": snapshot.result_sha256}
            made = call(client, case, handle=handle)
            assert made.status_code == 200, made.text
            items.append({"handle": handle, "ref_id": made.json()["ref_id"]})
        before = case["state"]["calls"]
        response = read_many(client, case, items)
        assert response.status_code == 200, response.text
        assert {value["ref_id"] for value in response.json()["items"]} == {item["ref_id"] for item in items}
        assert case["state"]["calls"] - before == 7


def test_batch_request_byte_limit_is_enforced_before_source_work(host_case):
    case = host_case
    with TestClient(case["app"]()) as client:
        items = registered(client, case)
        raw = json.dumps({"operation": "read_many", "items": items, "session_id": "native-session", "budget_ms": 5000}).encode()
        for length, status in [(4095, 200), (4096, 200), (4097, 400)]:
            response = client.post("/native-crm-source", content=raw + b" " * (length - len(raw)), headers={
                "Authorization": "Bearer " + case["token_file"].read_text(), "Content-Type": "application/json"})
            assert response.status_code == status, response.text


def test_timed_out_batch_keeps_its_slot_until_the_real_worker_exits(host_case, monkeypatch):
    case = host_case
    gate, entered = Event(), Event()
    lock = Lock()
    count = 0
    original = case["store"].read_owned_snapshot

    def blocked(owner, snapshot_id):
        nonlocal count
        with lock:
            count += 1
            if count == 4:
                entered.set()
        assert gate.wait(10)
        return original(owner, snapshot_id)

    with TestClient(case["app"]()) as client, ThreadPoolExecutor(max_workers=4) as pool:
        items = registered(client, case)
        monkeypatch.setattr(case["store"], "read_owned_snapshot", blocked)
        try:
            jobs = [pool.submit(read_many, client, case, items, 500) for _ in range(4)]
            assert entered.wait(2)
            assert all(job.result(timeout=2).status_code == 503 for job in jobs)
            assert read_many(client, case, items).status_code == 503
            assert count == 4
        finally:
            gate.set()
        deadline = monotonic() + 2
        while monotonic() < deadline:
            response = read_many(client, case, items)
            if response.status_code == 200:
                break
            sleep(0.01)
        assert response.status_code == 200, response.text
