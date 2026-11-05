"""P0-1 HTTP boundary: the ACP callback is binding-correlated and ACP-only."""

from __future__ import annotations

import os
from dataclasses import asdict

from fastapi.testclient import TestClient

from backend.analytics_runtime import runtime_app
from backend.services.analytics.acp_transport import AcpTransport
from backend.services.analytics.runtime import HostBridge
from backend.tests.analytics_run_support import synthetic_fixture

GATEWAY = "g" * 32
RUNTIME = "r" * 32
CALLBACK = "c" * 32
SESSION = "native-session"


def b0_config(tmp_path, *, transport="acp"):
    fixture = synthetic_fixture(tmp_path / "fixture")
    state = tmp_path / "state"
    state.mkdir(mode=0o700)
    os.chmod(state, 0o700)
    return {"state_dir": str(state), "session_id": SESSION, "gateway_token": GATEWAY,
            "runtime_token": RUNTIME, "fixture": asdict(fixture),
            "transport": transport, "method_package_digest": "a" * 64}


def acp_transport(tmp_path):
    return AcpTransport(cwd=str(tmp_path), env={}, callback_token=CALLBACK,
                        spawn=lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("not spawned")))


def prompt(key="native-1"):
    return {"sessionId": SESSION, "requestId": key, "mode": "queue",
            "content": [{"type": "text", "text": "合成渠道"}], "clientTimeZone": "Asia/Shanghai"}


def claim_and_bind(app, store, key="native-1", acp_session="acp-live"):
    # No lifespan: admission is the only dispatcher fact this route test needs,
    # and no tick may claim the run before the test binds it.
    app.state.dispatcher.ready = True
    client = TestClient(app)
    accepted = client.post("/internal/native/prompt", json=prompt(key),
                           headers={"authorization": "Bearer " + GATEWAY})
    assert accepted.status_code == 202, accepted.text
    intent = store.claim_next(app.state.dispatcher.resolve_actor)
    assert intent is not None
    assert store.bind_acp_attempt(intent.run_id, intent.attempt_id, intent.session_id,
                                  acp_session, "4", 1) is True
    return client, intent


def test_acp_callback_route_is_absent_on_the_bridge_default(tmp_path):
    app = runtime_app(b0_config(tmp_path, transport="bridge"),
                      bridge=HostBridge("http://127.0.0.1:5999", RUNTIME))
    client = TestClient(app)
    response = client.post("/internal/acp/tool-call", json={
        "acp_session_id": "acp-live", "call_id": "call-1", "query": "channel_repeat_rate",
    }, headers={"authorization": "Bearer " + CALLBACK})
    assert response.status_code == 404


def test_acp_callback_route_reserves_the_bound_run_step(tmp_path):
    receiver = acp_transport(tmp_path)
    try:
        app = runtime_app(b0_config(tmp_path), bridge=receiver)
        store = app.state.store
        client, intent = claim_and_bind(app, store)
        response = client.post("/internal/acp/tool-call", json={
            "acp_session_id": "acp-live", "call_id": "call-1", "query": "channel_repeat_rate",
        }, headers={"authorization": "Bearer " + CALLBACK})
        assert response.status_code == 200, response.text
        receipt = response.json()
        assert receipt["step_id"] and receipt["disposition"] == "EXECUTE"
        step = store.runtime_work(session_id=intent.session_id, request_id=intent.request_id)[0]
        assert step["steps"] == {"call-1": receipt["step_id"]}
        assert step["pending_steps"] == 0
    finally:
        receiver.close()


def test_acp_context_route_echoes_only_the_child_facing_identity(tmp_path):
    receiver = acp_transport(tmp_path)
    try:
        app = runtime_app(b0_config(tmp_path), bridge=receiver)
        store = app.state.store
        client, intent = claim_and_bind(app, store, acp_session="acp-context")
        response = client.post("/internal/acp/run-context", json={
            "acp_session_id": "acp-context", "unit_id": "model:1:1", "package_digest": "a" * 64,
        }, headers={"authorization": "Bearer " + CALLBACK})
        assert response.status_code == 200, response.text
        context = response.json()
        assert context["run_id"] == intent.run_id
        assert context["attempt_id"] == intent.attempt_id
        assert context["session_id"] == "acp-context"
        assert context["request_id"] == "acp-context"
        # A wrong method digest never reaches the run-context rebuild.
        rejected = client.post("/internal/acp/run-context", json={
            "acp_session_id": "acp-context", "unit_id": "model:1:2", "package_digest": "b" * 64,
        }, headers={"authorization": "Bearer " + CALLBACK})
        assert rejected.status_code == 409
        assert rejected.json()["error"]["code"] == "METHOD_VERSION_MISMATCH"
    finally:
        receiver.close()


def test_acp_callback_route_fails_closed_without_its_scoped_token(tmp_path):
    receiver = acp_transport(tmp_path)
    try:
        app = runtime_app(b0_config(tmp_path), bridge=receiver)
        store = app.state.store
        client, _intent = claim_and_bind(app, store)
        body = {"acp_session_id": "acp-live", "call_id": "call-1", "query": "channel_repeat_rate"}
        for header in (None, "Bearer " + RUNTIME, "Bearer " + GATEWAY):
            response = client.post("/internal/acp/tool-call", json=body,
                                   headers={} if header is None else {"authorization": header})
            assert response.status_code == 401
        # A session with no BOUND binding is unbound, not "the active run".
        response = client.post("/internal/acp/tool-call", json={**body, "acp_session_id": "acp-other"},
                               headers={"authorization": "Bearer " + CALLBACK})
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "UNBOUND_NATIVE_REQUEST"
        # A settled binding is history, never a live correlation window.
        assert store.settle_acp_binding(_intent.run_id, _intent.attempt_id, "SETTLED") is True
        response = client.post("/internal/acp/tool-call", json={**body, "call_id": "call-2"},
                               headers={"authorization": "Bearer " + CALLBACK})
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "UNBOUND_NATIVE_REQUEST"
    finally:
        receiver.close()
