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
from pathlib import Path

import pytest

from backend.analytics_runtime import build_host_transport
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
from backend.services.analytics.runtime import HostBridge, RunDispatcher
from backend.services.analytics.transport import HostTransport
from backend.tests.analytics_run_support import actor, make_store

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


def dispatch_payload(key="native-1", *, attempt="attempt-1", text="合成渠道", with_native=True):
    inner = {"question": text}
    if with_native:
        inner["native_request"] = native_request(key, text)
    return {"run_id": "run-1", "attempt_id": attempt, "session_id": SESSION, "request_id": key,
            "payload": inner, "payload_hash": "h" * 64, "deadline_ms": 0}


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
        self.prompt_started = threading.Event()
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
            self.server._inflight = {"respond": respond}
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
    assert receiver.call("dispatch", dispatch) == {"accepted": True}
    assert server.prompt_started.wait(5.0)
    assert server.prompts == ["合成渠道"]
    running = receiver.call("observe", dispatch)
    assert running["outcome"] == "RUNNING" and running["execution_exited"] is False

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
    assert receiver.call("dispatch", second) == {"accepted": True}
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


def test_end_turn_without_tool_calls_is_unknown_not_a_manufactured_success(tmp_path):
    # rc.5 collapses a blocked turn (bridge: NEEDS_INPUT) into end_turn. With no
    # tool-call evidence the transport must fail closed to UNKNOWN.
    server = FakeAcpServer()
    server.prompt_mode = "no_tools"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    try:
        receiver.call("health", {})
        payload = dispatch_payload()
        receiver.call("dispatch", payload)
        assert wait_until(lambda: server.prompts)
        evidence = observe_until(receiver, payload, "UNKNOWN")
        assert evidence["execution_exited"] is False
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
    store = make_store(tmp_path / "state")
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


def test_acp_lost_settlement_is_unknown_and_a_requested_cancel_stays_held(tmp_path):
    server = FakeAcpServer()
    server.prompt_mode = "hang_ignore_cancel"
    receiver = AcpTransport(cwd=str(tmp_path), env={}, spawn=server.spawn, timeout=5.0)
    store, run = bound_run(tmp_path)
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()
        assert store.get(actor(), run.run_id).status == "RUNNING"
        snapshot = store.get(actor(), run.run_id)
        store.cancel(actor(), run.run_id, "cancel", snapshot.version, AnalyticsCancelRequest())
        dispatcher.tick()  # observe RUNNING, cancel receipt accepted
        assert store.get(actor(), run.run_id).status == "CANCELLING"

        server.child.kill()
        assert wait_until(lambda: server.child.poll() is not None)
        dispatcher.tick()
        snapshot = store.get(actor(), run.run_id)
        assert snapshot.status == "CANCELLING"  # exit unproven; never CANCELLED
        assert snapshot.diagnostics.execution_active
        assert not dispatcher.ready
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
    "blocked": ("end_turn", "UNKNOWN"),        # NEEDS_INPUT is unrecoverable over ACP
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
