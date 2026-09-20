"""AI candidate lifecycle on small synthetic artifacts; never calls a model."""
import io
import json
import uuid
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.contracts.page_documents import PageDraft
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, B0IdentityRegistry
from backend.services.analytics.cockpit_ai import CockpitAIStore
from backend.services.analytics.cockpit_files import CockpitFileStore, OfficeSettings, verify_token
from backend.services.analytics.page_documents import PageDocumentStore
from backend.services.analytics.page_documents_routes import create_page_app


@pytest.fixture
def setup(tmp_path):
    actor = AnalyticsPrincipal('alice', frozenset({'dashboard:read', 'dashboard:update'}), frozenset({'competition-diagnosis-fixture'}))
    files = CockpitFileStore(tmp_path / 'files')
    (tmp_path / 'pages').mkdir(mode=0o700)
    pages = PageDocumentStore(tmp_path / 'pages')
    return actor, files, pages, CockpitAIStore(files, pages)


def start(setup, filename='report.csv', content=b'name,value\nx,1\n'):
    actor, files, _, ai = setup
    saved = files.upload(actor, filename, content, 'upload-' + str(uuid.uuid4()))
    job = ai.begin(actor, 'file', saved['file_id'], 1, 'ai_' + str(uuid.uuid4()))
    return saved, job


def output(job, data):
    (Path(job['workspace']) / job['output_name']).write_bytes(data)


def office(ext, text):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as z:
        z.writestr('word/document.xml' if ext == 'docx' else 'xl/workbook.xml', f'<doc><t>{text}</t></doc>')
    return buffer.getvalue()


@pytest.mark.parametrize('filename,before,after', [
    ('report.html', b'<h1>Old</h1>', b'<h1>New</h1>'),
    ('report.csv', b'a,1\n', b'a,2\n'),
    ('report.docx', office('docx', 'before'), office('docx', 'after')),
    ('report.xlsx', office('xlsx', 'before'), office('xlsx', 'after')),
    ('report.pdf', b'%PDF-1.7\nold', b'%PDF-1.7\nnew'),
])
def test_confirm_persists_immutable_version_and_retry(setup, filename, before, after):
    actor, files, pages, ai = setup
    saved, job = start(setup, filename, before)
    output(job, after)
    ready = ai.collect(actor, job['id'])
    assert files.content(actor, saved['file_id'])[1] == before
    # Further writes by the agent cannot change the collected snapshot.
    output(job, b'late write')
    assert ai.collect(actor, job['id'])['candidate_hash'] == ready['candidate_hash']
    assert ai.content(actor, job['id'], 'candidate')[1] == after
    result = ai.confirm(actor, job['id'], ready['candidate_hash'])
    reopened = CockpitAIStore(CockpitFileStore(files.path.parent), pages)
    assert result['saved_version'] == 2
    assert reopened.confirm(actor, job['id'], ready['candidate_hash']) == result
    assert reopened.files.content(actor, saved['file_id'])[1] == after
    assert reopened.files.content(actor, saved['file_id'], 1)[1] == before
    assert reopened.list(actor)['items'] == []


@pytest.mark.parametrize('ext', ['docx', 'xlsx'])
def test_corrupt_office_candidate_does_not_advance_task_or_saved_head(setup, ext):
    actor, files, pages, ai = setup
    before = office(ext, 'before')
    saved, job = start(setup, 'report.' + ext, before)
    output(job, office(ext, 'after').replace(b'after', b'broke'))

    with pytest.raises(AnalyticsError) as error:
        ai.collect(actor, job['id'])
    assert error.value.code == 'INVALID_OFFICE_FILE'

    reopened = CockpitAIStore(CockpitFileStore(files.path.parent), pages)
    pending = reopened.get(actor, job['id'])
    assert pending['status'] == 'WAITING'
    assert pending['candidate_hash'] is None
    assert pending['saved_version'] is None
    assert reopened.files.get(actor, saved['file_id'])['version'] == 1
    assert reopened.files.content(actor, saved['file_id'])[1] == before


