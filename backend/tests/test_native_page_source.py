from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import hashlib
import json
import sqlite3
from threading import Barrier

from fastapi.testclient import TestClient
import pytest

from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
from backend.services.analytics.native_page_source import NativePageSource, NATIVE_POLICY, source_error
from backend.services.analytics.page_context import PageRequestContext
from backend.services.analytics.page_documents_routes import create_page_app
from backend.services.analytics.first_purchase.asset_state import now_ms
from backend.tests.test_page_edit_context import operation as edit_operation

REF = 'crm_ref_' + 'a' * 32


def source_value(session='native-session', generation='generation1', epoch='epoch1'):
    result = {'schema_version': 'crm-dashboard-purchases/v1', 'metric_version': 'dashboard-gsv-purchases/v1',
              'filters': {'start_date': '2026-01-01', 'end_date': '2026-01-02', 'channel': '全店', 'exclude_low_price': False},
              'gsv_amount_fen': 8001, 'coverage': {'rows': 1, 'orders': 1, 'buyers': 1, 'unknown_order_rows': 0,
                  'unknown_buyer_rows': 0, 'unknown_order_amount_fen': 0, 'unknown_buyer_amount_fen': 0,
                  'null_amount_rows': 0, 'negative_amount_rows': 0, 'zero_amount_orders': 0, 'zero_only_buyers': 0},
              'aov': {'amount_fen': None, 'denominator': 0, 'reason': 'UNKNOWN_ORDER'},
              'aus': {'amount_fen': 8001, 'denominator': 1, 'reason': None},
              'limitations': ['synthetic only'], 'data_through': None, 'refund_as_of': None}
    digest = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    return {'ref': REF, 'epoch': epoch, 'identity': {'username': 'fixture-user', 'native_session_id': session,
            'connection_generation': generation, 'expires_at_ms': now_ms() + 60000, 'data_kind': 'synthetic'},
            'snapshot': {'schema_version': 'crm-result-snapshot/v1', 'snapshot_id': 'crm_s_' + 'b'*32,
                         'captured_at': '2026-01-02T12:00:00+00:00', 'data_kind': 'synthetic', 'result': result, 'result_sha256': digest}}


def actor(name='page-owner'):
    return AnalyticsPrincipal(name, frozenset({'dashboard:read', 'dashboard:update'}),
                              frozenset({NATIVE_POLICY.document_scope, NATIVE_POLICY.result_scope}))


def draft(session='native-session'):
    return {'title': 'CRM', 'session_id': session, 'package': {'html': '<h1>CRM</h1>'},
            'binding_manifest': {'result_refs': [REF], 'bindings': []}}


@pytest.fixture
def native(tmp_path):
    source = NativePageSource('http://127.0.0.1:18192')
    state = {'source': source_value(), 'error': None, 'calls': 0}
    def remote(operation, **fields):
        state['calls'] += 1
        if state.get('probe'):
            state['probe']()
        if operation == 'assertActive':
            return {'active': True}
        if state['error']:
            raise source_error(*state['error'])
        if fields.get('session_id') != state['source']['identity']['native_session_id'] or fields.get('ref') != REF:
            raise source_error(404, 'NOT_FOUND')
        return deepcopy(state['source'])
    def auth(_request):
        return PageRequestContext(actor(), now_ms() + 10000, remote)
    app = create_page_app(page_state_dir=tmp_path, authenticate_page=auth, policy=NATIVE_POLICY,
                          native_source=source, resolve_binding=source.resolve_binding)
    with TestClient(app) as client:
        yield client, app, state


def post(client, path, **fields):
    res = client.post('/api/v1/analytics/' + path, **fields)
    return res


def generate(client):
    res = post(client, 'page-documents/previews', json=draft())
    assert res.status_code == 201, res.text
    return res.json()


