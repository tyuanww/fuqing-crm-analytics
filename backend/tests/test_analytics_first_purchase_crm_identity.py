"""Real owned loopback identity responses; isolated synthetic service state only."""

from contextlib import contextmanager
from socketserver import StreamRequestHandler, ThreadingTCPServer
from threading import Event, Thread
from time import monotonic
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.analytics_first_purchase_analysis_app import PREFIX, RECEIPT_PREFIX, create_first_purchase_analysis_app
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
from backend.tests.test_analytics_first_purchase_analysis import TOKEN, analysis_counts, headers
from backend.tests import test_analytics_first_purchase_save_api as save_support
from backend.tests.test_analytics_first_purchase_save_api import inspect, save

gate = save_support.gate


def response(body=b'{"username":"synthetic-demo","is_admin":true}', status=200, extra=b""):
    return (f"HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n"
            .encode() + extra + b"Connection: close\r\n\r\n" + body)


@contextmanager
def identity_server():
    state = SimpleNamespace(reply=response(), chunks=None, requests=[])
    stopping = Event()

    class Handler(StreamRequestHandler):
        def handle(self):
            self.connection.settimeout(1)
            try:
                request = bytearray()
                while len(request) < 2048:
                    line = self.rfile.readline(2048)
                    request.extend(line)
                    if line in (b"\r\n", b""):
                        break
                state.requests.append(bytes(request))
                chunks = state.chunks if state.chunks is not None else [(state.reply, 0)]
                for chunk, delay in chunks:
                    if stopping.wait(delay):
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except OSError:
                pass  # Expected when the bounded client refuses or times out.

    with ThreadingTCPServer(("127.0.0.1", 0), Handler) as server:
        thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
        thread.start()
        try:
            yield state, f"http://127.0.0.1:{server.server_address[1]}"
        finally:
            stopping.set()
            server.shutdown()
            thread.join(timeout=2)
            assert not thread.is_alive()
    # server_close also joins the owned request handlers (no daemon threads).


@pytest.fixture
def crm():
    with identity_server() as pair:
        yield pair


def resolver(origin, **kwargs):
    return CRMFirstPurchaseIdentityResolver(origin, frozenset({"synthetic-demo"}), **kwargs)


def test_current_crm_account_maps_without_cached_grants_or_token_storage(crm, monkeypatch):
    state, origin = crm
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    adapter = resolver(origin)
    principal = adapter.resolve(f"Bearer {TOKEN}")
    assert principal.actor_id == "synthetic-demo"
    assert principal.capabilities == frozenset({"run:read", "analysis:read", "analysis:save"})
    assert principal.data_scopes == frozenset({"first-purchase-fixture"})
    assert TOKEN not in repr(adapter)
    state.reply = response(status=401)
    with pytest.raises(AnalyticsError) as caught:
        adapter.resolve(f"Bearer {TOKEN}")
    assert caught.value.status == 401
    assert len(state.requests) == 2
    assert all(item.startswith(b"GET /api/v1/auth/me HTTP/1.1\r\n") for item in state.requests)
    assert all(b"Cookie:" not in item and b"Authorization: Bearer " + TOKEN.encode() in item for item in state.requests)


@pytest.mark.parametrize("origin", [
    "https://127.0.0.1:1", "http://example.invalid:1", "http://localhost:1", "http://10.0.0.1:1",
    "http://0.0.0.0:1", "http://127.0.0.1", "http://127.0.0.1:0", "http://user@127.0.0.1:1",
    "http://127.0.0.1:1/", "http://127.0.0.1:1?x=1", "http://127.0.0.1:1#x", "http://127.0.0.1:1?",
    "http://127.0.0.1:1\r\nx", "http://[::1%lo0]:1", None,
])
def test_untrusted_or_ambiguous_origin_rejected_before_network(origin):
    with pytest.raises(ValueError, match="CRM_IDENTITY_LOOPBACK_ORIGIN_REQUIRED"):
        resolver(origin)


