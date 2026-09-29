import { fail, isIdentity, record, FROZEN_SCHEMA_VERSION } from './frozen-contract.mjs';
import { assertNoActiveOutbound } from './network-policy.mjs';
import { byteLength, bytesFromBase64, sha256Hex, utf8Bytes } from './bytes.mjs';
import { DEFAULT_BUDGETS, mergeBudgets } from '../runtime/budgets.mjs';

const NODE_KINDS = new Set(['static_element', 'dynamic_region']);
const RESOURCE_TYPES = new Set(['image', 'font', 'style', 'script', 'other']);

function takeDocumentParts(html) {
  const raw = String(html ?? '');
  if (!/<html[\s>]/i.test(raw)) {
    return { html: raw, extraCss: '', extraJs: '' };
  }
  const styles = [...raw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const scripts = [...raw.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  const quotedTag = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
  const kept = [
    ...[...raw.matchAll(new RegExp(`<link\\b${quotedTag}>`, 'gi'))].map((m) => m[0]),
    ...[...raw.matchAll(new RegExp(`<script\\b${quotedTag}\\bsrc=(['"])(.*?)\\1${quotedTag}>\\s*<\\/script>`, 'gi'))].map((m) => m[0]),
  ];
  const body = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const inner = body ? body[1] : raw;
  const stripped = inner
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(new RegExp(`<link\\b${quotedTag}>`, 'gi'), '');
  return { html: `${kept.join('')}${stripped}`, extraCss: styles, extraJs: scripts };
}

const AUTO_MAP_SKIP = new Set([
  'html', 'head', 'body', 'title', 'meta', 'link', 'base', 'style', 'script',
  'template', 'source', 'track', 'col', 'colgroup', 'option',
]);

function nextTagEnd(html, start) {
  let quote = null;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return -1;
}

function skipRawBlock(html, start) {
  if (html.startsWith('<!--', start)) {
    const end = html.indexOf('-->', start + 4);
    return end < 0 ? html.length : end + 3;
  }
  const tagEnd = nextTagEnd(html, start + 1);
  if (tagEnd < 0) return html.length;
  const open = html.slice(start, tagEnd + 1).match(/^<(script|style|template|textarea|title)\b/i);
  if (!open) return null;
  const close = new RegExp('</' + open[1] + '\\s*>', 'i').exec(html.slice(tagEnd + 1));
  return close ? tagEnd + 1 + close.index + close[0].length : html.length;
}

function autoNodeId(tag, start) {
  return `auto_${String(tag).toLowerCase()}_${start}`;
}

/**
 * Give unmarked visible elements a host-owned identity. The source remains
 * self-contained and the id is derived from the original source offset, so
 * later text edits keep the mapping stable through the marker itself.
 */
function annotateGenericElements(html) {
  const raw = String(html ?? '');
  const additions = [];
  const chunks = [];
  let cursor = 0;
  let index = 0;
  while (index < raw.length) {
    const start = raw.indexOf('<', index);
    if (start < 0) break;
    const skipped = skipRawBlock(raw, start);
    if (skipped !== null) {
      index = skipped;
      continue;
    }
    const end = nextTagEnd(raw, start + 1);
    if (end < 0) break;
    const source = raw.slice(start, end + 1);
    const match = source.match(/^<([A-Za-z][A-Za-z0-9:_-]*)([\s\S]*?)>$/);
    if (!match || source.startsWith('</') || source.startsWith('<!') || source.startsWith('<?')) {
      index = end + 1;
      continue;
    }
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? '';
    if (AUTO_MAP_SKIP.has(tag) || /\bdata-shine-(?:node|region)\s*=\s*/i.test(attrs)) {
      index = end + 1;
      continue;
    }
    const nodeId = autoNodeId(tag, start);
    const kind = ['canvas', 'svg', 'video', 'audio', 'iframe'].includes(tag)
      ? 'dynamic_region' : 'static_element';
    const marker = ` data-shine-${kind === 'dynamic_region' ? 'region' : 'node'}="${nodeId}"`;
    const insertAt = source.endsWith('/>') ? source.length - 2 : source.length - 1;
    chunks.push(raw.slice(cursor, start), source.slice(0, insertAt), marker, source.slice(insertAt));
    additions.push({ node_id: nodeId, kind, selector: `[data-shine-${kind === 'dynamic_region' ? 'region' : 'node'}='${nodeId}']` });
    cursor = end + 1;
    index = end + 1;
  }
  if (!additions.length) return { html: raw, nodes: [] };
  chunks.push(raw.slice(cursor));
  return { html: chunks.join(''), nodes: additions };
}

/** Add stable host mappings without rewriting resources or other package fields. */
export function annotateHostMappings(pkg) {
  if (!pkg || typeof pkg !== 'object' || typeof pkg.html !== 'string') return pkg;
  const annotated = annotateGenericElements(pkg.html);
  const existing = Array.isArray(pkg.node_map) ? pkg.node_map : [];
  const known = new Set(existing.map(row => row?.node_id).filter(Boolean));
  return {
    ...pkg,
    html: annotated.html,
    node_map: [...existing, ...annotated.nodes.filter(row => !known.has(row.node_id))],
  };
}

function extractNodeMap(html) {
  const nodes = [];
  const seen = new Set();
  const re = /data-shine-(node|region)\s*=\s*(['"])(.*?)\2/gi;
  let match;
  while ((match = re.exec(html))) {
    const kind = match[1] === 'region' ? 'dynamic_region' : 'static_element';
    const nodeId = match[3];
    if (!isIdentity(nodeId) || seen.has(nodeId)) continue;
    seen.add(nodeId);
    const attr = kind === 'dynamic_region' ? 'data-shine-region' : 'data-shine-node';
    nodes.push({ node_id: nodeId, kind, selector: `[${attr}='${nodeId}']` });
  }
  return nodes;
}

function validateNodeMap(raw, html) {
  if (raw === undefined) return { ok: true, value: extractNodeMap(html) };
  if (!Array.isArray(raw)) return fail('INVALID_PAGE', 'node_map 须为数组');
  const nodes = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!record(entry) || !isIdentity(entry.node_id) || !NODE_KINDS.has(entry.kind)
      || typeof entry.selector !== 'string' || !entry.selector.trim()) {
      return fail('INVALID_PAGE', 'node_map 条目非法');
    }
    if (seen.has(entry.node_id)) return fail('INVALID_PAGE', `重复 node_id: ${entry.node_id}`);
    seen.add(entry.node_id);
    nodes.push({ node_id: entry.node_id, kind: entry.kind, selector: entry.selector.trim() });
  }
  const extracted = extractNodeMap(html);
  for (const node of extracted) {
    if (!seen.has(node.node_id)) {
      seen.add(node.node_id);
      nodes.push(node);
    }
  }
  return { ok: true, value: nodes };
}

async function normalizeResource(raw, budgets) {
  if (!record(raw) || !isIdentity(raw.resource_id) || !RESOURCE_TYPES.has(raw.type)
    || typeof raw.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.sha256)) {
    return fail('INVALID_PAGE', '资源清单条目缺少 resource_id/type/sha256');
  }
  let bytes;
  if (raw.bytes instanceof Uint8Array) bytes = raw.bytes;
  else if (typeof raw.content_base64 === 'string') {
    bytes = bytesFromBase64(raw.content_base64);
    if (!bytes) return fail('INVALID_PAGE', `资源 ${raw.resource_id} 内容不是合法 base64`);
  } else if (typeof raw.text === 'string') bytes = utf8Bytes(raw.text);
  else return fail('INVALID_PAGE', `资源 ${raw.resource_id} 缺少内容`);
  if (bytes.byteLength > budgets.maxResourceBytes) {
    return fail('PACKAGE_TOO_LARGE', `资源 ${raw.resource_id} 超过单文件额度`);
  }
  const digest = await sha256Hex(bytes);
  if (digest !== raw.sha256) {
    return fail('RESOURCE_HASH_MISMATCH', `资源 ${raw.resource_id} 内容与 hash 不一致`);
  }
  return {
    ok: true,
    value: {
      resource_id: raw.resource_id,
      type: raw.type,
      sha256: digest,
      size: bytes.byteLength,
      mime: safeMime(raw.mime, defaultMime(raw.type)),
      preview: raw.preview === true,
      actor_id: isIdentity(raw.actor_id) ? raw.actor_id : null,
      bytes,
    },
  };
}

function defaultMime(type) {
  if (type === 'image') return 'image/png';
  if (type === 'font') return 'font/woff2';
  if (type === 'style') return 'text/css';
  if (type === 'script') return 'text/javascript';
  return 'application/octet-stream';
}

function safeMime(value, fallback) {
  if (typeof value !== 'string' || !value) return fallback;
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(value)) return fallback;
  return value;
}

