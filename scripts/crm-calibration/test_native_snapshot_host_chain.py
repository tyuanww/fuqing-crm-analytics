from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import select
import shutil
import socket
import subprocess
from threading import Thread
from time import monotonic, sleep

import duckdb
import pytest
import uvicorn

from backend.contracts.crm_analysis import CrmSnapshotRequest
from backend.services.crm_native_snapshot_host import create_native_crm_source_app
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases
from backend.tests.test_crm_native_snapshot_host import host_case as host_case


@contextmanager
def serve_app(app, channel):
    server = uvicorn.Server(uvicorn.Config(app, log_level="critical", access_log=False, lifespan="on"))
    thread = Thread(target=lambda: server.run(sockets=[channel]), daemon=True)
    thread.start()
    try:
        deadline = monotonic() + 5
        while not server.started and thread.is_alive() and monotonic() < deadline:
            sleep(0.01)
        assert server.started, "owned native source server did not start"
        yield
    finally:
        server.should_exit = True
        thread.join(timeout=7)
        if thread.is_alive():
            server.force_exit = True
            thread.join(timeout=1)
        assert not thread.is_alive(), "owned native source server did not close"


@pytest.fixture
def native_chain(host_case):
    root = Path(__file__).resolve().parents[2]
    configured = os.environ.get("CRM_NATIVE_HOST_PLUGIN")
    assert configured and Path(configured).is_absolute(), "CRM_NATIVE_HOST_PLUGIN must name the explicit maintained author plugin"
    plugin = Path(configured)
    node = shutil.which("node")
    assert node, "Node is required for the maintained native Host producer"
    case = host_case
    state = {"authenticated": True, "auth_checks": 0}
    crm_token = "synthetic_" + "a" * 32

    class CRM(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, value):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def admitted(self):
            return state["authenticated"] and self.headers.get("Authorization") == "Bearer " + crm_token

        def do_GET(self):
            if self.path == "/api/v1/auth/me":
                state["auth_checks"] += 1
                self.reply(200 if self.admitted() else 401, {"username": "fixture-user", "is_admin": True})
            else:
                self.reply(404, {})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if self.path == "/api/v1/auth/login":
                valid = body == {"username": "fixture-user", "password": "native-fixture-password"}
                self.reply(200 if valid else 401, {"username": "fixture-user", "token": crm_token} if valid else {})
            elif self.path == "/api/v1/metrics/dashboard-snapshots" and self.admitted():
                filters = CrmSnapshotRequest.model_validate(body)
                with duckdb.connect(str(case["root"] / "fixture.duckdb"), read_only=True) as con:
                    snapshot = case["store"].capture("fixture-user", self.headers.get("Idempotency-Key"), filters,
                                                     lambda value: query_dashboard_purchases(con, value))
                self.reply(200, snapshot.model_dump(mode="json"))
            else:
                self.reply(401, {})

    crm = ThreadingHTTPServer(("127.0.0.1", 0), CRM)
    crm_thread = Thread(target=crm.serve_forever, daemon=True)
    crm_thread.start()
    source_socket = socket.socket()
    source_socket.bind(("127.0.0.1", 0))
    source_socket.listen()
    source_origin = f"http://127.0.0.1:{source_socket.getsockname()[1]}"
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        host_port = reservation.getsockname()[1]
    helper = root / "scripts/crm-calibration/test-support/native-snapshot-host.fixture.mjs"
    child = subprocess.Popen([node, str(helper), str(plugin)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, text=True, cwd=root, env={"PATH": str(Path(node).parent)})

    def receive():
        assert select.select([child.stdout], [], [], 12)[0], "owned native Host fixture did not respond"
        line = child.stdout.readline(1024 * 1024)
        assert line.endswith("\n"), "owned native Host fixture closed before returning JSON"
        return json.loads(line)

    def rpc(operation, **extra):
        child.stdin.write(json.dumps({"operation": operation, **extra}) + "\n")
        child.stdin.flush()
        return receive()

    try:
        child.stdin.write(json.dumps({"crm_origin": f"http://127.0.0.1:{crm.server_port}", "host_port": host_port,
                                     "source_origin": source_origin, "token_file": str(case["token_file"])}) + "\n")
        child.stdin.flush()
        assert receive() == {"ready": True}
        app = create_native_crm_source_app(store=case["store"], directory=case["root"] / "refs",
                                           host_origin=f"http://127.0.0.1:{host_port}", token_file=case["token_file"])
        with serve_app(app, source_socket):
            yield rpc, state
    finally:
        if child.poll() is None:
            try:
                child.stdin.write('{"operation":"close"}\n')
                child.stdin.flush()
                child.stdin.close()
                child.wait(timeout=5)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=3)
        child.stdout.close()
        if not child.stdin.closed:
            child.stdin.close()
        source_socket.close()
        crm.shutdown()
        crm.server_close()
        crm_thread.join(timeout=3)
        assert not crm_thread.is_alive()
        assert child.poll() is not None