def test_native_edit_context_route_uses_local_page_policy(native):
    client, _, _ = native
    body = draft()
    body['package']['html'] = '<h1 data-shine-node="title">CRM</h1><p data-shine-node="metric">8001</p>'
    body['package']['node_map'] = [{'node_id': name, 'kind': 'static_element', 'selector': f'[data-shine-node="{name}"]'} for name in ['title', 'metric']]
    body['binding_manifest']['bindings'] = [{'binding_id': 'binding_metric', 'node_id': 'metric', 'result_ref': REF}]
    made = post(client, 'page-documents/previews', json=body)
    assert made.status_code == 201, made.text
    saved = confirm(client, made.json()).json()['spec']
    created = post(client, 'page-edit-contexts', json={'page_id': saved['page_id'], 'node_id': 'title', 'kind': 'static_element'})
    assert created.status_code == 201, created.text
    assert created.json()['user_id'] == actor().actor_id


def editable_page(client):
    body = draft()
    body['package'] = {'html': '<h1 data-shine-node="title">CRM</h1><p data-shine-node="metric">8001</p>',
                       'node_map': [{'node_id': name, 'kind': 'static_element', 'selector': f'[data-shine-node="{name}"]'}
                                    for name in ['title', 'metric']]}
    body['binding_manifest']['bindings'] = [{'binding_id': 'binding_metric', 'node_id': 'metric', 'result_ref': REF}]
    preview = post(client, 'page-documents/previews', json=body)
    assert preview.status_code == 201, preview.text
    return confirm(client, preview.json()).json()['spec']


def edit_preview(client, spec, channel, *, node='title', key='edit'):
    created = post(client, 'page-edit-contexts', json={'page_id': spec['page_id'], 'node_id': node,
                   'kind': 'static_element', 'channel': channel})
    assert created.status_code == 201, created.text
    context = created.json()
    payload = {'text': '已复核文案'} if channel == 'presentation' else f'<h2 data-shine-node="{node}">结构已复核</h2>'
    applied = post(client, f"page-edit-contexts/{context['edit_context_id']}/patches",
                   json=edit_operation(channel, payload, key, context=context, action='update' if channel == 'presentation' else 'replace'),
                   headers={'idempotency-key': key})
    return context, applied


@pytest.mark.parametrize('channel', ['presentation', 'source'])
def test_native_edit_confirmation_reopens_and_replays_without_source(native, channel):
    client, app, state = native
    spec = editable_page(client)
    context, applied = edit_preview(client, spec, channel)
    assert applied.status_code == 200, applied.text
    path = f"page-edit-contexts/{context['edit_context_id']}/patches/{applied.json()['preview_id']}"
    def unlocked():
        for path in [app.state.page_store.path, app.state.page_store.path.parent / 'page_edit_context.sqlite3']:
            with sqlite3.connect(path, timeout=.1) as con:
                con.execute('BEGIN IMMEDIATE')
                con.rollback()
        def acquire_cache():
            acquired = app.state.result_access._lock.acquire(timeout=.1)
            if acquired:
                app.state.result_access._lock.release()
            return acquired
        with ThreadPoolExecutor(1) as worker:
            assert worker.submit(acquire_cache).result(timeout=1)
    state['probe'] = unlocked
    before_calls = state['calls']
    saved = post(client, path + '/confirm', headers={'idempotency-key': 'edit-confirm'})
    assert saved.status_code == 200, saved.text
    assert saved.json()['saved_version'] == 2
    assert state['calls'] > before_calls
    state['error'] = (503, 'SOURCE_UNAVAILABLE')
    before_calls = state['calls']
    reopened_app = create_page_app(page_state_dir=app.state.page_store.path.parent,
                                  authenticate_page=lambda _: PageRequestContext(actor()), policy=NATIVE_POLICY)
    with TestClient(reopened_app) as reopened:
        document = reopened.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
        overlays = reopened.get('/api/v1/analytics/page-edit-contexts/overlay', params={'page_id': spec['page_id'], 'version': 2})
        assert overlays.status_code == 200, overlays.text
        if channel == 'presentation':
            assert document['package'] == spec['package']
            assert overlays.json()['overlays'] == {'title': {'text': '已复核文案'}}
        else:
            assert '<h2 data-shine-node="title">结构已复核</h2>' in document['package']['html']
            assert '<p data-shine-node="metric">8001</p>' in document['package']['html']
        replay = post(reopened, path + '/confirm', headers={'idempotency-key': 'edit-confirm'})
        assert replay.status_code == 200, replay.text
        assert replay.json()['replayed'] and replay.json()['saved_version'] == 2
        assert reopened.get('/api/v1/analytics/' + path + '/receipt').status_code == 200
    assert state['calls'] == before_calls


