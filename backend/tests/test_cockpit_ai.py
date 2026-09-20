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
