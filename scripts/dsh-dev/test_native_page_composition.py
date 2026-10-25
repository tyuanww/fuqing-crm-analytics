from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import select
import shutil
import socket
import sqlite3
import subprocess
from time import monotonic, sleep
import urllib.error
import urllib.request

import pytest

ROOT = Path(__file__).resolve().parents[2]
FILTERS = {"start_date": "2026-01-01", "end_date": "2026-01-02", "channel": "全店", "exclude_low_price": False}


def receive(child):
    assert select.select([child.stdout], [], [], 15)[0], 'owned child response timed out'
    line = child.stdout.readline(1024 * 1024)
    assert line.endswith('\n'), 'owned child exited; inspect its stderr artifact'
    return json.loads(line)


def command(child, **input):
    child.stdin.write(json.dumps(input) + '\n')
    child.stdin.flush()
    return receive(child)


def stop(child):
    if child.poll() is None and getattr(child, 'page_server', False):
        child.terminate()
    if child.poll() is None:
        try:
            child.stdin.write('{"op":"close"}\n')
            child.stdin.flush()
            child.wait(timeout=10)
        except (BrokenPipeError, subprocess.TimeoutExpired):
            child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)
    child.stdin.close()
    child.stdout.close()


@pytest.fixture
def composition(tmp_path):
    required = ['CRM_NATIVE_HOST_PLUGIN', 'WORKBENCH_NATIVE_PAGE_PLUGIN', 'DSH_NATIVE_UPSTREAM', 'CRM_SERVICE_PYTHON', 'FQ_B0_PYTHON']
    configured = {key: os.environ.get(key) for key in required}
    assert all(value and Path(value).is_absolute() for value in configured.values()), 'explicit maintained paths and both interpreters required'
    node = shutil.which('node')
    assert node
    ports = []
    reservations = []
    try:
        for _ in range(6):
            reservation = socket.socket()
            reservations.append(reservation)
            reservation.bind(('127.0.0.1', 0))
            ports.append(reservation.getsockname()[1])
    finally:
        for reservation in reservations: reservation.close()
    crm_port, source_port, introspection_port, page_port, callback_port, web_port = ports
    for name in ['assets', 'refs', 'pages', 'private']:
        (tmp_path / name).mkdir(mode=0o700)
    token = tmp_path / 'private/service.token'
    token.write_text(secrets.token_hex(32)); token.chmod(0o600)
    env = {'PATH': str(Path(node).parent) + ':/usr/bin:/bin', 'PYTHONPATH': str(ROOT), 'PYTHON_DOTENV_DISABLED': '1', 'PYTHONDONTWRITEBYTECODE': '1'}
    children = []
    logs = []
    def spawn(args, config=None):
        log = (tmp_path / f'child-{len(children)}.stderr').open('w')
        logs.append(log)
        child = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True, cwd=ROOT, env=env)
        child.page_server = config is None
        children.append(child)
        if config is not None:
            child.stdin.write(json.dumps(config) + '\n'); child.stdin.flush()
            assert receive(child) == {'ready': True}
        return child
    try:
        services = spawn([configured['CRM_SERVICE_PYTHON'], str(ROOT / 'scripts/dsh-dev/test-support/native-page-services.fixture.py')], {
            'root': str(tmp_path), 'crmPort': crm_port, 'sourcePort': source_port,
            'hostOrigin': f'http://127.0.0.1:{introspection_port}', 'tokenFile': str(token)})
        page = spawn([configured['FQ_B0_PYTHON'], str(ROOT / 'scripts/dsh-dev/native_page_server.py'), '--state-dir', str(tmp_path / 'pages'),
                      '--port', str(page_port), '--callback-origin', f'http://127.0.0.1:{callback_port}'])
        deadline = monotonic() + 8
        while monotonic() < deadline:
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{page_port}/', timeout=.2).close()
            except urllib.error.HTTPError:
                break
            except OSError:
                assert page.poll() is None
                sleep(.02)
        else:
            pytest.fail('owned page service did not become ready')
        host = spawn([node, '--import', str(Path(configured['DSH_NATIVE_UPSTREAM']) / 'node_modules/tsx/dist/loader.mjs'),
                      str(ROOT / 'scripts/dsh-dev/test-support/native-page-connection.fixture.mjs')], {
            'upstream': configured['DSH_NATIVE_UPSTREAM'], 'crmPlugin': configured['CRM_NATIVE_HOST_PLUGIN'],
            'workbenchPlugin': configured['WORKBENCH_NATIVE_PAGE_PLUGIN'], 'crmOrigin': f'http://127.0.0.1:{crm_port}',
            'sourceOrigin': f'http://127.0.0.1:{source_port}', 'pageOrigin': f'http://127.0.0.1:{page_port}',
            'browserOrigin': f'http://127.0.0.1:{web_port}', 'introspectionPort': introspection_port,
            'callbackPort': callback_port, 'webPort': web_port, 'tokenFile': str(token)})
        yield lambda op, **fields: command(host, op=op, **fields), lambda **state: command(services, op='state', value=state), tmp_path
    finally:
        for child in reversed(children): stop(child)
        for log in logs: log.close()
        assert all(child.poll() is not None for child in children)