def test_begin_idempotent_and_owner_boundary(setup):
    actor, files, _, ai = setup
    saved, job = start(setup)
    assert ai.begin(actor, 'file', saved['file_id'], 1, job['id']) == job
    assert len(ai.list(actor)['items']) == 1
    other = AnalyticsPrincipal('bob', actor.capabilities, actor.data_scopes)
    assert ai.list(other)['items'] == []
    for action in [lambda: ai.get(other, job['id']), lambda: ai.collect(other, job['id']), lambda: ai.content(other, job['id'], 'source')]:
        with pytest.raises(AnalyticsError) as e:
            action()
        assert e.value.status == 404
    with pytest.raises(AnalyticsError):
        ai.begin(actor, 'file', saved['file_id'], 2, job['id'])
    reader = AnalyticsPrincipal('alice', frozenset({'dashboard:read'}), frozenset())
    with pytest.raises(AnalyticsError) as e:
        ai.collect(reader, job['id'])
    assert e.value.status == 403


def test_missing_unchanged_cancel_and_bad_output(setup):
    actor, files, _, ai = setup
    saved, job = start(setup)
    with pytest.raises(AnalyticsError) as e:
        ai.collect(actor, job['id'])
    assert e.value.code == 'AI_OUTPUT_MISSING'
    source = files.content(actor, saved['file_id'])[1]
    output(job, source)
    with pytest.raises(AnalyticsError) as e:
        ai.collect(actor, job['id'])
    assert e.value.code == 'AI_NO_CHANGE'
    output(job, b'\xff')
    with pytest.raises(AnalyticsError):
        ai.collect(actor, job['id'])
    output(job, b'a,2')
    ready = ai.collect(actor, job['id'])
    ai.cancel(actor, job['id'])
    with pytest.raises(AnalyticsError):
        ai.confirm(actor, job['id'], ready['candidate_hash'])
    assert files.content(actor, saved['file_id'])[1] == source


def test_rejects_symlink_and_hardlink(setup, tmp_path):
    actor, _, _, ai = setup
    _, job = start(setup)
    outside = tmp_path / 'outside.csv'
    outside.write_bytes(b'private,1')
    candidate = Path(job['workspace']) / job['output_name']
    candidate.symlink_to(outside)
    with pytest.raises(AnalyticsError):
        ai.collect(actor, job['id'])
    candidate.unlink()
    candidate.hardlink_to(outside)
    with pytest.raises(AnalyticsError):
        ai.collect(actor, job['id'])


def test_concurrent_office_change_rejects_stale_candidate(setup):
    actor, files, _, ai = setup
    saved, job = start(setup)
    output(job, b'AI,2')
    ready = ai.collect(actor, job['id'])
    edit = files.begin_edit(actor, saved['file_id'])
    files.commit_office(actor, edit['key'], saved['filename'], b'Office,3')
    with pytest.raises(AnalyticsError) as e:
        ai.confirm(actor, job['id'], ready['candidate_hash'])
    assert e.value.code == 'AI_BASE_CHANGED'
    assert files.content(actor, saved['file_id'])[1] == b'Office,3'


def test_saved_html_uses_existing_page_contract_and_confirm(setup):
    actor, _, pages, ai = setup
    draft = PageDraft(title='HTML', session_id=None, origin_file_id='file_manual', package={'html': '<h1>Before</h1>'})
    preview = pages.generate(actor, draft)
    saved = pages.confirm(actor, preview['preview_id'], 'html-original-request')['spec']
    job = ai.begin(actor, 'page', saved['page_id'], 1, 'ai_' + str(uuid.uuid4()))
    output(job, json.dumps({'html': '<h1>After</h1>'}).encode())
    ready = ai.collect(actor, job['id'])
    assert pages.get(actor, saved['page_id'])['spec']['version'] == 1
    assert ai.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    assert ai.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    assert pages.get(actor, saved['page_id'])['spec']['package']['html'] == '<h1>After</h1>'


def test_bound_html_rejects_data_changes():
    before = {'html': '<div>10</div>', 'css': '', 'js': '', 'resources': [], 'node_map': []}
    manifest = {'result_refs': ['verified_result']}
    CockpitAIStore.protect_bindings(before, before | {'css': 'div {color:red}'}, manifest)
    with pytest.raises(AnalyticsError):
        CockpitAIStore.protect_bindings(before, before | {'html': '<div>100</div>'}, manifest)


def ready_page(setup):
    actor, _, pages, ai = setup
    preview = pages.generate(actor, PageDraft(title='Private page', session_id=None,
        origin_file_id='file_manual', package={'html': '<h1>Before</h1>'}))
    saved = pages.confirm(actor, preview['preview_id'], 'page-original-request')['spec']
    job = ai.begin(actor, 'page', saved['page_id'], 1, 'ai_' + str(uuid.uuid4()))
    output(job, json.dumps({'html': '<h1>After</h1>'}).encode())
    return saved, ai.collect(actor, job['id'])


