/**
 * Sidecar node graph for free HTML pages.
 *
 * The graph stays outside the page package. Nothing here writes markers back
 * into `html`, so historical bytes remain the source of truth. Runtime-only
 * identities (template instance, dynamic instance, temporary, deleted) live in
 * the same sidecar and can be dropped when the preview is disposed.
 *
 * `data-shine-node` / `data-shine-region` are locator hints. They are not
 * credentials: a marker becomes authoritative only when node_map declares the
 * same id and kind. Identity is a hash of page, anchor kind, anchor id,
 * occurrence and structural path — not the DOM text and not a CSS selector.
 *
 * `toEditNodeRef` projects a sidecar record onto the T1 NodeRef:
 * page_id, node_id, kind, selector or source_range, mapping_token,
 * source_hash, region_hash. Channel stays on EditOperation, not on NodeRef.
 * This module does not import the contract package.
 */
import { sha256Hex } from '../hash.mjs';
import { pageIdentity } from './index.mjs';
import { scanHtmlElements, scanShineMarkers } from './parse.mjs';

export const NODE_GRAPH_SCHEMA_VERSION = 'free-page-node-graph/v1';
export const NODE_REF_KINDS = Object.freeze([
  'source', 'template_instance', 'dynamic_instance', 'temporary',
]);
/** Markers never authorize an edit by themselves. */
export const MARKER_IS_CREDENTIAL = false;
export const NODE_GRAPH_BUDGETS = Object.freeze({
  nodes2k: 2000,
  nodes10k: 10000,
  build2kMs: 800,
  build10kMs: 2500,
  batchMs: 32,
  maxNodes: 10000,
  maxBatchRecords: 2000,
  maxFanout: 10000,
});

const STATIC = 'static_element';
const REGION = 'dynamic_region';
const IDENTITY = /^[A-Za-z0-9_.:-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EDIT_CHANNELS = new Set(['presentation', 'source', 'logic']);
const SKIP_TAGS = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta']);

function frozen(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  return Object.freeze(value);
}

function normalizeKey(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 512);
}

function identityText(value, fallback = '') {
  return String(value ?? fallback);
}

function pageKeyFor(pagePackage, pageId, sourceHash) {
  const supplied = normalizeKey(pageId || pagePackage?.page_id || pagePackage?.pageId);
  return pageIdentity(supplied) ? supplied : `package-${sourceHash.slice(0, 24)}`;
}

export function packageSourceHash(pagePackage) {
  const html = pagePackage?.html ?? '';
  const css = pagePackage?.css ?? '';
  const js = pagePackage?.js ?? '';
  return sha256Hex(`html:${html}\0css:${css}\0js:${js}`);
}

/** SHA-256 of the actual region bytes. Identical bytes share a hash; identity does not. */
export function byteRegionHash(text) {
  return sha256Hex(typeof text === 'string' ? text : '');
}

function nodeRefId(prefix, ...parts) {
  const digest = sha256Hex(parts.map(part => String(part ?? '')).join('\0')).slice(0, 32);
  return `${prefix}:${digest}`;
}

function regionHashFor({ sourceHash, anchorKind, anchorId, occurrence, range, identity }) {
  if (range && typeof range.outer_text === 'string') {
    return sha256Hex([
      'region', sourceHash, anchorKind, anchorId, occurrence, range.start, range.end, range.outer_text,
    ].join('\0'));
  }
  return sha256Hex(`region:missing:${sourceHash}:${anchorKind}:${anchorId}:${occurrence}:${identity || ''}`);
}

function sourceRef({ pageId, anchorId, attr, occurrence = 0, path = '', sourceHash = '', kind = STATIC, regionHash = '' }) {
  const normalizedAnchor = normalizeKey(anchorId);
  const anchorKind = attr === 'region' || kind === REGION ? 'region' : 'node';
  const identity = nodeRefId(
    'src',
    pageId,
    anchorKind,
    identityText(anchorId),
    occurrence,
    identityText(path),
  );
  const hash = regionHash || regionHashFor({
    sourceHash, anchorKind, anchorId: normalizedAnchor, occurrence, range: null, identity,
  });
  return frozen({
    schema_version: NODE_GRAPH_SCHEMA_VERSION,
    identity,
    node_ref: identity,
    kind: 'source',
    page_id: pageId,
    anchor_id: normalizedAnchor,
    anchor_kind: anchorKind,
    occurrence,
    source_hash: sourceHash,
    region_hash: hash,
    source_path: path || null,
    marker_is_credential: MARKER_IS_CREDENTIAL,
  });
}