def value(result):
    assert result['ok'], result
    return result['value']


def draft(ref, session='native-session'):
    return {'title': 'CRM经营聚合', 'session_id': session, 'package': {'html': '<h1>CRM</h1>'},
            'binding_manifest': {'result_refs': [ref], 'bindings': []}}


def editable_draft(ref):
    body = draft(ref)
    body['package']['html'] = '<h1 data-shine-node="title">CRM</h1><p data-shine-node="metric">8001</p>'
    body['package']['node_map'] = [{'node_id': name, 'kind': 'static_element', 'selector': f'[data-shine-node="{name}"]'}
                                   for name in ['title', 'metric']]
    body['binding_manifest']['bindings'] = [{'binding_id': 'binding_metric', 'node_id': 'metric', 'result_ref': ref}]
    return body


def test_actual_frame_message_entry_reads_native_source_and_rejects_forgery(composition):
    rpc, _, _ = composition
    assert value(rpc('login'))['connected']
    ref = value(rpc('query', filters=FILTERS))['source_ref']
    saved = value(rpc('storeOpen', draft=editable_draft(ref)))['current']
    assert saved['version'] == 1
    result = value(rpc('frame', payload={'result_ref': ref, 'mode': 'summary'}))
    assert result.get('event') == 'data.chunk', result
    assert result['payload']['rows'] == [
        {'metric': 'GSV', 'unit': 'CNY fen', 'amount_fen': 8001},
        {'metric': 'AOV', 'unit': 'CNY fen/order', 'amount_fen': 8001, 'denominator': 1, 'reason': None},
        {'metric': 'AUS', 'unit': 'CNY fen/buyer', 'amount_fen': 8001, 'denominator': 1, 'reason': None},
        {'metric': 'orders', 'unit': 'orders', 'count': 1}, {'metric': 'buyers', 'unit': 'buyers', 'count': 1}]
    for forged in [{'target': {'kind': 'page', 'page_id': 'other', 'version': 1}}, {'rows': [{'amount_fen': 999}]},
                   {'sql': 'SELECT 999'}, {'session_id': 'other-session'}, {'scopes': ['all']}]:
        assert value(rpc('frame', payload={'result_ref': ref, **forged}))['type'] == 'error'
    assert value(rpc('frame', operation='sql', payload={}))['error']['code'] == 'FORBIDDEN'


