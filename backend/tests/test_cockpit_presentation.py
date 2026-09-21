"""The actual candidate/SQLite path for declarative block edits; no model or live DB."""
import copy
import hashlib
import json
import uuid
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.contracts.page_documents import PageDraft, PagePackage, PageRollbackPreview, page_source_hash
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.cockpit_ai import CockpitAIStore
from backend.services.analytics.cockpit_html_selection import protect_selection, validate_selection
from backend.services.analytics.page_documents import PageDocumentStore
from backend.tests.test_cockpit_ai import setup as _base_setup, output

setup = _base_setup


def create(setup, instruction='改成新的文案'):
    actor, _, pages, ai = setup
    package = {'html': '<h1>Report</h1><section id="cards"></section>', 'css': '.card{color:black}',
               'js': 'window.originalLogic = true;', 'node_map': [], 'resources': []}
    preview = pages.generate(actor, PageDraft(title='Cards', session_id='rendered-test', package=package))
    spec = pages.confirm(actor, preview['preview_id'], 'create-cards')['spec']
    package = spec['package']
    scope = {'start': package['html'].index('<section'), 'end': len(package['html']),
             'html_hash': hashlib.sha256(package['html'].encode()).hexdigest(),
             'rendered': {'anchor': {'attribute': 'id', 'value': 'cards'},
                          'path': [{'tag': 'article', 'key': {'attribute': 'data-node', 'value': 'a'}}],
                          'html': '<article data-node="a"><span class="label">Before</span></article>',
                          'package_hash': hashlib.sha256(json.dumps([package['html'], package['css'], package['js'], package.get('presentation')], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()}}
    job = ai.begin(actor, 'page', spec['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope, instruction)
    return spec, package, scope, job


def candidate(package, scope):
    result = copy.deepcopy(package)
    result['presentation'] = {'version': 1, 'source_hash': page_source_hash(package['html'], package['css'], package['js']),
                              'edits': [{'target': {'anchor': scope['rendered']['anchor'], 'path': scope['rendered']['path'] + [{'tag': 'span'}]},
                                         'text': 'After', 'style': {}}]}
    return result


def write(job, package):
    output(job, json.dumps(package, ensure_ascii=False).encode())


def test_block_candidate_persists_and_retry_rollback_reopen_keep_source_exact(setup):
    actor, files, pages, ai = setup
    spec, package, scope, job = create(setup)
    changed = candidate(package, scope)
    write(job, changed)
    ready = ai.collect(actor, job['id'])
    # The candidate returned for rendering is the exact frozen candidate saved by confirm.
    assert json.loads(ai.content(actor, job['id'], 'candidate')[1]) == changed
    write(job, {**changed, 'js': 'late file mutation'})
    saved = ai.confirm(actor, job['id'], ready['candidate_hash'])
    reopened_pages = PageDocumentStore(pages.path.parent)
    reopened = CockpitAIStore(files, reopened_pages)
    assert reopened.confirm(actor, job['id'], ready['candidate_hash']) == saved
    actual = reopened_pages.get(actor, spec['page_id'])['spec']['package']
    for key in ('html', 'css', 'js', 'resources', 'node_map'):
        assert actual[key] == package[key]
    assert actual['presentation']['edits'][0]['text'] == 'After'
    rollback = reopened_pages.rollback(actor, spec['page_id'], PageRollbackPreview(base_version=2, to_version=1))
    restored = reopened_pages.confirm(actor, rollback['preview_id'], 'rollback-cards')['spec']
    assert restored['version'] == 3 and restored['package']['presentation'] is None
    assert reopened_pages.get(actor, spec['page_id'], 2)['spec']['package']['presentation']['edits'][0]['text'] == 'After'


@pytest.mark.parametrize('key', ['html', 'css', 'js'])
def test_shared_source_changes_rejected_even_when_model_updates_source_hash(setup, key):
    actor, _, pages, ai = setup
    spec, package, scope, job = create(setup)
    changed = candidate(package, scope)
    changed[key] += ' '
    changed['presentation']['source_hash'] = page_source_hash(changed['html'], changed['css'], changed['js'])
    write(job, changed)
    with pytest.raises(AnalyticsError) as error:
        ai.collect(actor, job['id'])
    assert error.value.code == 'AI_OUTSIDE_SELECTION'
    assert pages.get(actor, spec['page_id'])['spec']['version'] == 1
    assert ai.get(actor, job['id'])['status'] == 'WAITING'


def test_other_card_edits_and_positional_targets_are_rejected(setup):
    actor, _, _, ai = setup
    _, package, scope, job = create(setup)
    changed = candidate(package, scope)
    changed['presentation']['edits'][0]['target']['path'][0]['key']['value'] = 'b'
    write(job, changed)
    with pytest.raises(AnalyticsError) as error:
        ai.collect(actor, job['id'])
    assert error.value.code == 'AI_OUTSIDE_SELECTION'
    changed['presentation']['edits'][0]['target']['path'][0] = {'tag': 'article', 'index': 0}
    with pytest.raises(ValidationError):
        PagePackage.model_validate(changed)


@pytest.mark.parametrize('style', [{'color': 'url(https://bad)'}, {'position': 'fixed'}, {'padding': '0; color:red'}, {'color': 'var(--other)'}])
def test_style_values_cannot_introduce_code_resources_or_global_position(setup, style):
    _, package, scope, _ = create(setup)
    changed = candidate(package, scope)
    changed['presentation']['edits'][0]['style'] = style
    with pytest.raises(ValidationError):
        PagePackage.model_validate(changed)


def test_stale_selection_and_cross_job_conflict_preserve_current_version(setup):
    actor, _, pages, ai = setup
    spec, package, scope, first = create(setup)
    second = ai.begin(actor, 'page', spec['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope, '另一任务')
    changed = candidate(package, scope)
    for job in (first, second):
        write(job, changed)
    ready1 = ai.collect(actor, first['id'])
    ready2 = ai.collect(actor, second['id'])
    ai.confirm(actor, first['id'], ready1['candidate_hash'])
    with pytest.raises(AnalyticsError):
        ai.confirm(actor, second['id'], ready2['candidate_hash'])
    assert len(pages.history(actor, spec['page_id'])) == 2
    with pytest.raises(AnalyticsError):
        ai.begin(actor, 'page', spec['page_id'], 2, 'ai_' + str(uuid.uuid4()), scope)


def test_bound_page_cannot_attach_display_overrides_through_direct_draft(setup):
    _, package, scope, _ = create(setup)
    with pytest.raises(ValidationError, match='业务绑定页面'):
        PageDraft(title='Bound', session_id='bound-session', package=candidate(package, scope),
                  binding_manifest={'result_refs': ['verified'], 'bindings': []})


def test_frozen_candidate_preserves_optional_defaults_until_version_save(setup):
    actor, _, pages, ai = setup
    spec, package, scope, job = create(setup)
    changed = candidate(package, scope)
    changed['presentation'].pop('version')
    changed['presentation']['edits'][0].pop('style')
    write(job, changed)
    ready = ai.collect(actor, job['id'])
    assert json.loads(ai.content(actor, job['id'], 'candidate')[1]) == changed
    ai.confirm(actor, job['id'], ready['candidate_hash'])
    saved = pages.get(actor, spec['page_id'])['spec']['package']['presentation']
    assert saved['version'] == 1 and saved['edits'][0]['style'] == {}


def test_block_workspace_persists_selected_task_and_instruction(setup):
    actor, _, _, ai = setup
    spec, _, scope, job = create(setup, '把卡片改成季度收入')
    workspace = Path(job['workspace'])
    assert json.loads((workspace / 'SELECTED.json').read_text()) == scope['rendered']
    guide = (workspace / 'TASK.md').read_text()
    assert '把卡片改成季度收入' in guide and '结构化块编辑' in guide and 'candidate.json' in guide
    assert job['instruction'] == '把卡片改成季度收入'
    with pytest.raises(AnalyticsError) as error:
        ai.begin(actor, 'page', spec['page_id'], 1, job['id'], scope, '另一要求')
    assert error.value.code == 'AI_REQUEST_CONFLICT'
    assert ai.begin(actor, 'page', spec['page_id'], 1, job['id'], scope, '把卡片改成季度收入')['id'] == job['id']
    with pytest.raises(AnalyticsError) as error:
        ai.begin(actor, 'page', 'page_x', 1, 'ai_' + str(uuid.uuid4()), None, 'x' * 4001)
    assert error.value.code == 'INVALID_AI_REQUEST'


def test_rendered_selection_rejects_stale_or_mismatched_locator(setup):
    _, package, scope, _ = create(setup)
    assert validate_selection(package, scope, {}) == scope
    with pytest.raises(AnalyticsError) as error:
        validate_selection(package, {**scope, 'rendered': {**scope['rendered'], 'extra': 1}}, {})
    assert error.value.code == 'AI_SELECTION_INVALID'
    with pytest.raises(AnalyticsError) as error:
        validate_selection(package, {**scope, 'start': 0}, {})
    assert error.value.code == 'AI_SELECTION_INVALID'
    with pytest.raises(AnalyticsError) as error:
        validate_selection(package, {**scope, 'rendered': {**scope['rendered'], 'package_hash': '0' * 64}}, {})
    assert error.value.code == 'AI_SELECTION_STALE'
    with pytest.raises(AnalyticsError) as error:
        validate_selection(package, {**scope, 'rendered': {**scope['rendered'], 'path': [{'tag': 'article', 'index': 0}]}}, {})
    assert error.value.code == 'AI_SELECTION_INVALID'


def test_static_html_selection_cannot_change_presentation_records(setup):
    actor, _, pages, ai = setup
    html, css, js = '<h1>Report</h1><section id="cards"></section>', '.card{color:black}', 'window.originalLogic = true;'
    package = {'html': html, 'css': css, 'js': js, 'node_map': [], 'resources': [],
               'presentation': {'version': 1, 'source_hash': page_source_hash(html, css, js),
                                'edits': [{'target': {'anchor': {'attribute': 'id', 'value': 'cards'}, 'path': []},
                                           'style': {'padding': '8px'}}]}}
    spec = pages.confirm(actor, pages.generate(actor, PageDraft(title='Static', session_id='static-pres', package=package))['preview_id'], 'static-pres')['spec']
    scope = {'start': 0, 'end': html.index('</h1>') + 5, 'html_hash': hashlib.sha256(html.encode()).hexdigest()}
    job = ai.begin(actor, 'page', spec['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope)
    before = json.loads(ai.content(actor, job['id'], 'source')[1])
    mutated = copy.deepcopy(before)
    mutated['html'] = html.replace('Report', 'Edited')
    mutated['presentation']['edits'][0]['style'] = {'padding': '24px'}
    mutated['presentation']['source_hash'] = page_source_hash(mutated['html'], css, js)
    with pytest.raises(AnalyticsError) as error:
        protect_selection(before, mutated, scope)
    assert error.value.code == 'AI_OUTSIDE_SELECTION'
    write(job, mutated)
    with pytest.raises(AnalyticsError) as error:
        ai.collect(actor, job['id'])
    assert error.value.code == 'AI_OUTSIDE_SELECTION'
    allowed = copy.deepcopy(before)
    allowed['html'] = html.replace('Report', 'Edited')
    allowed['presentation']['source_hash'] = page_source_hash(allowed['html'], css, js)
    write(job, allowed)
    ready = ai.collect(actor, job['id'])
    assert ai.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    saved = pages.get(actor, spec['page_id'])['spec']['package']
    assert saved['html'] == allowed['html'] and saved['presentation']['edits'][0]['style'] == {'padding': '8px'}


def test_bound_pages_reject_presentation_payload(setup):
    package = {'html': '<h1>Report</h1><section id="cards"></section>', 'css': '', 'js': '', 'node_map': [], 'resources': []}
    presentation = {'version': 1, 'source_hash': page_source_hash(package['html']), 'edits': [
        {'target': {'anchor': {'attribute': 'id', 'value': 'cards'}, 'path': []}, 'text': 'x'}]}
    with pytest.raises(AnalyticsError) as error:
        CockpitAIStore.protect_bindings(package, {**package, 'presentation': presentation}, {'result_refs': ['verified']})
    assert error.value.code == 'AI_BOUND_CONTENT'
