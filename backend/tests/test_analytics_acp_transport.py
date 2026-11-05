"""P3-3b contract: the ACP stdio transport behind the five-operation seam.

These tests drive a real reader/writer pair over OS pipes against an
in-process fake ACP child, so framing, notification projection, cancellation,
child death and reconnect are exercised as the production transport sees them.
The child is injected through the transport's spawn factory; no ``dsh``
process, model or network is involved.

Failure-mapping parity is asserted at two boundaries:

* the projection table is compared with the *actual* bridge table
  (``dsh-plugins/analytics-workbench/src/native-evidence.mjs``) through Node,
  including the three rc.5 codec collapses the design accepts as losses;
* the dispatcher is run against the ACP transport for health, dispatch and
  observation failures and must produce the same run state as the bridge
  transport test (slot held, one UNKNOWN, admission closed).
"""

from __future__ import annotations

import json
import os
import select
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import asdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.analytics_runtime import build_host_transport, runtime_app
from backend.contracts.analytics import (
    AnalyticsCancelRequest,
    AnalyticsConversationRequest,
    AnalyticsRunRequest,
)
from backend.services.analytics import transport
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.acp_transport import (
    AcpTransport,
    AcpTransportError,
    AcpUnsupportedOperation,
)
from backend.services.analytics.first_purchase.native_identity import NativeSessionIdentityResolver
from backend.services.analytics.jobs import TransportPolicy
from backend.services.analytics.runtime import HostBridge, RunDispatcher, execute_acp_fixture
from backend.services.analytics.transport import HostTransport
from backend.tests.analytics_run_support import (
    actor, fixture_result, make_store, profile, sqlite_connection, successful_step, synthetic_fixture,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
NATIVE_EVIDENCE = REPO_ROOT / "dsh-plugins" / "analytics-workbench" / "src" / "native-evidence.mjs"
SESSION = "native-session"
GATEWAY = "g" * 32
IDENTITY = {
    "schema_version": "first-purchase-session-identity/v1",
    "owner_id": "crm-owner",
    "data_scope": "first-purchase-fixture",
    "query_access": "GRANTED",
}


def wait_until(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def native_request(key="native-1", text="合成渠道", session=SESSION):
    return {"sessionId": session, "requestId": key, "mode": "queue",
            "content": [{"type": "text", "text": text}], "clientTimeZone": "Asia/Shanghai"}


def dispatch_payload(key="native-1", *, attempt="attempt-1", text="合成渠道", with_native=True,
                     deadline_ms=0):
    inner = {"question": text}
    if with_native:
        inner["native_request"] = native_request(key, text)
    return {"run_id": "run-1", "attempt_id": attempt, "session_id": SESSION, "request_id": key,
            "payload": inner, "payload_hash": "h" * 64, "deadline_ms": deadline_ms}


def identity_payload():
    return {"session_id": SESSION}


class FakeAcpServer:
    """One scripted ACP agent; every spawned child shares its persisted sessions."""

    def __init__(self):
        self.children = []
        self.methods = []
        self.requests = []
        self.notifications = []
        self.prompts = []
        self.cancels = 0
        self.permission_responses = []
        self.sessions = set()
        self.fail_initialize = False
        self.fail_new = False
        self.fail_resume = False
        self.prompt_mode = "end_turn"
        self.tool_calls = True
        self.permission = False
        self.contaminate_stdout = False
        self.contaminate_on_list = False
        self.cancel_delay = 0.05
        self.close_calls = 0
        self.close_mode = "error"
        self.prompt_started = threading.Event()
        # Optional end-to-end hook: the fake child performs the real callback
        # the workbench tool would make, proving the binding resolver is used.
        self.tool_call_hook = None
        self.tool_call_error = None
        self._inflight = None
        self._lock = threading.Lock()
        self._server_request_id = 900

    # -- injected spawn factory -------------------------------------------

    def spawn(self, argv, *, cwd, env):
        child = FakeAcpChild(self, argv, cwd, env)
        self.children.append(child)
        return child

    @property
    def child(self):
        return self.children[-1]

    def release(self, stop_reason):
        with self._lock:
            inflight = self._inflight
            self._inflight = None
        if inflight is not None:
            inflight["respond"](stop_reason)

    def tool_update(self, call_id="call-1", status="completed"):
        """Emit one tool update on the in-flight prompt's stream, then return."""
        with self._lock:
            inflight = self._inflight
        if inflight is None:
            raise AssertionError("no in-flight prompt to attach a tool update to")
        update = {"sessionUpdate": "tool_call" if status == "in_progress" else "tool_call_update",
                  "toolCallId": call_id, "title": "native_query", "kind": "other", "status": status}
        self.child._notify("session/update", {"sessionId": inflight["session_id"], "update": update})

    def server_request_id(self):
        with self._lock:
            self._server_request_id += 1
            return self._server_request_id


class FakeAcpChild:
    """A real pipe-backed child; ``stdin``/``stdout``/``stderr`` match Popen."""

    def __init__(self, server, argv, cwd, env):
        self.server = server
        self.argv = list(argv)
        self.cwd = cwd
        self.env = dict(env)
        self._stdin_r, self._stdin_w = os.pipe()
        self._stdout_r, self._stdout_w = os.pipe()
        self._stderr_r, self._stderr_w = os.pipe()
        self.stdin = os.fdopen(self._stdin_w, "wb", buffering=0)
        self.stdout = os.fdopen(self._stdout_r, "rb", buffering=0)
        self.stderr = os.fdopen(self._stderr_r, "rb", buffering=0)
        self._returncode = None
        self._killed = threading.Event()
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()
        # stderr is a log channel: a JSON-RPC shaped line here must be ignored.
        try:
            os.write(self._stderr_w, b'{"jsonrpc":"2.0","id":1,"result":{"sessions":[]}}\n')
            os.close(self._stderr_w)
        except OSError:
            pass

    # -- Popen subset ------------------------------------------------------

    def poll(self):
        return self._returncode

    def kill(self):
        if self._returncode is None:
            self._returncode = -9
            self._killed.set()
            self._close_stdout()
            try:
                self.stdin.close()
            except OSError:
                pass
            try:
                os.close(self._stdin_r)
            except OSError:
                pass

    def wait(self, timeout=None):
        self._thread.join(timeout)
        return self._returncode if self._returncode is not None else 0

    # -- child loop --------------------------------------------------------

    def _serve(self):
        buffer = b""
        while not self._killed.is_set():
            try:
                ready, _, _ = select.select([self._stdin_r], [], [], 0.02)
            except (OSError, ValueError):
                break
            if not ready:
                continue
            try:
                chunk = os.read(self._stdin_r, 65536)
            except OSError:
                break
            if not chunk:
                break
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                if line.strip():
                    self._handle(json.loads(line))
        if self._returncode is None:
            self._returncode = 0
        self._killed.set()
        self._close_stdout()

    def _close_stdout(self):
        try:
            os.close(self._stdout_w)
        except OSError:
            pass

    def _write(self, message):
        try:
            os.write(self._stdout_w, json.dumps(message).encode() + b"\n")
        except OSError:
            pass

    def _respond(self, rpc_id, result):
        self._write({"jsonrpc": "2.0", "id": rpc_id, "result": result})

    def _respond_error(self, rpc_id, code, message):
        self._write({"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message}})

    def _notify(self, method, params):
        self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def _handle(self, message):
        method = message.get("method")
        if method is None:
            # A response to one of our server->client requests.
            self.server.permission_responses.append(
                (message.get("id"), message.get("result"), message.get("error")))
            return
        params = message.get("params") or {}
        if message.get("id") is None:
            self.server.notifications.append((method, params))
            if method == "session/cancel":
                self._handle_cancel()
            return
        self.server.methods.append(method)
        self.server.requests.append((method, params))
        if method == "initialize":
            if self.server.fail_initialize:
                self._respond_error(message["id"], -32603, "initialize failed")
            else:
                self._respond(message["id"], {
                    "protocolVersion": 1,
                    "agentInfo": {"name": "fake-acp", "version": "0"},
                    "agentCapabilities": {"sessionCapabilities": {"resume": {}, "list": {}, "close": {}}},
                    "authMethods": [],
                })
        elif method == "session/list":
            if self.server.contaminate_on_list:
                try:
                    os.write(self._stdout_w, b"[fake] a log line on stdout\n")
                except OSError:
                    pass
                return
            self._respond(message["id"], {"sessions": [
                {"sessionId": session_id, "cwd": self.cwd} for session_id in self.server.sessions]})
        elif method == "session/new":
            if self.server.fail_new:
                self._respond_error(message["id"], -32603, "new session failed")
                return
            session_id = str(uuid.uuid4())
            self.server.sessions.add(session_id)
            self._respond(message["id"], {"sessionId": session_id, "configOptions": []})
        elif method == "session/resume":
            session_id = params.get("sessionId")
            if self.server.fail_resume or session_id not in self.server.sessions:
                self._respond_error(message["id"], -32602, "session is not resumable")
                return
            self._respond(message["id"], {"configOptions": []})
        elif method == "session/prompt":
            self._prompt(message, params)
        elif method == "session/close":
            self.server.close_calls += 1
            if self.server.close_mode == "settle":
                with self.server._lock:
                    inflight = self.server._inflight
                    self.server._inflight = None
                if inflight is not None:
                    inflight["respond"]("cancelled")
                self._respond(message["id"], {})
            elif self.server.close_mode == "hang":
                return
            else:
                self._respond_error(message["id"], -32603, "close failed")
        else:
            self._respond_error(message["id"], -32601, f"method not found: {method}")

    def _prompt(self, message, params):
        self.server.prompts.append(params["prompt"][0]["text"])
        self.server.prompt_started.set()
        if self.server.contaminate_stdout:
            try:
                os.write(self._stdout_w, b"not-json\n")
            except OSError:
                pass
            return

        def respond(stop_reason):
            self._respond(message["id"], {"stopReason": stop_reason})

        with self.server._lock:
            self.server._inflight = {"respond": respond, "session_id": params["sessionId"]}
        mode = self.server.prompt_mode
        if mode in {"hang", "hang_ignore_cancel", "cancel_then_settle"}:
            return

        def run():
            if self.server.permission:
                request_id = self.server.server_request_id()
                self._write({"jsonrpc": "2.0", "id": request_id, "method": "session/request_permission",
                             "params": {"sessionId": params["sessionId"],
                                        "toolCall": {"toolCallId": "permission-call"},
                                        "options": [{"optionId": "allow-once", "name": "Allow once",
                                                     "kind": "allow_once"},
                                                    {"optionId": "reject-once", "name": "Reject",
                                                     "kind": "reject_once"}]}})
            if mode == "end_turn":
                if self.server.tool_calls:
                    if self.server.tool_call_hook is not None:
                        try:
                            self.server.tool_call_hook(params["sessionId"])
                        except Exception as error:  # noqa: BLE001 - surface the test failure
                            self.server.tool_call_error = error
                            self._respond_error(message["id"], -32603, "tool callback failed")
                            return
                    self._notify("session/update", {"sessionId": params["sessionId"], "update": {
                        "sessionUpdate": "tool_call", "toolCallId": "call-1", "title": "native_query",
                        "kind": "other", "status": "in_progress", "rawInput": {}}})
                    self._notify("session/update", {"sessionId": params["sessionId"], "update": {
                        "sessionUpdate": "tool_call_update", "toolCallId": "call-1",
                        "status": "completed", "content": []}})
                respond("end_turn")
            elif mode == "no_tools":
                respond("end_turn")
            elif mode == "cancelled":
                respond("cancelled")
            elif mode == "max_tokens":
                respond("max_tokens")
            elif mode == "refusal":
                respond("refusal")
            elif mode == "error":
                self._respond_error(message["id"], -32603, "turn failed")
            else:  # pragma: no cover - a test typo must not hang the suite
                self._respond_error(message["id"], -32603, f"unknown prompt mode {mode}")

        threading.Thread(target=run, daemon=True).start()

    def _handle_cancel(self):
        self.server.cancels += 1
        if self.server.prompt_mode != "cancel_then_settle":
            return
        with self.server._lock:
            inflight = self.server._inflight
        if inflight is not None:
            threading.Timer(self.server.cancel_delay,
                            lambda: inflight["respond"]("cancelled")).start()


@pytest.fixture
def acp(tmp_path):
    server = FakeAcpServer()
    transport = AcpTransport(
        cwd=str(tmp_path),
        env={"DSH_HOME": str(tmp_path / "acp-home")},
        spawn=server.spawn,
        timeout=5.0,
    )
    try:
        yield server, transport
    finally:
        transport.close()


def observe_until(transport, payload, outcome, timeout=5.0):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = transport.call("observe", payload)
        if last["outcome"] == outcome:
            return last
        assert last["outcome"] == "RUNNING", last
        time.sleep(0.01)
    raise AssertionError(f"observation never reached {outcome}: {last}")


# ---------------------------------------------------------------------------
# All five operations and the explicit ACP capability boundary
# ---------------------------------------------------------------------------


def test_all_five_operations_route_through_the_acp_transport(acp):
    server, receiver = acp
    assert isinstance(receiver, HostTransport)
    assert receiver.capabilities == {"health", "dispatch", "observe", "cancel"}
    assert set(receiver.capabilities) | {"identity"} == set(transport.TRANSPORT_OPERATIONS)

    assert receiver.call("health", {}) == {"ready": True}
    assert server.methods[:2] == ["initialize", "session/list"]

    dispatch = dispatch_payload()
    receipt = receiver.call("dispatch", dispatch)
    assert receipt["accepted"] is True
    assert receipt["transport"] == "acp"
    assert receipt["acp_session_id"] in server.sessions
    assert str(receipt["prompt_rpc_id"]).isdigit()
    assert server.prompt_started.wait(5.0)
    assert server.prompts == ["合成渠道"]
    settled = observe_until(receiver, dispatch, "SUCCEEDED")
    assert settled["execution_exited"] is True
    assert settled["successful_call_ids"] == ["call-1"]
    assert settled["run_id"] == dispatch["run_id"]
    assert settled["attempt_id"] == dispatch["attempt_id"]
    assert settled["session_id"] == dispatch["session_id"]
    assert settled["request_id"] == dispatch["request_id"]

    # One prompt per session; a second one is refused before it reaches the child.
    server.prompt_mode = "hang_ignore_cancel"
    second = dispatch_payload("native-2", attempt="attempt-2")
    assert receiver.call("dispatch", second)["accepted"] is True
    assert wait_until(lambda: len(server.prompts) == 2)
    with pytest.raises(AcpTransportError):
        receiver.call("dispatch", dispatch_payload("native-3", attempt="attempt-3"))
    assert server.prompts == ["合成渠道", "合成渠道"]

    # Cancel is a notification and a receipt, never exit evidence.
    started = time.monotonic()
    assert receiver.call("cancel", second) == {"accepted": True}
    assert time.monotonic() - started < 0.5
    assert wait_until(lambda: server.cancels == 1)
    cancel_message = server.notifications[-1]
    assert cancel_message[0] == "session/cancel" and "id" not in cancel_message[1]
    assert receiver.call("observe", second)["outcome"] == "RUNNING"
    server.release("cancelled")
    assert observe_until(receiver, second, "CANCELLED")["execution_exited"] is True

    # Identity stays bridge-only and is explicit about it; the resolver maps it
    # to the pre-existing retryable 503 rather than pretending to work.
    with pytest.raises(AcpUnsupportedOperation):
        receiver.call("identity", identity_payload())
    resolver = NativeSessionIdentityResolver(receiver, SESSION, GATEWAY)
    with pytest.raises(AnalyticsError) as error:
        resolver.resolve("Bearer " + GATEWAY)
    assert (error.value.status, error.value.code, error.value.retryable) == (
        503, "IDENTITY_UNAVAILABLE", True)
    assert "identity" not in [method for method, _params in server.requests]


def test_identity_capability_is_a_transport_flag_not_a_spawn_side_effect(acp):
    server, receiver = acp
    assert not receiver.supports("identity")
    assert receiver.supports("observe")
    with pytest.raises(AcpUnsupportedOperation):
        receiver.call("identity", identity_payload())
    assert server.children == []


# ---------------------------------------------------------------------------
# ACP projection and termination semantics
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("mode,outcome,error_code", [
    ("end_turn", "SUCCEEDED", None),
    ("cancelled", "CANCELLED", None),
    ("max_tokens", "FAILED", "MODEL_FAILED"),
    ("refusal", "FAILED", "MODEL_FAILED"),
    ("error", "FAILED", "MODEL_FAILED"),
])
def test_stop_reason_maps_into_the_existing_evidence_classes(tmp_path, mode, outcome, error_code):
    server = FakeAcpServer()
    server.prompt_mode = mode
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        assert receiver.call("health", {}) == {"ready": True}
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        evidence = observe_until(receiver, payload, outcome)
        assert evidence["execution_exited"] is True
        assert evidence.get("error_code") == error_code
    finally:
        receiver.close()


def test_end_turn_without_tool_calls_is_a_terminal_failure_not_a_manufactured_success(tmp_path):
    # rc.5 collapses a blocked turn (bridge: NEEDS_INPUT) into end_turn. With no
    # tool-call evidence success is unproven, but the prompt response still
    # proves the turn exited: FAILED/EXECUTION_UNKNOWN releases the slot.
    server = FakeAcpServer()
    server.prompt_mode = "no_tools"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        assert wait_until(lambda: server.prompts)
        evidence = observe_until(receiver, payload, "FAILED")
        assert evidence["execution_exited"] is True
        assert evidence["error_code"] == "EXECUTION_UNKNOWN"
        assert evidence["successful_call_ids"] == []
    finally:
        receiver.close()


def test_prompt_text_comes_from_the_native_request_and_stays_bound(tmp_path):
    server = FakeAcpServer()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        receiver.call("dispatch", dispatch_payload(text="渠道复购率"))
        assert wait_until(lambda: server.prompts == ["渠道复购率"])

        mismatched = dispatch_payload("native-2", attempt="attempt-2")
        mismatched["payload"]["native_request"]["requestId"] = "somebody-else"
        with pytest.raises(AcpTransportError):
            receiver.call("dispatch", mismatched)
        assert server.prompts == ["渠道复购率"]

        no_text = dispatch_payload("native-3", attempt="attempt-3", with_native=False, text=" ")
        with pytest.raises(AcpTransportError):
            receiver.call("dispatch", no_text)
    finally:
        receiver.close()


def test_permission_requests_are_answered_fail_closed(tmp_path):
    server = FakeAcpServer()
    server.permission = True
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        observe_until(receiver, payload, "SUCCEEDED")
        assert wait_until(lambda: bool(server.permission_responses))
        _request_id, result, error = server.permission_responses[0]
        assert error is None
        assert result == {"outcome": {"outcome": "cancelled"}}
    finally:
        receiver.close()


# ---------------------------------------------------------------------------
# Cancel: fire-and-forget notification, settlement is the only exit proof
# ---------------------------------------------------------------------------


def test_cancel_is_fire_and_forget_and_only_settlement_proves_exit(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "cancel_then_settle"
    server.cancel_delay = 0.3
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)

        started = time.monotonic()
        assert receiver.call("cancel", payload) == {"accepted": True}
        assert time.monotonic() - started < 0.2
        # No prompt response has been written yet: the receipt proves nothing.
        assert receiver.call("observe", payload)["outcome"] == "RUNNING"
        assert observe_until(receiver, payload, "CANCELLED")["execution_exited"] is True
        assert server.methods.count("session/cancel") == 0
        assert wait_until(lambda: server.cancels == 1)
    finally:
        receiver.close()


def test_aborted_after_cancel_maps_to_cancelled(tmp_path):
    """rc.5 reports an aborted turn as end_turn; the cancel record decides."""
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)
        assert receiver.call("cancel", payload)["accepted"] is True
        server.release("end_turn")
        evidence = observe_until(receiver, payload, "CANCELLED")
        assert evidence["execution_exited"] is True
        assert evidence["successful_call_ids"] == []
    finally:
        receiver.close()


def test_cancel_then_tool_call_then_end_turn_is_cancelled_never_succeeded(tmp_path):
    # The dangerous race: the cancel is in flight, a tool completes, then the
    # turn settles as a plain end_turn. Without the cancel record this would
    # read as SUCCEEDED; it must read as CANCELLED.
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)
        assert receiver.call("cancel", payload)["accepted"] is True
        server.tool_update("call-1", "in_progress")
        server.tool_update("call-1", "completed")
        server.release("end_turn")
        evidence = observe_until(receiver, payload, "CANCELLED")
        assert evidence["execution_exited"] is True
        assert evidence["successful_call_ids"] == ["call-1"]  # evidence kept, outcome truthful
    finally:
        receiver.close()


def test_aborted_without_a_cancel_remains_the_documented_codec_loss(tmp_path):
    # No cancel record exists, so an aborted turn is indistinguishable from a
    # completed one over ACP (design §2/R3 accepted loss). This is not a success
    # classification bug: it is the codec collapse the design lists.
    server = FakeAcpServer()
    server.prompt_mode = "end_turn"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        evidence = observe_until(receiver, payload, "SUCCEEDED")
        assert evidence["execution_exited"] is True
        assert evidence["successful_call_ids"] == ["call-1"]
        assert server.cancels == 0
    finally:
        receiver.close()


def test_a_normal_success_is_not_misclassified_by_a_previous_cancel(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        first = dispatch_payload("native-1", attempt="attempt-1")
        receiver.call("dispatch", first)
        assert server.prompt_started.wait(5.0)
        assert receiver.call("cancel", first)["accepted"] is True
        server.release("cancelled")
        assert observe_until(receiver, first, "CANCELLED")["execution_exited"] is True

        server.prompt_mode = "end_turn"
        second = dispatch_payload("native-2", attempt="attempt-2")
        receiver.call("dispatch", second)
        evidence = observe_until(receiver, second, "SUCCEEDED")
        assert evidence["execution_exited"] is True
        assert evidence["successful_call_ids"] == ["call-1"]
        assert server.cancels == 1
    finally:
        receiver.close()


# ---------------------------------------------------------------------------
# Deadline passed with a prompt in flight: bounded close, then restart
# ---------------------------------------------------------------------------


def expired_deadline():
    return int(time.time() * 1000) - 1000


def test_expired_prompt_closes_the_session_and_accepts_a_real_settlement(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    server.close_mode = "settle"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0,
                            cancel_grace=0.0, close_timeout=1.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload(deadline_ms=expired_deadline())
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)
        assert receiver.call("cancel", payload)["accepted"] is True
        evidence = observe_until(receiver, payload, "CANCELLED")
        # The close caused a real prompt response; CANCELLED is settlement-backed.
        assert evidence["execution_exited"] is True
        assert server.close_calls == 1
    finally:
        receiver.close()


def test_expired_prompt_without_settlement_restarts_the_child_and_stays_unknown(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    server.close_mode = "hang"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0,
                            cancel_grace=0.0, close_timeout=0.2)
    try:
        receiver.call("health", {})
        payload = dispatch_payload(deadline_ms=expired_deadline())
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)
        assert receiver.call("cancel", payload)["accepted"] is True
        child = server.child
        with pytest.raises(AcpTransportError) as error:
            receiver.call("observe", payload)
        assert "deadline expired without settlement" in str(error.value)
        assert server.close_calls == 1
        assert wait_until(lambda: child.poll() is not None)
        # The lost settlement is never rewritten as CANCELLED; the attempt
        # stays unresolved and a later call starts a fresh child.
        with pytest.raises(AcpTransportError):
            receiver.call("observe", payload)
        assert receiver.call("health", {}) == {"ready": True}
        assert len(server.children) == 2
    finally:
        receiver.close()


def test_deadline_expiry_does_not_fire_before_a_cancel_request(tmp_path):
    # A past deadline alone is not a stop request: the kernel owns deadlines
    # and only an in-flight cancel makes the transport escalate.
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    server.close_mode = "settle"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0,
                            cancel_grace=0.0, close_timeout=1.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload(deadline_ms=expired_deadline())
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)
        assert receiver.call("observe", payload)["outcome"] == "RUNNING"
        assert server.close_calls == 0
    finally:
        receiver.close()


def test_dispatcher_deadline_expiry_fences_lost_and_releases_the_slot(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    server.close_mode = "hang"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0,
                            cancel_grace=0.0, close_timeout=0.2)
    store = make_store(tmp_path / "state", resource_profile=profile(run_timeout_ms=500, query_timeout_ms=100),
                       transport_policy=TransportPolicy(mode="acp"))
    conversation = store.create_conversation(
        actor(), "native", AnalyticsConversationRequest(), runtime_session_id=SESSION)
    run = store.accept(actor(), conversation.conversation_id, "native-1",
                       AnalyticsRunRequest(question="合成渠道"), native_request=native_request())
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()  # claim + dispatch before the 500ms deadline
        intent = store.runtime_work()[0]["intent"]
        assert store.acp_binding(intent.run_id, intent.attempt_id).state == "BOUND"
        time.sleep(0.7)
        for _ in range(200):
            dispatcher.tick()
            snapshot = store.get(actor(), run.run_id)
            if server.close_calls:
                break
            time.sleep(0.01)
        assert server.close_calls == 1
        assert wait_until(lambda: server.child.poll() is not None)
        snapshot = store.get(actor(), run.run_id)
        # The deadline expired and the settlement is lost: the attempt is fenced
        # FAILED/EXECUTION_UNKNOWN, the binding records LOST, and the unique
        # active slot is released. It never becomes CANCELLED or SUCCEEDED.
        assert snapshot.status == "FAILED"
        assert snapshot.diagnostics.error_code == "EXECUTION_UNKNOWN"
        assert snapshot.diagnostics.execution_active is False
        assert store.acp_binding(intent.run_id, intent.attempt_id).state == "LOST"
        # The next queued run is claimable again: one bad turn no longer stops
        # all automation.
        second = store.accept(actor(), conversation.conversation_id, "native-2",
                              AnalyticsRunRequest(question="合成渠道"), native_request=native_request("native-2"))
        claimed = store.claim_next(lambda _owner: actor())
        assert claimed is not None and claimed.run_id == second.run_id
    finally:
        dispatcher.close()
        receiver.close()


# ---------------------------------------------------------------------------
# Child death, lost settlement and bounded reconnect
# ---------------------------------------------------------------------------


def test_sigkill_loses_settlement_and_the_next_call_reconnects(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)
        first_child = server.child

        first_child.kill()
        assert wait_until(lambda: first_child.poll() is not None)

        with pytest.raises(AcpTransportError):
            receiver.call("observe", payload)

        assert receiver.call("health", {}) == {"ready": True}
        assert len(server.children) == 2
        assert server.children[1] is not first_child
        assert server.children[1].argv == ["dsh", "--profile", "analytics-acp"]

        # The lost attempt is never re-dispatched by the transport; a later
        # attempt on the same kernel session resumes rather than forks.
        server.prompt_mode = "end_turn"
        second = dispatch_payload("native-2", attempt="attempt-2")
        receiver.call("dispatch", second)
        resumed = [params for method, params in server.requests if method == "session/resume"]
        assert resumed and resumed[0]["cwd"] == str(tmp_path)
        methods = [method for method, _params in server.requests]
        assert methods.count("session/new") == 1
        assert observe_until(receiver, second, "SUCCEEDED")["successful_call_ids"] == ["call-1"]
        # The dead child's attempt is never settled: it reads UNKNOWN, and the
        # next attempt had to replace its dead slot before running.
        assert receiver.call("observe", payload)["outcome"] == "UNKNOWN"
    finally:
        receiver.close()


def test_settled_evidence_survives_a_later_child_exit(tmp_path):
    # Exit is proven by the prompt response, so a later process death cannot
    # retract it; only an unsettled prompt is lost with the child.
    server = FakeAcpServer()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        settled = observe_until(receiver, payload, "SUCCEEDED")
        child = server.child
        child.kill()
        assert wait_until(lambda: child.poll() is not None)
        again = receiver.call("observe", payload)
        assert again == settled
    finally:
        receiver.close()


def test_reconnect_is_bounded_to_two_spawn_attempts(tmp_path):
    server = FakeAcpServer()
    server.fail_initialize = True
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        with pytest.raises(AcpTransportError):
            receiver.call("health", {})
        assert len(server.children) == 2
        for child in server.children:
            assert child.poll() is not None
    finally:
        receiver.close()


def test_one_stdout_contamination_retires_the_child_and_rejects_the_call(tmp_path):
    server = FakeAcpServer()
    server.contaminate_on_list = True
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        with pytest.raises(AcpTransportError) as error:
            receiver.call("health", {})
        assert "ACP stdout is not JSON-RPC" in str(error.value)
        assert wait_until(lambda: all(child.poll() is not None for child in server.children))
        server.contaminate_on_list = False
        assert receiver.call("health", {}) == {"ready": True}
        assert len(server.children) == 2
    finally:
        receiver.close()


def test_stderr_noise_is_never_parsed_as_protocol(acp):
    server, receiver = acp
    # Every fake child writes a JSON-RPC shaped response on stderr first.
    assert receiver.call("health", {}) == {"ready": True}
    assert server.methods[:2] == ["initialize", "session/list"]
    assert "initialize" in server.methods


# ---------------------------------------------------------------------------
# Config switch: bridge is the default; ACP is explicit and fails closed
# ---------------------------------------------------------------------------


def test_transport_config_defaults_to_bridge_and_selects_acp(tmp_path):
    default = build_host_transport({"bridge_url": "http://127.0.0.1:5001", "runtime_token": "x" * 32})
    assert isinstance(default, HostBridge)
    legacy = build_host_transport({"port_base": 4315, "runtime_token": "x" * 32})
    assert isinstance(legacy, HostBridge) and legacy.origin == "http://127.0.0.1:4316"

    selected = build_host_transport({
        "transport": "acp", "acp_cwd": str(tmp_path), "state_dir": str(tmp_path / "state"),
        "runtime_token": "x" * 32,
    })
    try:
        assert isinstance(selected, AcpTransport)
        assert selected.env["DSH_HOME"] == str(tmp_path / "state" / "acp-home")
        assert (tmp_path / "state" / "acp-home").is_dir()
        assert selected.argv == ("dsh", "--profile", "analytics-acp")
        assert selected.capabilities == {"health", "dispatch", "observe", "cancel"}
    finally:
        selected.close()

    with pytest.raises(ValueError):
        build_host_transport({"transport": "carrier-pigeon", "runtime_token": "x" * 32})
    with pytest.raises(ValueError):
        build_host_transport({"transport": "acp", "runtime_token": "x" * 32})
    with pytest.raises(ValueError):
        build_host_transport({"transport": "acp", "acp_cwd": str(tmp_path), "state_dir": str(tmp_path),
                              "runtime_token": "x" * 32, "acp_args": ["--profile", ""]})


# ---------------------------------------------------------------------------
# Dispatcher failure mapping: identical to the bridge seam path
# ---------------------------------------------------------------------------


def bound_run(tmp_path):
    store = make_store(tmp_path / "state", transport_policy=TransportPolicy(mode="acp"))
    conversation = store.create_conversation(
        actor(), "native", AnalyticsConversationRequest(), runtime_session_id=SESSION)
    run = store.accept(actor(), conversation.conversation_id, "native-1",
                       AnalyticsRunRequest(question="合成渠道"), native_request=native_request())
    return store, run


def test_acp_health_failure_closes_admission_without_a_dispatch(tmp_path):
    server = FakeAcpServer()
    server.fail_initialize = True
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, run = bound_run(tmp_path)
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        snapshot = store.get(actor(), run.run_id)
        assert not dispatcher.ready
        assert snapshot.status == "QUEUED" and snapshot.diagnostics.dispatch_attempts == 0
        assert "session/prompt" not in server.methods
    finally:
        dispatcher.close()
        receiver.close()


def test_acp_dispatch_failure_is_one_unknown_with_the_slot_held(tmp_path):
    server = FakeAcpServer()
    server.fail_new = True
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, run = bound_run(tmp_path)
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        snapshot = store.get(actor(), run.run_id)
        assert snapshot.status == "UNKNOWN"
        assert snapshot.diagnostics.execution_active
        assert snapshot.diagnostics.dispatch_attempts == 1
        assert "session/prompt" not in server.methods
    finally:
        dispatcher.close()
        receiver.close()


def test_acp_lost_settlement_fences_failed_and_never_writes_cancelled(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, run = bound_run(tmp_path)
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        assert store.get(actor(), run.run_id).status == "RUNNING"
        intent = store.runtime_work()[0]["intent"]
        snapshot = store.get(actor(), run.run_id)
        store.cancel(actor(), run.run_id, "cancel", snapshot.version, AnalyticsCancelRequest())
        dispatcher.tick()  # observe RUNNING, cancel receipt accepted
        assert store.get(actor(), run.run_id).status == "CANCELLING"

        server.child.kill()
        assert wait_until(lambda: server.child.poll() is not None)
        for _ in range(200):
            dispatcher.tick()
            snapshot = store.get(actor(), run.run_id)
            if snapshot.status == "FAILED":
                break
            time.sleep(0.01)
        # A settlement that died with the child can never become CANCELLED.
        # The binding records LOST and the run is fenced with the slot released.
        assert snapshot.status == "FAILED"
        assert snapshot.diagnostics.error_code == "EXECUTION_UNKNOWN"
        assert snapshot.diagnostics.execution_active is False
        assert store.acp_binding(intent.run_id, intent.attempt_id).state == "LOST"
    finally:
        dispatcher.close()
        receiver.close()


# ---------------------------------------------------------------------------
# Persisted ACP binding: written before the prompt, settled only by exit proof
# ---------------------------------------------------------------------------


def test_binding_sink_runs_after_session_new_and_before_the_prompt(tmp_path):
    server = FakeAcpServer()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    seen = []
    receiver.attach_binding_sink(lambda binding: seen.append(dict(binding)) or True)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        assert receiver.call("dispatch", payload)["accepted"] is True
        assert len(seen) == 1
        binding = seen[0]
        assert (binding["run_id"], binding["attempt_id"], binding["session_id"]) == (
            payload["run_id"], payload["attempt_id"], payload["session_id"])
        assert binding["acp_session_id"] in server.sessions
        assert binding["prompt_rpc_id"].isdigit()
        assert wait_until(lambda: server.prompts == ["合成渠道"])
        # session/new precedes the sink; the prompt is written only after it.
        assert server.methods.index("session/new") < server.methods.index("session/prompt")
        assert observe_until(receiver, payload, "SUCCEEDED")["execution_exited"] is True
    finally:
        receiver.close()


def test_binding_sink_refusal_blocks_the_prompt(tmp_path):
    server = FakeAcpServer()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    receiver.attach_binding_sink(lambda _binding: False)
    try:
        receiver.call("health", {})
        with pytest.raises(AcpTransportError) as error:
            receiver.call("dispatch", dispatch_payload())
        assert "already bound" in str(error.value)
        assert server.prompts == []
    finally:
        receiver.close()


def test_dispatcher_persists_the_binding_and_settles_it_with_exit_evidence(tmp_path):
    server = FakeAcpServer()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, run = bound_run(tmp_path)
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        intent = store.runtime_work()[0]["intent"]
        binding = store.acp_binding(intent.run_id, intent.attempt_id)
        assert binding is not None and binding.state == "BOUND"
        assert binding.acp_session_id in server.sessions
        assert binding.prompt_rpc_id.isdigit()

        # The fake child reports call-1 completed; give the dispatcher the same
        # successful step the bridge path would have written, then let the
        # settled prompt refresh the binding.
        successful_step(store, intent, call_id="call-1")
        for _ in range(200):
            dispatcher.tick()
            if store.get(actor(), run.run_id).status == "SUCCEEDED":
                break
            time.sleep(0.01)
        assert store.get(actor(), run.run_id).status == "SUCCEEDED"
        assert store.acp_binding(intent.run_id, intent.attempt_id).state == "SETTLED"
    finally:
        dispatcher.close()
        receiver.close()


# ---------------------------------------------------------------------------
# Projection parity with the bridge table (including accepted codec collapses)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def bridge_turn_evidence():
    if shutil.which("node") is None:
        pytest.skip("node is required to read the bridge projection table")
    script = (
        "import {TURN_END_EVIDENCE} from " + json.dumps(NATIVE_EVIDENCE.as_uri()) + ";"
        "console.log(JSON.stringify(TURN_END_EVIDENCE))"
    )
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=str(REPO_ROOT), capture_output=True, text=True, check=True, timeout=30,
    )
    return json.loads(completed.stdout)


# The three rc.5 codec collapses (acp/src/codec.ts:14-35). Each row is the
# design's accepted loss, not an accident: assert it stays explicit.
CODEC_COLLAPSES = {
    "aborted": ("end_turn", "SUCCEEDED"),      # aborted indistinguishable from completed
    "blocked": ("end_turn", "FAILED"),         # NEEDS_INPUT is unrecoverable over ACP
    "interrupted": ("cancelled", "CANCELLED"),  # interrupted indistinguishable from user cancel
}

PARITY_MODES = {
    "completed": "end_turn",
    "max-tokens": "max_tokens",
    "error": "error",
}


@pytest.mark.parametrize("reason", ["completed", "max-tokens", "error"])
def test_projection_parity_with_the_bridge_table(tmp_path, bridge_turn_evidence, reason):
    server = FakeAcpServer()
    server.prompt_mode = PARITY_MODES[reason]
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        bridge = bridge_turn_evidence[reason]
        evidence = observe_until(receiver, payload, bridge["outcome"])
        assert evidence["execution_exited"] is True
        if bridge["outcome"] == "FAILED":
            assert evidence["error_code"] == bridge.get("errorCode", "MODEL_FAILED")
    finally:
        receiver.close()


@pytest.mark.parametrize("reason", sorted(CODEC_COLLAPSES))
def test_codec_collapse_is_the_documented_loss(tmp_path, bridge_turn_evidence, reason):
    mode, acp_outcome = CODEC_COLLAPSES[reason]
    server = FakeAcpServer()
    server.prompt_mode = mode
    if reason == "blocked":
        server.tool_calls = False
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            evidence = receiver.call("observe", payload)
            if evidence["outcome"] != "RUNNING":
                break
            time.sleep(0.01)
        assert evidence["outcome"] == acp_outcome
        bridge_outcome = bridge_turn_evidence[reason]["outcome"]
        assert bridge_outcome != acp_outcome  # the loss is real and stays listed
    finally:
        receiver.close()


# ---------------------------------------------------------------------------
# P0-1: binding-correlated ACP tool callback (no kernel ids in the child)
# ---------------------------------------------------------------------------


class FixtureWorkers:
    """Minimal worker surface: complete the reserved step with the fixture result."""

    def __init__(self, store):
        self.store = store
        self.calls = []

    def execute(self, principal, intent, step):
        result = fixture_result()
        self.store.complete_step(principal, intent.run_id, intent.attempt_id, step.step_id, result)
        self.calls.append((intent.run_id, intent.attempt_id, step.step_id))
        return result


def test_acp_tool_callback_correlates_to_the_bound_run(tmp_path):
    server = FakeAcpServer()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, run = bound_run(tmp_path)
    workers = FixtureWorkers(store)
    seen = {}

    def tool_callback(acp_session_id):
        seen["receipt"] = execute_acp_fixture(
            store, lambda _owner: actor(), acp_session_id, "call-1", "channel_repeat_rate",
            workers=workers)

    server.tool_call_hook = tool_callback
    dispatcher = RunDispatcher(store, lambda _owner: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        intent = store.runtime_work()[0]["intent"]
        assert store.acp_binding(intent.run_id, intent.attempt_id).state == "BOUND"
        # The fake child performs the real callback the workbench tool makes.
        assert wait_until(lambda: "receipt" in seen, timeout=5.0)
        assert server.tool_call_error is None
        receipt = seen["receipt"]
        with sqlite_connection(store.path) as con:
            step = con.execute("SELECT run_id, attempt_id FROM steps WHERE step_id=?",
                               (receipt["step_id"],)).fetchone()
        assert tuple(step) == (intent.run_id, intent.attempt_id)

        for _ in range(300):
            dispatcher.tick()
            if store.get(actor(), run.run_id).status == "SUCCEEDED":
                break
            time.sleep(0.01)
        snapshot = store.get(actor(), run.run_id)
        assert snapshot.status == "SUCCEEDED"
        assert snapshot.diagnostics.execution_active is False
        assert snapshot.diagnostics.tool_steps_used == 1
        assert snapshot.primary_result_ref == receipt["step_id"]
        assert store.acp_binding(intent.run_id, intent.attempt_id).state == "SETTLED"
        assert workers.calls == [(intent.run_id, intent.attempt_id, receipt["step_id"])]
    finally:
        dispatcher.close()
        receiver.close()


def test_acp_tool_callback_fails_closed_for_unbound_or_stale_sessions(tmp_path):
    store, _run = bound_run(tmp_path)
    intent = store.claim_next(lambda _owner: actor())
    assert store.bind_acp_attempt(intent.run_id, intent.attempt_id, intent.session_id,
                                  "acp-live", "4", 1) is True
    workers = FixtureWorkers(store)
    try:
        with pytest.raises(AnalyticsError) as wrong_session:
            execute_acp_fixture(store, lambda _owner: actor(), "acp-other", "call-1",
                                "channel_repeat_rate", workers=workers)
        assert wrong_session.value.code == "UNBOUND_NATIVE_REQUEST"
        with pytest.raises(AnalyticsError):
            execute_acp_fixture(store, lambda _owner: actor(), "acp-live", "", "channel_repeat_rate",
                                workers=workers)
        # A settled binding is history, not a live correlation window.
        assert store.settle_acp_binding(intent.run_id, intent.attempt_id, "SETTLED") is True
        with pytest.raises(AnalyticsError) as stale:
            execute_acp_fixture(store, lambda _owner: actor(), "acp-live", "call-2",
                                "channel_repeat_rate", workers=workers)
        assert stale.value.code == "UNBOUND_NATIVE_REQUEST"
        assert workers.calls == []
        with sqlite_connection(store.path) as con:
            assert con.execute("SELECT count(*) FROM steps WHERE run_id=?",
                               (intent.run_id,)).fetchone()[0] == 0
    finally:
        store.settle_acp_binding(intent.run_id, intent.attempt_id, "LOST")


# ---------------------------------------------------------------------------
# P0-2: a settled no-tool turn releases the slot; sequential runs progress
# ---------------------------------------------------------------------------


def test_no_tool_settle_releases_the_slot_and_two_sequential_runs_progress(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "no_tools"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, first = bound_run(tmp_path)
    dispatcher = RunDispatcher(store, lambda _owner: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        first_intent = store.runtime_work()[0]["intent"]
        for _ in range(300):
            dispatcher.tick()
            snapshot = store.get(actor(), first.run_id)
            if snapshot.status == "FAILED":
                break
            time.sleep(0.01)
        snapshot = store.get(actor(), first.run_id)
        assert snapshot.status == "FAILED"
        assert snapshot.diagnostics.error_code == "EXECUTION_UNKNOWN"
        assert snapshot.diagnostics.execution_active is False
        # The prompt settled, so the binding records SETTLED, not a fake LOST.
        assert store.acp_binding(first_intent.run_id, first_intent.attempt_id).state == "SETTLED"

        second = store.accept(actor(), snapshot.conversation_id, "native-2",
                              AnalyticsRunRequest(question="合成渠道"), native_request=native_request("native-2"))
        server.prompt_mode = "end_turn"
        dispatcher.tick()  # claim + dispatch the second run
        second_intent = store.runtime_work()[0]["intent"]
        assert second_intent.run_id == second.run_id
        successful_step(store, second_intent, call_id="call-1")
        for _ in range(300):
            dispatcher.tick()
            if store.get(actor(), second.run_id).status == "SUCCEEDED":
                break
            time.sleep(0.01)
        snapshot = store.get(actor(), second.run_id)
        assert snapshot.status == "SUCCEEDED"
        assert snapshot.diagnostics.execution_active is False
        assert store.acp_binding(second_intent.run_id, second_intent.attempt_id).state == "SETTLED"
    finally:
        dispatcher.close()
        receiver.close()


# ---------------------------------------------------------------------------
# P1-4: the app lifespan owns the transport; shutdown reaps the child
# ---------------------------------------------------------------------------


def test_dispatcher_close_reaps_the_acp_child(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, _run = bound_run(tmp_path)
    dispatcher = RunDispatcher(store, lambda _owner: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        child = server.child
        assert child.poll() is None
        dispatcher.close()
        assert wait_until(lambda: child.poll() is not None, timeout=3.0)
        assert receiver._closed is True
        assert dispatcher._lock is None
    finally:
        receiver.close()


def test_app_lifespan_owns_and_closes_the_acp_transport(tmp_path):
    fixture_dir = tmp_path / "fixture"
    fixture = synthetic_fixture(fixture_dir)
    state = tmp_path / "state"
    state.mkdir(mode=0o700)
    os.chmod(state, 0o700)
    server = FakeAcpServer()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    config = {"state_dir": str(state), "session_id": SESSION, "gateway_token": GATEWAY,
              "runtime_token": "r" * 32, "fixture": asdict(fixture)}
    app = runtime_app(config, bridge=receiver)
    try:
        with TestClient(app):
            assert wait_until(lambda: bool(server.children), timeout=5.0)
            child = server.child
            assert child.poll() is None
        # The lifespan's finally closed the dispatcher, which owns the
        # transport; a clean shutdown must reap the fake child.
        assert wait_until(lambda: child.poll() is not None, timeout=3.0)
        assert receiver._closed is True
    finally:
        receiver.close()


# ---------------------------------------------------------------------------
# P1-5: explicit child environment allowlist plus scoped callback values
# ---------------------------------------------------------------------------


def test_from_config_passes_only_the_scoped_child_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "do-not-leak")
    monkeypatch.setenv("B0_GATEWAY_TOKEN", "g" * 32)
    monkeypatch.setenv("PYTHONPATH", "/kernel/private")
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    config = {"transport": "acp", "acp_cwd": str(tmp_path), "state_dir": str(tmp_path / "state"),
              "runtime_token": "r" * 32, "base_url": "http://127.0.0.1:5321", "family": "b0"}
    receiver = build_host_transport(config)
    try:
        assert "AWS_SECRET_ACCESS_KEY" not in receiver.env
        assert "B0_GATEWAY_TOKEN" not in receiver.env
        assert "B0_RUNTIME_TOKEN" not in receiver.env
        assert "PYTHONPATH" not in receiver.env
        assert receiver.env["PATH"] == "/usr/bin:/bin"
        assert receiver.env["DSH_HOME"] == str(tmp_path / "state" / "acp-home")
        assert receiver.env["B0_ACP_CALLBACK"] == "1"
        assert receiver.env["B0_ACP_BASE_URL"] == "http://127.0.0.1:5321"
        assert receiver.env["B0_ACP_RUNTIME_TOKEN"] == receiver.callback_token
        assert receiver.callback_token != "r" * 32
        assert receiver.env["B0_RUNTIME_FAMILY"] == "b0"
    finally:
        receiver.close()

    # H5: ACP serves kernel-owned automation only. A query-family runtime must
    # refuse the ACP switch instead of spawning a child for user-chat traffic.
    with pytest.raises(ValueError):
        build_host_transport({**config, "family": "channel_followup"})


def test_from_config_rejects_an_unscoped_token_shape(tmp_path):
    config = {"transport": "acp", "acp_cwd": str(tmp_path), "state_dir": str(tmp_path / "state"),
              "runtime_token": "r" * 32, "base_url": "http://127.0.0.1:5321",
              "acp_callback_token": "short"}
    with pytest.raises(ValueError):
        build_host_transport(config)


# ---------------------------------------------------------------------------
# P2: profile verification before admission
# ---------------------------------------------------------------------------


def _write_generated_profile(home, *, patch_name="@shine-mage/dsh-analytics-workbench-b0/tools"):
    profile = Path(home) / "profiles" / "analytics-acp"
    profile.mkdir(parents=True, exist_ok=True)
    (profile / "package.json").write_text(json.dumps({
        "name": "dsh-profile-analytics-acp", "private": True, "type": "module",
        "dsh": {"profile": {"bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app"]}},
    }), encoding="utf-8")
    (profile / "cordis.patch.yml").write_text(
        "# Generated\n- insert:\n    - id: analytics-workbench-tools\n"
        f"      name: '{patch_name}'\n", encoding="utf-8")
    return profile


def test_health_verifies_the_generated_profile_before_spawning(tmp_path):
    config = {"transport": "acp", "acp_cwd": str(tmp_path), "state_dir": str(tmp_path / "state"),
              "runtime_token": "r" * 32, "base_url": "http://127.0.0.1:5321"}
    receiver = build_host_transport(config)
    server = FakeAcpServer()
    receiver._spawn = server.spawn
    try:
        with pytest.raises(AcpTransportError) as missing:
            receiver.call("health", {})
        assert "not installed" in str(missing.value)
        assert server.children == []
        _write_generated_profile(receiver._profile_home)
        assert receiver.call("health", {}) == {"ready": True}
    finally:
        receiver.close()


def test_health_rejects_a_business_or_bridge_profile(tmp_path):
    config = {"transport": "acp", "acp_cwd": str(tmp_path), "state_dir": str(tmp_path / "state"),
              "runtime_token": "r" * 32, "base_url": "http://127.0.0.1:5321"}
    receiver = build_host_transport(config)
    server = FakeAcpServer()
    receiver._spawn = server.spawn
    try:
        _write_generated_profile(receiver._profile_home, patch_name="@shine-mage/dsh-analytics-workbench-b0")
        with pytest.raises(AcpTransportError) as business:
            receiver.call("health", {})
        assert "bridge row" in str(business.value)
        assert server.children == []
    finally:
        receiver.close()


# ---------------------------------------------------------------------------
# P2: cancel ordering and bounded stdin writes
# ---------------------------------------------------------------------------


def test_cancel_intent_is_recorded_only_after_the_notification_write(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        assert server.prompt_started.wait(5.0)
        original = receiver._write_notification

        def write_then_settle(method, params):
            original(method, params)
            # The child settles immediately after receiving the cancel, before
            # _cancel records its intent. That race is a real completion.
            server.tool_update("call-1", "in_progress")
            server.tool_update("call-1", "completed")
            server.release("end_turn")
            with receiver._state_lock:
                prompt = receiver._sessions[SESSION].prompt
            assert wait_until(lambda: prompt.settled, timeout=5.0)

        receiver._write_notification = write_then_settle
        assert receiver.call("cancel", payload)["accepted"] is True
        evidence = observe_until(receiver, payload, "SUCCEEDED")
        assert evidence["execution_exited"] is True
        assert evidence["successful_call_ids"] == ["call-1"]
    finally:
        receiver.close()


def test_write_locked_times_out_instead_of_blocking(tmp_path):
    read_fd, write_fd = os.pipe()
    os.set_blocking(write_fd, False)
    try:
        while True:
            os.write(write_fd, b"x" * 65536)
    except BlockingIOError:
        pass

    class Stdin:
        def fileno(self):
            return write_fd

    class Child:
        stdin = Stdin()
        stdout = None
        stderr = None
        killed = False

        def poll(self):
            return None

        def kill(self):
            Child.killed = True

        def wait(self, timeout=None):
            return 0

    child = Child()
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=lambda *_args, **_kwargs: child,
                            write_timeout=0.05)
    receiver._child, receiver._generation, receiver._dead = child, 1, False
    try:
        with pytest.raises(AcpTransportError) as timeout:
            receiver._write_locked({"jsonrpc": "2.0", "method": "session/cancel", "params": {}})
        assert "write timed out" in str(timeout.value)
        assert Child.killed is True
    finally:
        os.close(read_fd)
        try:
            os.close(write_fd)
        except OSError:
            pass