def test_actual_native_store_edit_confirms_reopens_and_keeps_numeric_binding_readonly(composition):
    rpc, state, root = composition
    assert value(rpc('login'))['connected']
    ref = value(rpc('query', filters=FILTERS))['source_ref']
    body = editable_draft(ref)
    initial = value(rpc('storeOpen', draft=body))['current']
    edited = value(rpc('storeText', node='title', text='已复核文案', key='text-ui'))
    assert edited['current']['version'] == 2, edited
    assert edited['preview'] is None
    reopened = value(rpc('storeReopen'))
    assert reopened['presentation_overlay'] == {'title': {'text': '已复核文案'}}
    assert reopened['current']['package'] == initial['package']
    structure = '<h2 data-shine-node="title">结构已复核</h2>'
    html = body['package']['html'].replace('<h1 data-shine-node="title">CRM</h1>', structure)
    edited = value(rpc('storeSource', node='title', structure=structure, html=html, key='source-ui'))
    assert edited['current']['version'] == 3, edited
    reopened = value(rpc('storeReopen'))['current']
    assert structure in reopened['package']['html']
    denied = value(rpc('storeText', node='metric', text='999', key='metric-ui'))
    assert denied['current']['version'] == 3 and denied['preview'] is not None
    assert not denied['confirmationUncertain']
    with sqlite3.connect(root / 'pages/page_documents.sqlite3') as con:
        assert con.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 3
    state(available=False)
    assert value(rpc('storeReopen'))['current']['version'] == 3


def test_native_edit_first_confirm_rechecks_revocation_and_success_replay_stays_offline(composition):
    from backend.tests.test_page_edit_context import operation
    rpc, state, root = composition
    assert value(rpc('login'))['connected']
    ref = value(rpc('query', filters=FILTERS))['source_ref']
    spec = value(rpc('storeOpen', draft=editable_draft(ref)))['current']
    def raw(op, **fields):
        return value(rpc('raw', envelope={'operation': op, **fields}))
    def patch(key):
        created = raw('editCreate', body={'page_id': spec['page_id'], 'node_id': 'title', 'kind': 'static_element'})
        assert created['status'] == 201, created
        context = created['body']
        applied = raw('editApply', id=context['edit_context_id'], page_id=spec['page_id'], idempotency_key=key,
                      body=operation('presentation', {'text': key}, key, context=context))
        assert applied['status'] == 200, applied
        return {'id': context['edit_context_id'], 'preview_id': applied['body']['preview_id']}
    first = patch('first-edit')
    saved = raw('editConfirm', **first, idempotency_key='confirm-first')
    assert saved['status'] == 200 and saved['body']['saved_version'] == 2
    pending = patch('pending-edit')
    value(rpc('revoke', ref=ref))
    denied = raw('editConfirm', **pending, idempotency_key='confirm-revoked')
    assert denied['status'] == 403 and denied['body']['error']['code'] == 'RESULT_REVOKED'
    with sqlite3.connect(root / 'pages/page_documents.sqlite3') as con:
        assert con.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 2
        assert con.execute("SELECT COUNT(*) FROM receipts WHERE key='confirm-revoked'").fetchone()[0] == 0
    with sqlite3.connect(root / 'pages/page_edit_context.sqlite3') as con:
        assert con.execute("SELECT COUNT(*) FROM idempotency WHERE kind='confirm'").fetchone()[0] == 1
    state(available=False)
    replay = raw('editConfirm', **first, idempotency_key='confirm-first')
    assert replay['status'] == 200 and replay['body']['replayed']
    assert raw('editReceipt', **first)['status'] == 200
    assert raw('editAcknowledge', **first)['status'] == 200
    overlay = raw('editOverlay', page_id=spec['page_id'], version=2)
    assert overlay['status'] == 200 and overlay['body']['overlays'] == {'title': {'text': 'first-edit'}}


