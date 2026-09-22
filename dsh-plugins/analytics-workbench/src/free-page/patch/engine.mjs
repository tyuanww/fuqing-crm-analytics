/**
 * Three-channel structured patch engine.
 *
 * presentation writes an overlay and leaves source bytes untouched.
 * source splices one verified HTML region.
 * logic is denied unless channel:logic is present, and bound nodes stay denied
 * unless node:bound is also present. Preview functions do not write a version.
 *
 * T2 seam: region bounds come from the source index while the sidecar flag is
 * off, and from the production node graph when the flag is on or smoke.
 */
import { sha256Hex } from '../hash.mjs';
import { buildSourceIndex, locateSelection } from '../source-index/index.mjs';
import { byteRegionHash, packageSourceHash } from '../source-index/node-graph.mjs';
import { openSidecarGraph, readSidecarFlag } from '../runtime/sidecar-flag.mjs';
import { analyzeImpact } from './impact.mjs';
import { adaptEditOperation, T1_SEAM } from '../edit/contract-adapter.mjs';

export { T1_SEAM };

/** Mirrors backend/contracts/page_documents.py size limits. Node cannot import that module. */
export const HTML_MAX_CHARS = 1_048_576;
export const STYLE_MAX_CHARS = 524_288;
export const PACKAGE_MAX_BYTES = 2_000_000;

