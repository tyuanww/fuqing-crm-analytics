from copy import deepcopy
from dataclasses import replace

import pytest

from backend.services.crm_analysis import digest
from backend.contracts.page_facts import PageFactView
from backend.tests.test_native_page_source import native as native, post, read, source_value, editable_page, edit_preview
from backend.tests.test_warehouse_page_source import install
from backend.tests.test_warehouse_native_source import capture
from backend.tests.test_warehouse_snapshot import snapshot_case as snapshot_case
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case


def target(page):
    return {'kind': 'page', 'page_id': page['page_id'], 'version': page['version']}


def facts(client, page, **extra):
    return read(client, target(page), result_ref=source_value()['ref'], mode='facts', **extra)


@pytest.mark.parametrize('family', ['purchases', 'product', 'analysis', 'r', 'f', 'm'])
def test_full_fact_view_survives_copy_edit_save_and_reopen(native, snapshot_case, family):
    client, _, state = native
    snapshot = capture(snapshot_case, family)
    install(state, snapshot)
    saved = editable_page(client)
    response = facts(client, saved)
    assert response.status_code == 200, response.text
    body = response.json()
    assert PageFactView.model_validate(body).model_dump(mode='json') == body
    assert body['facts_schema_version'] == 'warehouse-facts/v1'
    assert body['expires_at_ms'] == state['source']['identity']['expires_at_ms']
    assert body['rows'] == [] and body['cursor'] is None
    assert body['summary']['snapshot_id'] == snapshot['snapshot_id']
    result = snapshot['payload']['result']
    items = body['facts']
    if family == 'purchases':
        assert [f['selector']['metric'] for f in items] == ['GSV', 'AOV', 'AUS', 'orders', 'buyers']
        assert [f['value'] for f in items] == [result['gsv_amount_fen'], result['aov']['amount_fen'],
            result['aus']['amount_fen'], result['coverage']['orders'], result['coverage']['buyers']]
    elif family == 'product':
        assert len(items) == len(result['products']) * 47
        product = result['products'][-1]
        tail = next(f for f in items if f['selector'] == {'kind': 'product', 'display_name': product['display_name'],
                                                        'period': 'yoy', 'field': 'new_users_ratio_ppt'})
        assert tail['value'] == product['yoy']['new_users_ratio_ppt']
    else:
        segment = {'analysis': 'rfm_segment', 'r': 'r_segment', 'f': 'f_segment', 'm': 'm_segment'}[family]
        assert len(items) == sum(len(result[g]) for g in ['rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows']) * 20
        for group in ['rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows']:
            for row in result[group]:
                item = next(f for f in items if f['selector'] == {'kind': 'rfm', 'group': group,
                    'segment': row[segment], 'field': 'hist_users_current'})
                assert item['value'] == row['hist_users_current']
    context, applied = edit_preview(client, saved, 'presentation')
    assert applied.status_code == 200, applied.text
    confirmed = post(client, f"page-edit-contexts/{context['edit_context_id']}/patches/{applied.json()['preview_id']}/confirm",
                     headers={'idempotency-key': 'facts-copy-edit'})
    assert confirmed.status_code == 200, confirmed.text
    reopened = client.get('/api/v1/analytics/page-documents/pages/' + saved['page_id']).json()['spec']
    assert reopened['version'] == 2
    assert facts(client, reopened).json()['facts'] == items


@pytest.mark.parametrize('extra', [{'limit': 1}, {'cursor': 'v1:0'}, {'start': 0}, {'end': 1},
    {'facts': []}, {'selector': {'kind': 'purchase', 'metric': 'GSV'}}])
def test_fact_view_cannot_be_silently_truncated_or_selected(native, snapshot_case, extra):
    client, _, state = native
    install(state, capture(snapshot_case))
    saved = editable_page(client)
    response = facts(client, saved, **extra)
    assert response.status_code == 422, response.text
    assert 'facts' not in response.json()


@pytest.mark.parametrize('change', ['expired', 'session', 'generation', 'epoch', 'warehouse', 'snapshot', 'revoked'])
def test_fact_handle_rechecks_source_and_authorization(native, snapshot_case, change):
    client, _, state = native
    snapshot = capture(snapshot_case, 'product')
    install(state, snapshot)
    saved = editable_page(client)
    first = facts(client, saved)
    assert first.status_code == 200, first.text
    if change == 'expired':
        state['source']['identity']['expires_at_ms'] = 1
    elif change == 'session':
        state['source']['identity']['native_session_id'] = 'another-session'
    elif change == 'generation':
        state['source']['identity']['connection_generation'] = 'next'
    elif change == 'epoch':
        state['source']['epoch'] = 'next'
    elif change == 'revoked':
        state['error'] = (403, 'RESULT_REVOKED')
    else:
        if change == 'warehouse':
            snapshot['warehouse']['semantic_revision'] = 'f' * 64
        else:
            snapshot['snapshot_id'] = 'crm_w_' + '0' * 32
        install(state, snapshot)
    denied = read(client, target(saved), data_ref=first.json()['data_ref'], mode='facts')
    assert denied.status_code in (403, 404, 409), denied.text
    assert 'facts' not in denied.json()


