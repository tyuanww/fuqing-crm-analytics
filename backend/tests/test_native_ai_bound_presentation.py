"""Controlled AI text edits through the actual native page HTTP/save path."""
from copy import deepcopy
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Barrier
import sqlite3
import uuid

import pytest

from backend.contracts.page_documents import page_source_hash
from backend.tests.test_native_page_source import REF, draft, edit_preview, native, post
from backend.tests.test_page_edit_context import operation as manual_operation


def saved_page(client, prefix='', title_attributes='id="heading"', dynamic_title=False):
    body = draft()
    body['package']['html'] = prefix + (
        '<section id="report" data-shine-node="report">'
        f'<h1 {title_attributes} data-shine-node="title">原标题</h1>'
        '<p id="advice" data-shine-node="advice">原建议</p>'
        '<div id="metric" data-shine-node="metric"><span id="child" data-shine-node="child">8001</span></div>'
        '<p id="readonly" data-shine-node="readonly" data-page-readonly>不能改</p></section>'
    )
    body['binding_manifest']['bindings'] = [{'binding_id': 'b_metric', 'node_id': 'metric', 'result_ref': REF}]
    body['package']['node_map'] = [{'node_id': node, 'kind': 'static_element',
                                  'selector': f'[data-shine-node="{node}"]'}
                                 for node in ['report', 'title', 'advice', 'metric', 'child', 'readonly']]
    if dynamic_title:
        body['package']['html'] = body['package']['html'].replace('<h1 ', '<section data-shine-region="chart"><h1 ', 1).replace('</h1>', '</h1></section>', 1)
        body['package']['node_map'].append({'node_id': 'chart', 'kind': 'dynamic_region', 'selector': '[data-shine-region="chart"]'})
    made = post(client, 'page-documents/previews', json=body)
    assert made.status_code == 201, made.text
    saved = post(client, f"page-documents/previews/{made.json()['preview_id']}/confirm", json={},
                 headers={'idempotency-key': 'create-bound-page'})
    assert saved.status_code == 200, saved.text
    return saved.json()['spec']


def begin(client, app, spec, node='title', selection=None, **extra):
    package = spec['package']
    context = None
    if node:
        start, end = app.state.page_store._mapped_node_range(package, node, 'static_element')
        source_hash = app.state.page_store._source_hash(package)
        context = {'context_id': 'client-selection', 'page_id': spec['page_id'], 'version': spec['version'],
                   'node_id': node, 'kind': 'static_element', 'allowed_scope': 'exact_source_range',
                   'allowed_ranges': [{'file': 'html', 'start': start, 'end': end}],
                   'mapping_token': hashlib.sha256(f'{source_hash}:{node}:{start}:{end}'.encode()).hexdigest()[:32],
                   'version_hash': source_hash, **extra}
    return post(client, 'cockpit-ai', json={'id': 'ai_' + str(uuid.uuid4()), 'target_kind': 'page',
                'target_id': spec['page_id'], 'base_version': spec['version'], 'edit_context': context,
                'selection': selection})


def propose(client, job, package, field='presentation'):
    receipt = post(client, f"cockpit-ai/{job['id']}/read-part", json={'field': field}).json()
    value = package.get(field)
    return post(client, f"cockpit-ai/{job['id']}/candidate", json={
        'source_sha256': receipt['source_sha256'], 'candidate_sha256': receipt['candidate_sha256'],
        'edits': [{'field': field, 'old_text': receipt['text'],
                   'new_text': value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)}]})


def candidate(spec, job):
    package = deepcopy(spec['package'])
    package['presentation'] = {'version': 1, 'source_hash': page_source_hash(package['html'], package['css'], package['js']),
                               'edits': [{'target': job['edit_context']['presentation_target'], 'text': '新的经营建议', 'style': {}}]}
    return package


def collect(client, job):
    return post(client, f"cockpit-ai/{job['id']}/collect")


