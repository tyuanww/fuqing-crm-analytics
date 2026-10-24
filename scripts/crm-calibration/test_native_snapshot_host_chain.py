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
