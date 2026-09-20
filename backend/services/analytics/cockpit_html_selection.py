"""Validate static HTML source selections and keep AI candidates inside their scope."""
import hashlib
import re
from html.parser import HTMLParser

from backend.services.analytics.cockpit_files import fault

VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
SELECTABLE = set('header footer main section article aside div h1 h2 h3 h4 h5 h6 p span strong em b i small label button a li ul ol blockquote figcaption figure td th caption'.split())
ACTIVE = {'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'}
MAX_SELECTION_DEPTH = 256
URL_ATTRIBUTES = {'href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'background', 'codebase', 'poster', 'manifest'}
NAVIGATION_ATTRIBUTES = {'href', 'action', 'formaction', 'xlink:href'}
PHRASING = set('a abbr b bdi bdo br button cite code data dfn em i img input kbd label mark meter output progress q rp rt ruby s samp small span strong sub sup time u var wbr'.split())
PHRASING_ROOTS = (SELECTABLE & PHRASING) | set('p h1 h2 h3 h4 h5 h6 caption'.split()) | (PHRASING - VOID)
STATIC_ELEMENTS = SELECTABLE | PHRASING | {'hr'}
CONTEXT_ELEMENTS = STATIC_ELEMENTS | {'html', 'body', 'form', 'table', 'thead', 'tbody', 'tfoot', 'tr'}


def dynamic_attribute(key, value):
    if key.startswith('on') or key in {'data-shine-region', 'srcdoc'}:
        return True
    if key not in URL_ATTRIBUTES:
        return False
    # HTMLParser has already decoded character references. Browsers strip URL
    # controls/ASCII whitespace, so inspect the normalized protocol, not raw text.
    normalized = re.sub(r'[\x00-\x20\x7f]+', '', value or '').lower()
    # Static image src may use data/blob; navigation to a document may execute
    # code. Active document containers (iframe/object/embed) are blocked by tag.
    return normalized.startswith(('javascript:', 'vbscript:')) or (key in NAVIGATION_ATTRIBUTES and normalized.startswith(('data:', 'blob:')))


def static_nesting(tag, ancestors, *, context=False):
    """A conservative subset with explicit ends; no browser-implied reparenting."""
    if tag not in (CONTEXT_ELEMENTS if context else STATIC_ELEMENTS):
        return False
    parent = ancestors[-1] if ancestors else None
    if any(item in PHRASING_ROOTS for item in ancestors) and tag not in PHRASING:
        return False
    if tag in {'a', 'button'} and tag in ancestors:
        return False
    children = {'html': {'body'}, 'ul': {'li'}, 'ol': {'li'},
                'table': {'caption', 'thead', 'tbody', 'tfoot', 'tr'},
                'thead': {'tr'}, 'tbody': {'tr'}, 'tfoot': {'tr'}, 'tr': {'td', 'th'}}
    parents = {'html': {None}, 'body': {None, 'html'}, 'li': {'ul', 'ol'},
               'td': {'tr'}, 'th': {'tr'}, 'caption': {'table'},
               'thead': {'table'}, 'tbody': {'table'}, 'tfoot': {'table'},
               'tr': {'table', 'thead', 'tbody', 'tfoot'}}
    return (parent not in children or tag in children[parent]) and (tag not in parents or parent in parents[tag])


class UnsafeSelectionTree(Exception):
    """Abort bounded parsing immediately instead of walking the remaining input."""


class SourceTree(HTMLParser):
    def __init__(self, text, *, context=(), static=False):
        super().__init__(convert_charrefs=False)
        self.text, self.stack, self.nodes, self.invalid = text, [], [], False
        self.context, self.static = tuple(context), static
        self.lines = [0]
        for index, char in enumerate(text):
            if char == '\n':
                self.lines.append(index + 1)
        try:
            if static and any(not static_nesting(tag, self.context[:index], context=True) for index, tag in enumerate(self.context)):
                raise UnsafeSelectionTree()
            self.feed(text)
            self.close()
        except UnsafeSelectionTree:
            self.invalid = True
        self.invalid = self.invalid or bool(self.stack)

    def source_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        ancestors = self.context + tuple(p['tag'] for p in self.stack)
        if self.static and not static_nesting(tag, ancestors):
            raise UnsafeSelectionTree()
        foreign = tag in {'svg', 'math'} or bool(self.stack and self.stack[-1]['foreign'])
        blocked = tag in ACTIVE or any(dynamic_attribute(key, value) for key, value in attrs)
        if blocked:
            for parent in self.stack:
                parent['blocked'] = True
        if foreign or tag not in VOID:
            if len(ancestors) >= MAX_SELECTION_DEPTH:
                raise UnsafeSelectionTree()
            readonly = blocked or bool(self.stack and self.stack[-1]['readonly'])
            self.stack.append({'tag': tag, 'foreign': foreign, 'start': self.source_offset(), 'ancestors': ancestors,
                               'readonly': readonly, 'blocked': readonly})

    def handle_startendtag(self, tag, attrs):
        ancestors = self.context + tuple(p['tag'] for p in self.stack)
        if self.static and not static_nesting(tag, ancestors):
            raise UnsafeSelectionTree()
        foreign = tag in {'svg', 'math'} or bool(self.stack and self.stack[-1]['foreign'])
        if not foreign and tag not in VOID:
            self.invalid = True
        if tag in ACTIVE or any(dynamic_attribute(key, value) for key, value in attrs):
            for parent in self.stack:
                parent['blocked'] = True

    def handle_data(self, data):
        if self.static and data.strip() and self.stack and self.stack[-1]['tag'] in {'ul', 'ol'}:
            raise UnsafeSelectionTree()

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1]['tag'] != tag:
            self.invalid = True
            return
        node = self.stack.pop()
        node['end'] = self.text.find('>', self.source_offset()) + 1
        if tag in SELECTABLE and not node['blocked']:
            self.nodes.append(node)


