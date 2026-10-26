from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from dataclasses import replace
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import socket
import subprocess
import sys
from threading import Thread
from types import SimpleNamespace

import pytest
import duckdb

from backend.contracts.native_warehouse_snapshot import NativeWarehouseSnapshotRead
from backend.contracts.warehouse_snapshot import WarehouseSnapshot
from backend.services.crm_analysis import digest
from backend.services.analytics.warehouse_page_projection import warehouse_projection
from backend.services.crm_native_snapshot_host import create_native_crm_source_app
from backend.services.crm_native_snapshot_source import NativeCrmSnapshotSource
from backend.services.category_service.product_customer import get_product_customer_overview
from backend.services.health.rfm_analysis.analysis import get_rfm_analysis
from backend.services.rfm import get_rfm_r_flow, get_rfm_f_flow, get_rfm_m_flow
from backend.services.warehouse_source import VerifiedWarehouseSource
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case
from backend.tests.test_warehouse_snapshot import snapshot_case as snapshot_case, body, PATH, warm_purchases
from test_native_snapshot_host_chain import serve_app


@pytest.fixture
def warehouse_native_chain(snapshot_case, tmp_path):
    root = Path(__file__).resolve().parents[2]
    configured = os.environ.get("CRM_NATIVE_HOST_PLUGIN")
    assert configured and Path(configured).is_absolute(), "CRM_NATIVE_HOST_PLUGIN must name the maintained author plugin"
    node = shutil.which("node")
    assert node, "Node is required for the native Host producer"
    app, client, store, _, _ = snapshot_case
    directory = tmp_path / "native"
    directory.mkdir(mode=0o700)
    refs = directory / "refs"
    refs.mkdir(mode=0o700)
    NativeCrmSnapshotSource.create(directory=refs, store=store)
    token_file = directory / "token"
    token_file.write_text(os.urandom(32).hex())
    token_file.chmod(0o600)
    state = {"authenticated": True, "auth_checks": 0}
    crm_token = "synthetic_" + "a" * 32

    class CRM(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, value, headers=None):
            raw = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(raw)

        def admitted(self):
            return state["authenticated"] and self.headers.get("Authorization") == "Bearer " + crm_token

        def do_GET(self):
            if self.path == "/api/v1/auth/me":
                state["auth_checks"] += 1
                self.reply(200 if self.admitted() else 401, {"username": "fixture-user"})
            else:
                self.reply(404, {})

        def do_POST(self):
            value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if self.path == "/api/v1/auth/login":
                valid = value == {"username": "fixture-user", "password": "native-fixture-password"}
                self.reply(200 if valid else 401, {"username": "fixture-user", "token": crm_token} if valid else {})
            elif self.path == PATH and self.admitted():
                response = client.post(PATH, json=value, headers={
                    "X-Test-Owner": "fixture-user", "Idempotency-Key": self.headers.get("Idempotency-Key"),
                })
                headers = {key: response.headers[key] for key in ("X-Aggregate-Cache-Status", "X-RFM-Cache-Status")
                           if key in response.headers}
                self.reply(response.status_code, response.json(), headers)
            else:
                self.reply(401, {})

    with ExitStack() as resources:
        crm = ThreadingHTTPServer(("127.0.0.1", 0), CRM)
        resources.callback(crm.server_close)
        crm_thread = Thread(target=crm.serve_forever, daemon=True)
        crm_thread.start()

        def stop_crm():
            crm.shutdown()
            crm_thread.join(timeout=3)
            assert not crm_thread.is_alive()

        resources.callback(stop_crm)
        channel = resources.enter_context(socket.socket())
        channel.bind(("127.0.0.1", 0))
        channel.listen()
        source_origin = f"http://127.0.0.1:{channel.getsockname()[1]}"
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            host_port = reservation.getsockname()[1]
        helper = root / "scripts/crm-calibration/test-support/native-snapshot-host.fixture.mjs"
        child = subprocess.Popen([node, str(helper), configured], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, text=True, cwd=root, env={"PATH": str(Path(node).parent)})
        resources.callback(close_host, child)

        def receive():
            assert select.select([child.stdout], [], [], 12)[0], "owned native Host fixture did not respond"
            line = child.stdout.readline(1024 * 1024)
            assert line.endswith("\n"), "owned native Host fixture closed before returning JSON"
            return json.loads(line)

        def rpc(operation, **extra):
            child.stdin.write(json.dumps({"operation": operation, **extra}) + "\n")
            child.stdin.flush()
            return receive()

        child.stdin.write(json.dumps({"crm_origin": f"http://127.0.0.1:{crm.server_port}", "host_port": host_port,
                                     "source_origin": source_origin, "token_file": str(token_file),
                                     "snapshot_mode": "warehouse"}) + "\n")
        child.stdin.flush()
        assert receive() == {"ready": True}
        source = create_native_crm_source_app(store=store, directory=refs,
                                             host_origin=f"http://127.0.0.1:{host_port}", token_file=token_file)
        with serve_app(source, channel):
            yield rpc, state, app, store