@pytest.mark.parametrize("accounts", [None, set(), frozenset(), frozenset({"a\nb"}), frozenset({1})])
def test_explicit_immutable_account_policy_required(accounts):
    with pytest.raises(ValueError, match="CRM_IDENTITY_EXPLICIT_ACCOUNTS_REQUIRED"):
        CRMFirstPurchaseIdentityResolver("http://127.0.0.1:1", accounts)


@pytest.mark.parametrize("timeout", [True, 0, -1, float("nan"), float("inf"), 6, "1"])
def test_timeout_must_be_finite_and_bounded(timeout):
    with pytest.raises(ValueError, match="CRM_IDENTITY_TIMEOUT_INVALID"):
        resolver("http://127.0.0.1:1", timeout_seconds=timeout)


@pytest.mark.parametrize("authorization", [None, "Basic example", "Bearer ", "Bearer a b", "Bearer a\r\nx", "Bearer " + "a" * 1018])
def test_bad_bearer_never_reaches_crm(crm, authorization):
    state, origin = crm
    with pytest.raises(AnalyticsError) as caught:
        resolver(origin).resolve(authorization)
    assert caught.value.status == 401 and not state.requests


@pytest.mark.parametrize(("body", "status"), [
    (b'{"username":"another-admin","is_admin":true}', 403),
    (b'{"username":"synthetic-demo","is_admin":false}', 403),
    (b'{"username":"synthetic-demo","is_admin":1}', 503),
    (b'{"username":"synthetic-demo"}', 503),
    (b'{"username":"synthetic-demo","is_admin":false,"is_admin":true}', 503),
    (b'{"username":"synthetic-demo","is_admin":true,"capabilities":["root"]}', 503),
    (b'{"username":"bad\\nname","is_admin":true}', 503),
    (b'[]', 503), (b'private-provider-body', 503), (b'\xff', 503),
])
def test_identity_response_cannot_forge_or_expand_grants(crm, caplog, body, status):
    state, origin = crm
    state.reply = response(body)
    with pytest.raises(AnalyticsError) as caught:
        resolver(origin).resolve(f"Bearer {TOKEN}")
    assert caught.value.status == status
    assert caught.value.retryable is (status == 503)
    assert TOKEN not in str(caught.value) + caplog.text
    assert "private-provider-body" not in str(caught.value) + caught.value.message + caplog.text


@pytest.mark.parametrize("reply", [
    response(status=302, extra=b"Location: http://example.invalid/collect\r\nSet-Cookie: credential=bad\r\n"),
    response(status=500), response(b"x" * 4097),
    response(extra=b"Content-Type: application/json\r\n"), response(extra=b"Content-Encoding: gzip\r\n"),
    response(extra=b"X-Big: " + b"x" * 17000 + b"\r\n"),
    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{}",
    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\n{}",
    b"HTTP/1.1 101 Switching Protocols\r\nConnection: upgrade\r\nUpgrade: websocket\r\n\r\n",
], ids=["redirect", "outage", "body-limit", "duplicate-content-type", "compressed", "header-limit",
        "truncated", "conflicting-length", "upgrade"])
def test_http_refuses_redirect_ambiguous_framing_and_oversized_reply(crm, reply):
    state, origin = crm
    state.reply = reply
    with pytest.raises(AnalyticsError) as caught:
        resolver(origin).resolve(f"Bearer {TOKEN}")
    assert caught.value.status == 503 and len(state.requests) == 1


def test_chunked_json_uses_the_same_bounded_parser(crm):
    state, origin = crm
    body = b'{"username":"synthetic-demo","is_admin":true}'
    state.reply = (b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n"
                   + f"{len(body):x}\r\n".encode() + body + b"\r\n0\r\n\r\n")
    assert resolver(origin).resolve(f"Bearer {TOKEN}").actor_id == "synthetic-demo"


