import hashlib
import uuid

import pytest

from backend.contracts.page_documents import PageDraft
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
from backend.services.analytics.cockpit_files import CockpitFileStore
from backend.services.analytics.page_documents import PageDocumentStore


@pytest.fixture
def native(tmp_path):
    from backend.services.analytics.cockpit_native_ai import NativeCockpitAIStore

    actor = AnalyticsPrincipal('alice', frozenset({'dashboard:read', 'dashboard:update'}), frozenset({'competition-diagnosis-fixture'}))
    files = CockpitFileStore(tmp_path / 'files')
    (tmp_path / 'pages').mkdir(mode=0o700)
    pages = PageDocumentStore(tmp_path / 'pages')
    ai = NativeCockpitAIStore(files, pages)
    html = '<h1>' + '经营😀' * 2400 + '</h1><p data-page-field="summary">先复核人群</p>'
    preview = pages.generate(actor, PageDraft(title='Long page', session_id=None, origin_file_id='file_fixture', package={'html': html, 'css': 'p{color:red}'}))
    saved = pages.confirm(actor, preview['preview_id'], 'native-original')['spec']
    job = ai.begin(actor, 'page', saved['page_id'], 1, 'ai_' + str(uuid.uuid4()), instruction='只改总结')
    return actor, files, pages, ai, saved, job


def read_field(ai, actor, job, field, variant='source'):
    parts, offset = [], 0
    while True:
        result = ai.read_part(actor, job['id'], field, offset, variant)
        parts.append(result['text'])
        assert len(result['text']) <= 2000
        if result['next_offset'] is None:
            break
        assert result['next_offset'] > offset
        offset = result['next_offset']
    return ''.join(parts), result


def proposal(ai, actor, job, before='先复核人群', after='验收通过后再决定运营动作。', **extra):
    _, receipt = read_field(ai, actor, job, 'html')
    return ai.propose(actor, job['id'], {
        'source_sha256': receipt['source_sha256'], 'candidate_sha256': receipt['candidate_sha256'],
        'edits': [{'field': 'html', 'old_text': before, 'new_text': after}], **extra,
    })


def test_long_line_unicode_roundtrip_and_candidate_requires_confirmation(native):
    actor, files, pages, ai, saved, job = native
    assert job['transport'] == 'native-tools'
    assert not (ai.root / job['id']).exists()
    html, _ = read_field(ai, actor, job, 'html')
    assert html == saved['package']['html']
    result = proposal(ai, actor, job)
    assert result['status'] == 'WAITING'
    assert pages.get(actor, saved['page_id'])['spec']['version'] == 1
    candidate, _ = read_field(ai, actor, job, 'html', 'candidate')
    assert candidate == html.replace('先复核人群', '验收通过后再决定运营动作。')
    from backend.services.analytics.cockpit_native_ai import NativeCockpitAIStore
    reopened = NativeCockpitAIStore(CockpitFileStore(files.path.parent), pages)
    ready = reopened.collect(actor, job['id'])
    assert reopened.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    assert reopened.confirm(actor, job['id'], ready['candidate_hash'])['saved_version'] == 2
    assert pages.get(actor, saved['page_id'])['spec']['package']['html'] == candidate
    assert pages.get(actor, saved['page_id'], 1)['spec']['package']['html'] == html


def test_unknown_field_stale_hash_ambiguous_text_and_foreign_owner_do_not_write(native):
    actor, _, pages, ai, saved, job = native
    bob = AnalyticsPrincipal('bob', actor.capabilities, actor.data_scopes)
    for action in [lambda: ai.read_part(bob, job['id'], 'html', 0, 'source'),
                   lambda: ai.read_part(actor, job['id'], '../secrets', 0, 'source'),
                   lambda: proposal(ai, actor, job, before='经营😀'),
                   lambda: proposal(ai, actor, job, edits=[{'field': [], 'old_text': '', 'new_text': ''}]),
                   lambda: proposal(ai, actor, job, source_sha256='0' * 64),
                   lambda: proposal(ai, actor, job, owner='bob')]:
        with pytest.raises(AnalyticsError):
            action()
    with pytest.raises(AnalyticsError) as error:
        ai.collect(actor, job['id'])
    assert error.value.code == 'AI_OUTPUT_MISSING'
    assert pages.get(actor, saved['page_id'])['spec']['version'] == 1