def close_host(child):
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
    assert child.poll() is not None


def warm(app, family):
    if family == "purchases":
        warm_purchases(app)
        return
    with app.state.warehouse_runtime.read(mode="compute"):
        function = {"product": get_product_customer_overview, "analysis": get_rfm_analysis,
                    "r": get_rfm_r_flow, "f": get_rfm_f_flow, "m": get_rfm_m_flow}[family]
        function(start_date="2026-07-01", end_date="2026-07-05")


@pytest.mark.parametrize("family", ["purchases", "product", "analysis", "r", "f", "m"])
def test_maintained_node_preserves_actual_python_snapshot_and_lease(warehouse_native_chain, family):
    rpc, _, app, store = warehouse_native_chain
    warm(app, family)
    assert rpc("login")["connected"] is True
    result = rpc("query_warehouse", request=body(family))
    assert result["ok"] is True, result
    envelope = NativeWarehouseSnapshotRead.model_validate(result["value"])
    assert result["source_ref"] == envelope.ref_id
    assert hashlib.sha256(envelope.snapshot_json.encode()).hexdigest() == envelope.snapshot_json_sha256
    snapshot = WarehouseSnapshot.model_validate_json(envelope.snapshot_json)
    assert snapshot.snapshot_id == envelope.snapshot_id
    assert snapshot.data_kind == envelope.data_kind == "synthetic"
    assert snapshot.payload.family == family
    assert digest(snapshot.payload.model_dump(mode="json")) == envelope.result_sha256
    assert snapshot == store.read_owned_snapshot("fixture-user", envelope.snapshot_id)
    projected, rows, metadata, time_range = warehouse_projection(result["value"], envelope.ref_id, "synthetic")
    assert projected == snapshot and rows
    assert metadata["family"] == family
    assert metadata["warehouse"]["data_version"] == snapshot.warehouse.data_version
    assert time_range == {"start": "2026-07-01", "end": "2026-07-05"}
    if family == "product":
        assert all("name" not in row and "spu_classes" not in row for row in rows)
        assert next(row for row in rows if row["product"] == "爆款面膜F")["current"]["gsv"] == 120
    assert rpc("lease_open", lease_id="current")["ok"] is True
    assert rpc("lease_read_warehouse", lease_id="current", ref_id=envelope.ref_id) == result["value"]
    assert "crm_op_" not in json.dumps(result)


def test_actual_cache_miss_and_coverage_never_produce_a_source_ref(warehouse_native_chain):
    rpc, _, _, _ = warehouse_native_chain
    assert rpc("login")["connected"] is True
    result = rpc("query_warehouse", request=body("analysis"))
    assert result["code"] == "WAREHOUSE_CACHE_MISS" and "source_ref" not in result
    request = body("product")
    request["filters"] = {"start_date": "2026-07-06", "end_date": "2026-07-07"}
    result = rpc("query_warehouse", request=request)
    assert result["code"] == "INSUFFICIENT_COVERAGE" and "source_ref" not in result