@pytest.mark.parametrize("phase", ["headers", "body"])
def test_total_deadline_applies_to_slow_streams_and_closes_owned_connection(crm, phase):
    state, origin = crm
    reply = response()
    header, body = reply.split(b"\r\n\r\n", 1)
    prefix = [] if phase == "headers" else [(header + b"\r\n\r\n", 0)]
    slow = reply if phase == "headers" else body
    state.chunks = prefix + [(bytes([byte]), 0.04) for byte in slow]
    started = monotonic()
    with pytest.raises(AnalyticsError) as caught:
        resolver(origin, timeout_seconds=0.15).resolve(f"Bearer {TOKEN}")
    assert caught.value.status == 503
    assert monotonic() - started < 1.5  # Per-read timeouts would allow the whole drip (> 1.5 s).


def test_offline_identity_is_retryable_not_anonymous():
    with identity_server() as (_, origin):
        adapter = resolver(origin)
    with pytest.raises(AnalyticsError) as caught:
        adapter.resolve(f"Bearer {TOKEN}")
    assert caught.value.status == 503 and caught.value.retryable


def test_http_identity_rechecks_revoke_replay_and_preserves_saved_record(gate, crm):
    _, store, policy, _, runs, command = gate
    state, origin = crm
    with TestClient(create_first_purchase_analysis_app(
        runs, store, resolver(origin), save_policy=lambda: policy["policy"],
    )) as api:
        receipt = save(api, command)
        assert receipt.status_code == 201, receipt.text
        state.reply = response(b'{"username":"synthetic-demo","is_admin":false}')
        assert save(api, command).status_code == 403
        state.reply = response(status=401)
        assert api.post(RECEIPT_PREFIX + "/reconcile", json=command["identity"], headers=headers(key="save-1")).status_code == 401
        state.reply = response()
        replay = save(api, command)
        assert replay.status_code == 201 and replay.json() == receipt.json()
        assert api.get(f'{PREFIX}/{receipt.json()["analysis_ref"]["analysis_id"]}', headers=headers()).status_code == 200
    assert len(state.requests) >= 7
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}


def test_existing_crm_identity_alone_cannot_enable_save_or_reassign_source(gate, crm):
    _, store, _, _, runs, command = gate
    state, origin = crm
    with TestClient(create_first_purchase_analysis_app(runs, store, resolver(origin))) as api:
        check = inspect(api, command)
        assert check.status_code == 200 and not check.json()["save_eligible"]
        assert check.json()["save_ineligible_reason"] == "POLICY_NOT_CONFIGURED"
        assert save(api, command).status_code == 503
        legacy = api.post(PREFIX, json={"created_from_run_id": command["created_from_run_id"], "title": "bypass"},
                          headers=headers(key="legacy-bypass"))
        assert legacy.status_code == 409 and legacy.json()["error"]["code"] == "VERSIONED_SAVE_REQUIRED"
    state.reply = response(b'{"username":"another-admin","is_admin":true}')
    adapter = CRMFirstPurchaseIdentityResolver(origin, frozenset({"another-admin"}))
    with TestClient(create_first_purchase_analysis_app(runs, store, adapter)) as api:
        assert inspect(api, command).status_code == 404  # Never aliases a real username to synthetic-demo.
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


def test_outage_inside_write_transaction_leaves_no_analysis_or_receipt(gate, crm):
    _, store, policy, _, runs, command = gate
    state, origin = crm
    adapter = resolver(origin)
    calls = 0

    class RevokeDuringSave:
        def resolve(self, authorization):
            nonlocal calls
            calls += 1
            if calls > 1:
                state.reply = response(status=503)
            return adapter.resolve(authorization)

    with TestClient(create_first_purchase_analysis_app(
        runs, store, RevokeDuringSave(), save_policy=lambda: policy["policy"],
    )) as api:
        denied = save(api, command)
        assert denied.status_code == 503 and denied.json()["error"]["code"] == "IDENTITY_UNAVAILABLE"
    assert calls == 2 and analysis_counts(store) == {"analyses": 0, "idempotency": 0}
