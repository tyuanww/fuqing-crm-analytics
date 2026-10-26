"""Page candidates exchanged through scoped tools, without filesystem tools."""
import json
import hashlib
from html.parser import HTMLParser
from uuid import uuid4

from pydantic import ValidationError

from backend.contracts.page_documents import PagePackage, PagePatchPreview, page_source_hash
from backend.services.analytics.cockpit_ai import CockpitAIStore, digest
from backend.services.analytics.cockpit_files import fault
from backend.services.analytics.cockpit_html_selection import SourceTree, protect_selection, validate_selection
from backend.services.analytics.page_edit_context import PageEditContextStore


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
        self.edits = PageEditContextStore(pages.path.parent, pages, clock=pages.clock, policy=pages.policy)

    def validate_edit_context(self, actor, edit_context, target_id, base_version, spec):
        normalized = self._validate_edit_context(edit_context, target_id, base_version, spec, allow_bound=True)
        if not spec["binding_manifest"].get("result_refs"):
            return normalized
        if normalized['kind'] != 'static_element' or normalized['allowed_scope'] != 'exact_source_range':
            fault(422, 'AI_SCOPE_DIFF', '绑定页 AI 展示修改仅接受可核验的静态节点。')
        self.pages._validate_ai_scope(spec, spec, PagePatchPreview(
            base_version=base_version, package=spec["package"], edit_scope="source_range",
            edit_context_id=normalized["context_id"], focus_ref=normalized["focus_ref"], source_hash=normalized["version_hash"]))
        controlled = self.edits.create(actor, {"page_id": target_id, "node_id": normalized["node_id"],
                                               "kind": normalized["kind"], "channel": "presentation"})
        target, _ = self.edits.ai_presentation(actor, controlled["edit_context_id"], target_id, base_version,
                                               spec["package"], spec["package"], "ai-selection")
        return {**normalized, "controlled_context_id": controlled["edit_context_id"], "presentation_target": target,
                "selected_overlay": self.edits.overlay(actor, target_id, base_version).get(normalized["node_id"])}

    def validate_page_selection(self, actor, spec, selection, context):
        edit = context.get("edit_context") or {}
        if not spec["binding_manifest"].get("result_refs"):
            return super().validate_page_selection(actor, spec, selection, context)
        parsed = validate_selection(spec["package"], selection, spec["binding_manifest"], allow_bound=True)
        span = (parsed["start"], parsed["end"])
        if not edit:
            matches = [node for node in spec["package"]["node_map"]
                       if self.pages._mapped_node_range(spec["package"], node["node_id"], node["kind"]) == span]
            if len(matches) != 1:
                fault(422, 'AI_SELECTION_INVALID', '选区没有唯一的受控节点，请重新选择。')
            node = matches[0]
            source_hash = self.pages._source_hash(spec["package"])
            generated = {'context_id': 'selection_' + uuid4().hex, 'node_id': node['node_id'], 'kind': node['kind'],
                         'allowed_scope': 'exact_source_range', 'version_hash': source_hash,
                         'mapping_token': hashlib.sha256(f'{source_hash}:{node["node_id"]}:{span[0]}:{span[1]}'.encode()).hexdigest()[:32],
                         'allowed_ranges': [{'file': 'html', 'start': span[0], 'end': span[1]}]}
            edit = self.validate_edit_context(actor, generated, spec['page_id'], spec['version'], spec)
            context['edit_context'] = edit
            context['selection_context'] = True
        self.check_controlled_selection(spec["package"], edit, parsed)
        return parsed

    def check_controlled_selection(self, package, edit, selection):
        span = self.pages._mapped_node_range(package, edit["node_id"], edit["kind"])
        rendered = selection.get("rendered")
        node = next(item for item in SourceTree(package["html"]).all_nodes if item['start'] == span[0])
        if ((selection["start"], selection["end"]) != span or rendered and
                (rendered["path"] or node["attrs"].get(rendered["anchor"]["attribute"]) != rendered["anchor"]["value"])):
            fault(422, 'AI_OUTSIDE_SELECTION', '候选节点与选区不一致，请重新选择。')

    def controlled_operation(self, actor, row, package):
        context = json.loads(row['context'])
        edit = context.get('edit_context') or {}
        before = json.loads(row['source'])
        if not edit.get('controlled_context_id'):
            self.protect_bindings(before, package, context['binding_manifest'])
            protect_selection(before, package, context.get('selection'))
            return None
        if context.get('selection'):
            self.check_controlled_selection(before, edit, context['selection'])
        key = row['id'] + '.' + digest(json.dumps(package, ensure_ascii=False, sort_keys=True).encode())[:24]
        _, operation = self.edits.ai_presentation(actor, edit['controlled_context_id'], row['target_id'], row['base_version'],
                                                  before, package, key)
        return operation

    def collect(self, actor, job_id, *, source_context=None):
        with self.files.connect() as con:
            row = self.row(con, actor, job_id)
        if not (json.loads(row['context']).get('edit_context') or {}).get('controlled_context_id'):
            return super().collect(actor, job_id, source_context=source_context)
        self.files.access(actor, True)
        with self.files.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = self.row(con, actor, job_id)
            if row['status'] != 'WAITING':
                return self.view(row)
            content = self.candidate_bytes(row)
            package = PagePackage.model_validate_json(content).model_dump(mode='json')
            operation = self.controlled_operation(actor, row, package)
            if operation is None:
                fault(422, 'AI_NO_CHANGE', '候选没有受控展示修改。')
            context = json.loads(row['context'])
            edit = context['edit_context']
            patch = self.edits.apply(actor, edit['controlled_context_id'], operation, operation['cas']['idempotency_key'],
                                     page_id=row['target_id'])
            preview_id = self.edits.prepare(actor, edit['controlled_context_id'], patch['preview_id'], source_context=source_context)
            context['edit_preview_id'] = patch['preview_id']
            con.execute("UPDATE ai_edits SET status='READY',candidate=?,candidate_hash=?,preview_id=?,context=? WHERE id=?",
                        (content, digest(content), preview_id, json.dumps(context, ensure_ascii=False), job_id))
            return self.view(self.row(con, actor, job_id))

    def confirm(self, actor, job_id, expected_hash, *, source_context=None):
        with self.files.connect() as con:
            row = self.row(con, actor, job_id)
        if not (json.loads(row['context']).get('edit_context') or {}).get('controlled_context_id'):
            result = super().confirm(actor, job_id, expected_hash, source_context=source_context)
            if row['target_kind'] == 'page':
                self.edits.checkpoint(actor, row['target_id'], result['saved_version'])
            return result
        self.files.access(actor, True)
        with self.files.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = self.row(con, actor, job_id)
            if not expected_hash or row['candidate_hash'] != expected_hash:
                fault(409, 'AI_CANDIDATE_CHANGED', '候选标识不匹配，请重新核对预览。')
            if row['status'] == 'SAVED':
                return self.view(row)
            if row['status'] != 'READY':
                fault(409, 'AI_EDIT_CLOSED', '任务已关闭或尚未交付。')
            context = json.loads(row['context'])
            edit = context['edit_context']
            if self.pages.preview(actor, row['preview_id'])['status'] != 'APPLIED':
                self.controlled_operation(actor, row, PagePackage.model_validate_json(row['candidate']).model_dump(mode='json'))
            receipt = self.edits.confirm(actor, edit['controlled_context_id'], context['edit_preview_id'], job_id,
                                         source_context=source_context)
            if receipt['saved_version'] != row['base_version'] + 1:
                fault(503, 'STATE_UNAVAILABLE', '保存回执的版本不匹配。')
            con.execute("UPDATE ai_edits SET status='SAVED',saved_version=? WHERE id=?", (receipt['saved_version'], job_id))
            return self.view(self.row(con, actor, job_id))

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
                'rule': '只按用户要求提交候选；有 edit_context.presentation_target 时仅改该精确目标的 presentation 文案或样式，保留其他 edits 及所有源码；selected_overlay 是现有人工展示，未要求的文案和样式保持不变。没有受控目标的绑定页只改样式并保留已有文案。数字只读，候选须由用户收取、预览并确认保存。',
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
            operation = self.controlled_operation(actor, row, package)
            if (json.loads(row['context']).get('edit_context') or {}).get('controlled_context_id') and operation is None:
                fault(422, 'AI_NO_CHANGE', '候选没有受控展示修改。')
            if package == before:
                fault(422, 'AI_NO_CHANGE', '候选与原版本相同。')
            content = json.dumps(package, ensure_ascii=False, indent=2).encode()
            con.execute('UPDATE ai_edits SET candidate=? WHERE id=?', (content, job_id))
            return {'status': 'WAITING', 'source_sha256': digest(row['source']),
                    'candidate_sha256': digest(content), 'saved': False}
