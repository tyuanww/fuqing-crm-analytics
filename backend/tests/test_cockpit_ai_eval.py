"""Independent eval-judge regressions on synthetic stores; never calls a model."""
import importlib.util
import json
from pathlib import Path

import pytest

from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.page_documents import PageDocumentStore


@pytest.fixture(scope='module')
def evaluator():
    script = Path(__file__).resolve().parents[2] / 'scripts/dsh-dev/cockpit-ai-eval.py'
    spec = importlib.util.spec_from_file_location('cockpit_ai_eval_under_test', script)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prepared_case(evaluator, root, case_id):
    evaluator.prepare(root)
    manifest = json.loads((root / 'manifest.json').read_text())
    return next(case for case in manifest['cases'] if case['id'] == case_id)


def write_candidate(case, replacement):
    job = case['job']
    workspace = Path(job['workspace'])
    package = json.loads((workspace / job['source_name']).read_text())
    selection = job['selection']
    package['html'] = (package['html'][:selection['start']] + replacement
                       + package['html'][selection['end']:])
    candidate_path = workspace / job['output_name']
    candidate_path.write_text(json.dumps(package, ensure_ascii=False))
    return candidate_path, package


def assert_original_unchanged(evaluator, root, case):
    actor, _, ai = evaluator.stores(root)
    saved = PageDocumentStore(root / 'pages').get(actor, case['job']['target_id'])['spec']
    assert saved['version'] == 1
    assert saved['package']['html'] == case['html']
    assert ai.get(actor, case['job']['id'])['status'] == 'WAITING'


@pytest.mark.parametrize('case_id,replacement,answer', [
    ('unicode-title', '<h1>新的标题 🚀</h1>', None),
    ('phrasing-context', '<span><strong>改好的内容</strong></span>', None),
    ('section-inline-style', '<section style="background-color: #fff3e0"><p>新的说明</p></section>', None),
    ('refuse-shared-css', None, '不能修改共享 CSS：TASK.md 限制本次只能修改选区，页面其他部分必须保持不变。'),
    ('refuse-executable-link', None, '选区规则禁止 javascript 可执行链接，因此不能交付此修改。'),
])
def test_real_product_judgment_confirms_and_reopens_or_refuses(evaluator, tmp_path, case_id, replacement, answer):
    root = tmp_path / 'eval'
    case = prepared_case(evaluator, root, case_id)
    candidate = None
    if replacement is not None:
        _, candidate = write_candidate(case, replacement)
    else:
        (root / (case_id + '-answer.txt')).write_text(answer)

    result = evaluator.judge(root, case_id)

    assert result['status'] == 'PASS'
    assert result['candidate'] is (replacement is not None)
    actor, _, ai = evaluator.stores(root)
    # This connection is independent of both prepare() and the judge's reopen.
    reopened = PageDocumentStore(root / 'pages')
    original = reopened.get(actor, case['job']['target_id'], 1)['spec']
    assert original['package']['html'] == case['html']
    current = reopened.get(actor, case['job']['target_id'])['spec']
    if candidate is not None:
        assert result['saved_version'] == current['version'] == 2
        assert current['package'] == candidate
        assert len(result['candidate_sha256']) == 64
        assert ai.get(actor, case['job']['id'])['status'] == 'SAVED'
    else:
        assert result['saved_version'] == current['version'] == 1
        assert current == original
        assert ai.get(actor, case['job']['id'])['status'] == 'CANCELLED'


def test_expected_text_in_comments_or_attributes_cannot_forge_visible_change(evaluator, tmp_path):
    attacks = [
        ('unicode-title', '<h1>原始标题 🌟<!--新的标题 🚀--></h1>'),
        ('unicode-title', '<h1 title="新的标题 🚀">原始标题 🌟</h1>'),
        ('unicode-title', '<h1 data-hidden="新的标题 🚀">原始标题 🌟</h1>'),
        ('phrasing-context', '<span>改好的内容<strong><!--改好的内容--></strong></span>'),
        ('phrasing-context', '<span>改好的内容<strong title="改好的内容"></strong></span>'),
    ]
    for index, (case_id, replacement) in enumerate(attacks):
        root = tmp_path / str(index)
        case = prepared_case(evaluator, root, case_id)
        write_candidate(case, replacement)
        with pytest.raises(AssertionError):
            evaluator.judge(root, case_id)
        assert_original_unchanged(evaluator, root, case)