def test_warehouse_lease_honors_revocation_relogin_and_crm_401(warehouse_native_chain):
    rpc, state, app, _ = warehouse_native_chain
    rejected = {"error": "NATIVE_HOST_OPERATION_REJECTED"}
    warm(app, "product")
    assert rpc("login")["connected"] is True
    first = rpc("query_warehouse", request=body("product"))
    assert first["ok"] is True
    ref = first["source_ref"]
    assert rpc("lease_open", lease_id="first")["ok"] is True
    assert rpc("login", session_id="other-session")["connected"] is True
    assert rpc("read", session_id="other-session", ref_id=ref) == rejected
    assert rpc("revoke", ref_id=ref)["revoked"] is True
    assert rpc("lease_read_warehouse", lease_id="first", ref_id=ref) == rejected
    previous = rpc("query_warehouse", request=body("product"))
    assert previous["ok"] is True
    assert rpc("lease_open", lease_id="previous")["ok"] is True
    rpc("disconnect")
    assert rpc("login")["connected"] is True
    assert rpc("lease_read_warehouse", lease_id="first", ref_id=ref) == rejected
    assert rpc("lease_read_warehouse", lease_id="previous", ref_id=previous["source_ref"]) == rejected
    assert rpc("read", ref_id=previous["source_ref"]) == rejected
    current = rpc("query_warehouse", request=body("product"))
    assert current["ok"] is True
    state["authenticated"] = False
    assert rpc("read", ref_id=current["source_ref"]) == rejected
    state["authenticated"] = True
    assert rpc("read", ref_id=current["source_ref"]) == rejected


def test_actual_large_money_stays_exact_through_author_host_and_page_projection(warehouse_native_chain, snapshot_case):
    rpc, _, app, _ = warehouse_native_chain
    _, _, _, spec, source_dir = snapshot_case
    runtime = app.state.warehouse_runtime
    runtime.source.close()
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("UPDATE orders SET actual_amount=90071992547409.95 WHERE order_id='s3'")
    source = VerifiedWarehouseSource.seal(spec, source_dir, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    app.state.warehouse_runtime = replace(runtime, source=source)
    warm_purchases(app)
    assert rpc("login")["connected"] is True
    result = rpc("query_warehouse", request=body("purchases"))
    assert result["ok"] is True, result
    envelope = NativeWarehouseSnapshotRead.model_validate(result["value"])
    snapshot = WarehouseSnapshot.model_validate_json(envelope.snapshot_json)
    expected = snapshot.payload.result.gsv_amount_fen
    assert expected > 2**53 and expected % 2 == 1
    assert str(expected) in envelope.snapshot_json
    _, rows, metadata, _ = warehouse_projection(result["value"], envelope.ref_id, "synthetic")
    assert rows[0]["amount_fen"] == str(expected)
    assert metadata["integer_encoding"] == "unsafe-integers-as-decimal-strings"


def test_node_start_failure_closes_owned_http_thread_and_sockets(snapshot_case, tmp_path, monkeypatch):
    module = sys.modules[__name__]
    servers, sockets, threads = [], [], []
    server_type, socket_type, thread_type = ThreadingHTTPServer, socket.socket, Thread

    def server(*args, **kwargs):
        value = server_type(*args, **kwargs)
        servers.append(value)
        return value

    def channel(*args, **kwargs):
        value = socket_type(*args, **kwargs)
        sockets.append(value)
        return value

    def thread(*args, **kwargs):
        value = thread_type(*args, **kwargs)
        threads.append(value)
        return value

    def fail(*args, **kwargs):
        raise OSError("synthetic Node startup failure")

    monkeypatch.setattr(module, "ThreadingHTTPServer", server)
    monkeypatch.setattr(module, "socket", SimpleNamespace(socket=channel))
    monkeypatch.setattr(module, "Thread", thread)
    monkeypatch.setattr(subprocess, "Popen", fail)
    fixture = warehouse_native_chain.__wrapped__(snapshot_case, tmp_path)
    try:
        with pytest.raises(OSError, match="synthetic Node startup failure"):
            next(fixture)
        assert servers and all(value.fileno() == -1 for value in servers)
        assert sockets and all(value.fileno() == -1 for value in sockets)
        assert threads and all(not value.is_alive() for value in threads)
    finally:
        fixture.close()
        for value in servers:
            if any(thread.is_alive() for thread in threads):
                value.shutdown()
            value.server_close()
        for value in sockets:
            value.close()
        for value in threads:
            value.join(timeout=3)