def test_page_candidate_outlives_preview_and_recovers_cross_database_failure(setup, monkeypatch):
    actor, files, pages, ai = setup
    clock = [1000]
    pages.clock = lambda: clock[0]
    saved, job = ready_page(setup)
    clock[0] += 31 * 60 * 1000
    original_confirm = pages.confirm

    def lose_receipt(*args):
        original_confirm(*args)
        raise RuntimeError('process stopped after page commit')

    monkeypatch.setattr(pages, 'confirm', lose_receipt)
    with pytest.raises(RuntimeError):
        ai.confirm(actor, job['id'], job['candidate_hash'])
    assert pages.get(actor, saved['page_id'])['spec']['version'] == 2
    monkeypatch.setattr(pages, 'confirm', original_confirm)
    reopened = CockpitAIStore(CockpitFileStore(files.path.parent), pages)
    assert reopened.confirm(actor, job['id'], job['candidate_hash'])['saved_version'] == 2
    assert reopened.confirm(actor, job['id'], job['candidate_hash'])['saved_version'] == 2
    assert pages.get(actor, saved['page_id'])['spec']['version'] == 2


def test_expired_candidate_cannot_replace_a_newer_page(setup):
    from backend.contracts.page_documents import PagePatchPreview
    actor, _, pages, ai = setup
    clock = [1000]
    pages.clock = lambda: clock[0]
    saved, job = ready_page(setup)
    manual = pages.patch(actor, saved['page_id'], PagePatchPreview(base_version=1, title='Manual'))
    pages.confirm(actor, manual['preview_id'], 'manual-save-request')
    clock[0] += 31 * 60 * 1000
    with pytest.raises(AnalyticsError) as error:
        ai.confirm(actor, job['id'], job['candidate_hash'])
    assert error.value.code == 'VERSION_CONFLICT'
    assert pages.get(actor, saved['page_id'])['spec']['title'] == 'Manual'


def test_revoked_page_grants_hide_jobs_and_reject_begin_replay(setup):
    actor, _, _, ai = setup
    saved, job = ready_page(setup)
    revoked = AnalyticsPrincipal(actor.actor_id, actor.capabilities, frozenset())
    assert ai.list(revoked)['items'] == []
    with pytest.raises(AnalyticsError) as error:
        ai.begin(revoked, 'page', saved['page_id'], 1, job['id'])
    assert error.value.status == 403


def test_ai_job_pagination_includes_older_pending_work(setup):
    actor, _, _, ai = setup
    saved, first = start(setup)
    for _ in range(100):
        ai.begin(actor, 'file', saved['file_id'], 1, 'ai_' + str(uuid.uuid4()))
    page = ai.list(actor)
    assert len(page['items']) == 100 and page['next_offset'] == 100
    last = ai.list(actor, page['next_offset'])
    assert len(last['items']) == 1 and last['next_offset'] is None
    assert first['id'] in {item['id'] for item in page['items'] + last['items']}


def test_concurrent_begin_replays_the_same_task(setup):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    actor, files, _, ai = setup
    saved = files.upload(actor, 'report.csv', b'a,1', 'same-begin-test')
    job_id = 'ai_' + str(uuid.uuid4())
    barrier = Barrier(2)
    def begin():
        barrier.wait()
        return ai.begin(actor, 'file', saved['file_id'], 1, job_id)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: begin(), range(2)))
    assert results[0] == results[1]
    assert len(ai.list(actor)['items']) == 1


