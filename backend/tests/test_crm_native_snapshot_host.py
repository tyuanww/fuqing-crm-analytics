from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import secrets
import sqlite3
from threading import Event, Thread
from time import monotonic, sleep

import duckdb
from fastapi.testclient import TestClient
import pytest

from backend.contracts.crm_analysis import CrmSnapshotRequest
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.asset_state import now_ms
from backend.services.crm_analysis import CrmAnalysisStore
from backend.services.crm_native_snapshot_host import (
    HostBoundSnapshotSource, NativeCrmHostClient, create_native_crm_source_app, read_service_token,
)
from backend.services.crm_native_snapshot_source import (
    NativeCrmIdentity, NativeCrmLease, NativeCrmSnapshotSource, NativeSnapshotExpectation,
)
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases


@pytest.fixture
def host_case(tmp_path):
    for name in ("assets", "refs", "secrets"):
        (tmp_path / name).mkdir(mode=0o700)
    token_file = tmp_path / "secrets" / "service.token"
    token_file.write_text(secrets.token_hex(32))
    token_file.chmod(0o600)
    store = CrmAnalysisStore(tmp_path / "assets", "synthetic")
    warehouse = tmp_path / "fixture.duckdb"
    with duckdb.connect(str(warehouse)) as con:
        con.execute("""CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, actual_amount DOUBLE,
            channel VARCHAR, pay_time TIMESTAMP, is_refund BOOLEAN, is_goujinjin BOOLEAN, order_status VARCHAR)""")
        con.execute("INSERT INTO orders VALUES ('order1','user1',80.01,'货架','2026-01-01',false,false,'交易成功')")
        snapshots = [store.capture("fixture-user", f"fixture-{end}",
                                  CrmSnapshotRequest(start_date="2026-01-01", end_date=f"2026-01-{end:02}"),
                                  lambda value: query_dashboard_purchases(con, value)) for end in (2, 3)]
    identity = NativeCrmIdentity("fixture-user", "native-session", "grant-1", now_ms() + 60000, "synthetic")
    NativeCrmSnapshotSource.create(directory=tmp_path / "refs", store=store)
    handles = {"crm_op_" + digit * 32: {
        "schema_version": "native-crm-snapshot-observation/v1", "handle": "crm_op_" + digit * 32,
        "identity": asdict(identity), "snapshot_id": snapshot.snapshot_id, "result_sha256": snapshot.result_sha256,
    } for digit, snapshot in zip(("a", "b"), snapshots)}
    state = {"status": 200, "handles": handles, "calls": 0, "wait": None, "delay": 0}

    class Host(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.headers.get("Authorization") != "Bearer " + token_file.read_text():
                self.send_response(401)
                self.end_headers()
                return
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            state["calls"] += 1
            if state["wait"] is not None:
                state["wait"].wait(2)
            sleep(state["delay"])
            if self.path == "/native-crm-source/introspect-many":
                values = [state["handles"].get(handle) for handle in request["handles"]]
                value = ({"schema_version": "native-crm-snapshot-observations/v1", "observations": values}
                         if all(values) else None)
            else:
                value = state["handles"].get(request["handle"])
            status = state["status"] if value else 401
            body = json.dumps(value if status == 200 else {"code": "test-rejection"}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Host)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"

    def app():
        return create_native_crm_source_app(store=store, directory=tmp_path / "refs", host_origin=origin,
                                            token_file=token_file)

    try:
        yield {"root": tmp_path, "store": store, "snapshots": snapshots, "identity": identity,
               "token_file": token_file, "origin": origin, "state": state, "app": app}
    finally:
        if state["wait"] is not None:
            state["wait"].set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
        assert not thread.is_alive()


def call(client, case, operation="register", handle="crm_op_" + "a" * 32, **extra):
    body = {"operation": operation, "handle": handle, "session_id": "native-session", "budget_ms": 5000, **extra}
    return client.post("/native-crm-source", json=body, headers={
        "Authorization": "Bearer " + case["token_file"].read_text(),
    })


def test_private_http_register_read_revoke_and_restart_use_authoritative_source(host_case):
    case = host_case
    with TestClient(case["app"]()) as client:
        registered = call(client, case)
        assert registered.status_code == 200
        receipt = registered.json()
        assert receipt["snapshot_id"] == case["snapshots"][0].snapshot_id
        assert receipt["result_sha256"] == case["snapshots"][0].result_sha256
        assert call(client, case).json() == receipt
        read = call(client, case, "read", ref_id=receipt["ref_id"])
        assert read.status_code == 200
        assert read.json()["snapshot"] == case["snapshots"][0].model_dump(mode="json")
        assert read.json()["snapshot"]["result"]["gsv_amount_fen"] == 8001
        assert case["state"]["calls"] > 3
        assert call(client, case, "revoke", ref_id=receipt["ref_id"]).json()["revoked"] is True
        assert call(client, case, "revoke", ref_id=receipt["ref_id"]).status_code == 200
        assert call(client, case, "read", ref_id=receipt["ref_id"]).json()["code"] == "RESULT_REVOKED"
    with TestClient(case["app"]()) as client:
        assert call(client, case).json()["code"] == "RESULT_REVOKED"


def test_wrong_capture_cannot_read_or_revoke_a_different_reference(host_case):
    with TestClient(host_case["app"]()) as client:
        first = call(client, host_case).json()
        second = call(client, host_case, handle="crm_op_" + "b" * 32).json()
        assert first["ref_id"] != second["ref_id"]
        for operation in ("read", "revoke"):
            denied = call(client, host_case, operation, ref_id=second["ref_id"])
            assert denied.status_code == 404
        assert call(client, host_case, "read", handle="crm_op_" + "b" * 32,
                    ref_id=second["ref_id"]).status_code == 200
        assert call(client, host_case, session_id="another-session").status_code == 401


def test_new_connection_cannot_revoke_an_old_ref_via_a_current_capture(host_case):
    with TestClient(host_case["app"]()) as client:
        first = call(client, host_case).json()
        handles = host_case["state"]["handles"]
        replacement = handles["crm_op_" + "b" * 32]
        replacement.update(snapshot_id=first["snapshot_id"], result_sha256=first["result_sha256"])
        replacement["identity"]["connection_generation"] = "grant-2"
        del handles["crm_op_" + "a" * 32]
        current = call(client, host_case, handle="crm_op_" + "b" * 32).json()
        assert current["ref_id"] != first["ref_id"]
        denied = call(client, host_case, "revoke", handle="crm_op_" + "b" * 32, ref_id=first["ref_id"])
        assert denied.status_code == 404
        with closing(sqlite3.connect(host_case["root"] / "refs/native_crm_snapshot_refs.sqlite3")) as con:
            assert con.execute("SELECT count(*) FROM revocations WHERE ref_id=?", (first["ref_id"],)).fetchone()[0] == 0


@pytest.mark.parametrize("status,expected", [(401, "UNAUTHENTICATED"), (503, "IDENTITY_UNAVAILABLE")])
def test_current_host_authentication_is_rechecked_on_each_operation(host_case, status, expected):
    with TestClient(host_case["app"]()) as client:
        receipt = call(client, host_case).json()
        host_case["state"]["status"] = status
        denied = call(client, host_case, "read", ref_id=receipt["ref_id"])
        assert denied.json()["code"] == expected
        assert "test-rejection" not in denied.text


def test_source_receipt_is_not_created_for_wrong_authoritative_digest(host_case):
    host_case["state"]["handles"]["crm_op_" + "a" * 32]["result_sha256"] = "0" * 64
    with TestClient(host_case["app"]()) as client:
        assert call(client, host_case).json()["code"] == "RESULT_STALE"
    with closing(sqlite3.connect(host_case["root"] / "refs/native_crm_snapshot_refs.sqlite3")) as con:
        assert con.execute("SELECT count(*) FROM refs").fetchone()[0] == 0


def test_service_authentication_and_strict_body_stop_before_host_callback(host_case):
    with TestClient(host_case["app"]()) as client:
        for headers in ({}, {"Authorization": "Bearer wrong"},
                        {"Authorization": "Bearer " + host_case["token_file"].read_text(), "Origin": "http://localhost"}):
            assert client.post("/native-crm-source", json={}, headers=headers).status_code == 401
        for extra in ({"owner": "fixture-user"}, {"snapshot_id": host_case["snapshots"][0].snapshot_id},
                      {"budget_ms": True}, {"budget_ms": 5001}, {"handle": "guessed"}, {"ref_id": "extra"}):
            assert call(client, host_case, **extra).status_code == 400
        assert call(client, host_case, "sql").status_code == 400
        duplicate = '{"operation":"register","operation":"read"}'
        assert client.post("/native-crm-source", content=duplicate, headers={
            "Authorization": "Bearer " + host_case["token_file"].read_text(),
            "Content-Type": "application/json",
        }).status_code == 400
        assert host_case["state"]["calls"] == 0


def test_operation_deadline_prevents_late_result_delivery(host_case):
    host_case["state"]["delay"] = 0.15
    with TestClient(host_case["app"]()) as client:
        denied = call(client, host_case, budget_ms=30)
        assert denied.status_code == 503
        assert "ref_id" not in denied.json()


def test_full_worker_capacity_rejects_without_queuing_another_callback(host_case):
    host_case["state"]["wait"] = gate = Event()
    with TestClient(host_case["app"]()) as client, ThreadPoolExecutor(max_workers=4) as pool:
        jobs = [pool.submit(call, client, host_case) for _ in range(4)]
        deadline = monotonic() + 2
        while host_case["state"]["calls"] < 4 and monotonic() < deadline:
            sleep(0.01)
        assert host_case["state"]["calls"] == 4
        denied = call(client, host_case)
        assert denied.status_code == 503
        assert host_case["state"]["calls"] == 4
        gate.set()
        assert all(job.result(timeout=5).status_code == 200 for job in jobs)


@pytest.mark.parametrize("damage", ["public_file", "public_parent", "symlink", "hardlink", "short"])
def test_service_token_requires_owned_private_unlinked_state(host_case, damage):
    path = host_case["token_file"]
    if damage == "public_file":
        path.chmod(0o644)
    elif damage == "public_parent":
        path.parent.chmod(0o755)
    elif damage == "symlink":
        target = path.with_name("real-token")
        path.rename(target)
        path.symlink_to(target)
    elif damage == "hardlink":
        os.link(path, path.with_name("other-token"))
    else:
        path.write_text("short")
    with pytest.raises(ValueError, match="NATIVE_CRM_PRIVATE_SERVICE_TOKEN_REQUIRED"):
        read_service_token(path)


def test_observation_cannot_change_to_a_new_grant_mid_operation(host_case):
    client = NativeCrmHostClient(origin=host_case["origin"], token_file=host_case["token_file"])
    bound = HostBoundSnapshotSource(client=client, directory=host_case["root"] / "refs", store=host_case["store"],
                                   handle="crm_op_" + "a" * 32, session_id="native-session", deadline=monotonic() + 5)
    host_case["state"]["handles"]["crm_op_" + "a" * 32]["identity"]["connection_generation"] = "grant-2"
    with pytest.raises(AnalyticsError) as denied:
        bound.register()
    assert denied.value.code == "UNAUTHENTICATED"


def test_scoped_source_refuses_wrong_snapshot_before_any_revocation(host_case):
    identity = host_case["identity"]
    source = NativeCrmSnapshotSource(directory=host_case["root"] / "refs", store=host_case["store"],
                                    provider=lambda: NativeCrmLease(identity, lambda: True))
    ref = source.register(host_case["snapshots"][1].snapshot_id)
    scoped = NativeCrmSnapshotSource(directory=source.directory, store=source.store, provider=source.provider,
                                    expected_snapshot=NativeSnapshotExpectation(host_case["snapshots"][0].snapshot_id,
                                                                              host_case["snapshots"][0].result_sha256))
    for action in (scoped.read, scoped.revoke):
        with pytest.raises(AnalyticsError) as denied:
            action(ref.ref_id)
        assert denied.value.code == "NOT_FOUND"
    assert source.read(ref.ref_id) == host_case["snapshots"][1]


