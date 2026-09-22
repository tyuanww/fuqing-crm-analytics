/**
 * Editor value for mixed text and child markup. The sentence shows the
 * visible child text. Saving restores each original child around that text,
 * so a wording change cannot drop the metric element.
 */

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export function escapeRichText(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function decodeRichText(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, '\u00a0').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function tagEnd(html, from) {
  let quote = '';
  for (let i = from; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i + 1;
  }
  return -1;
}

function tagInfo(raw) {
  const match = raw.match(/^<\s*(\/?)\s*([A-Za-z][\w:-]*)\b/i);
  if (!match) return null;
  return { closing: Boolean(match[1]), name: match[2].toLowerCase(), selfClosing: /\/\s*>$/.test(raw) };
}

function nextMarkupEnd(html, start, first) {
  if (html.startsWith('<!--', start)) {
    const end = html.indexOf('-->', start + 4);
    return end < 0 ? html.length : end + 3;
  }
  if (!first || first.closing || first.selfClosing || VOID_TAGS.has(first.name)) return tagEnd(html, start) || html.length;
  let depth = 1;
  let cursor = tagEnd(html, start);
  if (cursor < 0) return html.length;
  while (cursor < html.length) {
    const next = html.indexOf('<', cursor);
    if (next < 0) return html.length;
    const end = tagEnd(html, next);
    if (end < 0) return html.length;
    const info = tagInfo(html.slice(next, end));
    if (info?.name === first.name && !VOID_TAGS.has(info.name)) {
      if (info.closing) depth -= 1;
      else if (!info.selfClosing) depth += 1;
      if (depth === 0) return end;
    }
    cursor = end;
  }
  return html.length;
}

function splitTopLevel(html) {
  const parts = [];
  let textStart = 0;
  let cursor = 0;
  const flushText = end => {
    if (end > textStart) parts.push({ kind: 'text', value: html.slice(textStart, end) });
  };
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    flushText(start);
    const end = tagEnd(html, start);
    if (end < 0) { textStart = start; cursor = html.length; break; }
    const raw = html.slice(start, end);
    const finish = nextMarkupEnd(html, start, tagInfo(raw));
    parts.push({ kind: 'markup', value: html.slice(start, finish) });
    cursor = finish;
    textStart = finish;
  }
  flushText(html.length);
  return parts;
}

function visibleText(html) {
  return decodeRichText(String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ''));
}

export function buildRichTextTemplate(innerHtml) {
  if (typeof innerHtml !== 'string' || !/<[a-z!/]/i.test(innerHtml)) return null;
  const parts = splitTopLevel(innerHtml);
  if (!parts.some(part => part.kind === 'markup')) return null;
  const tokens = [];
  const value = parts.map(part => {
    if (part.kind === 'text') return decodeRichText(part.value);
    const shown = visibleText(part.value);
    const marker = shown.trim() ? shown : `〔内容 ${tokens.length + 1}〕`;
    tokens.push({ marker, html: part.value });
    return marker;
  }).join('');
  return Object.freeze({ value, tokens: Object.freeze(tokens.map(token => Object.freeze(token))) });
}

export function restoreRichText(value, tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return { ok: false, code: 'TEXT_REPLACE_UNSUPPORTED', message: '缺少受保护内容映射' };
  const text = String(value ?? '');
  let cursor = 0;
  let html = '';
  for (const token of tokens) {
    if (!token || typeof token.marker !== 'string' || token.marker.length === 0 || typeof token.html !== 'string') {
      return { ok: false, code: 'TEXT_REPLACE_UNSUPPORTED', message: '受保护内容映射无效' };
    }
    const index = text.indexOf(token.marker, cursor);
    if (index < 0) {
      return { ok: false, code: 'PROTECTED_TEXT', message: `请保留指标原文「${token.marker}」` };
    }
    html += escapeRichText(text.slice(cursor, index)) + token.html;
    cursor = index + token.marker.length;
  }
  html += escapeRichText(text.slice(cursor));
  return { ok: true, html };
}
