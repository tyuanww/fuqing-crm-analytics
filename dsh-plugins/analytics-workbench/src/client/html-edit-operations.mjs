import { buildFormalEditOperation } from '../free-page/edit/formal-operation.mjs';

/**
 * Host-side operation vocabulary for the visual HTML editor.
 * The iframe can describe a selection. acceptOperation(apply) releases
 * text, style, attribute, and structure writes for a valid mapped node.
 * Runtime nodes without a stable source range stay read-only. AI stays
 * on the host until a person sends it.
 */
export const EDIT_CHANNELS = Object.freeze(['presentation', 'source', 'logic']);
export const EDIT_ACTIONS = Object.freeze([
  'select', 'set_text', 'set_attribute', 'set_style', 'replace_structure', 'ai_instruction',
]);
export const EDIT_KINDS = EDIT_ACTIONS;
export const EDIT_MODES = Object.freeze(['select', 'direct', 'ai', 'style']);

const safe = (value, limit = 8000) => typeof value === 'string' ? value.slice(0, limit) : '';

export function actionForMode(mode, detail = 'style') {
  if (mode === 'direct') return 'set_text';
  if (mode === 'ai') return 'ai_instruction';
  if (mode === 'style') return detail === 'attribute' ? 'set_attribute' : 'set_style';
  return 'select';
}

export function channelForAction(action) {
  if (action === 'replace_structure') return 'source';
  return 'presentation';
}

export function operationCapabilities(node) {
  const caps = node?.capabilities ?? {};
  const tag = String(node?.tag ?? '').toLowerCase();
  const crossOrigin = caps.cross_origin === true || node?.boundary === 'cross_origin_iframe' || tag === 'iframe';
  const canvas = caps.canvas === true || node?.boundary === 'canvas_visual' || tag === 'canvas';
  const bound = caps.bound === true || node?.boundary === 'bound';
  const dynamic = caps.dynamic === true || node?.kind === 'dynamic_region' || node?.boundary === 'dynamic_region';
  const scriptGenerated = caps.script_generated === true || node?.boundary === 'script_region' || dynamic;
  const opaque = bound || crossOrigin || canvas || scriptGenerated;
  return Object.freeze({
    select: caps.select !== false,
    direct_text: caps.direct_text === true && !opaque,
    ai: caps.ai === true && !bound && !crossOrigin,
    attribute: caps.attribute === true && !opaque,
    style: caps.style === true && !opaque,
    structure: caps.structure === true && !opaque,
    bound,
    script_generated: scriptGenerated,
    dynamic,
    cross_origin: crossOrigin,
    canvas,
  });
}

function actionAllowed(caps, action) {
  if (action === 'select') return caps.select !== false;
  if (action === 'set_text') return caps.direct_text === true;
  if (action === 'set_attribute') return caps.attribute === true;
  if (action === 'set_style') return caps.style === true;
  if (action === 'replace_structure') return caps.structure === true;
  if (action === 'ai_instruction') return caps.ai === true;
  return false;
}

export function operationBoundary(node, kind = 'ai_instruction') {
  const caps = operationCapabilities(node);
  if (kind === 'select') return '';
  if (caps.bound) return '业务绑定区域由数据合同保护，不能直接写入。';
  if (caps.cross_origin) return '跨域 iframe 只能查看能力边界，不能读取或改写内部 DOM。';
  if (caps.canvas) return 'canvas 是像素绘制表面，只能查看能力边界，不能按文字直接改写。';
  if (caps.dynamic || caps.script_generated) return '脚本或动态区域只显示能力边界，不能直接改写。';
  if (node?.mapping === 'runtime') return '当前是运行时 DOM 选区；操作会携带节点路径，待服务端 Node Graph 接口落地后提交。';
  if (kind === 'set_text' && !caps.direct_text) return '当前节点不能直接改文字。';
  return '';
}

function styleText(styles) {
  return Object.entries(styles ?? {}).map(([key, value]) => `${key}: ${value}`).join('; ');
}

function attributeText(attributes) {
  return Object.entries(attributes ?? {}).map(([key, value]) => `${key}="${value}"`).join(' ');
}

