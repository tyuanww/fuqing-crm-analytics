"""P3-3d: deterministic canary selection and the routed in-process transport.

The canary is a deployment switch, never a fallback: ``bridge`` and ``acp``
keep their whole-runtime meaning, while ``canary[:percent]`` may move only an
explicitly eligible synthetic family and only by a stable hash of the request
id. H5 keeps the query family (``channel_followup``) on the bridge, so it is
never ACP-eligible and a configuration that names it refuses startup. Missing
ACP wiring degrades the canary to bridge-only with a logged reason; a malformed
canary configuration refuses startup. The dispatcher test asserts the persisted
value, not a fresh decision, chooses the executing transport.
"""

from __future__ import annotations

import pytest

from backend.analytics_runtime import build_host_transport, transport_policy
from backend.contracts.analytics import (
    AnalyticsConversationRequest,
    AnalyticsRunRequest,
)
from backend.services.analytics.jobs import (
    TRANSPORT_ACP,
    TRANSPORT_BRIDGE,
    TransportPolicy,
    canary_bucket,
)
from backend.services.analytics.runtime import RunDispatcher
from backend.services.analytics.transport import HostTransport, RoutedTransport
from backend.tests.analytics_run_support import actor, make_store, sqlite_connection

SESSION = "native-session"


def native_request(key):
    return {"sessionId": SESSION, "requestId": key, "mode": "queue",
            "content": [{"type": "text", "text": "合成渠道"}], "clientTimeZone": "Asia/Shanghai"}


def make_conversation(store):
    return store.create_conversation(
        actor(), "native", AnalyticsConversationRequest(), runtime_session_id=SESSION)


def accept_native(store, conversation, key):
    return store.accept(actor(), conversation.conversation_id, key,
                        AnalyticsRunRequest(question="合成渠道"), native_request=native_request(key))


def recorded_transport(store, run_id):
    with sqlite_connection(store.path) as con:
        return con.execute("SELECT transport FROM dispatch_intents WHERE run_id=?", (run_id,)).fetchone()[0]


class RecordingTransport:
    """One seam transport that records every operation and owns no process."""

    def __init__(self, *, ready=True):
        self.calls = []
        self.ready = ready

    def call(self, operation, payload):
        self.calls.append((operation, dict(payload)))
        if operation == "health":
            return {"ready": self.ready}
        if operation in {"dispatch", "cancel"}:
            return {"accepted": True}
        if operation == "identity":
            return {"session_id": payload["session_id"], "identity": {}}
        return {"run_id": payload["run_id"], "attempt_id": payload["attempt_id"],
                "session_id": payload["session_id"], "request_id": payload["request_id"],
                "execution_exited": False, "outcome": "RUNNING", "successful_call_ids": []}

    def operations(self):
        return [operation for operation, _ in self.calls]

    def dispatched(self):
        return [payload for operation, payload in self.calls if operation == "dispatch"]


# ---------------------------------------------------------------------------
# Deterministic canary selection
# ---------------------------------------------------------------------------


def test_canary_is_off_by_default_and_bridge_keeps_its_meaning():
    policy = TransportPolicy.from_config({})
    assert policy.mode == "bridge"
    assert policy.select("b0", "native-1") == ("bridge", "mode=bridge")
    assert TransportPolicy.from_config({"transport": "bridge"}).select("b0", "x")[0] == "bridge"
    # ``acp`` keeps its whole-runtime meaning for the eligible synthetic
    # families; the query family is never selected for ACP (H5).
    acp = TransportPolicy.from_config({"transport": "acp"})
    assert acp.select("b0", "x")[0] == "acp"
    assert acp.select("first_purchase", "x")[0] == "acp"
    assert acp.select("channel_followup", "x") == ("bridge", "query_family_bridge_only")


def test_query_family_is_never_acp_eligible_in_any_mode():
    # H5: the query family stays on the bridge, including a canary that would
    # otherwise move every eligible family.
    for config in ({"transport": "acp"}, {"transport": "canary:100"},
                   {"transport": "canary:100", "canary_families": ["b0", "first_purchase"]}):
        policy = TransportPolicy.from_config(config)
        assert policy.select("channel_followup", "native-1") == ("bridge", "query_family_bridge_only")
    direct = TransportPolicy(mode="acp")
    assert direct.select("channel_followup", "native-1") == ("bridge", "query_family_bridge_only")