def test_actual_native_store_success_retry_after_lost_receipt_does_not_need_source(composition):
    rpc, state, root = composition
    assert value(rpc('login'))['connected']
    ref = value(rpc('query', filters=FILTERS))['source_ref']
    value(rpc('storeOpen', draft=editable_draft(ref)))
    uncertain = value(rpc('storeText', node='title', text='回执待核对', key='lost-receipt', loseReceipt=True))
    assert uncertain['current']['version'] == 1 and uncertain['confirmationUncertain']
    with sqlite3.connect(root / 'pages/page_documents.sqlite3') as con:
        assert con.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 2
    state(available=False)
    replayed = value(rpc('storeRetry'))
    assert replayed['current']['version'] == 2 and not replayed['confirmationUncertain'], replayed
    assert replayed['preview'] is None
    reopened = value(rpc('storeReopen'))
    assert reopened['presentation_overlay'] == {'title': {'text': '回执待核对'}}
    with sqlite3.connect(root / 'pages/page_edit_context.sqlite3') as con:
        assert con.execute('SELECT COUNT(*) FROM edit_contexts').fetchone()[0] == 1
        assert con.execute("SELECT COUNT(*) FROM idempotency WHERE kind='confirm'").fetchone()[0] == 1


def test_actual_connection_crm_page_workbench_closed_loop(composition):
    rpc, state, root = composition
    assert value(rpc('auth')) == {'statuses': [401, 401, 403, 403], 'valid': 200}
    assert value(rpc('login'))['connected']
    query = value(rpc('query', filters=FILTERS)); assert query['ok']
    ref = query['source_ref']
    preview = value(rpc('preview', draft=draft(ref)))
    preview_target = {'kind': 'preview', 'preview_id': preview['preview_id']}
    before = value(rpc('read', request={'result_ref': ref, 'target': preview_target}))
    assert [row['metric'] for row in before['rows']] == ['GSV', 'AOV', 'AUS', 'orders', 'buyers']
    assert before['rows'][0]['amount_fen'] == 8001
    assert before['rows'][1]['amount_fen'] == 8001
    assert before['summary']['unit'] == 'per-row'
    assert before['summary']['queried_at'] == query['value']['captured_at']
    saved = value(rpc('confirm', id=preview['preview_id'], key='first'))['spec']
    target = {'kind': 'page', 'page_id': saved['page_id'], 'version': saved['version']}
    read = value(rpc('read', request={'result_ref': ref, 'target': target}))
    assert read['rows'] == before['rows']
    assert value(rpc('get', id=saved['page_id']))['binding_manifest'] == saved['binding_manifest']
    actual_store = value(rpc('store', draft=draft(ref)))
    assert actual_store['current']['session_id'] == 'native-session'
    assert actual_store['current']['binding_manifest'] == saved['binding_manifest']
    assert value(rpc('binding', page=saved))['binding_state'] == 'BOUND_VERIFIED'
    for forged in [{'owner': 'attacker'}, {'scopes': ['all']}, {'rows': [{'amount_fen': 999}]}]:
        assert value(rpc('raw', envelope={'operation': 'generate', 'body': {**draft(ref), **forged}}))['status'] >= 400
    assert not rpc('preview', draft=draft(ref, 'other-session'))['ok']
    assert not rpc('read', request={'result_ref': 'crm_ref_' + 'f'*32, 'target': target})['ok']
    assert not rpc('read', request={'data_ref': read['data_ref'], 'target': preview_target})['ok']
    assert not rpc('read', request={'result_ref': ref, 'target': {'kind': 'page', 'page_id': 'missing', 'version': 1}})['ok']
    state(available=False)
    assert not rpc('read', request={'data_ref': read['data_ref'], 'target': target})['ok']
    assert value(rpc('get', id=saved['page_id']))['version'] == 1
    assert value(rpc('confirm', id=preview['preview_id'], key='replay'))['spec'] == saved
    state(available=True)
    assert value(rpc('read', request={'data_ref': read['data_ref'], 'target': target}))['rows'] == read['rows']
    pending = value(rpc('preview', draft=draft(ref)))
    value(rpc('revoke', ref=ref))
    rejected = rpc('confirm', id=pending['preview_id'], key='revoked')
    assert rejected == {'ok': False, 'status': 403, 'code': 'RESULT_REVOKED'}
    for request in [{'result_ref': ref}, {'data_ref': read['data_ref']}]:
        assert rpc('read', request={**request, 'target': target})['status'] == 403
    with sqlite3.connect(root / 'pages/page_documents.sqlite3') as con:
        assert con.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 2
        assert con.execute("SELECT COUNT(*) FROM receipts WHERE key='revoked'").fetchone()[0] == 0
        assert con.execute("SELECT COUNT(*) FROM heads").fetchone()[0] == 2
    assert value(rpc('confirm', id=preview['preview_id'], key='after-revoke'))['spec'] == saved