/** A stable identity for a source node, independent of runtime DOM objects. */
export function createSourceNodeRef(options = {}) {
  return sourceRef(options);
}

export function createTemplateInstanceRef({ templateRef, template_id, instanceKey, instance_key, occurrence = 0 } = {}) {
  const parent = typeof templateRef === 'string'
    ? templateRef
    : templateRef?.identity || templateRef?.node_ref || template_id;
  const key = normalizeKey(instanceKey ?? instance_key, `instance-${occurrence}`);
  if (!parent) throw new Error('templateRef or template_id required');
  const identity = nodeRefId('tpl', parent, key, occurrence);
  return frozen({
    schema_version: NODE_GRAPH_SCHEMA_VERSION,
    identity,
    node_ref: identity,
    kind: 'template_instance',
    template_ref: parent,
    instance_key: key,
    occurrence,
    source_range: null,
    marker_is_credential: MARKER_IS_CREDENTIAL,
  });
}

export function createDynamicInstanceRef({ dynamicRef, dynamic_id, instanceKey, instance_key, generation = 0 } = {}) {
  const parent = typeof dynamicRef === 'string'
    ? dynamicRef
    : dynamicRef?.identity || dynamicRef?.node_ref || dynamic_id;
  const key = normalizeKey(instanceKey ?? instance_key, `dynamic-${generation}`);
  if (!parent) throw new Error('dynamicRef or dynamic_id required');
  const identity = nodeRefId('dyn', parent, key, generation);
  return frozen({
    schema_version: NODE_GRAPH_SCHEMA_VERSION,
    identity,
    node_ref: identity,
    kind: 'dynamic_instance',
    dynamic_ref: parent,
    instance_key: key,
    generation,
    source_range: null,
    marker_is_credential: MARKER_IS_CREDENTIAL,
  });
}

export function createTemporaryNodeRef({ sessionId, session_id, key, seed, counter = 0 } = {}) {
  const session = normalizeKey(sessionId ?? session_id, 'session');
  const temporaryKey = normalizeKey(key, `temporary-${counter}`);
  const identity = seed
    ? nodeRefId('tmp', session, seed, counter)
    : nodeRefId('tmp', session, temporaryKey, counter);
  return frozen({
    schema_version: NODE_GRAPH_SCHEMA_VERSION,
    identity,
    node_ref: identity,
    kind: 'temporary',
    session_id: session,
    temporary_key: temporaryKey,
    counter,
    source_range: null,
    marker_is_credential: MARKER_IS_CREDENTIAL,
  });
}

function markerIndex(markers) {
  const counters = new Map();
  return markers.map(marker => {
    const key = `${marker.attr}:${marker.node_id}`;
    const occurrence = counters.get(key) ?? 0;
    counters.set(key, occurrence + 1);
    return { ...marker, occurrence };
  });
}

function rangeOf(html, item) {
  if (!item) return null;
  return frozen({
    start: item.start,
    inner_start: item.inner_start,
    inner_end: item.inner_end,
    end: item.end,
    outer_text: html.slice(item.start, item.end),
    inner_text: html.slice(item.inner_start, item.inner_end),
  });
}

function anchorKey(node) {
  const anchor = node.source_anchor;
  return anchor
    ? `${anchor.kind}:${anchor.anchor_id}:${anchor.occurrence}:${anchor.path || ''}`
    : '';
}

function nodeRecord({
  ref, nodeKind, sourceRange: range, path, status = 'mapped', selector = null, tag = null,
  origin = 'source', diagnostic = null, authoritative = false, duplicate = false,
  statusBeforeDelete = null,
}) {
  const sourceHash = ref.source_hash || '';
  const regionHash = range && typeof range.outer_text === 'string'
    ? byteRegionHash(range.outer_text)
    : (SHA256.test(ref.region_hash || '')
      ? ref.region_hash
      : byteRegionHash(`presentation-only\0${sourceHash}\0${ref.identity || ''}`));
  const stamped = frozen({ ...ref, source_hash: sourceHash, region_hash: regionHash });
  return frozen({
    identity: stamped.identity,
    node_ref: stamped,
    ref: stamped,
    kind: stamped.kind,
    node_kind: nodeKind,
    origin,
    status,
    status_before_delete: statusBeforeDelete,
    authoritative,
    duplicate,
    marker_is_credential: MARKER_IS_CREDENTIAL,
    source_hash: sourceHash,
    region_hash: regionHash,
    source_range: range,
    source_anchor: stamped.kind === 'source' ? frozen({
      kind: stamped.anchor_kind,
      anchor_id: stamped.anchor_id,
      occurrence: stamped.occurrence,
      path: path || null,
    }) : null,
    selector: selector || null,
    tag: tag || null,
    diagnostic: diagnostic || null,
  });
}