function proposedText(action, input, attributes, styles) {
  if (typeof input.proposed === 'string') return input.proposed;
  if (typeof input.proposedValue === 'string') return input.proposedValue;
  if (action === 'set_style') return styleText(styles) || input.value || '';
  if (action === 'set_attribute') return attributeText(attributes) || input.value || '';
  if (action === 'replace_structure') return input.structure ?? input.value ?? '';
  if (action === 'ai_instruction') return input.instruction || input.value || '';
  if (action === 'select') return '';
  return input.value ?? '';
}

export function createEditOperation({
  pageId, baseVersion, node, channel, kind, action, value = '', instruction = '',
  attributes = {}, styles = {}, structure = null, original, proposed, proposedValue: proposedAlias,
} = {}) {
  if (!node?.node_id) throw new Error('缺少 DOM 选区');
  const resolvedAction = EDIT_ACTIONS.includes(action) ? action : (EDIT_ACTIONS.includes(kind) ? kind : 'ai_instruction');
  const resolvedChannel = channel ?? channelForAction(resolvedAction);
  if (!EDIT_CHANNELS.includes(resolvedChannel)) throw new Error('未知编辑通道');
  if (!EDIT_ACTIONS.includes(resolvedAction)) throw new Error('未知编辑操作');
  const caps = operationCapabilities(node);
  const boundary = operationBoundary(node, resolvedAction);
  const crumbs = Array.isArray(node.breadcrumb) ? node.breadcrumb : [];
  const originalValue = safe(original ?? node.text ?? '');
  const nextValue = safe(proposedText(resolvedAction, {
    proposed, proposedValue: proposedAlias, value, instruction, structure,
  }, attributes, styles));
  const permitted = resolvedAction === 'select' || (actionAllowed(caps, resolvedAction) && !boundary);
  const target = Object.freeze({
    node_id: node.node_id,
    kind: node.kind ?? 'static_element',
    mapping: node.mapping ?? 'runtime',
    mapping_token: node.mapping_token ?? null,
    version_hash: node.version_hash ?? null,
    page_id: node.page_id ?? pageId ?? null,
    selector: node.selector ?? null,
    source_range: node.source_range ?? null,
    source_hash: node.source_hash ?? null,
    region_hash: node.region_hash ?? null,
    tag: node.tag ?? null,
    text: safe(node.text ?? ''),
    parent_node_id: node.parent_node_id ?? null,
    parent_block: node.parent_block ?? null,
    breadcrumb: crumbs,
    capabilities: caps,
  });
  const draft = {
    operation_id: `ui_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    page_id: pageId ?? null,
    base_version: Number.isInteger(baseVersion) ? baseVersion : null,
    channel: resolvedChannel,
    action: resolvedAction,
    kind: resolvedAction,
    target,
    breadcrumb: crumbs,
    original_value: originalValue,
    proposed_value: nextValue,
    capability: caps,
    payload: Object.freeze({
      value: safe(value),
      instruction: safe(instruction, 4000),
      attributes: Object.freeze({ ...attributes }),
      styles: Object.freeze({ ...styles }),
      structure: structure == null ? null : safe(structure),
      original_value: originalValue,
      proposed_value: nextValue,
    }),
    boundary: boundary || null,
    status: permitted ? 'ready_for_adapter' : 'needs_contract',
  };
  const formal = toFormalEditOperation(draft);
  return Object.freeze({
    ...draft,
    formal: formal.operation ?? null,
    context_only: formal.context_only === true,
  });
}

function nodeRefFrom(node, pageId) {
  if (!node?.node_id || !node.source_hash || !node.region_hash || !node.mapping_token) return null;
  const sourceRange = node.source_range && Number.isInteger(node.source_range.start) && Number.isInteger(node.source_range.end)
    ? { start: node.source_range.start, end: node.source_range.end }
    : null;
  const selector = typeof node.selector === 'string' && node.selector.trim() ? node.selector : null;
  if (!sourceRange && !selector) return null;
  return {
    page_id: node.page_id || pageId,
    node_id: node.node_id,
    kind: node.kind === 'dynamic_region' ? 'dynamic_region' : 'static_element',
    selector,
    source_range: sourceRange,
    mapping_token: node.mapping_token,
    source_hash: node.source_hash,
    region_hash: node.region_hash,
  };
}

/** Convert a UI verb into a free-page-edit/v1 operation, or an edit-context request. */
export function toFormalEditOperation(uiOperation, { idempotencyKey = 'ui_edit' } = {}) {
  if (!uiOperation || typeof uiOperation !== 'object') return Object.freeze({ ok: false, reason: 'forged_message' });
  const action = uiOperation.action || uiOperation.kind;
  const node = uiOperation.target ?? null;
  const blocked = node?.capabilities?.bound || node?.capabilities?.cross_origin || node?.capabilities?.canvas
    || node?.capabilities?.dynamic || node?.capabilities?.script_generated || node?.mapping === 'runtime';
  if (action === 'ai_instruction') {
    return Object.freeze({
      ok: true,
      context_only: true,
      operation: null,
      edit_context: Object.freeze({
        page_id: uiOperation.page_id,
        base_version: uiOperation.base_version,
        node_id: node?.node_id ?? null,
        instruction: uiOperation.payload?.instruction ?? uiOperation.proposed_value ?? '',
      }),
    });
  }
  if (blocked) return Object.freeze({ ok: false, reason: 'capability_boundary', operation: null });
  const ref = nodeRefFrom(node, uiOperation.page_id);
  if (!ref || !Number.isInteger(uiOperation.base_version)) {
    return Object.freeze({ ok: false, reason: 'needs_contract', operation: null });
  }
  if (action === 'replace_structure') {
    const payload = uiOperation.payload?.structure || uiOperation.proposed_value || '';
    if (!ref.source_range) return Object.freeze({ ok: false, reason: 'needs_contract', operation: null });
    return Object.freeze({
      ok: true,
      context_only: false,
      operation: buildFormalEditOperation({
        pageId: ref.page_id,
        node: ref,
        channel: 'source',
        action: 'replace',
        payload,
        idempotencyKey,
        baseVersion: uiOperation.base_version,
        operationId: uiOperation.operation_id,
      }),
    });
  }
  const overlay = {};
  if (action === 'set_text') overlay.text = uiOperation.proposed_value || uiOperation.payload?.value || '';
  else if (action === 'set_style') overlay.style = { ...(uiOperation.payload?.styles ?? {}) };
  else if (action === 'set_attribute') overlay.attributes = { ...(uiOperation.payload?.attributes ?? {}) };
  else return Object.freeze({ ok: false, reason: 'unknown_action', operation: null });
  if (!Object.keys(overlay).length || (overlay.style && !Object.keys(overlay.style).length) || (overlay.attributes && !Object.keys(overlay.attributes).length && action === 'set_attribute')) {
    return Object.freeze({ ok: false, reason: 'empty_overlay', operation: null });
  }
  return Object.freeze({
    ok: true,
    context_only: false,
    operation: buildFormalEditOperation({
      pageId: ref.page_id,
      node: ref,
      channel: 'presentation',
      action: 'update',
      payload: overlay,
      idempotencyKey,
      baseVersion: uiOperation.base_version,
      operationId: uiOperation.operation_id,
    }),
  });
}

function reject(reason) {
  return Object.freeze({ ok: false, reason });
}

function foreignNodeIds(operation, selection) {
  const blob = [
    operation?.proposed_value,
    operation?.payload?.structure,
    operation?.payload?.value,
  ].filter(item => typeof item === 'string').join('\n');
  const ids = [...blob.matchAll(/data-shine-(?:node|region)\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
  const allowed = new Set([
    selection?.node_id,
    ...(selection?.breadcrumb ?? []).map(row => row.node_id),
    selection?.parent_block?.node_id,
  ].filter(Boolean));
  return ids.filter(id => !allowed.has(id));
}

function dangerousPayload(operation, action) {
  const attributes = operation?.payload?.attributes ?? {};
  for (const [key, value] of Object.entries(attributes)) {
    if (/^on/i.test(key) || /^(srcdoc|formaction)$/i.test(key)) return true;
    if (typeof value === 'string' && /javascript:/i.test(value)) return true;
  }
  const styles = JSON.stringify(operation?.payload?.styles ?? {});
  if (/expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:/i.test(styles)) return true;
  if (action === 'replace_structure') {
    const structure = `${operation?.proposed_value ?? ''}\n${operation?.payload?.structure ?? ''}`;
    if (/<script\b|javascript:/i.test(structure)) return true;
  }
  return false;
}

/** Reject forged, stale, unknown, out-of-selection and boundary writes. */
export function acceptOperation(operation, context = {}) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return reject('forged_message');
  const action = operation.action || operation.kind;
  if (!EDIT_CHANNELS.includes(operation.channel) || !EDIT_ACTIONS.includes(action)) return reject('forged_message');
  if (context.pageId != null && operation.page_id !== context.pageId) return reject('wrong_page');
  if (context.version != null && operation.base_version !== context.version) return reject('wrong_version');
  const targetId = operation.target?.node_id;
  if (typeof targetId !== 'string' || !targetId) return reject('unknown_node');
  const selection = context.selection ?? null;
  if (!selection?.node_id) return reject('outside_selection');
  if (selection.node_id !== targetId) return reject('outside_selection');
  const catalog = (context.nodes ?? []).find(node => node?.node_id === targetId) ?? null;
  const node = catalog ?? selection;
  if (!node?.node_id) return reject('unknown_node');
  if (!catalog && selection.mapping !== 'runtime') return reject('unknown_node');
  if (foreignNodeIds(operation, selection).length) return reject('outside_selection');
  const caps = operationCapabilities(node);
  if (action !== 'select' && caps.bound) return reject('bound_write');
  if (action !== 'select' && (caps.cross_origin || caps.canvas)) return reject('capability_boundary');
  if (action === 'set_text' && !caps.direct_text) return reject('capability_boundary');
  if (action !== 'select' && action !== 'ai_instruction' && (caps.dynamic || caps.script_generated || node.mapping === 'runtime')) {
    return reject('capability_boundary');
  }
  if (dangerousPayload(operation, action)) return reject('capability_boundary');
  if (context.apply) {
    if (node.mapping !== 'valid' || caps.bound) return reject('capability_boundary');
    const writable = (action === 'set_text' && caps.direct_text)
      || (action === 'set_style' && caps.style)
      || (action === 'set_attribute' && caps.attribute)
      || (action === 'replace_structure' && caps.structure);
    if (!writable) return reject('capability_boundary');
  }
  return Object.freeze({ ok: true, operation });
}

export function formatCapability(node) {
  const caps = operationCapabilities(node);
  const parts = [];
  if (caps.select !== false) parts.push('可选');
  if (caps.direct_text) parts.push('可直接改文字');
  if (caps.ai) parts.push('可交给 AI');
  if (caps.style) parts.push('可改样式');
  if (caps.attribute) parts.push('可改属性');
  if (caps.structure) parts.push('可改结构');
  if (caps.bound) parts.push('绑定节点不可写入');
  if (caps.cross_origin) parts.push('跨域 iframe 不可写入');
  if (caps.canvas) parts.push('canvas 不可直接写入');
  if (caps.dynamic || caps.script_generated) parts.push('动态区域不可直接写入');
  if (!caps.direct_text && node?.mapping === 'runtime') parts.push('运行时身份待接入');
  return parts.join(' · ');
}

export function parseStyleDeclaration(text) {
  const styles = {};
  for (const part of String(text ?? '').split(';')) {
    const index = part.indexOf(':');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!/^[a-z-]+$/i.test(key)) continue;
    if (/expression\s*\(|javascript:|url\s*\(/i.test(value)) continue;
    styles[key] = value.slice(0, 200);
  }
  return styles;
}

export function nodeLabel(node) {
  if (!node) return '未选择元素';
  const text = String(node.text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return `${node.tag ?? '元素'}${text ? ` · ${text.slice(0, 48)}` : ''}`;
}