def test_stale_candidate_hash_and_proposals_after_collect_are_rejected(native):
    actor, _, pages, ai, saved, job = native
    first = proposal(ai, actor, job)
    assert first['candidate_sha256']
    with pytest.raises(AnalyticsError) as error:
        proposal(ai, actor, job, candidate_sha256=None)
    assert error.value.code == 'AI_CANDIDATE_CHANGED'
    ready = ai.collect(actor, job['id'])
    with pytest.raises(AnalyticsError) as error:
        proposal(ai, actor, job, after='Late write')
    assert error.value.code == 'AI_EDIT_CLOSED'
    assert ai.get(actor, job['id'])['candidate_hash'] == ready['candidate_hash']
    assert pages.get(actor, saved['page_id'])['spec']['version'] == 1


def test_native_candidates_enforce_selection_and_reject_files(native):
    actor, files, pages, ai, saved, job = native
    html = saved['package']['html']
    start, end = html.index('<p '), html.index('</p>') + 4
    scoped = ai.begin(actor, 'page', saved['page_id'], 1, 'ai_' + str(uuid.uuid4()), selection={
        'start': start, 'end': end, 'html_hash': hashlib.sha256(html.encode()).hexdigest(),
    })
    with pytest.raises(AnalyticsError) as error:
        proposal(ai, actor, scoped, before='经营😀' * 2400, after='Changed outside')
    assert error.value.code == 'AI_OUTSIDE_SELECTION'
    assert proposal(ai, actor, scoped)['status'] == 'WAITING'
    file = files.upload(actor, 'fixture.csv', b'a,1', 'fixture-file')
    with pytest.raises(AnalyticsError):
        ai.begin(actor, 'file', file['file_id'], 1, 'ai_' + str(uuid.uuid4()))


def test_native_candidate_never_reads_forged_workspace_file(native):
    actor, _, _, ai, _, job = native
    (ai.root / job['id']).mkdir()
    (ai.root / job['id'] / 'candidate.json').write_text('{"html":"forged"}')
    with pytest.raises(AnalyticsError) as error:
        ai.collect(actor, job['id'])
    assert error.value.code == 'AI_OUTPUT_MISSING'


def test_native_rendered_selection_candidate_can_save_only_its_presentation(native):
    import json
    from backend.tests.test_cockpit_presentation import create, candidate
    actor, files, pages, ai, _, _ = native
    spec, package, scope, job = create((actor, files, pages, ai))
    changed = candidate(package, scope)
    original, receipt = read_field(ai, actor, job, 'presentation')
    payload = {'source_sha256': receipt['source_sha256'], 'candidate_sha256': None,
               'edits': [{'field': 'presentation', 'old_text': original,
                          'new_text': json.dumps(changed['presentation'], ensure_ascii=False)}]}
    ai.propose(actor, job['id'], payload)
    wrong = candidate(package, scope)
    wrong['presentation']['edits'][0]['target']['path'][0]['key']['value'] = 'b'
    payload['candidate_sha256'] = ai.read_part(actor, job['id'], 'html')['candidate_sha256']
    payload['edits'][0]['new_text'] = json.dumps(wrong['presentation'])
    with pytest.raises(AnalyticsError) as error:
        ai.propose(actor, job['id'], payload)
    assert error.value.code == 'AI_OUTSIDE_SELECTION'
    ready = ai.collect(actor, job['id'])
    ai.confirm(actor, job['id'], ready['candidate_hash'])
    actual = pages.get(actor, spec['page_id'])['spec']['package']
    assert actual['html'] == package['html']
    assert actual['presentation']['edits'][0]['text'] == 'After'


def test_native_ai_rejects_malformed_textarea_without_losing_saved_source(native):
    actor, _, pages, ai, _, _ = native
    preview = pages.generate(actor, PageDraft(title='Text area', session_id=None, origin_file_id='file_textarea',
        package={'html': '<label><textarea>before</textarea></label>'}))
    saved = pages.confirm(actor, preview['preview_id'], 'textarea-create')['spec']
    job = ai.begin(actor, 'page', saved['page_id'], 1, 'ai_' + str(uuid.uuid4()))
    with pytest.raises(AnalyticsError) as error:
        proposal(ai, actor, job, before='<textarea', after='textarea')
    assert error.value.code == 'INVALID_AI_PAGE'
    assert pages.get(actor, saved['page_id'])['spec']['package']['html'] == saved['package']['html']
    assert ai.read_part(actor, job['id'], 'html')['candidate_sha256'] is None


@pytest.mark.parametrize('tag', ['xmp', 'iframe', 'noembed', 'noframes', 'plaintext'])
def test_native_ai_preserves_literal_textarea_in_raw_text(native, tag):
    actor, _, _, ai, saved, job = native
    assert proposal(ai, actor, job, before=saved['package']['html'],
                    after=f'<{tag}>example="</textarea>"</{tag}>')['status'] == 'WAITING'