@pytest.mark.parametrize('change', ['inactive', 'relogin', 'expire', 'crm401', 'restart'])
def test_cached_reads_and_data_refs_reauthorize(composition, change):
    rpc, state, _ = composition
    value(rpc('login'))
    ref = value(rpc('query', filters=FILTERS))['source_ref']
    preview = value(rpc('preview', draft=draft(ref)))
    saved = value(rpc('confirm', id=preview['preview_id'], key='save'))['spec']
    target = {'kind': 'page', 'page_id': saved['page_id'], 'version': 1}
    read = value(rpc('read', request={'result_ref': ref, 'target': target}))
    if change == 'relogin':
        value(rpc('disconnect')); value(rpc('login'))
    elif change == 'crm401': state(authenticated=False)
    else: value(rpc(change))
    for request in [{'result_ref': ref}, {'data_ref': read['data_ref']}]:
        assert not rpc('read', request={**request, 'target': target})['ok']
    assert value(rpc('get', id=saved['page_id']))['version'] == 1


def test_parallel_requests_keep_sessions_and_callback_capacity_independent(composition):
    rpc, _, _ = composition
    requests = []
    refs = []
    for session in ['native-session', 'other-session']:
        value(rpc('login', session=session))
        ref = value(rpc('query', session=session, filters=FILTERS))['source_ref']
        refs.append(ref)
        preview = value(rpc('preview', draft=draft(ref, session)))
        requests.append({'result_ref': ref, 'target': {'kind': 'preview', 'preview_id': preview['preview_id']}})
    assert refs[0] != refs[1]
    results = value(rpc('parallelRead', requests=requests * 2))
    assert all(result['ok'] for result in results), results
    assert [result['value']['host_source']['session_id'] for result in results] == ['native-session', 'other-session'] * 2
    burst = value(rpc('parallelRead', requests=requests * 4))
    assert any(result['ok'] for result in burst), burst
    for index, result in enumerate(burst):
        if result['ok']:
            assert result['value']['host_source']['session_id'] == ['native-session', 'other-session'][index % 2]
        else:
            assert result['status'] == 503 and result['code'] in {'SOURCE_UNAVAILABLE', 'IDENTITY_UNAVAILABLE'}
    recovered = value(rpc('parallelRead', requests=requests))
    assert all(result['ok'] for result in recovered), recovered


def test_page_host_epoch_invalidates_data_ref_with_live_crm_lease(composition):
    rpc, _, _ = composition
    value(rpc('login'))
    ref = value(rpc('query', filters=FILTERS))['source_ref']
    preview = value(rpc('preview', draft=draft(ref)))
    target = {'kind': 'preview', 'preview_id': preview['preview_id']}
    read = value(rpc('read', request={'result_ref': ref, 'target': target}))
    value(rpc('pageRestart'))
    assert rpc('read', request={'data_ref': read['data_ref'], 'target': target}) == {'ok': False, 'status': 409, 'code': 'RESULT_STALE'}
    assert value(rpc('read', request={'result_ref': ref, 'target': target}))['rows'] == read['rows']


def test_actual_host_store_preserves_verified_binding_after_generate(composition):
    rpc, _, _ = composition
    value(rpc('login'))
    ref = value(rpc('query', filters=FILTERS))['source_ref']
    state = value(rpc('store', draft=draft(ref)))
    page = state['current']
    assert page is not None and page['binding_state'] == 'BOUND_VERIFIED', state
    assert page['binding_manifest']['result_refs'] == [ref]
    assert page['session_id'] == 'native-session'
    assert '样例' not in state['message'] and '示例' not in state['message']
    assert value(rpc('get', id=page['page_id']))['binding_manifest'] == page['binding_manifest']