const CHANNEL_CAPABILITY = Object.freeze({
  presentation: 'edit:presentation',
  source: 'edit:source',
  logic: 'edit:logic',
});
const RECOVERY = Object.freeze(['redownload', 'reselect', 'reapply']);
const DANGEROUS = /<\s*(script|iframe|object|embed)\b|javascript\s*:|vbscript\s*:|\bon[a-z]+\s*=|<\s*meta\b[^>]*http-equiv|<\s*link\b[^>]*rel\s*=\s*["']?import|eval\s*\(|new\s+Function|document\s*\.\s*(write|cookie)\b|expression\s*\(/i;
const OVERLAY_KEYS = new Set(['text', 'style', 'attributes']);
const STYLE_KEY = /^[a-z-]{1,40}$/;
const ATTR_KEY = /^[a-zA-Z_:][a-zA-Z0-9_:-]{0,40}$/;

const CODES = Object.freeze({
  VERSION_CONFLICT: { code: 'VERSION_CONFLICT', http: 409 },
  HASH_MISMATCH: { code: 'HASH_MISMATCH', http: 409 },
  SCOPE_VIOLATION: { code: 'SCOPE_VIOLATION', http: 422 },
  CAPABILITY_DENIED: { code: 'CAPABILITY_DENIED', http: 403 },
  BOUND_NODE: { code: 'BOUND_NODE', http: 403 },
  EMPTY_PATCH: { code: 'EMPTY_PATCH', http: 422 },
  INVALID_EDIT: { code: 'INVALID_EDIT', http: 422 },
  DANGEROUS_CONTENT: { code: 'DANGEROUS_CONTENT', http: 422 },
  PACKAGE_TOO_LARGE: { code: 'PACKAGE_TOO_LARGE', http: 413 },
  MAPPING_STALE: { code: 'MAPPING_STALE', http: 409 },
  IDEMPOTENCY_CONFLICT: { code: 'IDEMPOTENCY_CONFLICT', http: 409 },
  CAS_CONFLICT: { code: 'CAS_CONFLICT', http: 409 },
  FORBIDDEN: { code: 'FORBIDDEN', http: 403 },
  INVALID_EDIT_CONTEXT: { code: 'INVALID_EDIT_CONTEXT', http: 422 },
  INVALID_CAS: { code: 'INVALID_CAS', http: 422 },
  EDIT_EXPIRED: { code: 'EDIT_EXPIRED', http: 409 },
  NOT_FOUND: { code: 'NOT_FOUND', http: 404 },
  LOGIC_REGION_UNAVAILABLE: { code: 'LOGIC_REGION_UNAVAILABLE', http: 422 },
});

const PARSER_CODES = new Set([
  'PACKAGE_TOO_LARGE', 'CAPABILITY_DENIED', 'VERSION_CONFLICT', 'CAS_CONFLICT',
  'MAPPING_STALE', 'IDEMPOTENCY_CONFLICT', 'FORBIDDEN', 'HASH_MISMATCH',
  'SCOPE_VIOLATION', 'INVALID_EDIT', 'INVALID_EDIT_CONTEXT', 'INVALID_CAS',
  'EDIT_EXPIRED',
]);

function fail(code, extra = {}) {
  const error = CODES[code] ?? CODES.INVALID_EDIT;
  const recovery = code === 'VERSION_CONFLICT' || code === 'HASH_MISMATCH' ? RECOVERY : undefined;
  return Object.freeze({ ok: false, error: Object.freeze({ ...error }), ...(recovery ? { recovery } : {}), ...extra });
}

function utf8Length(value) {
  return new TextEncoder().encode(value).byteLength;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function singleRange(ranges) {
  if (!ranges?.length) return null;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  let start = sorted[0].start;
  let end = sorted[0].end;
  for (const range of sorted.slice(1)) {
    if (range.start > end) return null;
    end = Math.max(end, range.end);
  }
  return { start, end };
}

function bindingFromSourceIndex(pagePackage, selector) {
  let index;
  try {
    index = buildSourceIndex(pagePackage);
  } catch {
    return fail('MAPPING_STALE', { reason: 'index' });
  }
  const located = locateSelection(index, { kind: selector?.kind, node_id: selector?.node_id });
  if (!located.ok) return fail('MAPPING_STALE', { reason: located.reason ?? 'locate' });
  const node = located.node;
  const html = pagePackage.html ?? '';
  const js = pagePackage.js ?? '';
  const outer = html.slice(node.html_range.start, node.html_range.end);
  const jsRange = singleRange(node.js_ranges);
  return Object.freeze({
    ok: true,
    located,
    index,
    outer,
    source_hash: packageSourceHash(pagePackage),
    region_hash: byteRegionHash(outer),
    logic_source_hash: packageSourceHash(pagePackage),
    logic_region_hash: jsRange ? byteRegionHash(js.slice(jsRange.start, jsRange.end)) : null,
    js_range: jsRange,
    catalog: 'source-index',
  });
}

function bindingFromGraph(pagePackage, graph, selector) {
  const nodeId = selector?.node_id;
  let record = null;
  let projected = null;
  for (const candidate of graph.node_list) {
    const next = graph.toEditNodeRef(candidate);
    if (next.ok && next.value.node_id === nodeId) {
      record = candidate;
      projected = next;
      break;
    }
  }
  const range = record?.source_range;
  if (!projected?.ok || !range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.end < range.start) {
    return fail('MAPPING_STALE', { reason: projected?.code || 'graph' });
  }
  const html = pagePackage.html ?? '';
  const js = pagePackage.js ?? '';
  const outer = html.slice(range.start, range.end);
  const nodes = {};
  for (const candidate of graph.node_list) {
    const next = graph.toEditNodeRef(candidate);
    if (next.ok) nodes[next.value.node_id] = { node_id: next.value.node_id };
  }
  let jsRange = null;
  try {
    const sourceIndex = buildSourceIndex(pagePackage);
    const located = locateSelection(sourceIndex, { kind: selector?.kind, node_id: nodeId });
    if (located.ok) jsRange = singleRange(located.node.js_ranges);
  } catch {
    jsRange = null;
  }
  return Object.freeze({
    ok: true,
    located: Object.freeze({
      ok: true,
      node: Object.freeze({
        kind: projected.value.kind,
        node_id: projected.value.node_id,
        html_range: Object.freeze({
          start: range.start,
          end: range.end,
          inner_start: range.inner_start,
          inner_end: range.inner_end,
        }),
        js_ranges: jsRange ? [jsRange] : [],
        mapping_token: projected.value.mapping_token,
      }),
    }),
    index: Object.freeze({ nodes: Object.freeze(nodes) }),
    outer,
    source_hash: packageSourceHash(pagePackage),
    region_hash: byteRegionHash(outer),
    logic_source_hash: packageSourceHash(pagePackage),
    logic_region_hash: jsRange ? byteRegionHash(js.slice(jsRange.start, jsRange.end)) : null,
    js_range: jsRange,
    catalog: 'node-graph',
  });
}

export function selectionBinding(pagePackage, selector, options = {}) {
  const mode = readSidecarFlag(options.env, options.flag);
  if (mode === 'off') return bindingFromSourceIndex(pagePackage, selector);
  let opened;
  try {
    opened = openSidecarGraph(pagePackage, {
      page_id: selector?.page_id || options.pageId,
      flag: mode,
      env: options.env,
    });
  } catch {
    return fail('MAPPING_STALE', { reason: 'graph' });
  }
  if (!opened.ok) return fail('MAPPING_STALE', { reason: opened.code || 'graph' });
  return bindingFromGraph(pagePackage, opened.graph, selector);
}

function nodeIsBound(binding, nodeId) {
  const bindings = Array.isArray(binding?.bindings) ? binding.bindings : [];
  if (bindings.some(row => row?.node_id === nodeId)) return true;
  const refs = Array.isArray(binding?.result_refs) ? binding.result_refs : [];
  return refs.length > 0 && bindings.every(row => !row?.node_id);
}

function dangerous(value) {
  return typeof value === 'string' && DANGEROUS.test(value);
}

function overlayFrom(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('INVALID_EDIT', { reason: 'overlay' });
  if (Object.keys(payload).some(key => !OVERLAY_KEYS.has(key))) return fail('INVALID_EDIT', { reason: 'overlay_key' });
  const overlay = {};
  if (payload.text != null) {
    if (typeof payload.text !== 'string') return fail('INVALID_EDIT', { reason: 'text' });
    if (dangerous(payload.text)) return fail('DANGEROUS_CONTENT');
    if (payload.text.length) overlay.text = payload.text;
  }
  if (payload.style != null) {
    if (!payload.style || typeof payload.style !== 'object' || Array.isArray(payload.style)) return fail('INVALID_EDIT', { reason: 'style' });
    const style = {};
    for (const [key, value] of Object.entries(payload.style)) {
      if (!STYLE_KEY.test(key) || typeof value !== 'string' || dangerous(value)) {
        return dangerous(value) || dangerous(key) ? fail('DANGEROUS_CONTENT') : fail('INVALID_EDIT', { reason: 'style' });
      }
      style[key] = value;
    }
    overlay.style = style;
  }
  if (payload.attributes != null) {
    if (!payload.attributes || typeof payload.attributes !== 'object' || Array.isArray(payload.attributes)) {
      return fail('INVALID_EDIT', { reason: 'attributes' });
    }
    const attributes = {};
    for (const [key, value] of Object.entries(payload.attributes)) {
      const lowered = key.toLowerCase();
      if (!ATTR_KEY.test(key) || lowered.startsWith('on') || lowered === 'data-shine-node' || lowered === 'data-shine-region'
        || typeof value !== 'string' || dangerous(value) || dangerous(key)) {
        return dangerous(value) || dangerous(key) || lowered.startsWith('on') ? fail('DANGEROUS_CONTENT') : fail('INVALID_EDIT', { reason: 'attributes' });
      }
      attributes[key] = value;
    }
    overlay.attributes = attributes;
  }
  if (!Object.keys(overlay).length) return fail('EMPTY_PATCH');
  return { ok: true, overlay };
}

function packageBytes(html, css, js) {
  return utf8Length(html) + utf8Length(css) + utf8Length(js);
}

function sameJson(a, b) {
  return stable(a ?? null) === stable(b ?? null);
}

const BYTE_ACTIONS = new Set(['insert', 'update', 'delete', 'move', 'replace']);

function rangeContains(outer, inner) {
  return inner && Number.isInteger(inner.start) && Number.isInteger(inner.end)
    && inner.start >= outer.start && inner.end <= outer.end && inner.end >= inner.start;
}

function applyBytes(source, operation) {
  const { start, end } = operation.splice;
  const payload = typeof operation.payload === 'string' ? operation.payload : '';
  if (operation.action === 'delete') return source.slice(0, start) + source.slice(end);
  if (operation.action === 'insert') return source.slice(0, start) + payload + source.slice(start);
  if (operation.action === 'move') {
    const removed = end - start;
    const base = source.slice(0, start) + source.slice(end);
    const dest = operation.destination.start >= end ? operation.destination.start - removed : operation.destination.start;
    return base.slice(0, dest) + payload + base.slice(dest);
  }
  return source.slice(0, start) + payload + source.slice(end);
}

function executeBody(input, operation) {
  const pagePackage = input.pagePackage;
  if (!pagePackage || typeof pagePackage.html !== 'string') return fail('INVALID_EDIT', { reason: 'package' });
  const channel = operation.channel;
  if (!BYTE_ACTIONS.has(operation.action)) return fail('INVALID_EDIT', { reason: 'unsupported_action' });
  if (channel === 'logic' && operation.encoding !== 'bytes') return fail('INVALID_EDIT', { reason: 'logic_encoding' });
  if (!Number.isSafeInteger(input.headVersion) || input.headVersion < 1) return fail('INVALID_EDIT', { reason: 'head' });
  if (operation.cas.base_version !== input.headVersion) {
    return fail('VERSION_CONFLICT');
  }
  if (operation.node.source_hash !== operation.cas.source_hash || operation.node.region_hash !== operation.cas.region_hash) {
    return fail('INVALID_EDIT', { reason: 'cas_node_mismatch' });
  }

  const binding = selectionBinding(pagePackage, {
    kind: operation.node.kind,
    node_id: operation.node.node_id,
    page_id: operation.node.page_id,
  }, { flag: input.flag, env: input.env });
  if (!binding.ok) return binding;
  if (input.selectedNodeId !== operation.node.node_id) return fail('SCOPE_VIOLATION');
  if (binding.located.node.kind !== operation.node.kind) return fail('SCOPE_VIOLATION');

  const capabilities = new Set(Array.isArray(input.capabilities) ? input.capabilities : []);
  if (nodeIsBound(input.binding, operation.node.node_id) && !capabilities.has('node:bound')) {
    return fail('BOUND_NODE');
  }
  if (!capabilities.has(CHANNEL_CAPABILITY[channel])) return fail('CAPABILITY_DENIED');

  const html = pagePackage.html;
  const css = pagePackage.css ?? '';
  const js = pagePackage.js ?? '';
  if (channel === 'logic' && !binding.js_range) return fail('LOGIC_REGION_UNAVAILABLE');
  const expectedSource = channel === 'logic' ? binding.logic_source_hash : binding.source_hash;
  const expectedRegion = channel === 'logic' ? binding.logic_region_hash : binding.region_hash;
  if (operation.node.source_hash !== expectedSource || operation.node.region_hash !== expectedRegion) {
    return fail('HASH_MISMATCH');
  }

  let overlay = null;
  let clearOverlay = false;
  let nextHtml = html;
  let nextJs = js;
  if (channel === 'presentation') {
    const current = pagePackage.presentation_overlays?.[operation.node.node_id] ?? null;
    if (operation.action === 'delete') {
      if (!current) return fail('EMPTY_PATCH');
      clearOverlay = true;
    } else {
      const built = overlayFrom(operation.payload);
      if (!built.ok) return built;
      overlay = operation.action === 'insert' ? { ...(current ?? {}), ...built.overlay } : built.overlay;
      if (sameJson(current, overlay)) return fail('EMPTY_PATCH');
      if (utf8Length(stable(overlay)) > HTML_MAX_CHARS) return fail('PACKAGE_TOO_LARGE');
    }
  } else if (channel === 'source' || channel === 'logic') {
    const locatedRange = channel === 'logic' ? binding.js_range : binding.located.node.html_range;
    const source = channel === 'logic' ? js : html;
    const slice = source.slice(locatedRange.start, locatedRange.end);
    if (!rangeContains(locatedRange, operation.splice)) return fail('SCOPE_VIOLATION');
    if (operation.action === 'replace'
      && (operation.splice.start !== locatedRange.start || operation.splice.end !== locatedRange.end)) {
      return fail('SCOPE_VIOLATION');
    }
    if (typeof operation.payload === 'string' && dangerous(operation.payload)) return fail('DANGEROUS_CONTENT');
    const next = applyBytes(source, operation);
    if (next === source) return fail('EMPTY_PATCH');
    if (channel === 'logic') {
      const otherIds = Object.keys(binding.index.nodes).filter(id => id !== operation.node.node_id);
      if (typeof operation.payload === 'string' && otherIds.some(id => operation.payload.includes(id) && !slice.includes(id))) {
        return fail('SCOPE_VIOLATION');
      }
      if (operation.action !== 'delete' && slice.includes(operation.node.node_id) && !next.includes(operation.node.node_id)) {
        return fail('SCOPE_VIOLATION');
      }
      nextJs = next;
      if (!nextJs.startsWith(js.slice(0, locatedRange.start)) || !nextJs.endsWith(js.slice(locatedRange.end))) {
        return fail('SCOPE_VIOLATION');
      }
      if (nextJs.length > STYLE_MAX_CHARS || packageBytes(html, css, nextJs) > PACKAGE_MAX_BYTES) return fail('PACKAGE_TOO_LARGE');
    } else {
      nextHtml = next;
      const { start, end } = locatedRange;
      if (!nextHtml.startsWith(html.slice(0, start)) || !nextHtml.endsWith(html.slice(end))) return fail('SCOPE_VIOLATION');
      if (nextHtml.length > HTML_MAX_CHARS || packageBytes(nextHtml, css, js) > PACKAGE_MAX_BYTES) return fail('PACKAGE_TOO_LARGE');
    }
  }

  const proposed = {
    html: nextHtml,
    css,
    js: nextJs,
    resources: pagePackage.resources ?? [],
    node_map: pagePackage.node_map ?? [],
  };
  let impact;
  if (channel === 'presentation') {
    impact = Object.freeze({
      scope: binding.located.scope,
      channel,
      html_changed_nodes: Object.freeze([]),
      foreign_html_nodes: Object.freeze([]),
      html_outside_selection: false,
      source_bytes_unchanged: true,
      affected_nodes: Object.freeze([operation.node.node_id]),
      expanded: false,
    });
  } else if (binding.catalog === 'node-graph') {
    impact = Object.freeze({
      scope: binding.located.scope ?? 'exact_source_range',
      channel,
      html_changed_nodes: Object.freeze([operation.node.node_id]),
      foreign_html_nodes: Object.freeze([]),
      html_outside_selection: false,
      source_bytes_unchanged: nextHtml === html && nextJs === js,
      affected_nodes: Object.freeze([operation.node.node_id]),
      expanded: false,
    });
  } else {
    impact = analyzeImpact(binding.index, binding.located, proposed);
    if (impact.html_outside_selection || impact.foreign_html_nodes.length) return fail('SCOPE_VIOLATION', { impact });
  }

  const preview = Object.freeze({
    preview_id: `preview_${sha256Hex(stable(operation)).slice(0, 24)}`,
    channel,
    node_id: operation.node.node_id,
    base_version: input.headVersion,
    idempotency_key: operation.cas.idempotency_key,
    source_bytes_unchanged: nextHtml === html && nextJs === js && css === (pagePackage.css ?? ''),
    html_bytes_unchanged: nextHtml === html,
    overlay,
    clear_overlay: clearOverlay,
    package: Object.freeze({ ...proposed }),
    impact,
  });
  return { ok: true, preview };
}

export function previewStructuredPatch(input) {
  const adapted = adaptEditOperation(input?.operation);
  if (!adapted.ok) {
    const code = PARSER_CODES.has(adapted.error?.code) ? adapted.error.code : 'INVALID_EDIT';
    return fail(code, { reason: adapted.reason });
  }
  const operation = adapted.value;
  const digest = sha256Hex(stable(operation));
  const replay = input.replay;
  const idempotencyKey = operation.cas.idempotency_key;
  if (replay?.has(idempotencyKey)) {
    const prior = replay.get(idempotencyKey);
    if (prior.digest !== digest) return fail('IDEMPOTENCY_CONFLICT');
    return Object.freeze({ ...prior.result, replayed: true, receipt_pending: prior.acked !== true });
  }
  const executed = executeBody(input, operation);
  const result = executed.ok
    ? Object.freeze({ ...executed, replayed: false, receipt_pending: true })
    : Object.freeze({ ...executed, replayed: false, receipt_pending: false });
  if (replay) replay.set(idempotencyKey, { digest, result, acked: false });
  return result;
}

export function commitWorkingCopy(pagePackage, preview) {
  if (!preview?.channel || !pagePackage) return fail('INVALID_EDIT');
  if (preview.channel === 'presentation') {
    const presentation_overlays = { ...(pagePackage.presentation_overlays ?? {}) };
    if (preview.clear_overlay) delete presentation_overlays[preview.node_id];
    else presentation_overlays[preview.node_id] = preview.overlay;
    return Object.freeze({
      ok: true,
      source_bytes_unchanged: true,
      html_bytes_unchanged: true,
      package: Object.freeze({
        html: pagePackage.html,
        css: pagePackage.css ?? '',
        js: pagePackage.js ?? '',
        resources: pagePackage.resources ?? [],
        node_map: pagePackage.node_map ?? [],
      }),
      presentation_overlays,
    });
  }
  const htmlSame = preview.package.html === pagePackage.html;
  const cssSame = preview.package.css === (pagePackage.css ?? '');
  const jsSame = preview.package.js === (pagePackage.js ?? '');
  return Object.freeze({
    ok: true,
    source_bytes_unchanged: htmlSame && cssSame && jsSame,
    html_bytes_unchanged: htmlSame,
    package: preview.package,
    presentation_overlays: pagePackage.presentation_overlays ?? {},
  });
}

export function createStructuredPatchSession() {
  const replay = new Map();
  return {
    execute(input) {
      return previewStructuredPatch({ ...input, replay });
    },
    acknowledge(key) {
      const prior = replay.get(key);
      if (!prior) return fail('NOT_FOUND');
      prior.acked = true;
      return Object.freeze({ ...prior.result, replayed: true, receipt_pending: false });
    },
    recover(key) {
      const prior = replay.get(key);
      if (!prior) return fail('NOT_FOUND');
      return Object.freeze({ ...prior.result, replayed: true, recovered: true, receipt_pending: prior.acked !== true });
    },
  };
}