@pytest.mark.parametrize('channel', ['presentation', 'source'])
@pytest.mark.parametrize('revoke_during_confirm', [False, True])
def test_native_edit_revocation_writes_no_revision_or_success_receipt(native, channel, revoke_during_confirm):
    client, app, state = native
    spec = editable_page(client)
    context, applied = edit_preview(client, spec, channel)
    assert applied.status_code == 200, applied.text
    path = f"page-edit-contexts/{context['edit_context_id']}/patches/{applied.json()['preview_id']}/confirm"
    if revoke_during_confirm:
        original = app.state.page_store.confirm
        def revoke(*args, **kwargs):
            assert kwargs['source_context'] is not None
            state['error'] = (403, 'RESULT_REVOKED')
            return original(*args, **kwargs)
        app.state.page_store.confirm = revoke
    else:
        state['error'] = (403, 'RESULT_REVOKED')
    response = post(client, path, headers={'idempotency-key': 'denied-confirm'})
    assert response.status_code == 403, response.text
    with sqlite3.connect(app.state.page_store.path) as con:
        assert [con.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in ['heads', 'revisions', 'receipts']] == [1, 1, 1]
    with sqlite3.connect(app.state.page_store.path.parent / 'page_edit_context.sqlite3') as con:
        assert con.execute("SELECT COUNT(*) FROM idempotency WHERE kind='confirm'").fetchone()[0] == 0
        assert con.execute("SELECT COUNT(*) FROM edit_previews WHERE status='APPLIED'").fetchone()[0] == 0


@pytest.mark.parametrize('channel', ['presentation', 'source'])
def test_native_bound_numeric_node_stays_readonly(native, channel):
    client, app, _ = native
    spec = editable_page(client)
    context, applied = edit_preview(client, spec, channel, node='metric')
    assert context['capabilities'] == []
    assert applied.status_code == 403 and applied.json()['error']['code'] == 'BOUND_NODE'
    with sqlite3.connect(app.state.page_store.path) as con:
        assert con.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 1


def confirm(client, preview, key='save'):
    return post(client, 'page-documents/previews/' + preview['preview_id'] + '/confirm', headers={'idempotency-key': key})


def read(client, target, **fields):
    return post(client, 'page-result-access/read', json={'target': target, 'manifest': {'result_refs': ['forged'], 'bindings': []},
               'request': {'op': 'data.read', 'request_id': 'req1', **fields}})


