"""P3-3a contract: five bridge operations behind one transport interface.

The dispatcher and the identity resolver must reach the Host only through
``HostTransport.call``; a transport failure must keep today's mapping (close
admission / one UNKNOWN observation with the slot held / retryable identity).
"""

from __future__ import annotations

import pytest

from backend.contracts.analytics import (
    AnalyticsCancelRequest,
    AnalyticsConversationRequest,
    AnalyticsRunRequest,
)
from backend.services.analytics import transport
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.native_identity import NativeSessionIdentityResolver
from backend.services.analytics.native_tools import bridge_surfaces, load_native_tools
from backend.services.analytics.runtime import BRIDGE_OPERATIONS, HostBridge, RunDispatcher
from backend.services.analytics.transport import HostTransport
from backend.tests.analytics_run_support import actor, make_store

SESSION = "native-session"
GATEWAY = "g" * 32
IDENTITY = {
    "schema_version": "first-purchase-session-identity/v1",
    "owner_id": "crm-owner",
    "data_scope": "first-purchase-fixture",
    "query_access": "GRANTED",
}


def native_request(key="native-1"):
    return {"sessionId": SESSION, "requestId": key, "mode": "queue",
            "content": [{"type": "text", "text": "合成渠道"}], "clientTimeZone": "Asia/Shanghai"}


def bound_run(tmp_path):
    store = make_store(tmp_path / "state")
    conversation = store.create_conversation(
        actor(), "native", AnalyticsConversationRequest(), runtime_session_id=SESSION,
    )
    run = store.accept(actor(), conversation.conversation_id, "native-1",
                       AnalyticsRunRequest(question="合成渠道"), native_request=native_request())
    return store, run


class RecordingTransport:
    """Minimal HostTransport: records calls, injects one failing operation."""

    def __init__(self):
        self.calls = []
        self.fail = None
        self.outcome = "RUNNING"
        self.exited = False
        self.tool_calls = []

    def call(self, operation, payload):
        self.calls.append((operation, dict(payload)))
        if operation == self.fail:
            raise OSError("controlled transport failure")
        if operation == "health":
            return {"ready": True}
        if operation in {"dispatch", "cancel"}:
            return {"accepted": True}
        if operation == "identity":
            return {"session_id": payload["session_id"], "identity": IDENTITY}
        return {**{key: payload[key] for key in transport.CORRELATION_FIELDS},
                "execution_exited": self.exited, "outcome": self.outcome,
                "successful_call_ids": self.tool_calls}

    def operations(self):
        return [operation for operation, _ in self.calls]


def test_all_five_operations_route_through_the_transport_interface(tmp_path):
    # The concrete HTTP transport conforms structurally; the seam's table is the
    # shared binding table, not a second route list.
    assert issubclass(HostBridge, HostTransport)
    assert isinstance(HostBridge("http://127.0.0.1:5000", "x" * 32), HostTransport)
    assert isinstance(RecordingTransport(), HostTransport)
    documented = {path.lstrip("/") for _method, path in bridge_surfaces(load_native_tools())}
    assert set(BRIDGE_OPERATIONS) == set(transport.TRANSPORT_OPERATIONS) == documented
    assert set(transport.OUTCOMES) == {
        "RUNNING", "UNKNOWN", "SUCCEEDED", "FAILED", "CANCELLED", "NEEDS_INPUT",
    }

    store, run = bound_run(tmp_path)
    receiver = RecordingTransport()
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        dispatcher.tick()  # health + dispatch
        assert store.get(actor(), run.run_id).status == "RUNNING"
        snapshot = store.get(actor(), run.run_id)
        store.cancel(actor(), run.run_id, "cancel", snapshot.version, AnalyticsCancelRequest())
        dispatcher.tick()  # health + observe + cancel receipt
        receiver.exited, receiver.outcome = True, "CANCELLED"
        dispatcher.tick()  # health + observe settles the run
    finally:
        dispatcher.close()
    assert store.get(actor(), run.run_id).status == "CANCELLED"

    principal = NativeSessionIdentityResolver(receiver, SESSION, GATEWAY).resolve("Bearer " + GATEWAY)
    assert principal.actor_id == "crm-owner"

    # Every one of the five operations reached the injected transport, and no
    # call used another route. dispatch is issued exactly once.
    assert set(receiver.operations()) == set(transport.TRANSPORT_OPERATIONS)
    assert receiver.operations().count("dispatch") == 1
    assert all(payload == {} for operation, payload in receiver.calls if operation == "health")
    assert receiver.calls[-1] == ("identity", {"session_id": SESSION})
    for operation in ("observe", "cancel"):
        payloads = [payload for name, payload in receiver.calls if name == operation]
        assert payloads and all(
            set(transport.CORRELATION_FIELDS) <= set(payload) for payload in payloads)
        assert all(payload["run_id"] == run.run_id and payload["request_id"] == "native-1"
                   for payload in payloads)
    dispatch_payload = next(payload for operation, payload in receiver.calls if operation == "dispatch")
    assert set(transport.CORRELATION_FIELDS) | {"payload"} <= set(dispatch_payload)
    assert dispatch_payload["run_id"] == run.run_id
    assert dispatch_payload["attempt_id"] == store.get(actor(), run.run_id).diagnostics.attempt_id
    assert dispatch_payload["session_id"] == SESSION and dispatch_payload["request_id"] == "native-1"