def test_query_family_configuration_refuses_startup_instead_of_filtering():
    for config in (
        {"transport": "acp", "family": "channel_followup"},
        {"transport": "canary:100", "family": "channel_followup"},
        {"transport": "canary:100", "canary_families": ["channel_followup"]},
        {"transport": "canary:100", "canary_families": ["b0", "channel_followup"]},
    ):
        with pytest.raises(ValueError):
            TransportPolicy.from_config(config)
    with pytest.raises(ValueError):
        TransportPolicy(mode="canary", canary_families=frozenset({"channel_followup"}))


def test_the_other_eligible_synthetic_families_are_unchanged():
    policy = TransportPolicy.from_config({"transport": "canary:100"})
    assert policy.canary_families == frozenset({"b0", "first_purchase"})
    assert policy.select("b0", "native-1")[0] == "acp"
    assert policy.select("first_purchase", "native-1")[0] == "acp"
    assert policy.select("crm-live", "native-1") == ("bridge", "non_synthetic_family")


def test_canary_assignment_is_deterministic_and_spread_across_request_ids():
    policy = TransportPolicy.from_config({"transport": "canary:50", "canary_percent": 50})
    assert policy.mode == "canary" and policy.canary_percent == 50
    first = [policy.select("b0", f"native-{index}") for index in range(1000)]
    second = [policy.select("b0", f"native-{index}") for index in range(1000)]
    assert first == second
    chosen = sum(1 for transport, _ in first if transport == "acp")
    # Independent sha256 buckets over 1000 ids: a very wide bound still proves
    # the split is a spread rather than an all-or-nothing decision.
    assert 400 <= chosen <= 600
    assert {transport for transport, _ in first} == {"bridge", "acp"}
    assert canary_bucket("native-1") == canary_bucket("native-1")


def test_canary_never_selects_acp_for_a_non_synthetic_family():
    policy = TransportPolicy.from_config({"transport": "canary:100"})
    assert policy.select("crm-live", "native-1") == ("bridge", "non_synthetic_family")
    # Configuration cannot widen eligibility beyond the synthetic allowlist.
    with pytest.raises(ValueError):
        TransportPolicy.from_config({"transport": "canary:100", "canary_families": ["crm-live"]})


def test_canary_eligibility_and_missing_prerequisites_fail_closed_to_bridge():
    other_family = TransportPolicy.from_config(
        {"transport": "canary:100", "canary_families": ["first_purchase"]})
    assert other_family.select("b0", "native-1") == ("bridge", "family_not_eligible")

    unavailable = TransportPolicy.from_config({"transport": "canary:100"}, acp_available=False)
    assert unavailable.select("b0", "native-1") == ("bridge", "acp_prerequisites_missing")
    assert unavailable.executes("acp") is False

    disabled = TransportPolicy.from_config({"transport": "canary:0"})
    assert disabled.select("b0", "native-1") == ("bridge", "canary_disabled")


def test_invalid_canary_configuration_refuses_startup():
    for config in (
        {"transport": "carrier-pigeon"},
        {"transport": "canary:abc"},
        {"transport": "canary:101"},
        {"transport": "canary:50", "canary_percent": 10},
        {"transport": "canary:50", "canary_families": "b0"},
    ):
        with pytest.raises(ValueError):
            TransportPolicy.from_config(config)
    with pytest.raises(ValueError):
        TransportPolicy(mode="canary", canary_percent=True)


def test_the_accept_decision_and_reason_are_logged(tmp_path, caplog):
    store = make_store(tmp_path / "state",
                       transport_policy=TransportPolicy.from_config({"transport": "canary:100"}))
    with caplog.at_level("INFO", logger="backend.services.analytics.jobs"):
        run = accept_native(store, make_conversation(store), "native-1")
    assert recorded_transport(store, run.run_id) == "acp"
    assert "dispatch transport acp" in caplog.text
    assert "canary_bucket=" in caplog.text


def test_the_query_family_decision_and_reason_are_logged(tmp_path, caplog):
    from backend.tests.test_analytics_query_jobs import make_query_store, query_accept

    store = make_query_store(
        tmp_path / "state", transport_policy=TransportPolicy.from_config({"transport": "canary:100"}))
    with caplog.at_level("INFO", logger="backend.services.analytics.jobs"):
        run = query_accept(store)
    assert recorded_transport(store, run.run_id) == "bridge"
    assert "family=channel_followup" in caplog.text
    assert "query_family_bridge_only" in caplog.text


# ---------------------------------------------------------------------------
# Routing: the recorded transport is the one that executes
# ---------------------------------------------------------------------------