def test_maintained_node_query_consumes_python_register_read_and_revocation(native_chain, host_case):
    rpc, state = native_chain
    assert rpc("login")["connected"] is True
    query = rpc("query", filters=host_case["snapshots"][0].result.filters.model_dump(mode="json"))
    assert query["ok"] is True
    assert query["value"]["result"]["gsv_amount_fen"] == 8001
    ref_id = query["source_ref"]
    assert ref_id.startswith("crm_ref_")
    assert "crm_op_" not in json.dumps(query)
    read = rpc("read", ref_id=ref_id)
    assert read == query["value"]
    assert rpc("login", session_id="other-session")["connected"] is True
    denied = rpc("read", session_id="other-session", ref_id=ref_id)
    assert denied == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    assert rpc("revoke", ref_id=ref_id)["revoked"] is True
    assert rpc("read", ref_id=ref_id) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    assert state["auth_checks"] > 5


def test_maintained_node_relogin_and_upstream_401_never_restore_old_ref(native_chain, host_case):
    rpc, state = native_chain
    filters = host_case["snapshots"][0].result.filters.model_dump(mode="json")
    assert rpc("login")["connected"] is True
    first = rpc("query", filters=filters)
    rpc("inactive")
    assert rpc("read", ref_id=first["source_ref"]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    rpc("active")
    assert rpc("read", ref_id=first["source_ref"]) == first["value"]
    rpc("disconnect")
    assert rpc("login")["connected"] is True
    assert rpc("read", ref_id=first["source_ref"]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    current = rpc("query", filters=filters)
    assert current["source_ref"] != first["source_ref"]
    state["authenticated"] = False
    assert rpc("read", ref_id=current["source_ref"]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    state["authenticated"] = True
    assert rpc("read", ref_id=current["source_ref"]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}


def test_native_lease_reads_python_source_and_preserves_session_isolation(native_chain, host_case):
    rpc, _ = native_chain
    filters = host_case["snapshots"][0].result.filters.model_dump(mode="json")
    rejected = {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    assert rpc("login")["connected"] is True
    query = rpc("query", filters=filters)
    assert query["ok"] is True
    ref_id = query["source_ref"]
    opened = rpc("lease_open", lease_id="original")
    assert opened["ok"] is True
    identity = opened["identity"]
    assert set(identity) == {"username", "native_session_id", "connection_generation", "expires_at_ms", "data_kind"}
    assert identity["username"] == "fixture-user"
    assert identity["native_session_id"] == "native-session"
    assert identity["data_kind"] == "synthetic"
    assert identity["connection_generation"]
    assert identity["expires_at_ms"] > 0
    expected = {"ok": True, "snapshot_id": query["value"]["snapshot_id"],
                "result_sha256": query["value"]["result_sha256"], "gsv_amount_fen": 8001}
    assert rpc("lease_assert_current", lease_id="original") == {"ok": True}
    assert rpc("lease_read", lease_id="original", ref_id=ref_id) == expected
    assert rpc("inactive") == {"ok": True}
    assert rpc("lease_open", lease_id="inactive") == rejected
    assert rpc("lease_read", lease_id="original", ref_id=ref_id) == rejected
    assert rpc("lease_assert_current", lease_id="original") == rejected
    assert rpc("active") == {"ok": True}
    assert rpc("lease_assert_current", lease_id="original") == {"ok": True}
    assert rpc("lease_read", lease_id="original", ref_id=ref_id) == expected
    assert rpc("login", session_id="other-session")["connected"] is True
    other = rpc("lease_open", session_id="other-session", lease_id="other")
    assert other["ok"] is True
    assert other["identity"]["username"] == identity["username"]
    assert other["identity"]["native_session_id"] == "other-session"
    assert other["identity"]["connection_generation"] != identity["connection_generation"]
    assert rpc("lease_assert_current", lease_id="other") == {"ok": True}
    assert rpc("lease_read", lease_id="other", ref_id=ref_id) == rejected
    other_query = rpc("query", session_id="other-session", filters=filters)
    assert other_query["ok"] is True
    assert other_query["source_ref"] != ref_id
    assert rpc("lease_read", lease_id="other", ref_id=other_query["source_ref"])["gsv_amount_fen"] == 8001
    assert rpc("lease_read", lease_id="original", ref_id=other_query["source_ref"]) == rejected
    assert rpc("lease_read", lease_id="original", ref_id=ref_id) == expected


def test_native_lease_relogin_revocation_and_crm_401_block_hot_reads(native_chain, host_case):
    rpc, state = native_chain
    filters = host_case["snapshots"][0].result.filters.model_dump(mode="json")
    rejected = {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    assert rpc("login")["connected"] is True
    first = rpc("query", filters=filters)
    assert first["ok"] is True
    old = rpc("lease_open", lease_id="old")
    assert old["ok"] is True
    assert rpc("lease_read", lease_id="old", ref_id=first["source_ref"])["gsv_amount_fen"] == 8001
    assert rpc("disconnect")["connected"] is False
    assert rpc("lease_assert_current", lease_id="old") == rejected
    assert rpc("lease_read", lease_id="old", ref_id=first["source_ref"]) == rejected
    assert rpc("login")["connected"] is True
    current = rpc("query", filters=filters)
    assert current["ok"] is True
    assert current["source_ref"] != first["source_ref"]
    opened = rpc("lease_open", lease_id="current")
    assert opened["ok"] is True
    assert opened["identity"]["connection_generation"] != old["identity"]["connection_generation"]
    assert opened["identity"]["native_session_id"] == old["identity"]["native_session_id"]
    assert rpc("lease_assert_current", lease_id="old") == rejected
    assert rpc("lease_read", lease_id="old", ref_id=first["source_ref"]) == rejected
    assert rpc("lease_read", lease_id="old", ref_id=current["source_ref"]) == rejected
    assert rpc("lease_assert_current", lease_id="current") == {"ok": True}
    assert rpc("lease_read", lease_id="current", ref_id=first["source_ref"]) == rejected
    expected = {"ok": True, "snapshot_id": current["value"]["snapshot_id"],
                "result_sha256": current["value"]["result_sha256"], "gsv_amount_fen": 8001}
    assert rpc("lease_read", lease_id="current", ref_id=current["source_ref"]) == expected
    assert rpc("revoke", ref_id=current["source_ref"])["revoked"] is True
    assert rpc("lease_read", lease_id="current", ref_id=current["source_ref"]) == rejected
    assert rpc("lease_assert_current", lease_id="current") == {"ok": True}
    fresh = rpc("query", filters=host_case["snapshots"][1].result.filters.model_dump(mode="json"))
    assert fresh["ok"] is True
    assert fresh["source_ref"] != current["source_ref"]
    assert rpc("lease_read", lease_id="current", ref_id=fresh["source_ref"])["gsv_amount_fen"] == 8001
    state["authenticated"] = False
    assert rpc("lease_read", lease_id="current", ref_id=fresh["source_ref"]) == rejected
    assert rpc("lease_assert_current", lease_id="current") == rejected
    assert rpc("lease_open", lease_id="unauthenticated") == rejected
    state["authenticated"] = True
    assert rpc("lease_assert_current", lease_id="current") == rejected
    assert rpc("lease_read", lease_id="current", ref_id=fresh["source_ref"]) == rejected


@pytest.mark.parametrize("count", [1, 16, 17, 64])
def test_reauthorization_maintained_node_and_python_restore_exact_persistent_snapshot(native_chain, host_case, count):
    rpc, state = native_chain
    case = host_case
    assert rpc("login")["connected"]
    filters = case["snapshots"][0].result.filters.model_dump(mode="json")
    captured = [rpc("query", filters=filters) for _ in range(count)]
    assert all(item["ok"] for item in captured)
    refs = [item["source_ref"] for item in captured]
    path = case["root"] / "refs/native_crm_snapshot_refs.sqlite3"
    before = path.read_bytes()
    rpc("disconnect")
    assert rpc("login")["connected"]
    assert rpc("read", ref_id=refs[0]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    p = rpc("source_authorization_preview", refs=refs)
    assert p["ok"], p
    assert len(p["value"]["sources"]) == count
    assert rpc("read", ref_id=refs[0]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    c = rpc("source_authorization_confirm", preview_id=p["value"]["preview_id"])
    assert c["ok"], c
    assert c["value"]["authorized_refs"] == refs
    assert rpc("source_authorization_confirm", preview_id=p["value"]["preview_id"]) == c
    assert rpc("lease_open", lease_id="restored")["ok"]
    for start in range(0, count, 16):
        batch = rpc("lease_read_many", lease_id="restored", ref_ids=refs[start:start + 16])
        assert [item["ref"] for item in batch] == refs[start:start + 16]
        assert [item["snapshot"] for item in batch] == [item["value"] for item in captured[start:start + 16]]
    assert path.read_bytes() == before
    assert rpc("revoke", ref_id=refs[-1])["revoked"]
    denied = rpc("source_authorization_confirm", preview_id=p["value"]["preview_id"])
    assert denied["code"] == "RESULT_REVOKED", denied


def test_reauthorization_chain_last_revocation_and_relogin_never_activate(native_chain, host_case):
    rpc, _ = native_chain
    assert rpc("login")["connected"]
    filters = host_case["snapshots"][0].result.filters.model_dump(mode="json")
    refs = [rpc("query", filters=filters)["source_ref"] for _ in range(2)]
    rpc("disconnect")
    rpc("login")
    p = rpc("source_authorization_preview", refs=refs)
    assert p["ok"], p
    from backend.services.crm_native_snapshot_source import NativeCrmLease, NativeCrmSnapshotSource
    revoker = NativeCrmSnapshotSource(directory=host_case["root"] / "refs", store=host_case["store"],
                                    provider=lambda: NativeCrmLease(host_case["identity"], lambda: True))
    revoker.revoke(refs[-1])
    c = rpc("source_authorization_confirm", preview_id=p["value"]["preview_id"])
    assert c["code"] == "RESULT_REVOKED", c
    assert rpc("read", ref_id=refs[0]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    p = rpc("source_authorization_preview", refs=refs[:1])
    assert p["ok"], p
    rpc("disconnect")
    rpc("login")
    assert rpc("source_authorization_confirm", preview_id=p["value"]["preview_id"])["ok"] is False
    assert rpc("read", ref_id=refs[0]) == {"error": "NATIVE_HOST_OPERATION_REJECTED"}