function buildGenericRecords(pagePackage, pageId, sourceHash, usedAnchors) {
  const html = pagePackage.html;
  const records = [];
  const elements = scanHtmlElements(html).filter(element => !SKIP_TAGS.has(element.tag));
  for (const element of elements) {
    if (usedAnchors.has(`${element.start}:${element.end}`)) continue;
    const range = rangeOf(html, element);
    const ref = sourceRef({
      pageId,
      sourceHash,
      anchorId: element.path,
      attr: 'node',
      occurrence: 0,
      path: element.path,
      kind: STATIC,
      regionHash: regionHashFor({
        sourceHash,
        anchorKind: 'node',
        anchorId: element.path,
        occurrence: 0,
        range,
        identity: element.path,
      }),
    });
    records.push(nodeRecord({
      ref,
      nodeKind: STATIC,
      sourceRange: range,
      path: element.path,
      selector: null,
      tag: element.tag,
      status: 'inferred',
      diagnostic: 'NO_EXPLICIT_ANCHOR',
      authoritative: false,
    }));
  }
  return records;
}

function restoreRuntimeNodes(sidecar, sourceHash, pageId) {
  const restored = [];
  const seen = new Set();
  for (const node of Array.isArray(sidecar?.nodes) ? sidecar.nodes : []) {
    if (!node || node.kind === 'source' || !NODE_REF_KINDS.includes(node.kind)) continue;
    const raw = node.node_ref && typeof node.node_ref === 'object' ? node.node_ref : null;
    if (!raw || typeof raw.identity !== 'string' || seen.has(raw.identity)) continue;
    seen.add(raw.identity);
    const regionHash = typeof raw.region_hash === 'string' && SHA256.test(raw.region_hash)
      ? raw.region_hash
      : sha256Hex(`region:runtime:${raw.identity}`);
    const ref = frozen({
      ...raw,
      page_id: raw.page_id || pageId,
      source_hash: sourceHash,
      region_hash: regionHash,
      marker_is_credential: MARKER_IS_CREDENTIAL,
    });
    restored.push(nodeRecord({
      ref,
      nodeKind: node.node_kind || raw.kind,
      sourceRange: null,
      status: node.status || 'runtime',
      origin: 'runtime',
      diagnostic: node.diagnostic || null,
      tag: node.tag || null,
      authoritative: false,
      statusBeforeDelete: node.status_before_delete || null,
    }));
  }
  return restored;
}

