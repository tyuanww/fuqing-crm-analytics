import { validatePresentation } from '../presentation/model.mjs';
/** Free-page/v1 package, manifest and bridge validators. Not a BoardSpec catalogue. */

const IDENTITY = /^[A-Za-z0-9_.:-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BINDING_STATES = new Set(['UNBOUND_SAMPLE', 'BOUND_VERIFIED', 'BOUND_STALE']);
const NODE_KINDS = new Set(['static_element', 'dynamic_region', 'whole_page']);
const PAGE_OPS = new Set(['GENERATE', 'PATCH', 'SAVE', 'ROLLBACK']);
const PAGE_TO_HOST = new Set(['data.read', 'data.cancel']);
const HOST_TO_PAGE = new Set(['data.chunk', 'data.end', 'data.error', 'binding.state']);
const FORBIDDEN_OPS = new Set(['sql', 'save', 'http.fetch', 'credential.read']);
const HTML_MAX = 1_048_576;
const STYLE_MAX = 524_288;
const PACKAGE_MAX = 2_000_000;
const READ_LIMIT_MAX = 50;
const BUDGET_BYTES = 65536;
const BUDGET_ROWS = 2000;
const READ_MODES = new Set(['summary', 'page', 'range']);
const utf8 = new TextEncoder();
const BRIDGE_KEYS = {
  'data.read': new Set(['protocol', 'instance_id', 'request_id', 'nonce', 'seq', 'op', 'result_ref', 'mode', 'cursor', 'limit']),
  'data.cancel': new Set(['protocol', 'instance_id', 'request_id', 'nonce', 'seq', 'op']),
  'data.chunk': new Set(['protocol', 'instance_id', 'request_id', 'nonce', 'seq', 'op', 'unit', 'time_range', 'queried_at', 'source', 'row_count', 'byte_length']),
  'data.end': new Set(['protocol', 'instance_id', 'request_id', 'nonce', 'seq', 'op']),
  'data.error': new Set(['protocol', 'instance_id', 'request_id', 'nonce', 'seq', 'op', 'code', 'message']),
  'binding.state': new Set(['protocol', 'instance_id', 'request_id', 'nonce', 'seq', 'op', 'binding_state']),
};

function utf8Bytes(text) {
  return utf8.encode(text).byteLength;
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(value) {
  return { ok: true, value };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extraKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function opaque(value, label) {
  if (typeof value !== 'string' || !IDENTITY.test(value)) {
    return `${label} 不是合法标识`;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function parsePagePackage(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_PAGE', '源码包必须是对象');
  const unknown = extraKeys(raw, new Set(['html', 'css', 'js', 'resources', 'node_map', 'presentation']));
  if (unknown.length) return fail('INVALID_PAGE', `源码包含未知字段: ${unknown.join(',')}`);
  if (typeof raw.html !== 'string' || !raw.html.trim() || raw.html.length > HTML_MAX) {
    return fail('INVALID_PAGE', 'html 必须是非空源码');
  }
  const css = raw.css ?? '';
  const js = raw.js ?? '';
  if (typeof css !== 'string' || css.length > STYLE_MAX) return fail('INVALID_PAGE', 'css 超限或类型错误');
  if (typeof js !== 'string' || js.length > STYLE_MAX) return fail('INVALID_PAGE', 'js 超限或类型错误');
  const resources = raw.resources ?? [];
  const nodeMap = raw.node_map ?? [];
  if (!Array.isArray(resources) || resources.length > 32) return fail('INVALID_PAGE', 'resources 非法');
  if (!Array.isArray(nodeMap) || nodeMap.length > 2000) return fail('INVALID_PAGE', 'node_map 非法');
  const resourceIds = new Set();
  let bytes = utf8Bytes(raw.html) + utf8Bytes(css) + utf8Bytes(js);
  for (const item of resources) {
    if (!isPlainObject(item)) return fail('INVALID_PAGE', 'resource 必须是对象');
    if (extraKeys(item, new Set(['resource_id', 'content_type', 'sha256', 'byte_length'])).length) {
      return fail('INVALID_PAGE', 'resource 含未知字段');
    }
    if (opaque(item.resource_id, 'resource_id') || resourceIds.has(item.resource_id)) {
      return fail('INVALID_PAGE', 'resource_id 非法或重复');
    }
    resourceIds.add(item.resource_id);
    if (typeof item.content_type !== 'string' || !item.content_type.includes('/')) {
      return fail('INVALID_PAGE', 'content_type 非法');
    }
    if (typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) return fail('INVALID_PAGE', '资源 hash 非法');
    if (!Number.isInteger(item.byte_length) || item.byte_length < 0 || item.byte_length > PACKAGE_MAX) {
      return fail('INVALID_PAGE', 'byte_length 非法');
    }
    bytes += item.byte_length;
  }
  const nodeIds = new Set();
  for (const item of nodeMap) {
    if (!isPlainObject(item)) return fail('INVALID_PAGE', 'node_map 项必须是对象');
    if (extraKeys(item, new Set(['node_id', 'kind', 'selector'])).length) return fail('INVALID_PAGE', 'node_map 含未知字段');
    if (opaque(item.node_id, 'node_id') || nodeIds.has(item.node_id)) return fail('INVALID_PAGE', 'node_id 非法或重复');
    nodeIds.add(item.node_id);
    if (!NODE_KINDS.has(item.kind)) return fail('INVALID_PAGE', 'node kind 非法');
    if (typeof item.selector !== 'string' || !item.selector.trim()) return fail('INVALID_PAGE', 'selector 非法');
  }
  if (!validatePresentation(raw.presentation, raw)) return fail('INVALID_PAGE', '可编辑内容与源码不匹配');
  bytes += utf8Bytes(JSON.stringify(raw.presentation ?? null));
  if (bytes > PACKAGE_MAX) return fail('PACKAGE_TOO_LARGE', '页面源码包超过大小上限');
  return ok({ html: raw.html, css, js, resources, node_map: nodeMap, ...(raw.presentation ? { presentation: raw.presentation } : {}) });
}

/**
 * @param {unknown} raw
 */
export function parseBindingManifest(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_PAGE', 'binding manifest 必须是对象');
  if (extraKeys(raw, new Set(['bindings', 'result_refs'])).length) return fail('INVALID_PAGE', 'manifest 含未知字段');
  const bindings = raw.bindings ?? [];
  const resultRefs = raw.result_refs ?? [];
  if (!Array.isArray(bindings) || !Array.isArray(resultRefs)) return fail('INVALID_PAGE', 'manifest 数组非法');
  const declared = new Set();
  for (const ref of resultRefs) {
    if (opaque(ref, 'result_ref') || declared.has(ref)) return fail('INVALID_PAGE', 'result_ref 非法或重复');
    declared.add(ref);
  }
  const bindingIds = new Set();
  for (const item of bindings) {
    if (!isPlainObject(item)) return fail('INVALID_PAGE', 'binding 必须是对象');
    if (extraKeys(item, new Set(['binding_id', 'result_ref', 'node_id', 'data_ref', 'mode'])).length) {
      return fail('INVALID_PAGE', 'binding 含未知字段');
    }
    if (opaque(item.binding_id, 'binding_id') || bindingIds.has(item.binding_id)) {
      return fail('INVALID_PAGE', 'binding_id 非法或重复');
    }
    bindingIds.add(item.binding_id);
    if (item.mode != null && !READ_MODES.has(item.mode)) return fail('INVALID_PAGE', 'binding mode 非法');
    if (!declared.has(item.result_ref)) return fail('INVALID_PAGE', 'binding result_ref 未声明');
  }
  return ok({ bindings, result_refs: resultRefs });
}

/**
 * @param {unknown} raw
 */
export function parsePageDocument(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_PAGE', '页面文档必须是对象');
  if ('blocks' in raw || 'board_id' in raw) return fail('INVALID_PAGE', '不能把 BoardSpec 当作页面资产');
  const allowed = new Set(['schema_version', 'page_id', 'session_id', 'title', 'version',
    'binding_state', 'package', 'binding_manifest']);
  if (extraKeys(raw, allowed).length) return fail('INVALID_PAGE', '页面文档含未知字段');
  if (raw.schema_version !== 'free-page/v1') return fail('INVALID_PAGE', 'schema_version 必须是 free-page/v1');
  for (const key of ['page_id', 'session_id']) {
    const message = opaque(raw[key], key);
    if (message) return fail('INVALID_PAGE', message);
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) return fail('INVALID_PAGE', 'title 非法');
  if (!Number.isInteger(raw.version) || raw.version < 1) return fail('INVALID_PAGE', 'version 非法');
  if (!BINDING_STATES.has(raw.binding_state)) return fail('INVALID_PAGE', 'binding_state 非法');
  const pack = parsePagePackage(raw.package);
  if (!pack.ok) return pack;
  const manifest = parseBindingManifest(raw.binding_manifest ?? { bindings: [], result_refs: [] });
  if (!manifest.ok) return manifest;
  const unbound = manifest.value.result_refs.length === 0;
  if (unbound && raw.binding_state !== 'UNBOUND_SAMPLE') {
    return fail('INVALID_PAGE', '无 result_refs 时只能是 UNBOUND_SAMPLE');
  }
  if (!unbound && raw.binding_state === 'UNBOUND_SAMPLE') {
    return fail('INVALID_PAGE', '未绑定页不能声明 result_refs');
  }
  return ok({
    schema_version: 'free-page/v1',
    page_id: raw.page_id,
    session_id: raw.session_id,
    title: raw.title,
    version: raw.version,
    binding_state: raw.binding_state,
    package: pack.value,
    binding_manifest: manifest.value,
  });
}

/**
 * @param {unknown} raw
 * @param {{ instance_id?: string, nonce?: string, expired?: boolean }} [session]
 */
export function parseBridgeMessage(raw, session = {}) {
  if (!isPlainObject(raw)) return fail('BRIDGE_UNKNOWN_OP', '桥消息必须是对象');
  if (typeof raw.op !== 'string') return fail('BRIDGE_UNKNOWN_OP', '缺少 op');
  if (FORBIDDEN_OPS.has(raw.op) || !(PAGE_TO_HOST.has(raw.op) || HOST_TO_PAGE.has(raw.op))) {
    return fail('BRIDGE_UNKNOWN_OP', `未知或禁止的桥操作: ${raw.op}`);
  }
  if (extraKeys(raw, BRIDGE_KEYS[raw.op]).length) return fail('INVALID_PAGE', '桥消息含未知字段');
  if (raw.protocol !== 'free-page-bridge/v1') return fail('BRIDGE_UNKNOWN_OP', '协议版本不匹配');
  if (session.expired) return fail('BRIDGE_EXPIRED_INSTANCE', '桥接实例已过期');
  if (session.nonce != null && raw.nonce !== session.nonce) return fail('BRIDGE_NONCE', 'nonce 无效');
  if (session.instance_id != null && raw.instance_id !== session.instance_id) {
    return fail('BRIDGE_EXPIRED_INSTANCE', '实例不匹配');
  }
  if (!Number.isInteger(raw.seq) || raw.seq < 0) return fail('INVALID_PAGE', 'seq 非法');
  if (raw.op === 'data.read') {
    if (opaque(raw.result_ref, 'result_ref')) return fail('INVALID_PAGE', 'result_ref 非法');
    if (raw.mode != null && !READ_MODES.has(raw.mode)) return fail('INVALID_PAGE', 'read mode 非法');
    const limit = raw.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > READ_LIMIT_MAX) return fail('INVALID_PAGE', 'limit 超限');
  }
  if (raw.op === 'data.chunk') {
    if (raw.byte_length != null && (raw.byte_length < 0 || raw.byte_length > BUDGET_BYTES)) {
      return fail('PACKAGE_TOO_LARGE', '桥响应超过额度');
    }
    if (raw.row_count != null && (raw.row_count < 0 || raw.row_count > BUDGET_ROWS)) {
      return fail('PACKAGE_TOO_LARGE', '桥累计行数超过额度');
    }
  }
  return ok(raw);
}

export const PAGE_OPERATIONS = [...PAGE_OPS];
export const BINDING_STATE_VALUES = [...BINDING_STATES];
export const FORBIDDEN_BRIDGE_OPS = [...FORBIDDEN_OPS];

// free-page-edit/v1 is additive. PagePackage and PageDocument stay free-page/v1.
const EDIT_CHANNELS = new Set(['presentation', 'source', 'logic']);
const EDIT_ACTIONS = new Set(['insert', 'update', 'delete', 'move', 'replace']);
const EDIT_ENCODINGS = new Set(['overlay', 'bytes']);
const OVERLAY_KEYS = new Set(['text', 'attributes', 'style']);
const EDIT_SCHEMA = 'free-page-edit/v1';
const CONTEXT_SCHEMA = 'free-page-edit-context/v1';
const SAFE_MAX = 9007199254740991;
const TTL_MAX = 86_400_000;

export const EDIT_CHANNEL_VALUES = Object.freeze(['presentation', 'source', 'logic']);
export const EDIT_ACTION_VALUES = Object.freeze(['insert', 'update', 'delete', 'move', 'replace']);
export const EDIT_ENCODING_VALUES = Object.freeze(['overlay', 'bytes']);
export const EDIT_ERROR_CODES = Object.freeze([
  'INVALID_EDIT', 'INVALID_CAS', 'INVALID_EDIT_CONTEXT', 'CAS_CONFLICT', 'VERSION_CONFLICT',
  'EDIT_EXPIRED', 'CAPABILITY_DENIED', 'SCOPE_VIOLATION', 'IDEMPOTENCY_CONFLICT', 'FORBIDDEN', 'MAPPING_STALE',
]);

function hashOk(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function containsRange(outer, inner) {
  return inner.start >= outer.start && inner.end <= outer.end;
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function sameRange(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return left.start === right.start && left.end === right.end;
}

function parseCapabilities(value, code, { allowEmpty = false } = {}) {
  const minimum = allowEmpty ? 0 : 1;
  if (!Array.isArray(value) || value.length < minimum || value.length > 16) return fail(code, 'capabilities 非法');
  if (value.some((item) => typeof item !== 'string' || item.length > 64 || opaque(item, 'capability'))) {
    return fail(code, 'capabilities 非法');
  }
  if (new Set(value).size !== value.length) return fail(code, 'capabilities 不得重复');
  return ok(value.slice());
}

/**
 * @param {unknown} raw
 * @param {{ point?: boolean }} [options]
 */
export function parseSourceRange(raw, options = {}) {
  if (!isPlainObject(raw)) return fail('INVALID_EDIT', 'source range 必须是对象');
  if (extraKeys(raw, new Set(['start', 'end'])).length) return fail('INVALID_EDIT', 'source range 含未知字段');
  if (!Number.isSafeInteger(raw.start) || !Number.isSafeInteger(raw.end)
    || raw.start < 0 || raw.end < raw.start || raw.end > PACKAGE_MAX) {
    return fail('INVALID_EDIT', 'source range 非法');
  }
  if (!options.point && raw.end === raw.start) return fail('INVALID_EDIT', 'source range 不能为空');
  return ok({ start: raw.start, end: raw.end });
}

function parseSelector(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) return fail('INVALID_EDIT', 'selector 非法');
  return ok(value);
}

function parseStringMap(value, label) {
  if (!isPlainObject(value)) return fail('INVALID_EDIT', `${label} 必须是对象`);
  const keys = Object.keys(value);
  if (keys.length < 1 || keys.length > 32) return fail('INVALID_EDIT', `${label} 为空或过多`);
  for (const key of keys) {
    const item = value[key];
    if (!key.trim() || key.length > 64 || typeof item !== 'string' || item.length > 512) {
      return fail('INVALID_EDIT', `${label} 项非法`);
    }
  }
  return ok(value);
}

function parseOverlay(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_EDIT', 'overlay payload 必须是对象');
  if (extraKeys(raw, OVERLAY_KEYS).length) return fail('INVALID_EDIT', 'presentation overlay 含未知字段');
  if (!Object.keys(raw).length) return fail('INVALID_EDIT', 'overlay 不能为空');
  const value = {};
  if ('text' in raw) {
    if (typeof raw.text !== 'string' || raw.text.length > 8000) return fail('INVALID_EDIT', 'overlay text 非法');
    value.text = raw.text;
  }
  if ('attributes' in raw) {
    const attributes = parseStringMap(raw.attributes, 'attributes');
    if (!attributes.ok) return attributes;
    value.attributes = attributes.value;
  }
  if ('style' in raw) {
    const style = parseStringMap(raw.style, 'style');
    if (!style.ok) return style;
    value.style = style.value;
  }
  return ok(value);
}

export function parseNodeRef(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_EDIT', 'NodeRef 必须是对象');
  const unknown = extraKeys(raw, new Set([
    'page_id', 'node_id', 'kind', 'selector', 'source_range', 'mapping_token', 'source_hash', 'region_hash',
  ]));
  if (unknown.length) return fail('INVALID_EDIT', `NodeRef 含未知字段: ${unknown.join(',')}`);
  if (opaque(raw.page_id, 'page_id') || opaque(raw.node_id, 'node_id') || opaque(raw.mapping_token, 'mapping_token')) {
    return fail('INVALID_EDIT', 'NodeRef 标识非法');
  }
  if (!NODE_KINDS.has(raw.kind) || !hashOk(raw.source_hash) || !hashOk(raw.region_hash)) {
    return fail('INVALID_EDIT', 'NodeRef 字段非法');
  }
  let selector = null;
  if (raw.selector != null) {
    const parsed = parseSelector(raw.selector);
    if (!parsed.ok) return parsed;
    selector = parsed.value;
  }
  let sourceRange = null;
  if (raw.source_range != null) {
    const parsed = parseSourceRange(raw.source_range);
    if (!parsed.ok) return parsed;
    sourceRange = parsed.value;
  }
  if (selector == null && sourceRange == null) return fail('INVALID_EDIT', 'NodeRef 需要 selector 或 source range');
  return ok({
    page_id: raw.page_id,
    node_id: raw.node_id,
    kind: raw.kind,
    selector,
    source_range: sourceRange,
    mapping_token: raw.mapping_token,
    source_hash: raw.source_hash,
    region_hash: raw.region_hash,
  });
}

export function parseSelectedScope(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_EDIT', 'selected scope 必须是对象');
  if (extraKeys(raw, new Set(['page_id', 'node_id', 'source_range'])).length) {
    return fail('INVALID_EDIT', 'selected scope 含未知字段');
  }
  if (opaque(raw.page_id, 'page_id') || opaque(raw.node_id, 'node_id')) return fail('INVALID_EDIT', 'selected scope 标识非法');
  let sourceRange = null;
  if (raw.source_range != null) {
    const parsed = parseSourceRange(raw.source_range);
    if (!parsed.ok) return parsed;
    sourceRange = parsed.value;
  }
  return ok({ page_id: raw.page_id, node_id: raw.node_id, source_range: sourceRange });
}

export function parseCAS(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_CAS', 'CAS 必须是对象');
  if (extraKeys(raw, new Set(['base_version', 'source_hash', 'region_hash', 'idempotency_key'])).length) {
    return fail('INVALID_CAS', 'CAS 含未知字段');
  }
  if (!Number.isSafeInteger(raw.base_version) || raw.base_version < 1 || !hashOk(raw.source_hash) || !hashOk(raw.region_hash)) {
    return fail('INVALID_CAS', 'CAS 字段非法');
  }
  if (typeof raw.idempotency_key !== 'string' || raw.idempotency_key.length < 1 || raw.idempotency_key.length > 200
    || raw.idempotency_key !== raw.idempotency_key.trim()) {
    return fail('INVALID_CAS', '幂等键非法');
  }
  return ok({
    base_version: raw.base_version,
    source_hash: raw.source_hash,
    region_hash: raw.region_hash,
    idempotency_key: raw.idempotency_key,
  });
}

export function casFingerprint(cas) {
  return `${cas.base_version}\0${cas.source_hash}\0${cas.region_hash}\0${cas.idempotency_key}`;
}

function payloadBytesOk(payload, byteLength, { allowEmpty }) {
  if (typeof payload !== 'string' || utf8Bytes(payload) !== byteLength) {
    return fail('INVALID_EDIT', 'bytes payload 与 byte_length 不一致');
  }
  if (!allowEmpty && byteLength < 1) return fail('INVALID_EDIT', '字节操作不能为空');
  return ok(payload);
}

export function parseEditOperation(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_EDIT', 'EditOperation 必须是对象');
  const allowed = new Set([
    'schema_version', 'operation_id', 'channel', 'action', 'selected_scope', 'capabilities',
    'node', 'cas', 'encoding', 'payload', 'byte_length', 'splice', 'destination', 'expected_region_hash',
  ]);
  if (extraKeys(raw, allowed).length) return fail('INVALID_EDIT', 'EditOperation 含未知字段');
  if (raw.schema_version !== EDIT_SCHEMA) return fail('INVALID_EDIT', 'EditOperation 版本非法');
  if (opaque(raw.operation_id, 'operation_id')) return fail('INVALID_EDIT', 'operation_id 非法');
  if (!EDIT_ACTIONS.has(raw.action)) return fail('INVALID_EDIT', '未知 operation');
  if (!EDIT_CHANNELS.has(raw.channel)) return fail('INVALID_EDIT', '未知 channel');
  if (!EDIT_ENCODINGS.has(raw.encoding)) return fail('INVALID_EDIT', 'encoding 非法');
  const scope = parseSelectedScope(raw.selected_scope);
  if (!scope.ok) return scope;
  const capabilities = parseCapabilities(raw.capabilities, 'INVALID_EDIT');
  if (!capabilities.ok) return capabilities;
  const node = parseNodeRef(raw.node);
  if (!node.ok) return node;
  const cas = parseCAS(raw.cas);
  if (!cas.ok) return cas;
  const bytes = raw.byte_length ?? 0;
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > PACKAGE_MAX) return fail('PACKAGE_TOO_LARGE', 'byte_length 非法');
  if (scope.value.page_id !== node.value.page_id || scope.value.node_id !== node.value.node_id) {
    return fail('SCOPE_VIOLATION', 'selected scope 与节点不一致');
  }
  if (cas.value.source_hash !== node.value.source_hash || cas.value.region_hash !== node.value.region_hash) {
    return fail('CAS_CONFLICT', 'CAS hash 与节点不一致');
  }
  if (!capabilities.value.includes(`edit:${raw.channel}`)) return fail('CAPABILITY_DENIED', '缺少通道能力');
  if (node.value.source_range && scope.value.source_range && !containsRange(scope.value.source_range, node.value.source_range)) {
    return fail('SCOPE_VIOLATION', '节点范围超出 selected scope');
  }

  let payload = null;
  let splice = null;
  let destination = null;
  let expectedRegionHash = null;
  if (raw.channel === 'presentation') {
    if (raw.encoding !== 'overlay') return fail('INVALID_EDIT', 'presentation 必须使用 overlay');
    if (bytes !== 0) return fail('INVALID_EDIT', 'overlay 的 byte_length 必须为 0');
    if (raw.splice != null || raw.expected_region_hash != null) {
      return fail('INVALID_EDIT', 'presentation 不能声明字节覆盖');
    }
    if (raw.action === 'delete') {
      if (raw.payload != null || raw.destination != null) return fail('INVALID_EDIT', 'presentation delete 不能携带 payload');
    } else {
      const overlay = parseOverlay(raw.payload);
      if (!overlay.ok) return overlay;
      payload = overlay.value;
      if (raw.action === 'move') {
        if (raw.destination == null || node.value.source_range == null || scope.value.source_range == null) {
          return fail('INVALID_EDIT', 'move 必须声明 destination 和 source range');
        }
        const dest = parseSourceRange(raw.destination, { point: true });
        if (!dest.ok) return dest;
        if (!containsRange(node.value.source_range, dest.value) || !containsRange(scope.value.source_range, dest.value)) {
          return fail('SCOPE_VIOLATION', 'destination 超出 selected scope');
        }
        destination = dest.value;
      } else if (raw.destination != null) return fail('INVALID_EDIT', '只有 move 可以携带 destination');
    }
  } else {
    if (raw.encoding !== 'bytes') return fail('INVALID_EDIT', 'source/logic 必须使用 bytes，不能静默覆盖');
    if (node.value.source_range == null || scope.value.source_range == null) {
      return fail('INVALID_EDIT', 'source/logic 必须声明 source range，不能覆盖未知字节');
    }
    if (!hashOk(raw.expected_region_hash)) return fail('INVALID_EDIT', 'source/logic 缺少 expected_region_hash');
    if (raw.expected_region_hash !== node.value.region_hash) {
      return fail('CAS_CONFLICT', 'expected_region_hash 与节点 region_hash 不一致');
    }
    expectedRegionHash = raw.expected_region_hash;
    if (raw.splice == null) return fail('INVALID_EDIT', 'source/logic 缺少 splice，不能覆盖未知字节');
    const point = raw.action === 'insert';
    const parsedSplice = parseSourceRange(raw.splice, { point });
    if (!parsedSplice.ok) return parsedSplice;
    splice = parsedSplice.value;
    if (!containsRange(node.value.source_range, splice)) return fail('SCOPE_VIOLATION', 'splice 超出节点 source range');
    if (raw.action === 'insert') {
      if (splice.start !== splice.end || raw.destination != null) return fail('INVALID_EDIT', 'insert 必须是范围内的插入点');
      const body = payloadBytesOk(raw.payload, bytes, { allowEmpty: false });
      if (!body.ok) return body;
      payload = body.value;
    } else if (raw.action === 'delete') {
      if (splice.end === splice.start || raw.payload != null || bytes !== 0 || raw.destination != null) {
        return fail('INVALID_EDIT', 'delete 不得携带 payload');
      }
    } else if (raw.action === 'move') {
      if (splice.end === splice.start || raw.destination == null) return fail('INVALID_EDIT', 'move 必须声明源区间和 destination');
      const dest = parseSourceRange(raw.destination, { point: true });
      if (!dest.ok) return dest;
      if (!containsRange(node.value.source_range, dest.value)) return fail('SCOPE_VIOLATION', 'destination 超出节点范围');
      if (rangesOverlap(splice, dest.value)) return fail('INVALID_EDIT', 'move 的源区间与目标区间重叠');
      const body = payloadBytesOk(raw.payload, bytes, { allowEmpty: false });
      if (!body.ok) return body;
      payload = body.value;
      destination = dest.value;
    } else {
      if (raw.destination != null || splice.end === splice.start) return fail('INVALID_EDIT', 'update/replace 必须声明非空 splice');
      if (raw.action === 'replace' && (splice.start !== node.value.source_range.start || splice.end !== node.value.source_range.end)) {
        return fail('INVALID_EDIT', 'replace 必须精确覆盖节点 source range，不能留下未声明字节');
      }
      const body = payloadBytesOk(raw.payload, bytes, { allowEmpty: true });
      if (!body.ok) return body;
      payload = body.value;
    }
  }
  return ok({
    schema_version: EDIT_SCHEMA,
    operation_id: raw.operation_id,
    channel: raw.channel,
    action: raw.action,
    selected_scope: scope.value,
    capabilities: capabilities.value,
    node: node.value,
    cas: cas.value,
    encoding: raw.encoding,
    payload,
    byte_length: bytes,
    splice,
    destination,
    expected_region_hash: expectedRegionHash,
  });
}

export function parseEditContext(raw) {
  if (!isPlainObject(raw)) return fail('INVALID_EDIT_CONTEXT', 'EditContext 必须是对象');
  const allowed = new Set([
    'schema_version', 'edit_context_id', 'user_id', 'tenant_id', 'page_id', 'version',
    'selected_node', 'capabilities', 'created_at', 'expires_at', 'ttl_ms',
  ]);
  if (extraKeys(raw, allowed).length) return fail('INVALID_EDIT_CONTEXT', 'EditContext 含未知字段');
  if (raw.schema_version !== CONTEXT_SCHEMA) return fail('INVALID_EDIT_CONTEXT', 'EditContext 版本非法');
  for (const key of ['edit_context_id', 'user_id', 'tenant_id', 'page_id']) {
    if (opaque(raw[key], key)) return fail('INVALID_EDIT_CONTEXT', `${key} 非法`);
  }
  if (!Number.isSafeInteger(raw.version) || raw.version < 1) return fail('INVALID_EDIT_CONTEXT', 'version 非法');
  const capabilities = parseCapabilities(raw.capabilities, 'INVALID_EDIT_CONTEXT', { allowEmpty: true });
  if (!capabilities.ok) return capabilities;
  const selected = parseNodeRef(raw.selected_node);
  if (!selected.ok) return selected;
  if (selected.value.page_id !== raw.page_id) return fail('INVALID_EDIT_CONTEXT', 'selected node 与 page_id 不一致');
  if (!Number.isSafeInteger(raw.created_at) || raw.created_at < 0
    || !Number.isSafeInteger(raw.ttl_ms) || raw.ttl_ms < 1 || raw.ttl_ms > TTL_MAX
    || !Number.isSafeInteger(raw.expires_at) || raw.expires_at < 0 || raw.expires_at > SAFE_MAX) {
    return fail('INVALID_EDIT_CONTEXT', 'TTL 字段非法');
  }
  if (raw.expires_at !== raw.created_at + raw.ttl_ms) return fail('INVALID_EDIT_CONTEXT', 'expires_at 必须等于 created_at + ttl_ms');
  return ok({
    schema_version: CONTEXT_SCHEMA,
    edit_context_id: raw.edit_context_id,
    user_id: raw.user_id,
    tenant_id: raw.tenant_id,
    page_id: raw.page_id,
    version: raw.version,
    selected_node: selected.value,
    capabilities: capabilities.value,
    created_at: raw.created_at,
    expires_at: raw.expires_at,
    ttl_ms: raw.ttl_ms,
  });
}

export function evaluateCAS(casRaw, head, prior = null) {
  const cas = parseCAS(casRaw);
  if (!cas.ok) return cas;
  if (prior != null) {
    if (!isPlainObject(prior) || typeof prior.idempotency_key !== 'string' || typeof prior.fingerprint !== 'string') {
      return fail('INVALID_CAS', '幂等回执非法');
    }
    if (prior.idempotency_key === cas.value.idempotency_key) {
      if (prior.fingerprint !== casFingerprint(cas.value)) return fail('IDEMPOTENCY_CONFLICT', '同一幂等键对应了不同的 CAS');
      return ok({ replay: true, cas: cas.value });
    }
  }
  if (!isPlainObject(head) || !Number.isSafeInteger(head.version) || head.version < 1
    || !hashOk(head.source_hash) || !hashOk(head.region_hash)) {
    return fail('INVALID_CAS', '当前版本非法');
  }
  if (head.version !== cas.value.base_version) return fail('VERSION_CONFLICT', 'base_version 与当前版本不一致');
  if (head.source_hash !== cas.value.source_hash || head.region_hash !== cas.value.region_hash) {
    return fail('CAS_CONFLICT', 'source_hash 或 region_hash 与当前区域不一致');
  }
  return ok({ replay: false, cas: cas.value });
}

function sameNodeIdentity(selected, node) {
  return selected.page_id === node.page_id
    && selected.node_id === node.node_id
    && selected.kind === node.kind
    && selected.selector === node.selector
    && selected.mapping_token === node.mapping_token
    && sameRange(selected.source_range, node.source_range);
}

export function admitEdit(contextRaw, operationRaw, head) {
  const context = parseEditContext(contextRaw);
  if (!context.ok) return context;
  const operation = parseEditOperation(operationRaw);
  if (!operation.ok) return operation;
  if (!isPlainObject(head) || !Number.isSafeInteger(head.now_ms) || head.now_ms < 0) {
    return fail('INVALID_EDIT_CONTEXT', 'now_ms 非法');
  }
  if (head.now_ms < context.value.created_at) return fail('INVALID_EDIT_CONTEXT', '上下文尚未生效');
  if (head.now_ms >= context.value.expires_at) return fail('EDIT_EXPIRED', '编辑上下文已过期');
  if (head.actor_user_id !== context.value.user_id || head.actor_tenant_id !== context.value.tenant_id) {
    return fail('FORBIDDEN', '编辑上下文不属于当前用户或租户');
  }
  if (operation.value.node.page_id !== context.value.page_id || operation.value.selected_scope.page_id !== context.value.page_id) {
    return fail('SCOPE_VIOLATION', '操作页面超出编辑上下文');
  }
  if (operation.value.node.node_id !== context.value.selected_node.node_id) {
    return fail('SCOPE_VIOLATION', '操作节点超出 selected node');
  }
  if (!sameNodeIdentity(context.value.selected_node, operation.value.node)) {
    return fail('MAPPING_STALE', 'selected node 与操作节点映射不一致');
  }
  if (context.value.selected_node.source_hash !== operation.value.node.source_hash
    || context.value.selected_node.region_hash !== operation.value.node.region_hash) {
    return fail('CAS_CONFLICT', '上下文节点 hash 与操作不一致');
  }
  if (operation.value.capabilities.some((item) => !context.value.capabilities.includes(item))) {
    return fail('CAPABILITY_DENIED', '上下文未授予操作所需能力');
  }
  if (context.value.version !== operation.value.cas.base_version) {
    return fail('VERSION_CONFLICT', '上下文版本与 CAS base_version 不一致');
  }
  const decision = evaluateCAS(operation.value.cas, head, head.prior ?? null);
  if (!decision.ok) return decision;
  return ok({ context: context.value, operation: operation.value, cas: decision.value });
}