def confirm(client, job, ready):
    return post(client, f"cockpit-ai/{job['id']}/confirm", json={'candidate_hash': ready['candidate_hash']})


def manual(client, spec, node, payload, key):
    context = post(client, 'page-edit-contexts', json={'page_id': spec['page_id'], 'node_id': node,
                   'kind': 'static_element'}).json()
    patched = post(client, f"page-edit-contexts/{context['edit_context_id']}/patches",
                   json=manual_operation('presentation', payload, key, context=context),
                   headers={'idempotency-key': key})
    assert patched.status_code == 200, patched.text
    result = post(client, f"page-edit-contexts/{context['edit_context_id']}/patches/{patched.json()['preview_id']}/confirm",
                  json={}, headers={'idempotency-key': key + '-confirm'})
    assert result.status_code == 200, result.text
    return client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']


@pytest.mark.parametrize('node', ['title', 'advice'])
@pytest.mark.parametrize('selection_kind', ['none', 'source', 'rendered'])
def test_selected_text_saves_reopens_without_changing_facts_or_source(native, node, selection_kind):
    client, app, state = native
    spec = saved_page(client)
    selection = None
    if selection_kind != 'none':
        package = spec['package']
        start, end = app.state.page_store._mapped_node_range(package, node, 'static_element')
        selection = {'start': start, 'end': end, 'html_hash': hashlib.sha256(package['html'].encode()).hexdigest()}
        if selection_kind == 'rendered':
            package_hash = hashlib.sha256(json.dumps([package['html'], package['css'], package['js'], package['presentation']],
                                                       ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
            selection['rendered'] = {'anchor': {'attribute': 'id', 'value': 'heading' if node == 'title' else 'advice'},
                                     'path': [], 'html': package['html'][start:end], 'package_hash': package_hash}
    opened = begin(client, app, spec, node, selection=selection, controlled_context_id='forged-server-id')
    assert opened.status_code == 201, opened.text
    job = opened.json()
    assert job['edit_context']['controlled_context_id'] != 'forged-server-id'
    package = candidate(spec, job)
    proposed = propose(client, job, package)
    assert proposed.status_code == 200, proposed.text
    ready = collect(client, job)
    assert ready.status_code == 200, ready.text
    before = state['calls']
    saved = confirm(client, job, ready.json())
    assert saved.status_code == 200, saved.text
    assert state['calls'] > before
    assert confirm(client, job, ready.json()).json()['saved_version'] == 2
    reopened = client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
    assert reopened['version'] == 2 and reopened['binding_manifest'] == spec['binding_manifest']
    assert reopened['binding_state'] == 'BOUND_VERIFIED'
    for key in ['html', 'css', 'js', 'node_map', 'resources']:
        assert reopened['package'][key] == spec['package'][key]
    assert reopened['package'] == spec['package']
    overlay = client.get('/api/v1/analytics/page-edit-contexts/overlay',
                         params={'page_id': spec['page_id'], 'version': 2}).json()['overlays']
    assert overlay[node]['text'] == '新的经营建议'


@pytest.mark.parametrize('node', ['metric', 'child', 'report', 'readonly'])
def test_fact_ancestor_descendant_and_readonly_cannot_begin(native, node):
    client, app, _ = native
    spec = saved_page(client)
    result = begin(client, app, spec, node)
    assert result.status_code == 403, result.text
    assert result.json()['error']['code'] == 'BOUND_NODE'


@pytest.mark.parametrize('field', ['html', 'css', 'js', 'node_map', 'resources', 'other-node', 'ancestor-path'])
def test_candidate_cannot_escape_selected_presentation(native, field):
    client, app, _ = native
    spec = saved_page(client)
    job = begin(client, app, spec).json()
    package = candidate(spec, job)
    if field in {'other-node', 'ancestor-path'}:
        package['presentation']['edits'][0]['target'] = {'anchor': {'attribute': 'id', 'value': 'advice' if field == 'other-node' else 'report'}, 'path': []}
    elif field == 'node_map':
        package[field] = []
    elif field == 'resources':
        package[field] = [{'resource_id': 'x'}]
    else:
        package[field] += ' changed'
    if field in {'node_map', 'resources'}:
        receipt = post(client, f"cockpit-ai/{job['id']}/read-part", json={'field': 'html'}).json()
        result = post(client, f"cockpit-ai/{job['id']}/candidate", json={
            'source_sha256': receipt['source_sha256'], 'candidate_sha256': None,
            'edits': [{'field': field, 'old_text': '', 'new_text': json.dumps(package[field])}]})
    else:
        result = propose(client, job, package, field if field in {'html', 'css', 'js'} else 'presentation')
    assert result.status_code in {403, 422}, result.text
    assert collect(client, job).status_code == 409


@pytest.mark.parametrize('error', [(404, 'NOT_FOUND'), (403, 'RESULT_REVOKED'), (409, 'RESULT_STALE')])
@pytest.mark.parametrize('phase', ['collect', 'confirm'])
def test_source_loss_blocks_save(native, error, phase):
    client, app, state = native
    spec = saved_page(client)
    job = begin(client, app, spec).json()
    assert propose(client, job, candidate(spec, job)).status_code == 200
    ready = collect(client, job) if phase == 'confirm' else None
    state['error'] = error
    response = confirm(client, job, ready.json()) if ready else collect(client, job)
    assert response.status_code == error[0], response.text
    assert response.json()['error']['code'] == error[1]
    assert client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']['version'] == 1


def test_context_expiry_and_concurrent_save_block_confirmation(native):
    client, app, _ = native
    spec = saved_page(client)
    first, second, third = (begin(client, app, spec).json() for _ in range(3))
    for job in (first, second, third):
        assert propose(client, job, candidate(spec, job)).status_code == 200
    a, b, c = (collect(client, job).json() for job in (first, second, third))
    with closing(sqlite3.connect(app.state.page_store.path.parent / 'page_edit_context.sqlite3')) as con:
        con.execute('UPDATE edit_contexts SET expires_ms=0 WHERE context_id=?', (first['edit_context']['controlled_context_id'],))
        con.commit()
    assert confirm(client, first, a).json()['error']['code'] == 'EDIT_EXPIRED'
    assert confirm(client, second, b).status_code == 200
    assert confirm(client, third, c).json()['error']['code'] == 'VERSION_CONFLICT'
    assert collect(client, first).json()['status'] == 'READY'
    assert begin(client, app, spec).status_code == 409


def test_global_css_preserves_existing_text_and_rejects_new_text(native):
    client, app, _ = native
    spec = saved_page(client)
    job = begin(client, app, spec).json()
    assert propose(client, job, candidate(spec, job)).status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200
    spec = client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
    global_job = begin(client, app, spec, node=None).json()
    styled = deepcopy(spec['package'])
    styled['css'] = 'h1 { color: blue; }'
    assert propose(client, global_job, styled, 'css').status_code == 200
    assert confirm(client, global_job, collect(client, global_job).json()).status_code == 200
    spec = client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
    global_job = begin(client, app, spec, node=None).json()
    altered = deepcopy(spec['package'])
    altered['presentation'] = {'version': 1, 'source_hash': page_source_hash(altered['html'], altered['css'], altered['js']),
                               'edits': [{'target': job['edit_context']['presentation_target'], 'text': '越权改字'}]}
    result = propose(client, global_job, altered)
    assert result.json()['error']['code'] == 'AI_BOUND_CONTENT'


def test_manual_overlay_survives_ai_css_and_controlled_text(native):
    client, app, _ = native
    spec = saved_page(client)
    context, preview = edit_preview(client, spec, 'presentation')
    saved = post(client, f"page-edit-contexts/{context['edit_context_id']}/patches/{preview.json()['preview_id']}/confirm",
                 json={}, headers={'idempotency-key': 'manual-confirm'})
    assert saved.status_code == 200, saved.text
    spec = client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
    overlay_url = '/api/v1/analytics/page-edit-contexts/overlay'
    original = client.get(overlay_url, params={'page_id': spec['page_id'], 'version': 2}).json()
    job = begin(client, app, spec, node=None).json()
    package = deepcopy(spec['package'])
    package['css'] = 'h1 { color: blue; }'
    assert propose(client, job, package, 'css').status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200
    carried = client.get(overlay_url, params={'page_id': spec['page_id'], 'version': 3}).json()
    assert carried['overlays'] == original['overlays']
    spec = client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
    job = begin(client, app, spec).json()
    assert job['edit_context']['selected_overlay']['text'] == '已复核文案'
    assert propose(client, job, candidate(spec, job)).status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200
    changed = client.get(overlay_url, params={'page_id': spec['page_id'], 'version': 4}).json()
    assert changed['overlays']['title']['text'] == '新的经营建议'


def test_applied_page_confirmation_can_recover_before_ai_receipt(native, monkeypatch):
    client, app, _ = native
    spec = saved_page(client)
    job = begin(client, app, spec).json()
    assert propose(client, job, candidate(spec, job)).status_code == 200
    ready = collect(client, job).json()
    original = app.state.page_store.confirm
    def fail_once(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError('isolated receipt interruption')
    with monkeypatch.context() as patch:
        patch.setattr(app.state.page_store, 'confirm', fail_once)
        with pytest.raises(RuntimeError, match='isolated receipt interruption'):
            confirm(client, job, ready)
    overlay = client.get('/api/v1/analytics/page-edit-contexts/overlay',
                         params={'page_id': spec['page_id'], 'version': 2}).json()['overlays']
    assert overlay['title']['text'] == '新的经营建议'
    with closing(sqlite3.connect(app.state.page_store.path.parent / 'page_edit_context.sqlite3')) as con:
        con.execute('UPDATE edit_contexts SET expires_ms=0')
        con.commit()
    assert confirm(client, job, ready).json()['saved_version'] == 2


def test_selection_and_focus_must_name_the_same_node(native):
    client, app, _ = native
    spec = saved_page(client)
    start, end = app.state.page_store._mapped_node_range(spec['package'], 'advice', 'static_element')
    scope = {'start': start, 'end': end, 'html_hash': hashlib.sha256(spec['package']['html'].encode()).hexdigest()}
    opened = begin(client, app, spec, node='title', selection=scope)
    assert opened.status_code == 422, opened.text
    assert opened.json()['error']['code'] == 'AI_OUTSIDE_SELECTION'


def test_actual_workbench_client_selection_only_request_saves_via_manual_overlay(native):
    client, app, _ = native
    spec = saved_page(client, prefix='😀')
    root = Path(__file__).resolve().parents[2]
    author = os.environ.get('WORKBENCH_AUTHOR_ROOT')
    if not author:
        pytest.skip('WORKBENCH_AUTHOR_ROOT must identify the matching external author source')
    completed = subprocess.run([os.environ.get('NODE_BINARY', 'node'), str(Path(__file__).parent / 'fixtures/native-ai-client-request.mjs'), author],
                               input=json.dumps(spec, ensure_ascii=False), text=True, capture_output=True, check=True,
                               cwd=root)
    request = json.loads(completed.stdout)
    assert 'selection' in request and 'edit_context' not in request
    opened = post(client, 'cockpit-ai', json=request)
    assert opened.status_code == 201, opened.text
    job = opened.json()
    assert job['edit_context']['controlled_context_id'].startswith('editctx_')
    assert propose(client, job, candidate(spec, job)).status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200
    assert client.get('/api/v1/analytics/page-edit-contexts/overlay',
                      params={'page_id': spec['page_id'], 'version': 2}).json()['overlays']['title']['text'] == '新的经营建议'


def test_ai_text_preserves_manual_styles_and_manual_save_in_commit_window(native, monkeypatch):
    client, app, _ = native
    spec = manual(client, saved_page(client), 'title', {'text': '人工标题', 'style': {'color': 'red', 'font-size': '24px'}}, 'manual-title')
    job = begin(client, app, spec).json()
    assert propose(client, job, candidate(spec, job)).status_code == 200
    ready = collect(client, job).json()
    original = app.state.page_store.confirm
    def interleave(actor, preview_id, key, **kwargs):
        result = original(actor, preview_id, key, **kwargs)
        if key == job['id']:
            with closing(sqlite3.connect(app.state.page_store.path.parent / 'page_edit_context.sqlite3')) as con:
                assert con.execute('SELECT count(*) FROM presentation_overlays WHERE version=3').fetchone()[0] == 0
            def other_editor():
                current = client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
                return manual(client, current, 'advice', {'text': '并发人工建议'}, 'concurrent-advice')
            with ThreadPoolExecutor(max_workers=1) as pool:
                assert pool.submit(other_editor).result(timeout=10)['version'] == 4
        return result
    monkeypatch.setattr(app.state.page_store, 'confirm', interleave)
    result = confirm(client, job, ready)
    assert result.status_code == 200, result.text
    overlay = client.get('/api/v1/analytics/page-edit-contexts/overlay',
                         params={'page_id': spec['page_id'], 'version': 4}).json()['overlays']
    assert overlay['title'] == {'text': '新的经营建议', 'style': {'color': 'red', 'font-size': '24px'}}
    assert overlay['advice']['text'] == '并发人工建议'


def test_process_exit_after_page_commit_recovers_published_overlay_and_receipt(native):
    client, app, _ = native
    spec = manual(client, saved_page(client), 'title', {'text': '人工标题', 'style': {'color': 'red'}}, 'process-title')
    job = begin(client, app, spec).json()
    assert propose(client, job, candidate(spec, job)).status_code == 200
    ready = collect(client, job).json()
    root = Path(__file__).resolve().parents[2]
    worker = Path(__file__).parent / 'fixtures/native_ai_save_worker.py'
    arguments = [sys.executable, str(worker), str(app.state.page_store.path.parent), job['id'], ready['candidate_hash']]
    environment = {'PATH': os.environ.get('PATH', ''), 'PYTHONPATH': str(root), 'PYTHONDONTWRITEBYTECODE': '1'}
    interrupted = subprocess.run([*arguments, 'interrupt'], cwd=root, env=environment, capture_output=True, text=True)
    assert interrupted.returncode == 73, interrupted.stderr
    with closing(sqlite3.connect(app.state.page_store.path.parent / 'page_edit_context.sqlite3')) as con:
        assert con.execute('SELECT count(*) FROM presentation_overlays WHERE version=3').fetchone()[0] == 0
        con.execute('UPDATE edit_contexts SET expires_ms=0')
        con.commit()
    reconstructed = client.get('/api/v1/analytics/page-edit-contexts/overlay',
                               params={'page_id': spec['page_id'], 'version': 3}).json()['overlays']
    assert reconstructed['title'] == {'text': '新的经营建议', 'style': {'color': 'red'}}
    recovered = subprocess.run([*arguments, 'recover'], cwd=root, env=environment, capture_output=True, text=True, check=True)
    assert json.loads(recovered.stdout)['saved_version'] == 3
    assert confirm(client, job, ready).json()['saved_version'] == 3
    assert client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']['version'] == 3


def test_manual_confirm_race_pins_one_page_preview(native, monkeypatch):
    from backend.services.analytics.page_edit_context import PageEditContextStore
    client, app, _ = native
    spec = saved_page(client)
    context, preview = edit_preview(client, spec, 'presentation')
    original = PageEditContextStore._open_page_preview
    barrier = Barrier(2)
    def simultaneous(self, *args, **kwargs):
        result = original(self, *args, **kwargs)
        barrier.wait(timeout=10)
        return result
    monkeypatch.setattr(PageEditContextStore, '_open_page_preview', simultaneous)
    def save(key):
        return post(client, f"page-edit-contexts/{context['edit_context_id']}/patches/{preview.json()['preview_id']}/confirm",
                    json={}, headers={'idempotency-key': key})
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(save, 'race-a'), pool.submit(save, 'race-b')
        responses = [a.result(timeout=10), b.result(timeout=10)]
    assert [response.status_code for response in responses] == [200, 200], [response.text for response in responses]
    with closing(sqlite3.connect(app.state.page_store.path)) as con:
        assert con.execute("SELECT count(*) FROM previews WHERE operation='PATCH' AND status='APPLIED'").fetchone()[0] == 1
    assert client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']['version'] == 2


@pytest.mark.parametrize('phase', ['propose', 'collect', 'confirm'])
def test_controlled_context_expiry_blocks_every_pending_phase(native, phase):
    client, app, _ = native
    spec = saved_page(client)
    job = begin(client, app, spec).json()
    if phase != 'propose':
        assert propose(client, job, candidate(spec, job)).status_code == 200
    ready = collect(client, job).json() if phase == 'confirm' else None
    with closing(sqlite3.connect(app.state.page_store.path.parent / 'page_edit_context.sqlite3')) as con:
        con.execute('UPDATE edit_contexts SET expires_ms=0')
        con.commit()
    result = (propose(client, job, candidate(spec, job)) if phase == 'propose' else
              collect(client, job) if phase == 'collect' else confirm(client, job, ready))
    assert result.json()['error']['code'] == 'EDIT_EXPIRED'
    assert client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']['version'] == 1


def test_rollback_does_not_blindly_inherit_overlay(native):
    client, _, _ = native
    spec = manual(client, saved_page(client), 'title', {'text': '人工标题'}, 'before-rollback')
    preview = post(client, f"page-documents/pages/{spec['page_id']}/rollback-preview", json={'base_version': 2, 'to_version': 1})
    assert preview.status_code == 201, preview.text
    result = post(client, f"page-documents/previews/{preview.json()['preview_id']}/confirm", json={},
                  headers={'idempotency-key': 'rollback'})
    assert result.status_code == 200, result.text
    overlay = client.get('/api/v1/analytics/page-edit-contexts/overlay',
                         params={'page_id': spec['page_id'], 'version': 3}).json()['overlays']
    assert overlay == {}


def test_legacy_package_presentation_text_does_not_block_css(native):
    client, app, _ = native
    spec = saved_page(client)
    package = deepcopy(spec['package'])
    package['presentation'] = {'version': 1, 'source_hash': page_source_hash(package['html'], package['css'], package['js']),
                               'edits': [{'target': {'anchor': {'attribute': 'id', 'value': 'heading'}, 'path': []},
                                          'text': '旧展示标题', 'style': {}}]}
    preview = post(client, f"page-documents/pages/{spec['page_id']}/save-preview", json={
        'base_version': 1, 'title': spec['title'], 'package': package, 'binding_manifest': spec['binding_manifest']})
    assert preview.status_code == 201, preview.text
    saved = post(client, f"page-documents/previews/{preview.json()['preview_id']}/confirm", json={},
                 headers={'idempotency-key': 'legacy-title'})
    spec = saved.json()['spec']
    job = begin(client, app, spec, node=None).json()
    package = deepcopy(spec['package'])
    package['css'] = 'h1 { font-weight: 700; }'
    assert propose(client, job, package, 'css').status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200
    reopened = client.get('/api/v1/analytics/page-documents/pages/' + spec['page_id']).json()['spec']
    assert reopened['package']['presentation']['edits'][0]['text'] == '旧展示标题'


def test_selection_only_backend_creates_the_server_context(native):
    client, app, _ = native
    spec = saved_page(client)
    start, end = app.state.page_store._mapped_node_range(spec['package'], 'title', 'static_element')
    scope = {'start': start, 'end': end, 'html_hash': hashlib.sha256(spec['package']['html'].encode()).hexdigest()}
    opened = begin(client, app, spec, node=None, selection=scope)
    assert opened.status_code == 201, opened.text
    job = opened.json()
    assert job['selection'] == scope and job['edit_context']['node_id'] == 'title'
    assert propose(client, job, candidate(spec, job)).status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200


def test_invalid_id_does_not_hide_valid_field_anchor(native):
    client, app, _ = native
    spec = saved_page(client, title_attributes='id="9-invalid" data-page-field="valid_title"')
    opened = begin(client, app, spec)
    assert opened.status_code == 201, opened.text
    job = opened.json()
    assert job['edit_context']['presentation_target']['anchor'] == {'attribute': 'data-page-field', 'value': 'valid_title'}
    assert propose(client, job, candidate(spec, job)).status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200


def test_missing_stable_anchor_fails_closed(native):
    client, app, _ = native
    spec = saved_page(client, title_attributes='id="9-invalid"')
    opened = begin(client, app, spec)
    assert opened.json()['error']['code'] == 'MAPPING_STALE'


@pytest.mark.parametrize('scope', ['readonly_bound', 'shared_scope', 'dynamic_source_range'])
def test_bound_ai_rejects_other_edit_scopes(native, scope):
    client, app, _ = native
    spec = saved_page(client)
    opened = begin(client, app, spec, allowed_scope=scope)
    assert opened.status_code in {403, 422}, opened.text


def test_actual_workbench_client_retry_keeps_one_derived_context(native):
    client, app, _ = native
    author = os.environ.get('WORKBENCH_AUTHOR_ROOT')
    if not author:
        pytest.skip('matching external author input required')
    spec = saved_page(client)
    root = Path(__file__).resolve().parents[2]
    completed = subprocess.run([os.environ.get('NODE_BINARY', 'node'), str(Path(__file__).parent / 'fixtures/native-ai-client-request.mjs'), author, 'retry'],
                               input=json.dumps(spec, ensure_ascii=False), text=True, capture_output=True, check=True, cwd=root)
    requests = json.loads(completed.stdout)
    assert len(requests) == 2 and requests[0] == requests[1]
    first, replay = (post(client, 'cockpit-ai', json=request) for request in requests)
    assert first.status_code == replay.status_code == 201, replay.text
    assert first.json()['edit_context'] == replay.json()['edit_context']
    with closing(sqlite3.connect(app.state.page_store.path.parent / 'page_edit_context.sqlite3')) as con:
        assert con.execute('SELECT count(*) FROM edit_contexts').fetchone()[0] == 1


def test_global_presentation_style_keeps_manual_overlay(native):
    client, app, _ = native
    spec = manual(client, saved_page(client), 'title', {'text': '人工标题', 'style': {'font-size': '24px'}}, 'global-style-title')
    job = begin(client, app, spec, node=None).json()
    package = deepcopy(spec['package'])
    package['presentation'] = {'version': 1, 'source_hash': page_source_hash(package['html'], package['css'], package['js']),
                               'edits': [{'target': {'anchor': {'attribute': 'id', 'value': 'advice'}, 'path': []},
                                          'style': {'color': 'blue'}}]}
    assert propose(client, job, package).status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200
    overlays = client.get('/api/v1/analytics/page-edit-contexts/overlay',
                          params={'page_id': spec['page_id'], 'version': 3}).json()['overlays']
    assert overlays['title'] == {'text': '人工标题', 'style': {'font-size': '24px'}}


def test_dynamic_region_leaf_is_rejected_but_static_sibling_still_edits(native):
    client, app, _ = native
    spec = saved_page(client, dynamic_title=True)
    blocked = begin(client, app, spec, node='title')
    assert blocked.status_code == 403, blocked.text
    job = begin(client, app, spec, node='advice').json()
    assert propose(client, job, candidate(spec, job)).status_code == 200
    assert confirm(client, job, collect(client, job).json()).status_code == 200
