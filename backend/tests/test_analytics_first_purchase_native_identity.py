"""CRM owner binding/revocation over the existing native runtime; no real data."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
from backend.analytics_first_purchase_native import create_first_purchase_native_app
from backend.services.analytics.access import AnalyticsError, B0IdentityRegistry
from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
from backend.services.analytics.first_purchase.native_identity import NativeSessionIdentityResolver
from backend.tests.analytics_run_support import sqlite_connection
from backend.tests.test_analytics_first_purchase_crm_identity import identity_server, response
from backend.tests.test_analytics_first_purchase_native import (
    DIGEST, GATEWAY, RUNTIME, SESSION, SNAPSHOT, auth, fp_actor, native_prompt, private_dir,
)
from backend.tests.test_analytics_native_runtime import Receiver

IDENTITY_PATH = "/api/v1/analytics-first-purchase/session-identity"


def identity(owner="crm-owner"):
    return {"schema_version": "first-purchase-session-identity/v1", "owner_id": owner,
            "data_scope": "first-purchase-fixture", "query_access": "GRANTED"}


class IdentityReceiver(Receiver):
    def __init__(self):
        super().__init__()
        self.current = identity()

    def call(self, operation, payload):
        if operation == "identity":
            if self.current is None:
                raise OSError("controlled identity down")
            if self.current == "DISCONNECTED":
                return {"session_id": payload["session_id"], "denied": "UNAUTHENTICATED"}
            return {"session_id": payload["session_id"], "identity": self.current}
        return super().call(operation, payload)


def config(tmp_path):
    return {"state_dir": str(private_dir(tmp_path, "state")), "runtime_token": RUNTIME,
            "gateway_token": GATEWAY, "session_id": SESSION, "snapshot": SNAPSHOT,
            "method_package_digest": DIGEST, "identity_mode": "crm-session"}


def test_identity_route_requires_explicit_fresh_query_grant_and_no_client_actor():
    with identity_server() as (state, origin):
        adapter = CRMFirstPurchaseIdentityResolver(origin, frozenset({"synthetic-demo"}))
        with TestClient(create_first_purchase_analysis_app(identities=adapter)) as client:
            assert client.post(IDENTITY_PATH, json={}, headers=auth()).status_code == 403
        adapter = CRMFirstPurchaseIdentityResolver(origin, frozenset({"synthetic-demo"}), allow_query=True)
        with TestClient(create_first_purchase_analysis_app(identities=adapter)) as client:
            grant = client.post(IDENTITY_PATH, json={}, headers=auth())
            assert grant.status_code == 200 and grant.json() == identity("synthetic-demo")
            assert grant.headers["cache-control"] == "no-store"
            assert client.post(IDENTITY_PATH, json={"owner_id": "admin"}, headers=auth()).status_code == 422
            state.reply = response(status=401)
            assert client.post(IDENTITY_PATH, json={}, headers=auth()).status_code == 401


@pytest.mark.parametrize("payload", [
    None, {}, {"session_id": "another-session", "identity": identity()},
    {"session_id": SESSION, "identity": {"owner_id": "crm-owner"}},
    {"session_id": SESSION, "identity": {**identity(), "token": "unexpected"}},
    {"session_id": SESSION, "identity": {**identity(), "query_access": "DENIED"}},
])
def test_native_identity_rejects_incomplete_or_foreign_claims(payload):
    resolver = NativeSessionIdentityResolver(SimpleNamespace(call=lambda *_: payload), SESSION, GATEWAY)
    with pytest.raises(AnalyticsError) as error:
        resolver.resolve("Bearer " + GATEWAY)
    assert error.value.code == "IDENTITY_UNAVAILABLE"


def test_native_identity_requires_gateway_credential_before_contacting_host():
    calls = []
    resolver = NativeSessionIdentityResolver(SimpleNamespace(call=lambda *args: calls.append(args)), SESSION, GATEWAY)
    for authorization in (None, "Bearer foreign", "Bearer 中文", "Bearer " + RUNTIME):
        with pytest.raises(AnalyticsError) as error:
            resolver.resolve(authorization)
        assert error.value.status == 401
    assert not calls


def test_native_crm_mode_is_explicit_and_disallows_legacy_asset_writes(tmp_path):
    cfg = config(tmp_path)
    for extra in ({"identity_mode": "auto"}, {"asset_capabilities": ["analysis:save"]}):
        with pytest.raises(ValueError):
            create_first_purchase_native_app({**cfg, **extra}, bridge=IdentityReceiver())


def test_crm_session_owner_is_durable_never_aliases_fixture_or_other_login(tmp_path):
    cfg, bridge = config(tmp_path), IdentityReceiver()
    app = create_first_purchase_native_app(cfg, bridge=bridge)
    app.state.dispatcher.ready = True
    with TestClient(app, raise_server_exceptions=True) as client:
        accepted = client.post("/internal/native/prompt", json=native_prompt(), headers=auth())
        assert accepted.status_code == 202
        run_id = accepted.json()["run_id"]
        assert app.state.store.get(fp_actor("crm-owner"), run_id).run_id == run_id
        bridge.current = identity("another-account")
        denied = client.post("/internal/native/prompt", json=native_prompt("other"), headers=auth())
        assert denied.status_code == 409 and denied.json()["error"]["code"] == "SESSION_ALREADY_BOUND"
        assert client.get(f"/api/v1/analytics-first-purchase/runs/{run_id}", headers=auth()).status_code == 404
        bridge.current = None
        assert client.get("/internal/native/context", headers=auth()).status_code == 503
        bridge.current = identity()
        assert client.get("/internal/native/context", headers=auth()).status_code == 200
    reopened = create_first_purchase_native_app(cfg, bridge=bridge)
    with TestClient(reopened) as client:
        replay = client.post("/internal/native/prompt", json=native_prompt(), headers=auth())
        assert replay.status_code == 202 and replay.json()["run_id"] == run_id
    with sqlite_connection(app.state.store.path) as db:
        assert {row[0] for row in db.execute("SELECT owner FROM runs")} == {"crm-owner"}
        assert db.execute("SELECT count(*) FROM conversations").fetchone()[0] == 1
    assert not isinstance(app.state.registry, B0IdentityRegistry)


def test_disconnected_queued_query_is_not_dispatched(tmp_path):
    bridge = IdentityReceiver()
    app = create_first_purchase_native_app(config(tmp_path), bridge=bridge)
    # Drive the same dispatcher deterministically, without a background tick race.
    dispatcher = app.state.dispatcher
    dispatcher.start()
    try:
        dispatcher.ready = True
        client = TestClient(app)
        accepted = client.post("/internal/native/prompt", json=native_prompt(), headers=auth()).json()
        bridge.current = "DISCONNECTED"
        dispatcher.tick()
        stored = app.state.store.get(fp_actor("crm-owner"), accepted["run_id"])
        assert stored.status == "FAILED"
        assert not any(op == "dispatch" for op, _ in bridge.calls)
    finally:
        dispatcher.close()


def test_existing_synthetic_session_is_not_reassigned_to_crm_owner(tmp_path):
    cfg = config(tmp_path)
    original = create_first_purchase_native_app({**cfg, "identity_mode": "synthetic"}, bridge=Receiver())
    app = create_first_purchase_native_app(cfg, bridge=IdentityReceiver())
    client = TestClient(app)
    denied = client.get("/internal/native/context", headers=auth())
    assert denied.status_code == 409
    assert denied.json()["error"]["code"] == "SESSION_ALREADY_BOUND"
    with sqlite_connection(original.state.store.path) as db:
        assert [row[0] for row in db.execute("SELECT owner FROM conversations")] == ["synthetic-demo"]


def test_identity_outage_pauses_admission_without_falsely_revoking_queued_owner(tmp_path):
    bridge = IdentityReceiver()
    app = create_first_purchase_native_app(config(tmp_path), bridge=bridge)
    dispatcher = app.state.dispatcher
    dispatcher.start()
    try:
        dispatcher.ready = True
        client = TestClient(app)
        accepted = client.post("/internal/native/prompt", json=native_prompt(), headers=auth()).json()
        bridge.current = None
        dispatcher.tick()
        assert app.state.store.get(fp_actor("crm-owner"), accepted["run_id"]).status == "QUEUED"
        assert dispatcher.ready is False
        bridge.current = identity()
        dispatcher.tick()
        stored = app.state.store.get(fp_actor("crm-owner"), accepted["run_id"])
        assert stored.status == "RUNNING" and stored.diagnostics.dispatch_attempts == 1
    finally:
        dispatcher.close()


def test_identity_status_and_cancel_before_first_prompt_do_not_create_conversations(tmp_path):
    app = create_first_purchase_native_app(config(tmp_path), bridge=IdentityReceiver())
    client = TestClient(app)
    status = client.get("/internal/native/context", headers=auth())
    assert status.status_code == 200
    with sqlite_connection(app.state.store.path) as db:
        assert db.execute("SELECT count(*) FROM conversations").fetchone()[0] == 0
    assert status.json()["conversation"] is None
    cancel = client.post("/internal/native/first-purchase/cancel", json={}, headers=auth())
    assert cancel.status_code == 409 and cancel.json()["error"]["code"] == "NO_ACTIVE_RUN"
    with sqlite_connection(app.state.store.path) as db:
        assert db.execute("SELECT count(*) FROM conversations").fetchone()[0] == 0