def test_native_projection_preview_confirm_history_and_data_refs(native):
    client, app, state = native
    preview = generate(client)
    ptarget = {'kind': 'preview', 'preview_id': preview['preview_id']}
    before = read(client, ptarget, result_ref=REF).json()
    assert before['summary']['unit'] == 'per-row'
    assert before['summary']['queried_at'] == state['source']['snapshot']['captured_at']
    assert before['summary']['filters'] == state['source']['snapshot']['result']['filters']
    assert before['summary']['coverage'] == state['source']['snapshot']['result']['coverage']
    assert before['rows'] == [
        {'metric': 'GSV', 'unit': 'CNY fen', 'amount_fen': 8001},
        {'metric': 'AOV', 'unit': 'CNY fen/order', 'amount_fen': None, 'denominator': 0, 'reason': 'UNKNOWN_ORDER'},
        {'metric': 'AUS', 'unit': 'CNY fen/buyer', 'amount_fen': 8001, 'denominator': 1, 'reason': None},
        {'metric': 'orders', 'unit': 'orders', 'count': 1}, {'metric': 'buyers', 'unit': 'buyers', 'count': 1}]
    spec = confirm(client, preview).json()['spec']
    target = {'kind': 'page', 'page_id': spec['page_id'], 'version': 1}
    body = read(client, target, result_ref=REF).json()
    assert body['rows'] == before['rows']
    assert read(client, target, data_ref=body['data_ref']).json()['rows'] == body['rows']
    assert read(client, ptarget, data_ref=body['data_ref']).status_code == 409
    assert read(client, target, result_ref='forged').status_code == 404
    assert read(client, None, result_ref=REF).status_code == 422
    assert len(app.state.result_access._cache) == 2
    assert 'fixture' not in json.dumps(spec)
    assert spec['session_id'] != state['source']['identity']['username']
    state['error'] = (503, 'SOURCE_UNAVAILABLE')
    assert client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).status_code == 200
    assert confirm(client, preview, 'replay').json()['spec'] == spec


@pytest.mark.parametrize('error', [(401, 'UNAUTHENTICATED'), (403, 'RESULT_REVOKED'), (409, 'RESULT_STALE'), (503, 'SOURCE_UNAVAILABLE')])
def test_failures_recheck_cache_data_ref_and_first_confirm_without_writes(native, error):
    client, app, state = native
    preview = generate(client)
    target = {'kind': 'preview', 'preview_id': preview['preview_id']}
    first = read(client, target, result_ref=REF).json()
    state['error'] = error
    for request in [{'result_ref': REF}, {'data_ref': first['data_ref']}]:
        response = read(client, target, **request)
        assert response.status_code == error[0]
        assert response.json()['error']['code'] == error[1]
    assert confirm(client, preview).status_code == error[0]
    with sqlite3.connect(app.state.page_store.path) as con:
        assert [con.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in ['heads', 'revisions', 'receipts']] == [0, 0, 0]


@pytest.mark.parametrize('field,new', [('epoch', 'epoch2'), ('connection_generation', 'generation2'), ('expires_at_ms', 1)])
def test_data_ref_identity_and_epoch_are_pinned(native, field, new):
    client, _, state = native
    preview = generate(client)
    target = {'kind': 'preview', 'preview_id': preview['preview_id']}
    body = read(client, target, result_ref=REF).json()
    if field == 'epoch':
        state['source'][field] = new
    else:
        state['source']['identity'][field] = new
    assert read(client, target, data_ref=body['data_ref']).status_code == 409


def test_final_revalidation_and_local_cancellation(native):
    client, app, state = native
    preview = generate(client)
    target = {'kind': 'preview', 'preview_id': preview['preview_id']}
    source = app.state.result_access.source
    original = source.read
    def revoke_after_read(*args, **kwargs):
        snapshot = original(*args, **kwargs)
        state['error'] = (403, 'RESULT_REVOKED')
        return snapshot
    source.read = revoke_after_read
    assert read(client, target, result_ref=REF).status_code == 403
    assert not app.state.result_access._data_refs
    source.read = original
    state['error'] = None
    post(client, 'page-result-access/cancel', json={'op': 'data.cancel', 'request_id': 'req1'})
    assert read(client, target, result_ref=REF).status_code == 409


def test_contexts_are_explicit_and_concurrent_identity_does_not_cross():
    source = NativePageSource('http://127.0.0.1:18192')
    barrier = Barrier(2)
    def run(name):
        observed = source_value(session=name)
        def remote(operation, **fields):
            barrier.wait(3)
            assert fields['session_id'] == name
            return observed
        context = PageRequestContext(actor(name), now_ms() + 3000, remote)
        snapshot = source.read(context, name, REF)
        return snapshot.owner, snapshot.session_id
    with ThreadPoolExecutor(2) as executor:
        assert list(executor.map(run, ['alice', 'bob'])) == [('alice', 'alice'), ('bob', 'bob')]


