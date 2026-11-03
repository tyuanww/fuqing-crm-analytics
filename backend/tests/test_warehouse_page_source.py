from copy import deepcopy
import hashlib
import json
import shutil
import subprocess

import pytest

from backend.services.analytics.page_context import PageRequestContext
from backend.services.analytics.first_purchase.asset_state import now_ms
from backend.tests.test_native_page_source import (
    native as native, source_value, actor, post, generate, confirm, editable_page, edit_preview, read,
)
from backend.tests.test_warehouse_native_source import capture
from backend.tests.test_warehouse_snapshot import snapshot_case as snapshot_case
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case
from backend.services.crm_analysis import digest


def envelope(snapshot):
    raw = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':'))
    return {'schema_version': 'native-warehouse-snapshot-read/v1', 'ref_id': source_value()['ref'],
            'snapshot_id': snapshot['snapshot_id'], 'data_kind': snapshot['warehouse']['data_kind'],
            'result_sha256': snapshot['result_sha256'], 'snapshot_json': raw,
            'snapshot_json_sha256': hashlib.sha256(raw.encode()).hexdigest()}


def install(state, snapshot):
    state['source'] = {**source_value(), 'snapshot': envelope(snapshot)}


@pytest.mark.parametrize('family', ['purchases', 'product', 'analysis', 'r', 'f', 'm'])
def test_owned_warehouse_families_generate_save_reopen_and_read(native, snapshot_case, family):
    client, app, state = native
    snapshot = capture(snapshot_case, family)
    install(state, snapshot)
    saved = confirm(client, generate(client)).json()['spec']
    reopened = client.get('/api/v1/analytics/page-documents/pages/' + saved['page_id'])
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()['spec']['binding_state'] == 'BOUND_VERIFIED'
    context = PageRequestContext(actor(), now_ms() + 10000, lambda *_args, **_kw: deepcopy(state['source']))
    result = app.state.result_access.source.read(context, saved['session_id'], source_value()['ref'])
    assert result.metadata['family'] == family
    assert result.metadata['warehouse'] == snapshot['warehouse']
    assert result.metadata['periods'] == snapshot['payload']['periods']
    if family == 'product':
        assert result.metadata['column_units']['current']['gsv'] == 'CNY'
        assert result.metadata['column_units']['yoy']['old_ratio_ppt'] == 'ratio_difference'
        assert all('spu_classes' not in row and 'name' not in row for row in result.rows)
        for row, product in zip(result.rows, snapshot['payload']['result']['products'], strict=True):
            assert row['product'] == product['display_name']
            for period in ('current', 'comparison', 'yoy'):
                assert row[period] == product[period]
                assert set(row[period]) == set(result.metadata['column_units'][period])
    elif family != 'purchases':
        assert result.metadata['column_units']['repurchase_rate_current'] == 'ratio'
        assert result.metadata['column_units']['yoy_repurchase_rate'] == 'ratio_difference'
        expected = [{"group": group, **row}
                    for group in ('rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows')
                    for row in snapshot['payload']['result'][group]]
        assert list(result.rows) == expected
        for row in result.rows:
            fields = set(row) - {'group', 'rfm_segment', 'r_segment', 'f_segment', 'm_segment'}
            assert fields == set(result.metadata['column_units'])


@pytest.mark.parametrize('mutation', ['bytes', 'result', 'id', 'kind', 'ref'])
def test_warehouse_envelope_mismatch_is_rejected(native, snapshot_case, mutation):
    client, _, state = native
    snapshot = capture(snapshot_case)
    value = envelope(snapshot)
    if mutation == 'bytes':
        value['snapshot_json'] += ' '
    elif mutation == 'result':
        snapshot['payload']['result']['gsv_amount_fen'] += 1
        value = envelope(snapshot)
    else:
        value[{'id': 'snapshot_id', 'kind': 'data_kind', 'ref': 'ref_id'}[mutation]] = {
            'id': 'crm_w_' + '0' * 32, 'kind': 'real', 'ref': 'crm_ref_' + '0' * 32,
        }[mutation]
    state['source'] = {**source_value(), 'snapshot': value}
    response = post(client, 'page-documents/previews', json={
        'title': 'Bad', 'session_id': 'native-session', 'package': {'html': '<h1>Bad</h1>'},
        'binding_manifest': {'bindings': [], 'result_refs': [source_value()['ref']]}})
    assert response.status_code == 503, response.text


def test_warehouse_purchases_preserves_large_integer_through_node_and_browser(native, snapshot_case):
    _, app, state = native
    snapshot = capture(snapshot_case)
    snapshot['payload']['result']['gsv_amount_fen'] = 9007199254747995
    snapshot['result_sha256'] = digest(snapshot['payload'])
    install(state, snapshot)
    node = shutil.which('node')
    if node is None:
        pytest.skip('Node unavailable for opaque snapshot round trip')
    output = subprocess.run([node, '--input-type=module', '-e',
        'let s=""; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.stringify(JSON.parse(s)));'],
        input=json.dumps(state['source']), text=True, capture_output=True, check=True, timeout=10)
    assert json.loads(output.stdout)['snapshot']['snapshot_json'] == state['source']['snapshot']['snapshot_json']
    state['source'] = json.loads(output.stdout)
    context = PageRequestContext(actor(), now_ms() + 10000, lambda *_args, **_kw: state['source'])
    result = app.state.result_access.source.read(context, 'native-session', source_value()['ref'])
    assert result.rows[0]['amount_fen'] == '9007199254747995'
    browser = subprocess.run([node, '--input-type=module', '-e',
        'let s=""; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.parse(s).amount_fen);'],
        input=json.dumps(result.rows[0]), text=True, capture_output=True, check=True, timeout=10)
    assert browser.stdout == '9007199254747995'


