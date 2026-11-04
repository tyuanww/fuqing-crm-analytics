import { validatePresentation, sourceHash, targetId } from '../free-page/presentation/model.mjs';
import { editorPageCatalog } from './editor-page-nodes.mjs';
import { instrumentSourceTargets } from './html-source-selection.mjs';
import { safeOverlayAttributes, safeOverlayStyles } from './presentation-overlay.mjs';

const fail = () => { throw new Error('AI 预览与基线叠加无法准确定位，请重新读取修改任务。'); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const writable = node => node?.namespaceURI === 'http://www.w3.org/1999/xhtml'
  && !node.closest('script,style,template,iframe,object,embed,textarea,input,select,xmp,noembed,noframes,plaintext,noscript,[data-sp-bindable="database"],[data-page-readonly]');

function resolveBaselineTarget(document, target) {
  const matches = (node, key) => key.attribute === 'text' ? node.textContent === key.value
    : key.attribute === 'class' ? node.classList.contains(key.value) : node.getAttribute(key.attribute) === key.value;
  const roots = [...document.querySelectorAll('[' + target.anchor.attribute + ']')].filter(node => matches(node, target.anchor));
  if (roots.length !== 1) return null;
  let node = roots[0];
  for (const part of target.path) {
    const sameTag = [...node.children].filter(child => child.localName === part.tag);
    const children = part.key?.attribute === 'nth' ? sameTag.slice(Number(part.key.value), Number(part.key.value) + 1)
      : sameTag.filter(child => !part.key || matches(child, part.key));
    if (children.length !== 1) return null;
    node = children[0];
  }
  return node;
}

function applyPreviewStyles(element, style) {
  for (const [name, raw] of safeOverlayStyles(style)) {
    const priority = /\s*!important\s*$/i.test(raw) ? 'important' : '';
    element.style.setProperty(name, priority ? raw.replace(/\s*!important\s*$/i, '').trim() : raw, priority);
  }
}

export function projectAIPagePreview({ source, candidate = source, variant, pageId, overlays }) {
  for (const pkg of [source, candidate]) {
    if (!pkg || typeof pkg.html !== 'string' || !validatePresentation(pkg.presentation, pkg)) {
      throw new Error('文案修改与页面来源不匹配。');
    }
  }
  if (!record(overlays)) fail();
  const pkg = variant === 'source' ? source : candidate;
  if (!Object.keys(overlays).length) return pkg;
  if (source.html !== candidate.html) fail();
  const catalog = editorPageCatalog(source, null, { pageId });
  const nodes = Object.keys(overlays).map(id => {
    const found = catalog.pageNodes.filter(node => node.node_id === id && node.source_range);
    if (found.length !== 1) fail();
    return found[0];
  });
  const marked = instrumentSourceTargets(source, nodes.map(node => ({ ...node, source: node.source_range })));
  const document = new DOMParser().parseFromString(marked.html, 'text/html');
  const values = new Map(), targets = new Map(), styles = new Map(), runtimeStyles = new Map();
  const original = new Map((source.presentation?.edits ?? []).map(edit => [targetId(edit.target), edit]));
  const keyFor = target => {
    const node = resolveBaselineTarget(document, target);
    return writable(node) ? node : targetId(target);
  };
  const applyStyles = (node, style, persistent = false) => {
    if (!styles.has(node)) styles.set(node, document.createElement('span'));
    applyPreviewStyles(styles.get(node), style);
    applyPreviewStyles(node, style);
    if (persistent) {
      if (!runtimeStyles.has(node)) runtimeStyles.set(node, new Set());
      for (const name of Object.keys(style)) {
        const names = ['padding', 'margin'].includes(name) ? ['top', 'right', 'bottom', 'left'].map(side => name + '-' + side) : [name];
        for (const property of names) runtimeStyles.get(node).add(property);
      }
    }
  };
  const edits = pkg.presentation?.edits ?? [];
  for (const edit of edits) {
    const key = keyFor(edit.target);
    const previous = values.get(key) ?? {};
    targets.set(key, edit.target);
    if (typeof key !== 'string') applyStyles(key, edit.style ?? {}, true);
    values.set(key, { text: edit.text ?? previous.text, style: typeof key === 'string' ? { ...previous.style, ...edit.style } : {} });
  }
  const delta = [];
  if (variant === 'candidate') for (const edit of candidate.presentation?.edits ?? []) {
    const before = original.get(targetId(edit.target));
    const style = Object.fromEntries(Object.entries(edit.style ?? {}).filter(([name, value]) => value !== before?.style?.[name]));
    delta.push({ key: keyFor(edit.target), ...(edit.text != null && edit.text !== before?.text ? { text: edit.text } : {}), style });
  }
  for (const node of nodes) {
    const overlay = overlays[node.node_id];
    if (!record(overlay) || Object.keys(overlay).some(key => !['text', 'style', 'attributes'].includes(key))
      || overlay.text != null && typeof overlay.text !== 'string' || overlay.style != null && !record(overlay.style)
      || overlay.attributes != null && !record(overlay.attributes)) fail();
    const matches = [...document.querySelectorAll('[data-cockpit-source]')].filter(element => element.getAttribute('data-cockpit-source') === node.node_id);
    if (matches.length !== 1) fail();
    const element = matches[0];
    if (!writable(element)) fail();
    const previous = values.get(element) ?? {};
    applyStyles(element, overlay.style ?? {});
    values.set(element, { text: overlay.text ?? previous.text, style: {} });
    for (const [name, value] of safeOverlayAttributes(overlay.attributes ?? {})) element.setAttribute(name, value);
  }
  for (const edit of delta) {
    const previous = values.get(edit.key) ?? {};
    if (typeof edit.key !== 'string') applyStyles(edit.key, edit.style, true);
    values.set(edit.key, { text: edit.text ?? previous.text, style: typeof edit.key === 'string' ? { ...previous.style, ...edit.style } : {} });
  }
  let serial = 0;
  const projected = [];
  for (const [key, value] of values) {
    if (typeof key !== 'string') {
      const style = styles.get(key)?.style;
      const hash = sourceHash(source);
      value.style = Object.fromEntries([...(runtimeStyles.get(key) ?? [])].flatMap(name => {
        if (style.getPropertyPriority(name)) return [];
        const entry = { [name]: style.getPropertyValue(name) };
        const target = { anchor: { attribute: 'id', value: 'preview' }, path: [] };
        return validatePresentation({ source_hash: hash, edits: [{ target, style: entry }] }, source) ? Object.entries(entry) : [];
      }));
    }
    if (value.text == null && !Object.keys(value.style ?? {}).length) continue;
    let target = targets.get(key);
    if (typeof key !== 'string') {
      let id;
      do { id = 'cockpit_preview_' + serial++; } while (document.querySelector('[data-page-field="' + id + '"]'));
      if (key.hasAttribute('data-page-field')) {
        const existing = key.getAttribute('data-page-field');
        if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(existing)
          || [...document.querySelectorAll('[data-page-field]')].filter(node => node.getAttribute('data-page-field') === existing).length !== 1) fail();
        id = existing;
      } else key.setAttribute('data-page-field', id);
      target = { anchor: { attribute: 'data-page-field', value: id }, path: [] };
    }
    projected.push({ target, ...(value.text != null ? { text: value.text } : {}), style: value.style });
  }
  const display = { ...pkg, html: document.documentElement.outerHTML };
  display.presentation = { version: 1, source_hash: sourceHash(display), edits: projected };
  if (!validatePresentation(display.presentation, display)) fail();
  return display;
}