def test_http_preview_is_readonly_signed_and_cannot_confirm_other_hash(tmp_path):
    actor = AnalyticsPrincipal('alice', frozenset({'dashboard:read', 'dashboard:update'}), frozenset({'competition-diagnosis-fixture'}))
    registry = B0IdentityRegistry()
    token = 'synthetic-token-' * 3
    registry.grant(token, actor)
    settings = OfficeSettings('http://127.0.0.1:18110', 'http://host.docker.internal:19091', 'synthetic-secret-' * 3)
    app = create_page_app(registry, page_state_dir=tmp_path, office=settings, office_principal=lambda: actor)
    client = TestClient(app)
    assert client.get('/api/v1/analytics/cockpit-ai').status_code == 401
    client.headers['Authorization'] = 'Bearer ' + token
    saved = client.post('/api/v1/analytics/cockpit-files?filename=report.csv', content=b'a,1', headers={'idempotency-key': 'upload-test'}).json()
    prefix = '/api/v1/analytics/cockpit-ai'
    job = client.post(prefix, json={'target_kind': 'file', 'target_id': saved['file_id'], 'base_version': 1, 'id': 'ai_' + str(uuid.uuid4())}).json()
    output(job, b'a,2')
    ready = client.post(prefix + '/' + job['id'] + '/collect').json()
    config = client.get(prefix + '/' + job['id'] + '/viewer').json()['config']
    assert config['editorConfig']['mode'] == 'view'
    assert config['document']['permissions']['edit'] is False
    assert 'callbackUrl' not in config['editorConfig']
    assert verify_token(config['token'], settings.secret)['document'] == config['document']
    assert client.post(prefix + '/' + job['id'] + '/confirm', json={'candidate_hash': '0' * 64}).status_code == 409
    assert client.post(prefix + '/' + job['id'] + '/confirm', json={'candidate_hash': ready['candidate_hash']}).json()['status'] == 'SAVED'