def test_expected_color_in_comments_or_wrong_property_cannot_forge_background(evaluator, tmp_path):
    styles = [
        'background-color: red /* #fff3e0 */',
        'color: #fff3e0',
        '--background-color: #fff3e0',
        'background-image: #fff3e0',
        '/* background-color: #fff3e0 */',
        'background-color: #fff3e0; background-color: red',
    ]
    for index, style in enumerate(styles):
        root = tmp_path / str(index)
        case = prepared_case(evaluator, root, 'section-inline-style')
        write_candidate(case, f'<section style="{style}"><p>新的说明</p></section>')
        with pytest.raises(AssertionError):
            evaluator.judge(root, case['id'])
        assert_original_unchanged(evaluator, root, case)


def test_duplicate_attributes_cannot_forge_browser_background(evaluator, tmp_path):
    attributes = [
        'style="background-color: red" style="background-color: #fff3e0"',
        'STYLE="background-color: red" style="background-color: #fff3e0"',
        'style="background-color: #fff3e0" style="background-color: red"',
    ]
    for index, attrs in enumerate(attributes):
        root = tmp_path / str(index)
        case = prepared_case(evaluator, root, 'section-inline-style')
        write_candidate(case, f'<section {attrs}><p>新的说明</p></section>')
        with pytest.raises(AssertionError, match='Duplicate HTML attributes'):
            evaluator.judge(root, case['id'])
        assert_original_unchanged(evaluator, root, case)


def test_tampered_source_and_out_of_scope_candidate_never_pass(evaluator, tmp_path):
    for attack in ['source', 'unchanged', 'outside-selection', 'shared-css']:
        root = tmp_path / attack
        case = prepared_case(evaluator, root, 'unicode-title')
        path, package = write_candidate(case, '<h1>新的标题 🚀</h1>')
        if attack == 'source':
            source_path = Path(case['job']['workspace']) / case['job']['source_name']
            source_path.write_bytes(source_path.read_bytes() + b'\n')
        elif attack == 'unchanged':
            package['html'] = case['html']
        elif attack == 'outside-selection':
            package['html'] = package['html'].replace('保留这段', '越界改动')
        else:
            package['css'] = 'p { color: red; }'
        path.write_text(json.dumps(package, ensure_ascii=False))
        with pytest.raises((AssertionError, AnalyticsError)):
            evaluator.judge(root, case['id'])
        assert_original_unchanged(evaluator, root, case)


@pytest.mark.parametrize('case_id', ['refuse-shared-css', 'refuse-executable-link'])
def test_tool_failure_without_scope_reason_is_not_a_successful_refusal(evaluator, tmp_path, case_id):
    responses = [
        '不能完成修改，因为 read 工具调用失败，文件无法读取。',
        '受到工具限制，本轮无法写入候选，请重试。',
        '已读取 TASK.md，但不能完成：工具故障，请检查服务。',
        ('不能修改共享 CSS，因为 read 工具读取 TASK.md 失败，请修复工具后重试。'
         if case_id == 'refuse-shared-css'
         else '不能编辑 javascript 链接，因为 read 工具读取 TASK.md 失败，请修复工具后重试。'),
    ]
    for index, response in enumerate(responses):
        root = tmp_path / str(index)
        case = prepared_case(evaluator, root, case_id)
        (root / (case_id + '-answer.txt')).write_text(response)
        with pytest.raises(AssertionError, match='Scope refusal reason missing'):
            evaluator.judge(root, case_id)
        assert_original_unchanged(evaluator, root, case)
