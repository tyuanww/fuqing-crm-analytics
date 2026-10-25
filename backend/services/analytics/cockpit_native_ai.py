"""Page candidates exchanged through scoped tools, without filesystem tools."""
import json
from html.parser import HTMLParser

from pydantic import ValidationError

from backend.contracts.page_documents import PagePackage, page_source_hash
from backend.services.analytics.cockpit_ai import CockpitAIStore, digest
from backend.services.analytics.cockpit_files import fault
from backend.services.analytics.cockpit_html_selection import protect_selection


class _TextareaMarkup(HTMLParser):
    CDATA_CONTENT_ELEMENTS = ('script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext')

    def __init__(self):
        super().__init__()
        self.open_textarea = False
        self.valid = True
        self.plaintext = False

    def handle_starttag(self, tag, attrs):
        if self.plaintext:
            return
        self.plaintext = tag == 'plaintext'
        if tag == 'textarea':
            self.open_textarea = True

    def handle_endtag(self, tag):
        if self.plaintext:
            return
        if tag == 'textarea':
            self.valid = self.valid and self.open_textarea
            self.open_textarea = False

    def handle_startendtag(self, tag, attrs):
        if self.plaintext:
            return
        if tag == 'textarea':
            self.valid = False


class NativeCockpitAIStore(CockpitAIStore):
    def __init__(self, files, pages):
        super().__init__(files, pages, workspace_files=False)

    def view(self, row):
        return {**super().view(row), 'transport': 'native-tools', 'workspace': '',
                'session_id': 'session-cockpit-native-ai-' + row['id'][3:]}

    def begin(self, actor, target_kind, *args, **kwargs):
        if target_kind != 'page':
            fault(422, 'INVALID_AI_TARGET', '原生页面修改仅接受已保存页面。')
        return super().begin(actor, target_kind, *args, **kwargs)

    def candidate_bytes(self, row):
        if row['candidate'] is None:
            fault(409, 'AI_OUTPUT_MISSING', 'AI 尚未提交候选，请在对话中完成修改后再收取。')
        return row['candidate']

    def read_part(self, actor, job_id, field, offset=0, variant='source'):
        with self.files.connect() as con:
            row = self.row(con, actor, job_id)
        if field not in {'task', 'html', 'css', 'js', 'resources', 'node_map', 'presentation'} \
                or variant not in {'source', 'candidate'} or type(offset) is not int or offset < 0:
            fault(422, 'INVALID_AI_REQUEST', '请使用支持的字段和字符偏移。')
        if field == 'task':
            context = json.loads(row['context'])
            source = json.loads(row['source'])
            text = json.dumps({
                'title': context['title'], 'instruction': context.get('instruction', ''),
                'presentation_source_hash': page_source_hash(source['html'], source.get('css', ''), source.get('js', '')),
                'base_version': row['base_version'], 'binding_manifest': context['binding_manifest'],
                'selection': context.get('selection'), 'edit_context': context.get('edit_context'),
                'rule': '只按用户要求提交候选；保留未修改内容。绑定页面只允许 CSS 或受控 presentation 样式，不能改写数值或文案。候选须由用户收取、预览和确认保存。',
            }, ensure_ascii=False)
        else:
            content = row['source'] if variant == 'source' else self.candidate_bytes(row)
            value = json.loads(content).get(field)
            text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        if offset > len(text):
            fault(422, 'INVALID_AI_REQUEST', '字符偏移超出字段长度。')
        end = min(offset + 2000, len(text))
        return {'field': field, 'variant': variant, 'text': text[offset:end], 'offset': offset,
                'total_chars': len(text), 'next_offset': end if end < len(text) else None,
                'source_sha256': digest(row['source']),
                'candidate_sha256': digest(row['candidate']) if row['candidate'] is not None else None,
                'status': row['status']}

    def propose(self, actor, job_id, payload):
        self.files.access(actor, True)
        if not isinstance(payload, dict) or set(payload) != {'source_sha256', 'candidate_sha256', 'edits'}:
            fault(422, 'INVALID_AI_REQUEST', '候选须包含来源哈希、前一候选哈希及替换列表。')
        edits = payload['edits']
        if not isinstance(edits, list) or not 1 <= len(edits) <= 32:
            fault(422, 'INVALID_AI_REQUEST', '每次候选接受 1 至 32 个精确替换。')
        with self.files.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = self.row(con, actor, job_id)
            if row['status'] != 'WAITING':
                fault(409, 'AI_EDIT_CLOSED', '任务已收取或关闭，不能替换候选。')
            previous_hash = digest(row['candidate']) if row['candidate'] is not None else None
            if payload['source_sha256'] != digest(row['source']):
                fault(409, 'AI_BASE_CHANGED', '来源哈希不匹配，请重新读取原始版本。')
            if payload['candidate_sha256'] != previous_hash:
                fault(409, 'AI_CANDIDATE_CHANGED', '候选已变化，请重新读取候选状态。')
            package = json.loads(row['source'])
            before = json.loads(row['source'])
            for edit in edits:
                if not isinstance(edit, dict) or set(edit) != {'field', 'old_text', 'new_text'} \
                        or not isinstance(edit['field'], str) \
                        or edit['field'] not in {'html', 'css', 'js', 'presentation'} \
                        or not isinstance(edit['old_text'], str) or not isinstance(edit['new_text'], str):
                    fault(422, 'INVALID_AI_REQUEST', '替换只接受 HTML、CSS、JS 文本或 presentation JSON。')
                text = (json.dumps(package.get('presentation'), ensure_ascii=False) if edit['field'] == 'presentation'
                        else package.get(edit['field'], ''))
                old = edit['old_text']
                if (old and text.count(old) != 1) or (not old and text):
                    fault(422, 'AI_REPLACEMENT_AMBIGUOUS', '原文须在该字段内唯一；未修改候选。')
                replacement = text.replace(old, edit['new_text'], 1) if old else edit['new_text']
                if edit['field'] == 'presentation':
                    try:
                        package['presentation'] = json.loads(replacement)
                    except (ValueError, RecursionError):
                        fault(422, 'INVALID_AI_PAGE', 'presentation 必须为有效的页面展示 JSON。')
                else:
                    package[edit['field']] = replacement
            if package.get('presentation') is not None and not isinstance(package['presentation'], dict):
                fault(422, 'INVALID_AI_PAGE', 'presentation 必须为页面展示对象。')
            if package.get('presentation'):
                if any(package.get(key) != before.get(key) for key in ('html', 'js')):
                    fault(422, 'AI_PRESENTATION_REVIEW_REQUIRED', '页面已有展示修改，HTML/JS 变更须在源码入口核对定位后提交。')
                package['presentation']['source_hash'] = page_source_hash(package['html'], package.get('css', ''), package.get('js', ''))
            markup = _TextareaMarkup()
            markup.feed(package['html'])
            markup.close()
            if not markup.valid or markup.open_textarea:
                fault(422, 'INVALID_AI_PAGE', 'textarea 起止标签不完整，请修复后重新提交候选。')
            try:
                package = PagePackage.model_validate(package).model_dump(mode='json')
            except ValidationError:
                fault(422, 'INVALID_AI_PAGE', '候选源码不符合页面合同。')
            context = json.loads(row['context'])
            self.protect_bindings(before, package, context['binding_manifest'])
            protect_selection(before, package, context.get('selection'))
            if package == before:
                fault(422, 'AI_NO_CHANGE', '候选与原版本相同。')
            content = json.dumps(package, ensure_ascii=False, indent=2).encode()
            con.execute('UPDATE ai_edits SET candidate=? WHERE id=?', (content, job_id))
            return {'status': 'WAITING', 'source_sha256': digest(row['source']),
                    'candidate_sha256': digest(content), 'saved': False}