def test_static_selection_rejects_outside_edits_and_persists_only_selected_region(setup):
    import hashlib
    actor, files, pages, ai = setup
    html = '<header><h1>你好 🌟</h1></header><section><p>Keep</p></section>'
    draft = PageDraft(title='Plain HTML', session_id='selection-session', package={'html': html, 'css': '', 'js': '', 'resources': [], 'node_map': []}, binding_manifest={'bindings': [], 'result_refs': []})
    candidate = pages.generate(actor, draft)
    page = pages.confirm(actor, candidate['preview_id'], 'selection-seed')['spec']
    scope = {'start': 0, 'end': html.index('</header>') + len('</header>'), 'html_hash': hashlib.sha256(html.encode()).hexdigest()}
    job = ai.begin(actor, 'page', page['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope)
    assert job['selection'] == scope
    assert 'Unicode' in (Path(job['workspace']) / 'TASK.md').read_text()
    before = json.loads(ai.content(actor, job['id'], 'source')[1])
    for changed in [{**before, 'html': html.replace('Keep', 'Wrong')}, {**before, 'css': 'body{color:red}'},
                    {**before, 'html': html.replace('<h1>', '<h1 onclick="run()">')}]:
        output(job, json.dumps(changed).encode())
        with pytest.raises(AnalyticsError) as error:
            ai.collect(actor, job['id'])
        assert error.value.code == 'AI_OUTSIDE_SELECTION'
        assert pages.get(actor, page['page_id'])['spec']['version'] == 1
    after = {**before, 'html': html.replace('<h1>你好 🌟</h1>', '<h1 style="color:orange">新标题</h1>')}
    output(job, json.dumps(after).encode())
    ready = ai.collect(actor, job['id'])
    assert ai.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    reopened = PageDocumentStore(pages.path.parent)
    assert reopened.get(actor, page['page_id'])['spec']['package']['html'] == after['html']
    with pytest.raises(AnalyticsError):
        ai.begin(actor, 'page', page['page_id'], 1, job['id'], {**scope, 'end': 1})


def test_source_scope_checks_unicode_version_and_static_boundaries():
    import hashlib
    from backend.services.analytics.cockpit_html_selection import validate_selection
    html = '<p>🌟 前言</p><section><h1>标题</h1></section>'
    package = {'html': html}
    scope = {'start': html.index('<section>'), 'end': len(html), 'html_hash': hashlib.sha256(html.encode()).hexdigest()}
    assert validate_selection(package, scope, {}) == scope
    for invalid in [{**scope, 'html_hash': '0' * 64}, {**scope, 'start': scope['start'] + 1}, {**scope, 'start': True}]:
        with pytest.raises(AnalyticsError):
            validate_selection(package, invalid, {})
    with pytest.raises(AnalyticsError):
        validate_selection(package, scope, {'bindings': [{'node_id': 'protected'}]})


@pytest.mark.parametrize('graphic', ['<svg><path d="M0 0"/><use href="#icon" /></svg>', '<svg/>', '<math><mi>x</mi><mspace width="1em" /></math>'])
def test_static_scope_survives_readonly_foreign_content(graphic):
    import hashlib
    from backend.services.analytics.cockpit_html_selection import protect_selection, validate_selection
    html = '<section><h1>Before</h1>' + graphic + '<p>After</p></section>'
    scope = {'start': len('<section>'), 'end': len('<section><h1>Before</h1>'), 'html_hash': hashlib.sha256(html.encode()).hexdigest()}
    assert validate_selection({'html': html}, scope, {}) == scope
    protect_selection({'html': html}, {'html': html.replace('Before', 'Edited')}, scope)
    foreign_scope = {**scope, 'start': scope['end'], 'end': scope['end'] + len(graphic)}
    with pytest.raises(AnalyticsError):
        validate_selection({'html': html}, foreign_scope, {})
    after_scope = {**scope, 'start': html.index('<p>'), 'end': html.index('</section>')}
    assert validate_selection({'html': html}, after_scope, {}) == after_scope


def test_ordinary_html_self_closing_tag_still_invalidates_scope():
    import hashlib
    from backend.services.analytics.cockpit_html_selection import validate_selection
    html = '<h1>Before</h1><div/><p>After</p>'
    scope = {'start': 0, 'end': len('<h1>Before</h1>'), 'html_hash': hashlib.sha256(html.encode()).hexdigest()}
    with pytest.raises(AnalyticsError):
        validate_selection({'html': html}, scope, {})


def test_selection_rejects_executable_url_attributes_on_begin_and_collect_but_keeps_static_links(setup):
    import hashlib
    from backend.services.analytics.cockpit_html_selection import protect_selection
    actor, _, pages, ai = setup

    def save_page(html):
        draft = PageDraft(title='Static link selection', session_id='selection-links',
                          package={'html': html, 'css': '', 'js': '', 'resources': [], 'node_map': []},
                          binding_manifest={'bindings': [], 'result_refs': []})
        generated = pages.generate(actor, draft)
        return pages.confirm(actor, generated['preview_id'], 'link-seed-' + str(uuid.uuid4()))['spec']

    def scope_for(html):
        return {'start': 0, 'end': len(html), 'html_hash': hashlib.sha256(html.encode()).hexdigest()}

    source = '<div><a href="#safe">Original link</a></div>'
    page = save_page(source)
    scope = scope_for(source)
    job = ai.begin(actor, 'page', page['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope)
    before = json.loads(ai.content(actor, job['id'], 'source')[1])
    elements = ['<a href="javascript:void(0)">link</a>', '<a href="java&#115;cript:void(0)">link</a>',
                '<a href=" \tJaVa&#x0a;ScRiPt:void(0)">link</a>', '<img src="java&#x09;script:void(0)"/>',
                '<form action="javascript:void(0)">form</form>', '<button formaction="javascript:void(0)">button</button>',
                '<a xlink:href="javascript:void(0)">link</a>', '<a href="data:text/html,static">link</a>',
                '<a href="blob:https://example.invalid/document">link</a>']
    for element in elements:
        html = '<div>' + element + '</div>'
        invalid_page = save_page(html)
        with pytest.raises(AnalyticsError) as error:
            ai.begin(actor, 'page', invalid_page['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope_for(html))
        assert error.value.code == 'AI_SELECTION_INVALID'
        output(job, json.dumps({**before, 'html': html}).encode())
        with pytest.raises(AnalyticsError) as error:
            ai.collect(actor, job['id'])
        assert error.value.code == 'AI_OUTSIDE_SELECTION'
        assert ai.get(actor, job['id'])['status'] == 'WAITING'
        assert pages.get(actor, page['page_id'])['spec']['version'] == 1
    for href in ('https://example.invalid/path', 'http://example.invalid/', '../relative', '#anchor'):
        proposed = {**before, 'html': f'<div><a href="{href}">Changed link</a></div>'}
        protect_selection(before, proposed, scope)
    output(job, json.dumps(proposed).encode())
    ready = ai.collect(actor, job['id'])
    assert ai.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    assert PageDocumentStore(pages.path.parent).get(actor, page['page_id'])['spec']['package']['html'] == proposed['html']
    for src in ('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=',
                'blob:https://example.invalid/static-image'):
        html = f'<div><img src="{src}"/><p>Before</p></div>'
        image_page = save_page(html)
        image_job = ai.begin(actor, 'page', image_page['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope_for(html))
        image_package = json.loads(ai.content(actor, image_job['id'], 'source')[1])
        output(image_job, json.dumps({**image_package, 'html': html.replace('Before', 'After')}).encode())
        ready = ai.collect(actor, image_job['id'])
        assert ai.confirm(actor, image_job['id'], ready['candidate_hash'])['saved_version'] == 2


def test_selection_preserves_root_and_parent_content_model_without_browser_reparenting(setup):
    import hashlib
    from backend.services.analytics.cockpit_html_selection import protect_selection, validate_selection
    actor, _, pages, ai = setup
    html = '<p id="parent">before <span>inside</span> after <b id="outside">outside</b></p>'
    selected = '<span>inside</span>'
    scope = {'start': html.index(selected), 'end': html.index(selected) + len(selected),
             'html_hash': hashlib.sha256(html.encode()).hexdigest()}
    draft = PageDraft(title='Context selection', session_id='selection-context',
                      package={'html': html, 'css': '', 'js': '', 'resources': [], 'node_map': []},
                      binding_manifest={'bindings': [], 'result_refs': []})
    generated = pages.generate(actor, draft)
    page = pages.confirm(actor, generated['preview_id'], 'context-seed')['spec']
    job = ai.begin(actor, 'page', page['page_id'], 1, 'ai_' + str(uuid.uuid4()), scope)
    before = json.loads(ai.content(actor, job['id'], 'source')[1])
    for fragment in ('<div>changed</div>', '<span><div>changed</div></span>', '<span><h2>changed</h2></span>'):
        output(job, json.dumps({**before, 'html': html.replace(selected, fragment)}).encode())
        with pytest.raises(AnalyticsError) as error:
            ai.collect(actor, job['id'])
        assert error.value.code == 'AI_OUTSIDE_SELECTION'
        assert pages.get(actor, page['page_id'])['spec']['package']['html'] == html
    for original, target, replacement in [
        ('<a href="#ok"><span>inside</span></a>', selected, '<span><a href="#other">changed</a></span>'),
        ('<button><span>inside</span></button>', selected, '<span><button>changed</button></span>'),
        ('<ul><li>inside</li></ul>', '<li>inside</li>', '<li>changed<li>outside</li></li>'),
    ]:
        start = original.index(target)
        nested_scope = {'start': start, 'end': start + len(target), 'html_hash': hashlib.sha256(original.encode()).hexdigest()}
        assert validate_selection({'html': original}, nested_scope, {}) == nested_scope
        with pytest.raises(AnalyticsError) as error:
            protect_selection({'html': original}, {'html': original.replace(target, replacement)}, nested_scope)
        assert error.value.code == 'AI_OUTSIDE_SELECTION'
    after = {**before, 'html': html.replace(selected, '<span><strong>changed</strong></span>')}
    output(job, json.dumps(after).encode())
    ready = ai.collect(actor, job['id'])
    assert ai.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    assert pages.get(actor, page['page_id'])['spec']['package']['html'] == after['html']


def test_selection_parser_caps_depth_and_stops_before_processing_the_remaining_megabyte():
    import hashlib
    from backend.services.analytics.cockpit_html_selection import MAX_SELECTION_DEPTH, SourceTree, validate_selection
    html = '<div>' * MAX_SELECTION_DEPTH + 'static' + '</div>' * MAX_SELECTION_DEPTH
    scope = {'start': 0, 'end': len(html), 'html_hash': hashlib.sha256(html.encode()).hexdigest()}
    assert validate_selection({'html': html}, scope, {}) == scope
    too_deep = '<div>' + html + '</div>'
    with pytest.raises(AnalyticsError) as error:
        validate_selection({'html': too_deep}, {'start': 0, 'end': len(too_deep), 'html_hash': hashlib.sha256(too_deep.encode()).hexdigest()}, {})
    assert error.value.code == 'AI_SELECTION_INVALID'
    assert SourceTree('<div>' * MAX_SELECTION_DEPTH + '<svg/>' + '</div>' * MAX_SELECTION_DEPTH).invalid is False

    class CountingTree(SourceTree):
        visited = 0

        def handle_starttag(self, tag, attrs):
            self.visited += 1
            super().handle_starttag(tag, attrs)

    tree = CountingTree('<div>' * 90000 + '</div>' * 90000)
    assert tree.invalid is True
    assert tree.visited == MAX_SELECTION_DEPTH + 1
    assert len(tree.stack) == MAX_SELECTION_DEPTH