def test_unknown_errors_are_sanitized_and_expired_context_never_reads():
    assert source_error(418, 'SQL:password').code == 'SOURCE_UNAVAILABLE'
    context = PageRequestContext(actor(), 1, lambda *args, **kwargs: pytest.fail('expired context called source'))
    with pytest.raises(AnalyticsError):
        NativePageSource('http://127.0.0.1:18192').read(context, 'native-session', REF)


def test_native_rejects_overlong_sessions_and_browser_numeric_authority(native):
    client, _, _ = native
    for extra in [{"owner": "other"}, {"scopes": ["all"]}, {"rows": [{"amount_fen": 999}]}]:
        assert post(client, 'page-documents/previews', json={**draft(), **extra}).status_code == 422
    assert post(client, 'page-documents/previews', json=draft('s' * 129)).status_code == 422


def test_source_calls_hold_neither_page_write_transaction_nor_cache_lock(native):
    client, app, state = native
    def probe():
        with sqlite3.connect(app.state.page_store.path, timeout=.1) as con:
            con.execute('BEGIN IMMEDIATE')
            con.rollback()
        def acquire_cache():
            acquired = app.state.result_access._lock.acquire(timeout=.1)
            if acquired:
                app.state.result_access._lock.release()
            return acquired
        with ThreadPoolExecutor(1) as worker:
            assert worker.submit(acquire_cache).result(timeout=1)
    state['probe'] = probe
    preview = generate(client)
    assert read(client, {'kind': 'preview', 'preview_id': preview['preview_id']}, result_ref=REF).status_code == 200
    assert confirm(client, preview).status_code == 200


def test_private_authentication_checks_bound_request_and_rejects_browser_identity(tmp_path):
    import io
    source = NativePageSource('http://127.0.0.1:18192')
    observed = source_value()
    calls = []
    grant = {'actor_id': 'page-owner', 'capabilities': ['dashboard:read', 'dashboard:update'],
             'data_scopes': [NATIVE_POLICY.document_scope, NATIVE_POLICY.result_scope], 'deadline_ms': now_ms() + 60000}
    class PrivateTransport:
        def open(self, request, timeout):
            body = json.loads(request.data)
            calls.append(body)
            assert request.get_header('Authorization') == 'Bearer ' + 'a'*64
            if body['operation'] == 'authenticate':
                value = grant
            elif body['operation'] == 'assertActive':
                value = {'active': True}
            else:
                value = observed
            return io.BytesIO(json.dumps(value).encode())
    source.opener = PrivateTransport()
    app = create_page_app(page_state_dir=tmp_path, authenticate_page=source.authenticate, policy=NATIVE_POLICY,
                          native_source=source, resolve_binding=source.resolve_binding)
    with TestClient(app) as client:
        url = '/api/v1/analytics/page-documents/previews'
        raw = json.dumps(draft(), ensure_ascii=False).encode()
        assert client.post(url, content=raw, headers={'content-type': 'application/json'}).status_code == 401
        headers = {'x-native-page-lease': 'a'*64, 'content-type': 'application/json'}
        assert client.post(url, content=raw, headers={**headers, 'origin': 'http://browser.invalid'}).status_code == 401
        assert not calls
        assert client.post(url, content=raw, headers=headers).status_code == 201
        assert calls[0] == {'operation': 'authenticate', 'method': 'POST', 'path': url, 'query': '',
                            'body_sha256': hashlib.sha256(raw).hexdigest(), 'idempotency_key': None}
        grant['capabilities'] = ['all']
        assert client.post(url, content=raw, headers=headers).status_code == 503