def test_warehouse_bound_fact_is_read_only_and_revoke_blocks_reopen(native, snapshot_case):
    client, _, state = native
    install(state, capture(snapshot_case, 'product'))
    saved = editable_page(client)
    _, preview = edit_preview(client, saved, 'presentation', node='metric')
    assert preview.status_code in (403, 409, 422), preview.text
    state['error'] = (403, 'RESULT_REVOKED')
    target = {'kind': 'page', 'page_id': saved['page_id'], 'version': saved['version']}
    response = read(client, target, result_ref=source_value()['ref'])
    assert response.status_code == 403, response.text
    state_response = post(client, 'page-result-access/binding-state', json={'target': target})
    assert state_response.status_code == 403, state_response.text


@pytest.mark.parametrize('channel', ['presentation', 'source'])
def test_warehouse_copy_and_layout_edits_save_reopen_without_changing_facts(native, snapshot_case, channel):
    client, _, state = native
    install(state, capture(snapshot_case, 'analysis'))
    before_source = deepcopy(state['source'])
    saved = editable_page(client)
    context, applied = edit_preview(client, saved, channel)
    assert applied.status_code == 200, applied.text
    path = f"page-edit-contexts/{context['edit_context_id']}/patches/{applied.json()['preview_id']}/confirm"
    committed = post(client, path, headers={'idempotency-key': 'warehouse-edit'})
    assert committed.status_code == 200, committed.text
    reopened = client.get('/api/v1/analytics/page-documents/pages/' + saved['page_id']).json()['spec']
    assert reopened['version'] == 2
    assert reopened['binding_manifest'] == saved['binding_manifest']
    assert state['source'] == before_source
    target = {'kind': 'page', 'page_id': saved['page_id'], 'version': 2}
    assert read(client, target, result_ref=source_value()['ref']).status_code == 200


@pytest.mark.parametrize('channel', ['presentation', 'source'])
def test_warehouse_bound_fact_rejects_both_edit_channels(native, snapshot_case, channel):
    client, app, state = native
    install(state, capture(snapshot_case, 'product'))
    saved = editable_page(client)
    context, applied = edit_preview(client, saved, channel, node='metric')
    assert context['capabilities'] == []
    assert applied.status_code == 403 and applied.json()['error']['code'] == 'BOUND_NODE'
    assert client.get('/api/v1/analytics/page-documents/pages/' + saved['page_id']).json()['spec']['version'] == 1


@pytest.mark.parametrize('change', ['expired', 'session', 'generation', 'epoch', 'warehouse', 'snapshot'])
def test_warehouse_result_handles_recheck_authorization_and_provenance(native, snapshot_case, change):
    client, _, state = native
    snapshot = capture(snapshot_case, 'product')
    install(state, snapshot)
    saved = confirm(client, generate(client)).json()['spec']
    target = {'kind': 'page', 'page_id': saved['page_id'], 'version': 1}
    first = read(client, target, result_ref=source_value()['ref'])
    assert first.status_code == 200, first.text
    if change == 'expired':
        state['source']['identity']['expires_at_ms'] = 1
    elif change == 'session':
        state['source']['identity']['native_session_id'] = 'different-session'
    elif change == 'generation':
        state['source']['identity']['connection_generation'] = 'next-generation'
    elif change == 'epoch':
        state['source']['epoch'] = 'next-epoch'
    else:
        if change == 'warehouse':
            snapshot['warehouse']['semantic_revision'] = 'f' * 64
        else:
            snapshot['snapshot_id'] = 'crm_w_' + '0' * 32
        install(state, snapshot)
    denied = read(client, target, data_ref=first.json()['data_ref'])
    assert denied.status_code in (404, 409), denied.text


def test_warehouse_manual_css_layout_save_keeps_bound_html_and_data(native, snapshot_case):
    client, _, state = native
    install(state, capture(snapshot_case, 'r'))
    saved = editable_page(client)
    changed = {**saved['package'], 'css': 'body{display:grid;grid-template-columns:2fr 1fr;gap:16px}'}
    preview = post(client, f"page-documents/pages/{saved['page_id']}/save-preview", json={
        'base_version': 1, 'title': saved['title'], 'package': changed,
        'binding_manifest': saved['binding_manifest']})
    assert preview.status_code == 201, preview.text
    result = confirm(client, preview.json(), 'layout')
    assert result.status_code == 200, result.text
    reopened = client.get('/api/v1/analytics/page-documents/pages/' + saved['page_id']).json()['spec']
    assert reopened['package']['html'] == saved['package']['html']
    assert reopened['package']['css'] == changed['css']
    assert reopened['binding_manifest'] == saved['binding_manifest']
    assert read(client, {'kind': 'page', 'page_id': saved['page_id'], 'version': 2}, result_ref=source_value()['ref']).status_code == 200