def test_fact_view_revalidates_before_response(native, snapshot_case):
    client, _, state = native
    install(state, capture(snapshot_case))
    saved = editable_page(client)
    reads = 0
    def revoke():
        nonlocal reads
        reads += 1
        if reads == 3:
            state['error'] = (403, 'RESULT_REVOKED')
    state['probe'] = revoke
    denied = facts(client, saved)
    assert denied.status_code == 403, denied.text
    assert 'facts' not in denied.json()


def test_fact_response_preserves_large_integer(native, snapshot_case):
    client, _, state = native
    snapshot = capture(snapshot_case)
    snapshot['payload']['result']['gsv_amount_fen'] = 9007199254747995
    snapshot['result_sha256'] = digest(snapshot['payload'])
    install(state, snapshot)
    response = facts(client, editable_page(client))
    assert response.status_code == 200, response.text
    assert response.json()['facts'][0]['value'] == '9007199254747995'


def test_fact_view_rejects_incomplete_product_coverage(native, snapshot_case):
    client, _, state = native
    snapshot = capture(snapshot_case, 'product')
    snapshot['payload']['result']['status'] = 'INSUFFICIENT_COVERAGE'
    snapshot['payload']['result']['coverage']['current_status'] = 'INSUFFICIENT'
    snapshot['result_sha256'] = digest(snapshot['payload'])
    install(state, snapshot)
    response = facts(client, editable_page(client))
    assert response.status_code == 422, response.text
    assert 'facts' not in response.json()


def test_fact_budget_fails_whole_view_and_keeps_legacy_limit(native, snapshot_case, monkeypatch):
    client, app, state = native
    install(state, capture(snapshot_case, 'product'))
    saved = editable_page(client)
    original = app.state.result_access.source.read
    def oversized(*args, **kwargs):
        result = original(*args, **kwargs)
        rows = tuple({**deepcopy(result.rows[0]), 'product': f'P{i}'} for i in range(43))
        return replace(result, rows=rows, authorization_key=(*result.authorization_key, 'oversized'))
    monkeypatch.setattr(app.state.result_access.source, 'read', oversized)
    response = facts(client, saved)
    assert response.status_code == 413, response.text
    assert 'facts' not in response.json()


def test_fifteen_product_view_exceeds_old_byte_limit_without_losing_tail(native, snapshot_case):
    client, _, state = native
    snapshot = capture(snapshot_case, 'product')
    template = snapshot['payload']['result']['products'][0]
    snapshot['payload']['result']['products'] = [dict(deepcopy(template), display_name=f'映射商品{i}') for i in range(15)]
    snapshot['result_sha256'] = digest(snapshot['payload'])
    install(state, snapshot)
    response = facts(client, editable_page(client))
    assert response.status_code == 200, response.text
    assert len(response.content) > 65536
    items = response.json()['facts']
    assert len(items) == 705
    assert items[-1]['selector'] == {'kind': 'product', 'display_name': '映射商品14',
                                    'period': 'yoy', 'field': 'new_users_ratio_ppt'}
    assert items[-1]['value'] == template['yoy']['new_users_ratio_ppt']


def test_same_segment_in_four_groups_remains_distinct(native, snapshot_case):
    client, _, state = native
    snapshot = capture(snapshot_case, 'r')
    result = snapshot['payload']['result']
    row = result['rows'][0]
    for index, group in enumerate(['rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows']):
        result[group] = [dict(row, r_segment='近4-6月已购客', hist_users_current=index + 101)]
    snapshot['result_sha256'] = digest(snapshot['payload'])
    install(state, snapshot)
    response = facts(client, editable_page(client))
    assert response.status_code == 200, response.text
    chosen = [item for item in response.json()['facts'] if item['selector']['field'] == 'hist_users_current']
    assert [item['value'] for item in chosen] == [101, 102, 103, 104]
    assert all(item['selector']['segment'] == '近4-6月已购客' for item in chosen)


def test_duplicate_product_identity_fails_whole_fact_view(native, snapshot_case):
    client, _, state = native
    snapshot = capture(snapshot_case, 'product')
    snapshot['payload']['result']['products'].append(deepcopy(snapshot['payload']['result']['products'][0]))
    snapshot['result_sha256'] = digest(snapshot['payload'])
    install(state, snapshot)
    response = facts(client, editable_page(client))
    assert response.status_code == 422, response.text
    assert 'facts' not in response.json()