@pytest.mark.parametrize("operation", ["health", "dispatch", "observe", "cancel"])
def test_transport_failure_keeps_todays_fail_closed_mapping(tmp_path, operation):
    store, run = bound_run(tmp_path)
    receiver = RecordingTransport()
    dispatcher = RunDispatcher(store, lambda _: actor(), receiver)
    dispatcher.start()
    try:
        if operation == "health":
            receiver.fail = "health"
            dispatcher.tick()
            assert not dispatcher.ready
            snapshot = store.get(actor(), run.run_id)
            assert snapshot.status == "QUEUED" and snapshot.diagnostics.dispatch_attempts == 0
            # Admission is retryable: the same tick path recovers without a claim.
            receiver.fail = None
            dispatcher.tick()
            assert dispatcher.ready and store.get(actor(), run.run_id).status == "RUNNING"
            assert receiver.operations() == ["health", "health", "dispatch"]
            return
        if operation == "dispatch":
            receiver.fail = "dispatch"
            dispatcher.tick()
            # Ambiguous receipt is one UNKNOWN, never a second dispatch; a later
            # observe reconciles the persisted intent.
            snapshot = store.get(actor(), run.run_id)
            assert snapshot.status == "UNKNOWN" and snapshot.diagnostics.execution_active
            assert snapshot.diagnostics.dispatch_attempts == 1
            receiver.fail = None
            dispatcher.tick()
            assert store.get(actor(), run.run_id).status == "RUNNING"
            assert receiver.operations().count("dispatch") == 1
            return
        dispatcher.tick()
        assert store.get(actor(), run.run_id).status == "RUNNING"
        receiver.fail = operation
        if operation == "cancel":
            snapshot = store.get(actor(), run.run_id)
            store.cancel(actor(), run.run_id, "cancel", snapshot.version, AnalyticsCancelRequest())
        dispatcher.tick()
        snapshot = store.get(actor(), run.run_id)
        assert snapshot.diagnostics.execution_active
        if operation == "cancel":
            # The receipt failure is not exit: the slot stays held as CANCELLING.
            assert snapshot.status == "CANCELLING"
        else:
            assert snapshot.status == "UNKNOWN"
        assert not dispatcher.ready
        receiver.fail = None
        receiver.exited = True
        receiver.outcome = "CANCELLED" if operation == "cancel" else "FAILED"
        dispatcher.tick()
        assert store.get(actor(), run.run_id).status == (
            "CANCELLED" if operation == "cancel" else "FAILED")
    finally:
        dispatcher.close()


def test_identity_transport_failure_remains_retryable():
    receiver = RecordingTransport()
    receiver.fail = "identity"
    resolver = NativeSessionIdentityResolver(receiver, SESSION, GATEWAY)
    with pytest.raises(AnalyticsError) as error:
        resolver.resolve("Bearer " + GATEWAY)
    assert (error.value.status, error.value.code, error.value.retryable) == (
        503, "IDENTITY_UNAVAILABLE", True)
    assert receiver.operations() == ["identity"]