/**
 * Normalize a free-page source package. Failure does not mutate the input.
 * BoardSpec component catalogs are not a generation whitelist.
 */
export async function normalizePagePackage(raw, options = {}) {
  const budgets = mergeBudgets(options.budgets ?? DEFAULT_BUDGETS);
  if (!record(raw)) return fail('INVALID_PAGE', '页面包必须是对象');
  if (raw.schema_version !== undefined && raw.schema_version !== FROZEN_SCHEMA_VERSION) {
    return fail('INVALID_PAGE', '不支持的页面包 schema_version');
  }
  if (typeof raw.html !== 'string' || typeof raw.css !== 'string' || typeof raw.js !== 'string') {
    return fail('INVALID_PAGE', 'html/css/js 必须是字符串');
  }
  if (byteLength(raw.html) > budgets.maxHtmlBytes || byteLength(raw.css) > budgets.maxCssBytes
    || byteLength(raw.js) > budgets.maxJsBytes) {
    return fail('PACKAGE_TOO_LARGE', '源码超过页面额度');
  }
  if (!Array.isArray(raw.resources)) return fail('INVALID_PAGE', 'resources 须为数组');
  if (raw.resources.length > budgets.maxResourceCount) {
    return fail('PACKAGE_TOO_LARGE', '资源数量超过额度');
  }
  const resources = [];
  const ids = new Set();
  let total = 0;
  for (const item of raw.resources) {
    const got = await normalizeResource(item, budgets);
    if (!got.ok) return got;
    if (ids.has(got.value.resource_id)) return fail('INVALID_PAGE', `重复 resource_id: ${got.value.resource_id}`);
    ids.add(got.value.resource_id);
    total += got.value.size;
    if (total > budgets.maxResourcesTotalBytes) return fail('PACKAGE_TOO_LARGE', '资源合计超过额度');
    resources.push(got.value);
  }
  const outbound = assertNoActiveOutbound(raw.html, raw.css, raw.js, ids);
  if (!outbound.ok) return outbound;
  const parts = takeDocumentParts(raw.html);
  const html = parts.html;
  const css = parts.extraCss ? `${raw.css}\n${parts.extraCss}` : raw.css;
  const js = parts.extraJs ? `${raw.js}\n${parts.extraJs}` : raw.js;
  if (byteLength(html) + byteLength(css) + byteLength(js) > budgets.maxSourceBytes) {
    return fail('PACKAGE_TOO_LARGE', '源码合计超过页面额度');
  }
  const outboundAfter = assertNoActiveOutbound(html, css, js, ids);
  if (!outboundAfter.ok) return outboundAfter;
  const annotated = annotateGenericElements(html);
  if (byteLength(annotated.html) + byteLength(css) + byteLength(js) > budgets.maxSourceBytes) {
    return fail('PACKAGE_TOO_LARGE', '元素映射标记使源码超过页面额度');
  }
  const nodes = validateNodeMap(raw.node_map, annotated.html);
  if (!nodes.ok) return nodes;
  const allNodes = [...nodes.value, ...annotated.nodes.filter(row => !nodes.value.some(item => item.node_id === row.node_id))];
  if (allNodes.length > budgets.maxNodeMap) return fail('PACKAGE_TOO_LARGE', '节点映射超过额度');
  return {
    ok: true,
    value: {
      schema_version: FROZEN_SCHEMA_VERSION,
      html: annotated.html,
      css,
      js,
      resources: resources.map((row) => ({
        resource_id: row.resource_id,
        type: row.type,
        sha256: row.sha256,
        size: row.size,
        mime: row.mime,
        preview: row.preview,
        actor_id: row.actor_id,
        bytes: row.bytes,
      })),
      node_map: allNodes,
    },
  };
}