function resolveBudgets(override) {
  const next = { ...NODE_GRAPH_BUDGETS };
  if (!override || typeof override !== 'object') return next;
  for (const key of Object.keys(NODE_GRAPH_BUDGETS)) {
    if (Number.isFinite(override[key]) && override[key] >= 0) next[key] = override[key];
  }
  return next;
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function contractNodeId(node) {
  if (node.duplicate) return null;
  if (node.kind === 'source' && node.authoritative && node.ref?.occurrence === 0 && IDENTITY.test(node.ref.anchor_id || '')) {
    return node.ref.anchor_id;
  }
  const digest = String(node.identity || '').split(':').pop();
  const prefix = node.kind === 'template_instance' ? 'tpl.'
    : node.kind === 'dynamic_instance' ? 'dyn.'
      : node.kind === 'temporary' ? 'tmp.'
        : 'inf.';
  const nodeId = `${prefix}${digest}`;
  return IDENTITY.test(nodeId) ? nodeId : null;
}

function contractKind(node) {
  if (node.node_kind === REGION || node.kind === 'template_instance' || node.kind === 'dynamic_instance') {
    return REGION;
  }
  return STATIC;
}

/**
 * Declared and inferred HTML nodes with a stable source range may use source.
 * Logic needs a separate JS slice, which this sidecar does not invent.
 * Template, dynamic, temporary, and other runtime nodes are presentation-only.
 * Duplicate anchors, deletions, and missing ranges require reselection.
 * The projection never widens the node to whole_page.
 */
export function channelPolicy(node) {
  const runtimeKind = node?.kind === 'template_instance'
    || node?.kind === 'dynamic_instance'
    || node?.kind === 'temporary'
    || node?.origin === 'runtime';
  const hasRange = Boolean(node?.source_range
    && Number.isInteger(node.source_range.start)
    && Number.isInteger(node.source_range.end)
    && node.source_range.end > node.source_range.start);
  if (!hasRange || runtimeKind) {
    return Object.freeze({
      presentation: true,
      source: false,
      logic: false,
      reason: runtimeKind ? 'runtime_without_stable_source_range' : 'missing_source_range',
    });
  }
  const inferred = node.status === 'inferred' || node.diagnostic === 'NO_EXPLICIT_ANCHOR';
  return Object.freeze({
    presentation: true,
    source: true,
    logic: Boolean(node.logic_range || node.js_range),
    reason: inferred ? 'inferred_html_source_only' : 'declared_source_range',
  });
}

function mappingTokenFor(identity) {
  return `mt.${sha256Hex(String(identity || '')).slice(0, 16)}`;
}

/**
 * Project a sidecar record onto the T1 NodeRef. `channel` is an admission
 * check only; it is not copied into `value`.
 */
export function toEditNodeRef(node, { channel } = {}) {
  if (!node || typeof node !== 'object' || !node.identity || !node.status) {
    return { ok: false, code: 'NOT_A_GRAPH_NODE', reselect: true };
  }
  if (node.marker_is_credential === true) return { ok: false, code: 'MARKER_IS_NOT_CREDENTIAL', reselect: true };
  if (node.status === 'untrusted' || node.diagnostic === 'UNTRUSTED_MARKER') {
    return { ok: false, code: 'UNTRUSTED_MARKER', reselect: true };
  }
  if (node.duplicate) return { ok: false, code: 'DUPLICATE_ANCHOR', reselect: true };
  if (node.status === 'deleted' || node.state === 'deleted') return { ok: false, code: 'DELETED', reselect: true };
  if (node.status === 'missing_source_range' || node.diagnostic === 'MISSING_SOURCE_RANGE') {
    return { ok: false, code: 'MISSING_SOURCE_RANGE', reselect: true };
  }
  const policy = channelPolicy(node);
  if (channel != null && !EDIT_CHANNELS.has(channel)) return { ok: false, code: 'INVALID_CHANNEL', reselect: true };
  if (channel && policy[channel] !== true) {
    return {
      ok: false,
      code: policy.source ? 'CHANNEL_DENIED' : 'PRESENTATION_ONLY',
      reselect: false,
      channel_policy: policy,
    };
  }
  const nodeId = contractNodeId(node);
  const pageId = node.ref?.page_id || node.page_id;
  if (!nodeId || !pageIdentity(pageId) || !SHA256.test(node.source_hash || '') || !SHA256.test(node.region_hash || '')) {
    return { ok: false, code: 'INVALID_HASH', reselect: true };
  }
  const sourceRange = node.source_range && policy.source
    ? { start: node.source_range.start, end: node.source_range.end }
    : null;
  let selector = typeof node.selector === 'string' && node.selector.trim() && node.selector.length <= 512
    ? node.selector
    : null;
  if (!selector && !sourceRange) {
    const synthetic = `[data-fp-node="${nodeId}"]`;
    selector = synthetic.length <= 512 ? synthetic : null;
  }
  if (!selector && !sourceRange) return { ok: false, code: 'MISSING_LOCATOR', reselect: true };
  const kind = contractKind(node);
  if (kind === 'whole_page') return { ok: false, code: 'RESELECT_REQUIRED', reselect: true };
  return {
    ok: true,
    projection: node.authoritative ? 'node_map' : 'synthetic',
    channel_policy: policy,
    reselect: false,
    value: {
      page_id: pageId,
      node_id: nodeId,
      kind,
      selector,
      source_range: sourceRange,
      mapping_token: mappingTokenFor(node.identity),
      source_hash: node.source_hash,
      region_hash: node.region_hash,
    },
  };
}

/**
 * Build a sidecar graph from a page package. Explicit node_map markers are
 * authoritative; unmarked historical elements are inferred without changing
 * the HTML. Duplicate anchors stay as separate occurrences.
 */
export function buildNodeGraph(pagePackage, options = {}) {
  if (!pagePackage || typeof pagePackage !== 'object' || typeof pagePackage.html !== 'string') {
    throw Object.assign(new Error('INVALID_PAGE'), { code: 'INVALID_PAGE', http: 422 });
  }
  const { page_id: pageIdOption, pageId, sidecar, now } = options;
  const budgets = resolveBudgets(options.budgets);
  const clock = typeof now === 'function' ? now : defaultNow;
  const started = clock();
  const html = pagePackage.html;
  const sourceHash = packageSourceHash(pagePackage);
  const pageKey = pageKeyFor(pagePackage, pageIdOption ?? pageId, sourceHash);
  const nodeMap = Array.isArray(pagePackage.node_map) ? pagePackage.node_map : [];
  const declared = new Map();
  for (const row of nodeMap) {
    if (!row || typeof row !== 'object' || !pageIdentity(row.node_id)) continue;
    if (row.kind !== STATIC && row.kind !== REGION) continue;
    if (!declared.has(row.node_id)) declared.set(row.node_id, row);
  }

  const markers = markerIndex(scanShineMarkers(html));
  const records = [];
  const usedRanges = new Set();
  const missing = [];
  const seenAnchor = new Map();

  for (const marker of markers) {
    const declaredRow = declared.get(marker.node_id);
    const expectedAttr = declaredRow?.kind === REGION ? 'region' : 'node';
    const kind = declaredRow?.kind || (marker.attr === 'region' ? REGION : STATIC);
    const sourceKey = `${marker.attr}:${marker.node_id}`;
    const seen = seenAnchor.get(sourceKey) ?? 0;
    seenAnchor.set(sourceKey, seen + 1);
    const path = `marker:${marker.attr}:${marker.node_id}`;
    const range = rangeOf(html, marker);
    const ref = sourceRef({
      pageId: pageKey,
      sourceHash,
      anchorId: marker.node_id,
      attr: marker.attr,
      occurrence: marker.occurrence,
      path,
      kind,
      regionHash: regionHashFor({
        sourceHash,
        anchorKind: marker.attr,
        anchorId: marker.node_id,
        occurrence: marker.occurrence,
        range,
        identity: marker.node_id,
      }),
    });
    const trusted = Boolean(declaredRow) && marker.attr === expectedAttr;
    records.push(nodeRecord({
      ref,
      nodeKind: kind,
      sourceRange: range,
      path,
      selector: declaredRow?.selector || null,
      tag: marker.tag,
      status: trusted ? 'mapped' : 'untrusted',
      diagnostic: trusted ? null : 'UNTRUSTED_MARKER',
      authoritative: trusted,
    }));
    usedRanges.add(`${marker.start}:${marker.end}`);
  }

  for (const [nodeId, row] of declared) {
    const matching = markers.filter(marker => marker.node_id === nodeId
      && marker.attr === (row.kind === REGION ? 'region' : 'node'));
    if (matching.length === 0) {
      const ref = sourceRef({
        pageId: pageKey,
        sourceHash,
        anchorId: nodeId,
        attr: row.kind === REGION ? 'region' : 'node',
        occurrence: 0,
        path: 'missing',
        kind: row.kind,
      });
      records.push(nodeRecord({
        ref,
        nodeKind: row.kind,
        sourceRange: null,
        path: 'missing',
        selector: row.selector || null,
        status: 'missing_source_range',
        diagnostic: 'MISSING_SOURCE_RANGE',
        authoritative: false,
      }));
      missing.push(nodeId);
    }
  }

  records.push(...buildGenericRecords(pagePackage, pageKey, sourceHash, usedRanges));
  records.push(...restoreRuntimeNodes(sidecar, sourceHash, pageKey));

  const duplicateKeys = new Set();
  const duplicateIds = new Set();
  for (const [key, count] of seenAnchor) {
    if (count <= 1) continue;
    duplicateKeys.add(key);
    duplicateIds.add(key.slice(key.indexOf(':') + 1));
  }
  const prior = new Map();
  for (const node of Array.isArray(sidecar?.nodes) ? sidecar.nodes : []) {
    if (!node || node.kind !== 'source' || !node.source_anchor) continue;
    prior.set(anchorKey(node), node);
  }

  const reasons = [];
  let limited = records;
  const sourceRecords = records.filter(node => node.origin !== 'runtime');
  const runtimeRecords = records.filter(node => node.origin === 'runtime');
  if (sourceRecords.length > budgets.maxNodes) {
    const pinned = sourceRecords.filter(node => node.status !== 'inferred');
    const inferred = sourceRecords.filter(node => node.status === 'inferred');
    const room = Math.max(0, budgets.maxNodes - pinned.length);
    limited = pinned.concat(inferred.slice(0, room), runtimeRecords);
    reasons.push('NODE_LIMIT');
  }

  const byIdentity = new Map();
  for (const record of limited) {
    const duplicate = record.kind === 'source'
      && duplicateKeys.has(`${record.ref.anchor_kind}:${record.ref.anchor_id}`);
    let next = duplicate
      ? frozen({
        ...record,
        duplicate: true,
        authoritative: false,
        diagnostic: record.diagnostic || 'DUPLICATE_ANCHOR',
      })
      : record;
    const previous = prior.get(anchorKey(next));
    if (previous?.identity && previous.identity !== next.identity) {
      const ref = frozen({ ...next.ref, identity: previous.identity, node_ref: previous.identity });
      next = frozen({ ...next, identity: ref.identity, node_ref: ref, ref });
    }
    if (previous?.status === 'deleted') {
      next = frozen({
        ...next,
        status: 'deleted',
        status_before_delete: previous.status_before_delete || next.status,
        diagnostic: 'DELETED',
        authoritative: false,
        state: 'deleted',
      });
    }
    byIdentity.set(next.identity, next);
  }

  if (pagePackage.html !== html) {
    throw Object.assign(new Error('SOURCE_BYTES_CHANGED'), { code: 'SOURCE_BYTES_CHANGED' });
  }

  const elapsed = Math.max(0, clock() - started);
  const nodeCount = byIdentity.size;
  const limit = nodeCount > budgets.nodes2k ? budgets.build10kMs : budgets.build2kMs;
  if (elapsed > limit) reasons.push('BUILD_BUDGET');
  const budget = frozen({
    node_count: nodeCount,
    elapsed_ms: elapsed,
    limit_ms: limit,
    degraded: reasons.length > 0,
    reasons: frozen(reasons.slice()),
  });

  let temporaryCounter = 0;

  function get(refOrId) {
    if (!refOrId) return null;
    if (typeof refOrId === 'string') return byIdentity.get(refOrId) || null;
    if (refOrId.status && refOrId.identity && byIdentity.has(refOrId.identity)) {
      return byIdentity.get(refOrId.identity);
    }
    const id = refOrId.identity || (typeof refOrId.node_ref === 'string' ? refOrId.node_ref : refOrId.node_ref?.identity);
    return id ? byIdentity.get(id) || null : null;
  }

  function snapshot() {
    return Object.freeze([...byIdentity.values()]);
  }

  function upsert(record) {
    byIdentity.set(record.identity, record);
    return record;
  }

  function sourceRefOf(anchorId, { attr = 'node', occurrence = 0 } = {}) {
    for (const node of byIdentity.values()) {
      if (node.ref?.kind === 'source'
        && node.ref.anchor_id === anchorId
        && node.ref.anchor_kind === attr
        && node.ref.occurrence === occurrence) return node.ref;
    }
    return null;
  }

  function remember(ref, nodeKind, { status = 'runtime', tag = null } = {}) {
    const existing = byIdentity.get(ref.identity);
    if (existing && existing.status !== 'deleted') return existing.ref;
    const stamped = frozen({
      ...ref,
      page_id: ref.page_id || pageKey,
      source_hash: sourceHash,
      region_hash: ref.region_hash && SHA256.test(ref.region_hash)
        ? ref.region_hash
        : byteRegionHash(`presentation-only\0${sourceHash}\0${ref.identity}`),
    });
    const record = nodeRecord({
      ref: stamped,
      nodeKind,
      sourceRange: null,
      status,
      origin: 'runtime',
      tag,
      authoritative: false,
    });
    upsert(record);
    return record.ref;
  }

  function templateRef(template, instanceKey, occurrence = 0) {
    return remember(
      createTemplateInstanceRef({ templateRef: template, instanceKey, occurrence }),
      'template_instance',
    );
  }

  function dynamicRef(dynamic, instanceKey, generation = 0) {
    return remember(
      createDynamicInstanceRef({ dynamicRef: dynamic, instanceKey, generation }),
      'dynamic_instance',
    );
  }

  function temporaryRef(key, { sessionId = 'session', counter } = {}) {
    const keyed = key != null && String(key).trim() !== '';
    const next = Number.isSafeInteger(counter) ? counter : (keyed ? 0 : temporaryCounter++);
    const temporaryKey = keyed ? key : `temporary-${next}`;
    return remember(
      createTemporaryNodeRef({
        sessionId,
        key: temporaryKey,
        seed: `${sessionId}:${temporaryKey}`,
        counter: next,
      }),
      'temporary',
    );
  }

  function markDeleted(refOrId) {
    const current = get(refOrId);
    if (!current || current.status === 'deleted') return current;
    const next = frozen({
      ...current,
      status: 'deleted',
      status_before_delete: current.status,
      diagnostic: 'DELETED',
      authoritative: false,
      state: 'deleted',
    });
    return upsert(next);
  }

  function revive(refOrId) {
    const current = get(refOrId);
    if (!current || current.status !== 'deleted') return current;
    const status = current.status_before_delete || (current.origin === 'runtime' ? 'runtime' : 'mapped');
    const next = frozen({
      ...current,
      status,
      status_before_delete: null,
      diagnostic: status === 'untrusted' ? 'UNTRUSTED_MARKER'
        : status === 'missing_source_range' ? 'MISSING_SOURCE_RANGE'
          : status === 'inferred' ? 'NO_EXPLICIT_ANCHOR'
            : null,
      authoritative: status === 'mapped' && !current.duplicate,
      state: 'connected',
    });
    return upsert(next);
  }

  function project(refOrNode, projectOptions) {
    const record = refOrNode?.status ? get(refOrNode) || refOrNode : get(refOrNode);
    return toEditNodeRef(record, projectOptions);
  }

  const api = {
    schema_version: NODE_GRAPH_SCHEMA_VERSION,
    page_id: pageKey,
    source_hash: sourceHash,
    source_bytes_unchanged: true,
    marker_is_credential: MARKER_IS_CREDENTIAL,
    budget,
    get degraded() { return budget.degraded; },
    get nodes() {
      const obj = Object.create(null);
      for (const [key, value] of byIdentity) obj[key] = value;
      return Object.freeze(obj);
    },
    get node_list() { return snapshot(); },
    get roots() {
      return Object.freeze(snapshot()
        .filter(node => node.source_range && node.source_anchor && !String(node.source_anchor.path || '').includes('>'))
        .map(node => node.identity));
    },
    get diagnostics() {
      const list = snapshot();
      return frozen({
        duplicate_anchors: frozen([...duplicateIds]),
        missing_source_ranges: frozen(missing.slice()),
        untrusted_markers: frozen(list.filter(node => node.status === 'untrusted').map(node => node.identity)),
        inferred_nodes: list.filter(node => node.status === 'inferred').length,
        deleted: frozen(list.filter(node => node.status === 'deleted').map(node => node.identity)),
        runtime_nodes: list.filter(node => node.origin === 'runtime').length,
      });
    },
    get,
    sourceRef: sourceRefOf,
    templateRef,
    dynamicRef,
    temporaryRef,
    markDeleted,
    revive,
    toEditNodeRef: project,
    toSidecar() {
      return serializeNodeGraph(api);
    },
  };
  return Object.freeze(api);
}

export const createNodeGraph = buildNodeGraph;

export function rebuildNodeGraph(pagePackage, options = {}) {
  return buildNodeGraph(pagePackage, options);
}

export function serializeNodeGraph(graph) {
  const list = graph.node_list || Object.values(graph.nodes || {});
  return {
    schema_version: graph.schema_version,
    page_id: graph.page_id,
    source_hash: graph.source_hash,
    source_bytes_unchanged: true,
    marker_is_credential: MARKER_IS_CREDENTIAL,
    nodes: list.map(node => ({
      identity: node.identity,
      node_ref: node.ref,
      kind: node.kind,
      node_kind: node.node_kind,
      origin: node.origin,
      status: node.status,
      status_before_delete: node.status_before_delete || null,
      authoritative: node.authoritative === true,
      duplicate: node.duplicate === true,
      marker_is_credential: false,
      source_hash: node.source_hash,
      region_hash: node.region_hash,
      source_range: node.source_range,
      source_anchor: node.source_anchor,
      selector: node.selector,
      tag: node.tag,
      diagnostic: node.diagnostic,
    })),
  };
}

export function hydrateNodeGraph(pagePackage, sidecar, options = {}) {
  return buildNodeGraph(pagePackage, { ...options, sidecar });
}