def validate_selection(package, selection, manifest):
    if not isinstance(selection, dict) or set(selection) != {'start', 'end', 'html_hash'}:
        fault(422, 'AI_SELECTION_INVALID', '选区格式无效，请重新点选。')
    html = package['html']
    start, end = selection['start'], selection['end']
    if (type(start) is not int or type(end) is not int or not 0 <= start < end <= len(html)
            or selection['html_hash'] != hashlib.sha256(html.encode()).hexdigest()):
        fault(409, 'AI_SELECTION_STALE', '页面已变化，请重新点选。')
    if manifest.get('bindings') or manifest.get('result_refs'):
        fault(422, 'AI_BOUND_CONTENT', '业务绑定页面不支持普通选区修改。')
    tree = SourceTree(html)
    node = next((node for node in tree.nodes if node['start'] == start and node['end'] == end), None)
    scoped = SourceTree(html[start:end], context=node['ancestors'], static=True) if node else None
    if tree.invalid or scoped is None or scoped.invalid:
        fault(422, 'AI_SELECTION_INVALID', '此区域无法可靠定位，或包含动态内容，请选择静态文字或板块。')
    return dict(selection)


def protect_selection(before, after, selection):
    if not selection:
        return
    start, end = selection['start'], selection['end']
    html, proposed = before['html'], after['html']
    prefix, suffix = html[:start], html[end:]
    if (any(before.get(key) != after.get(key) for key in ('css', 'js', 'resources', 'node_map'))
            or len(proposed) < len(prefix) + len(suffix)
            or not proposed.startswith(prefix) or not proposed.endswith(suffix)):
        fault(422, 'AI_OUTSIDE_SELECTION', '候选修改超出了选区，未保存；请让 AI 只调整指定板块。')
    fragment = proposed[len(prefix):len(proposed) - len(suffix) if suffix else len(proposed)]
    original = SourceTree(html)
    selected = next((node for node in original.nodes if node['start'] == start and node['end'] == end), None)
    tree = SourceTree(fragment, context=selected['ancestors'], static=True) if selected else None
    if (original.invalid or tree is None or tree.invalid
            or not any(node['start'] == 0 and node['end'] == len(fragment) and node['tag'] == selected['tag'] for node in tree.nodes)):
        fault(422, 'AI_OUTSIDE_SELECTION', '候选选区结构无效或包含动态代码，未保存。')