def test_routed_transport_routes_only_by_the_recorded_value():
    bridge, acp = RecordingTransport(), RecordingTransport()
    router = RoutedTransport(bridge, acp)
    assert isinstance(router, HostTransport)

    payload = {"run_id": "run-1", "attempt_id": "attempt-1", "session_id": SESSION,
               "request_id": "native-1", "transport": "bridge"}
    router.call("dispatch", payload)
    router.call("dispatch", {**payload, "transport": "acp"})
    assert bridge.dispatched() == [payload]
    assert acp.dispatched() == [{**payload, "transport": "acp"}]
    with pytest.raises(ValueError):
        router.call("dispatch", {**payload, "transport": "carrier-pigeon"})
    with pytest.raises(ValueError):
        router.call("dispatch", {key: value for key, value in payload.items() if key != "transport"})

    assert router.call("health", {})["ready"] is True
    assert router.call("identity", {"session_id": SESSION})["session_id"] == SESSION
    # Identity stays bridge-only: the ACP seam has no identity operation.
    assert "identity" not in acp.operations()

    acp.ready = False
    assert router.call("health", {})["ready"] is False


def test_the_dispatcher_executes_the_recorded_transport(tmp_path):
    bridge, acp = RecordingTransport(), RecordingTransport()
    router = RoutedTransport(bridge, acp)

    acp_store = make_store(tmp_path / "acp",
                           transport_policy=TransportPolicy.from_config({"transport": "canary:100"}))
    acp_run = accept_native(acp_store, make_conversation(acp_store), "native-acp")
    assert recorded_transport(acp_store, acp_run.run_id) == TRANSPORT_ACP
    dispatcher = RunDispatcher(acp_store, lambda _owner: actor(), router)
    dispatcher.start()
    try:
        dispatcher.tick()
        assert acp_store.runtime_work()[0]["intent"].transport == TRANSPORT_ACP
    finally:
        dispatcher.close()
    assert [payload["run_id"] for payload in acp.dispatched()] == [acp_run.run_id]
    assert bridge.dispatched() == []

    bridge_rec, acp_rec = RecordingTransport(), RecordingTransport()
    bridge_router = RoutedTransport(bridge_rec, acp_rec)
    bridge_store = make_store(tmp_path / "bridge",
                              transport_policy=TransportPolicy.from_config({"transport": "canary:0"}))
    bridge_run = accept_native(bridge_store, make_conversation(bridge_store), "native-bridge")
    assert recorded_transport(bridge_store, bridge_run.run_id) == TRANSPORT_BRIDGE
    dispatcher = RunDispatcher(bridge_store, lambda _owner: actor(), bridge_router)
    dispatcher.start()
    try:
        dispatcher.tick()
        assert bridge_store.runtime_work()[0]["intent"].transport == TRANSPORT_BRIDGE
    finally:
        dispatcher.close()
    assert [payload["run_id"] for payload in bridge_rec.dispatched()] == [bridge_run.run_id]
    assert acp_rec.dispatched() == []


# ---------------------------------------------------------------------------
# Runtime wiring: valid canary, and canary without ACP prerequisites
# ---------------------------------------------------------------------------


def test_canary_without_acp_wiring_degrades_to_a_bridge_only_canary(tmp_path):
    config = {"transport": "canary:100", "runtime_token": "x" * 32,
              "bridge_url": "http://127.0.0.1:5001", "state_dir": str(tmp_path / "state")}
    host = build_host_transport(config)
    try:
        assert isinstance(host, RoutedTransport)
        assert host.canary_available is False and host.acp is None
        policy = transport_policy(config, host)
        assert policy.select("b0", "native-1") == ("bridge", "acp_prerequisites_missing")
        assert policy.executes("acp") is False
    finally:
        host.close()


def test_canary_with_acp_wiring_selects_acp_and_exposes_its_callback_token(tmp_path):
    config = {"transport": "canary:100", "runtime_token": "x" * 32,
              "bridge_url": "http://127.0.0.1:5001", "acp_cwd": str(tmp_path),
              "state_dir": str(tmp_path / "state"), "family": "b0"}
    host = build_host_transport(config)
    try:
        assert isinstance(host, RoutedTransport) and host.canary_available is True
        assert isinstance(host.callback_token, str) and len(host.callback_token) >= 32
        policy = transport_policy(config, host)
        assert policy.select("b0", "native-1")[0] == "acp"
    finally:
        host.close()


def test_the_default_runtime_transport_is_still_the_bridge(tmp_path):
    host = build_host_transport({"runtime_token": "x" * 32, "bridge_url": "http://127.0.0.1:5001"})
    assert not isinstance(host, RoutedTransport)
    assert transport_policy({"runtime_token": "x" * 32}, host).mode == "bridge"
