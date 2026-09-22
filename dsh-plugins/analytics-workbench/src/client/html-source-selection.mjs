import { sourceHash } from '../free-page/presentation/model.mjs';
/** Source offsets for ordinary static HTML. Ambiguous/malformed trees fail closed. */
import { sha256Hex } from '../free-page/hash.mjs';
import { buildRichTextTemplate, restoreRichText } from './free-html-library/rich-text.mjs';
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const SELECTABLE = new Set('header footer main section article aside div h1 h2 h3 h4 h5 h6 p span strong em b i small label button a li ul ol blockquote figcaption figure td th caption'.split(' '));
const BLOCK = new Set('header footer main section article aside div ul ol figure blockquote'.split(' '));
const SENTENCE = new Set('p h1 h2 h3 h4 h5 h6 li figcaption caption label td th button blockquote'.split(' '));
const BLOCK_CHILD = /<\/?(?:div|section|article|aside|header|footer|main|nav|table|ul|ol|li|p|h[1-6]|blockquote|figure|script|style|iframe|canvas)\b/i;

function sentenceTemplate(tag, inner) {
  if (!SENTENCE.has(tag) || BLOCK_CHILD.test(inner)) return null;
  return buildRichTextTemplate(inner);
}
export function sourceTargets(pkg, manifest, { rendered = false } = {}) {
  if (!pkg?.html || manifest?.bindings?.length || manifest?.result_refs?.length) return [];
  const html = pkg.html, stack = [], rows = [];
  // Temporary identities share the bridge with persisted markers. Reserve even
  // untrusted/unmapped markers so recomputing a source edit cannot hit another node.
  const reserved = new Set((pkg.node_map ?? []).map(row => row?.node_id));
  for (const attr of html.matchAll(/\bdata-(?:shine-node|shine-region|cockpit-source)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    reserved.add((attr[1] ?? attr[2] ?? attr[3]).replace(/&#(x[0-9a-f]+|\d+);?|&(lowbar|UnderBar);/gi, (entity, code) => {
      if (!code) return '_';
      const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    }));
  }
  const tags = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][\w:-]*(?:\s+(?:[^'"<>]|"[^"]*"|'[^']*')*)?\s*\/?>/g;
  let match, invalid = false;
  while ((match = tags.exec(html))) {
    const text = match[0];
    if (text.startsWith('<!')) continue;
    const tag = /^<\/?([\w:-]+)/.exec(text)[1].toLowerCase();
    if (text.startsWith('</')) {
      const entry = stack.pop();
      if (!entry || entry.tag !== tag) { invalid = true; break; }
      const inner = html.slice(entry.inner_start, match.index);
      if ((rendered ? !entry.readonly && entry.anchor : !entry.blocked) && SELECTABLE.has(tag) && !/<(?:script|style|iframe|object|embed)\b|\bdata-shine-region\s*=/i.test(inner)) {
        rows.push({ ...entry, inner_end: match.index, end: tags.lastIndex, text: inner,
          block: BLOCK.has(tag) && /<[a-z]/i.test(inner), editableText: !/<[a-z!/]/i.test(inner) });
      }
      continue;
    }
    const blocked = /\bdata-shine-region\s*=|\bon\w+\s*=/i.test(text)
      || ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'].includes(tag);
    if (blocked) for (const parent of stack) parent.blocked = true;
    const foreign = tag === 'svg' || tag === 'math' || Boolean(stack.at(-1)?.foreign);
    if (text.endsWith('/>')) {
      if (!foreign && !VOID.has(tag)) { invalid = true; break; }
      continue;
    }
    if (['script', 'style', 'textarea', 'title'].includes(tag)) {
      const close = new RegExp('</' + tag + '\\s*>', 'gi'); close.lastIndex = tags.lastIndex;
      if (!close.exec(html)) { invalid = true; break; } tags.lastIndex = close.lastIndex; continue;
    }
    if (!foreign && VOID.has(tag)) continue;
    if (stack.length >= 256) return [];
    const readonly = Boolean(blocked || stack.at(-1)?.readonly);
    const attr = /\s(id|data-node|data-page-block)\s*=\s*(["'])([A-Za-z][A-Za-z0-9_.:-]{0,159})\2/i.exec(text);
    const anchor = attr ? { attribute: attr[1].toLowerCase(), value: attr[3] } : undefined;
    stack.push({ tag, foreign, anchor, start: match.index, inner_start: tags.lastIndex, readonly, blocked: readonly });
  }
  if (invalid || stack.length) return [];
  const html_hash = sha256Hex(html);
  let serial = 0;
  return rows.sort((a, b) => a.start - b.start).slice(0, 2000).map(row => {
    while (reserved.has('source_' + serial)) serial++;
    const node_id = 'source_' + serial++;
    const sentence = sentenceTemplate(row.tag, row.text);
    return { node_id, kind: 'static_element', mapping: 'valid', mapping_token: html_hash,
    version_hash: html_hash, tag: row.tag, text: row.text, editorText: sentence?.value, richText: Boolean(sentence),
    editableText: row.editableText || Boolean(sentence), block: row.block,
    anchor: row.anchor,
    source: { start: row.start, end: row.end, inner_start: row.inner_start, inner_end: row.inner_end, html_hash },
    };
  });
}
export function selectionForAI(pkg, node) {
  const source = node?.source ?? node?.aiSource;
  if (!source || source.html_hash !== sha256Hex(pkg.html)) return null;
  return { start: [...pkg.html.slice(0, source.start)].length, end: [...pkg.html.slice(0, source.end)].length, html_hash: source.html_hash,
    ...(node.runtime ? { rendered: node.runtime } : {}) };
}
export function sourceTextPreview(pkg, node, replacementText, manifest) {
  const current = sourceTargets(pkg, manifest).find(item => item.node_id === node?.node_id && item.mapping_token === node.mapping_token);
  if (!current?.editableText) throw new Error('选区已变化或不支持直接改字，请重新选择。');
  const inner = pkg.html.slice(current.source.inner_start, current.source.inner_end);
  const sentence = sentenceTemplate(current.tag, inner);
  let replacement;
  if (sentence) {
    const restored = restoreRichText(replacementText, sentence.tokens);
    if (!restored.ok) throw new Error(restored.message);
    replacement = restored.html;
  } else {
    replacement = String(replacementText).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  const next = { ...pkg, html: pkg.html.slice(0, current.source.inner_start) + replacement + pkg.html.slice(current.source.inner_end) };
  if (next.presentation) next.presentation = { ...next.presentation, source_hash: sourceHash(next) };
  return next;
}
export function instrumentSourceTargets(pkg, nodes) {
  let html = pkg.html;
  for (const node of nodes.filter(item => item.source).sort((a, b) => b.source.start - a.source.start)) {
    const at = node.source.start + 1 + node.tag.length;
    html = html.slice(0, at) + ` data-cockpit-source="${node.node_id}"` + html.slice(at);
  }
  const next = { ...pkg, html };
  if (next.presentation) next.presentation = { ...next.presentation, source_hash: sourceHash(next) };
  return next;
}
