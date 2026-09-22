/**
 * Apply a confirmed presentation overlay to a preview copy.
 * The input HTML string is not a mutable buffer; the returned string is a new copy.
 * Nested elements of the same tag are matched by depth, the same way the source index does.
 */
import { closeTagRange, isVoidHtmlTag } from '../free-page/source-index/parse.mjs';

const STYLE_KEY = /^[a-z-]{1,40}$/;
const ATTR_KEY = /^[a-zA-Z_:][a-zA-Z0-9_:-]{0,40}$/;

function escapeText(value) {
  return String(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function escapeAttr(value) {
  return String(value).replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char]));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findRegion(html, nodeId) {
  const pattern = new RegExp(
    `<([A-Za-z][\\w:-]*)([^>]*\\sdata-shine-(?:node|region)\\s*=\\s*(["'])${escapeRegExp(nodeId)}\\3[^>]*)(\\s*\\/?)>`,
    'i',
  );
  const open = pattern.exec(html);
  if (!open) return null;
  const tag = open[1];
  const start = open.index;
  const openEnd = start + open[0].length;
  if (open[4] === '/' || isVoidHtmlTag(tag)) {
    return { tag, start, openEnd, closeStart: openEnd, end: openEnd, attrs: open[2] };
  }
  const closed = closeTagRange(html, tag, openEnd);
  if (!closed) return null;
  return { tag, start, openEnd, closeStart: closed.inner_end, end: closed.end, attrs: open[2] };
}

function mergeStyle(attrs, style) {
  const text = Object.entries(style).flatMap(([key, value]) => {
    if (!STYLE_KEY.test(key) || typeof value !== 'string') return [];
    if (/expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:/i.test(value)) return [];
    return [`${key}: ${escapeAttr(value)}`];
  }).join('; ');
  if (!text) return attrs;
  if (/\sstyle\s*=/.test(attrs)) {
    return attrs.replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/i, ` style="${text}"`);
  }
  return `${attrs} style="${text}"`;
}

function mergeAttributes(attrs, attributes) {
  let next = attrs;
  for (const [key, value] of Object.entries(attributes)) {
    const lowered = key.toLowerCase();
    if (!ATTR_KEY.test(key) || lowered.startsWith('on') || lowered === 'style'
      || lowered === 'data-shine-node' || lowered === 'data-shine-region' || typeof value !== 'string') continue;
    if (/javascript:/i.test(value)) continue;
    const safe = escapeAttr(value);
    const existing = new RegExp(`\\s${escapeRegExp(key)}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'i');
    if (existing.test(next)) next = next.replace(existing, ` ${key}="${safe}"`);
    else next += ` ${key}="${safe}"`;
  }
  return next;
}

function rangeRegion(html, node) {
  const range = node?.source_range;
  if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.end <= range.start) return null;
  if (range.end > html.length) return null;
  const outer = html.slice(range.start, range.end);
  const open = /^<([A-Za-z][\w:-]*)([^>]*)>/.exec(outer);
  if (!open) return null;
  const tag = open[1];
  const openEnd = range.start + open[0].length;
  const closed = isVoidHtmlTag(tag) || /\/\s*>$/.test(open[0])
    ? { inner_end: openEnd, end: openEnd }
    : closeTagRange(html, tag, openEnd);
  if (!closed || closed.end !== range.end) return null;
  return { tag, start: range.start, openEnd, closeStart: closed.inner_end, end: closed.end, attrs: open[2] };
}

function paint(html, region, overlay) {
  let attrs = region.attrs;
  if (overlay.style && typeof overlay.style === 'object') attrs = mergeStyle(attrs, overlay.style);
  if (overlay.attributes && typeof overlay.attributes === 'object') attrs = mergeAttributes(attrs, overlay.attributes);
  const open = `<${region.tag}${attrs}>`;
  const inner = overlay.text != null ? escapeText(overlay.text) : html.slice(region.openEnd, region.closeStart);
  const close = html.slice(region.closeStart, region.end);
  return html.slice(0, region.start) + open + inner + close + html.slice(region.end);
}

export function applyPresentationOverlay(html, overlays, nodes = []) {
  if (typeof html !== 'string' || !overlays || typeof overlays !== 'object' || Array.isArray(overlays)) return html;
  const byId = new Map((Array.isArray(nodes) ? nodes : []).map(node => [node?.node_id, node]));
  const ranged = [];
  const marked = [];
  for (const [nodeId, overlay] of Object.entries(overlays)) {
    if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) continue;
    const marker = findRegion(html, nodeId);
    if (marker) {
      marked.push({ nodeId, overlay });
      continue;
    }
    const region = rangeRegion(html, byId.get(nodeId));
    if (region) ranged.push({ region, overlay });
  }
  const kept = ranged.filter(job => !ranged.some(other => other !== job
    && other.overlay.text != null
    && other.region.start <= job.region.start
    && other.region.end >= job.region.end));
  kept.sort((left, right) => right.region.start - left.region.start);
  let next = html;
  for (const job of kept) next = paint(next, job.region, job.overlay);
  for (const job of marked) {
    const region = findRegion(next, job.nodeId);
    if (region) next = paint(next, region, job.overlay);
  }
  return next;
}
