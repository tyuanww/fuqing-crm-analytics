/** Trusted CRM assets use account-bound HTTP only; never accept client facts. */
import { createHash, randomUUID } from 'node:crypto';
import { normalizePurchases, validateBinding, validateRequest } from './dashboard.mjs';

export const ASSET_MESSAGES = Object.freeze({
  INVALID_REQUEST: '请求无效，请重新打开 CRM 分析。', NOT_CONNECTED: '请先连接当前对话的 CRM。',
  AUTH_EXPIRED: 'CRM 登录已失效，请重新连接。', ACCOUNT_MISMATCH: 'CRM 账号已变化，请重新连接。',
  ACCESS_DENIED: '当前账号无权访问。', NOT_FOUND: '分析不存在或当前账号不可见。',
  CONFLICT: '请求内容已变化，或此快照已有其他标题的分析。请刷新核对。',
  VERSION_CONFLICT: '内容已被更新，请刷新后基于最新版本继续。',
  ACCOUNT_NOT_FOUND: '找不到该 CRM 账号，未建立分享。',
  INVALID_BOARD: '组板内容无效：请检查指标来源、布局和展示属性。',
  STATE_NOT_CONFIGURED: '尚未配置独立的 CRM 分析存储。', STATE_LIMIT: '当前账号的保存数量已达上限。',
  STATE_UNAVAILABLE: 'CRM 分析存储暂不可用。', DATA_WARNING: '查询区间包含未来日期，未生成快照。',
  INVALID_RESPONSE: 'CRM 返回内容未通过校验，未展示结果。', SERVICE_UNAVAILABLE: 'CRM 服务暂不可用，请重试核对。',
  CANCELLED: '操作已取消；若已点击保存，请重新连接后刷新核对。',
  TIMEOUT: '请求超时，保存结果可能已落盘。请使用原请求重试核对。',
});
class AssetError extends Error { constructor(code) { super(ASSET_MESSAGES[code]); this.code = code; } }
/** @returns {never} */
function fail(code) { throw new AssetError(code); }
const id = (value, kind) => typeof value === 'string' && new RegExp(`^crm_${kind}_[0-9a-f]{32}$`).test(value);
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical)
  : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const timestamp = value => typeof value === 'string' && /^20\d\d-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const title = value => typeof value === 'string' && value.trim() === value && value.length > 0 && [...value].length <= 120 && !/[\x00-\x1f\x7f]/.test(value);
const citationTitle = value => typeof value === 'string' && value.trim() === value && value.length > 0 && [...value].length <= 200 && !/[\x00-\x1f\x7f]/.test(value);
const description = value => typeof value === 'string' && value.trim() === value && [...value].length <= 500 && !/[\x00-\x1f\x7f]/.test(value);
const username = value => typeof value === 'string' && /^[A-Za-z0-9_.@-]{1,64}$/.test(value);
const revision = value => Number.isInteger(value) && value >= 1 && value <= 10_000_000;
const FILTER_CODES = ['NOT_FOUND', 'CONFLICT', 'VERSION_CONFLICT', 'ACCOUNT_NOT_FOUND', 'ACCESS_DENIED', 'INVALID_BOARD',
  'STATE_NOT_CONFIGURED', 'STATE_LIMIT', 'STATE_UNAVAILABLE', 'DATA_WARNING'];
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function projectSnapshot(value, dataKind) {
  if (!value || value.schema_version !== 'crm-result-snapshot/v1' || !id(value.snapshot_id, 's') ||
      value.data_kind !== dataKind || !timestamp(value.captured_at) || !/^[a-f0-9]{64}$/.test(value.result_sha256 ?? '')) fail('INVALID_RESPONSE');
  try {
    const filters = validateRequest(value.result?.filters);
    normalizePurchases(value.result, filters, dataKind);
    const r = value.result;
    const coverage = Object.fromEntries(['rows', 'orders', 'buyers', 'unknown_order_rows', 'unknown_order_amount_fen',
      'unknown_buyer_rows', 'unknown_buyer_amount_fen', 'zero_amount_orders', 'zero_only_buyers', 'negative_amount_rows', 'null_amount_rows'].map(k => [k, r.coverage[k]]));
    const avg = v => Object.fromEntries(['amount_fen', 'denominator', 'reason'].map(k => [k, v[k]]));
    if (!Array.isArray(r.limitations) || r.limitations.length > 20 || r.limitations.some(v => typeof v !== 'string' || v.length > 1000)) fail('INVALID_RESPONSE');
    const result = { schema_version: r.schema_version, metric_version: r.metric_version, filters, gsv_amount_fen: r.gsv_amount_fen,
      coverage, aov: avg(r.aov), aus: avg(r.aus), limitations: [...r.limitations], data_through: null, refund_as_of: null };
    if (hash(result) !== value.result_sha256) fail('INVALID_RESPONSE');
    return { schema_version: value.schema_version, snapshot_id: value.snapshot_id, captured_at: value.captured_at,
      data_kind: dataKind, result_sha256: value.result_sha256, result };
  } catch { fail('INVALID_RESPONSE'); }
}
function projectCitations(value) {
  const items = value ?? [];
  if (!Array.isArray(items) || items.length > 20) fail('INVALID_RESPONSE');
  const chunks = new Set();
  return items.map(item => {
    if (!item || item.schema_version !== 'crm-knowledge-citation/v1' || !UUID.test(item.knowledge_id)
        || !UUID.test(item.knowledge_base_id) || !UUID.test(item.chunk_id) || !/^[a-f0-9]{64}$/.test(item.content_sha256 ?? '')
        || !citationTitle(item.title)
        || Object.hasOwn(item, 'excerpt') || Object.hasOwn(item, 'content') || Object.hasOwn(item, 'owner')) fail('INVALID_RESPONSE');
    if (item.updated_at != null && (typeof item.updated_at !== 'string' || !item.updated_at || item.updated_at.length > 64)) fail('INVALID_RESPONSE');
    if (item.processed_at != null && (typeof item.processed_at !== 'string' || !item.processed_at || item.processed_at.length > 64)) fail('INVALID_RESPONSE');
    if (chunks.has(item.chunk_id)) fail('INVALID_RESPONSE');
    chunks.add(item.chunk_id);
    return { schema_version: item.schema_version, knowledge_id: item.knowledge_id, knowledge_base_id: item.knowledge_base_id,
      chunk_id: item.chunk_id, content_sha256: item.content_sha256, title: item.title,
      updated_at: item.updated_at ?? null, processed_at: item.processed_at ?? null };
  });
}
function projectAnalysis(value, dataKind) {
  if (!value || value.schema_version !== 'crm-saved-analysis/v1' || !id(value.analysis_id, 'a') || !title(value.title)
      || !description(value.description ?? '') || !timestamp(value.saved_at) || !revision(value.revision ?? 1)) fail('INVALID_RESPONSE');
  const updated = value.updated_at ?? value.saved_at;
  if (!timestamp(updated)) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, analysis_id: value.analysis_id, title: value.title,
    description: value.description ?? '', saved_at: value.saved_at, updated_at: updated, revision: value.revision ?? 1,
    snapshot: projectSnapshot(value.snapshot, dataKind), knowledge_citations: projectCitations(value.knowledge_citations) };
}
function projectReference(value, dataKind) {
  if (!value || value.schema_version !== 'crm-cockpit-reference/v1' || !id(value.reference_id, 'r') || !timestamp(value.added_at)) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, reference_id: value.reference_id, added_at: value.added_at, analysis: projectAnalysis(value.analysis, dataKind) };
}
function projectLibrary(value, kind) {
  if (!value || value.schema_version !== 'crm-library/v1' || value.data_kind !== kind) fail('INVALID_RESPONSE');
  const result = { schema_version: value.schema_version, data_kind: kind };
  for (const [key, project] of [['snapshots', projectSnapshot], ['analyses', projectAnalysis], ['references', projectReference]]) {
    if (!Array.isArray(value[key]) || value[key].length > 20 || typeof value[key + '_truncated'] !== 'boolean') fail('INVALID_RESPONSE');
    result[key] = value[key].map(item => project(item, kind)); result[key + '_truncated'] = value[key + '_truncated'];
  }
  return result;
}
function projectSummary(value) {
  if (!value || value.schema_version !== 'crm-saved-analysis-summary/v1' || !id(value.analysis_id, 'a') || !title(value.title)
      || !description(value.description ?? '') || !timestamp(value.saved_at) || !timestamp(value.updated_at)
      || !revision(value.revision) || !id(value.snapshot_id, 's') || !['owner', 'shared'].includes(value.access)) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, analysis_id: value.analysis_id, title: value.title, description: value.description ?? '',
    saved_at: value.saved_at, updated_at: value.updated_at, revision: value.revision, snapshot_id: value.snapshot_id,
    filters: validateRequest(value.filters), access: value.access };
}
function projectPage(value, kind) {
  if (!value || value.schema_version !== 'crm-analysis-page/v1' || value.data_kind !== kind || !Array.isArray(value.items) || value.items.length > 20) fail('INVALID_RESPONSE');
  if (value.next_cursor != null && (typeof value.next_cursor !== 'string' || value.next_cursor.length > 200)) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, data_kind: kind, items: value.items.map(projectSummary), next_cursor: value.next_cursor ?? null };
}
function projectShareList(value) {
  if (!value || value.schema_version !== 'crm-analysis-shares/v1' || !id(value.analysis_id, 'a') || !Array.isArray(value.grants) || value.grants.length > 20) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, analysis_id: value.analysis_id, grants: value.grants.map(item => {
    if (!username(item?.username) || !timestamp(item.granted_at)) fail('INVALID_RESPONSE');
    return { username: item.username, granted_at: item.granted_at };
  }) };
}
function projectLayout(value) {
  if (!value || ![value.x, value.y, value.w, value.h].every(n => Number.isInteger(n)) || value.x < 0 || value.y < 0
      || value.w < 3 || value.h < 3 || value.x + value.w > 12 || value.y + value.h > 40) fail('INVALID_RESPONSE');
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}
function projectDisplay(value) {
  const display = value ?? {};
  const tone = display.tone ?? 'neutral';
  const density = display.density ?? 'comfortable';
  const value_format = display.value_format ?? 'standard';
  const show_coverage = display.show_coverage ?? true;
  if (!['neutral', 'accent', 'muted'].includes(tone) || !['comfortable', 'compact'].includes(density)
      || !['standard', 'compact'].includes(value_format) || typeof show_coverage !== 'boolean') fail('INVALID_RESPONSE');
  return { tone, density, value_format, show_coverage };
}
function projectComponent(value, dataKind) {
  if (!value || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value.block_id) || !title(value.title) || !id(value.analysis_id, 'a')
      || !id(value.snapshot_id, 's') || !['gsv', 'aov', 'aus', 'orders', 'buyers'].includes(value.metric)
      || value.metric_version !== 'dashboard-gsv-purchases/v1' || !/^[a-f0-9]{64}$/.test(value.result_sha256 ?? '')) fail('INVALID_RESPONSE');
  const amount = value.value ?? {};
  if (amount.amount_fen != null && !Number.isInteger(amount.amount_fen)) fail('INVALID_RESPONSE');
  if (amount.denominator != null && !Number.isInteger(amount.denominator)) fail('INVALID_RESPONSE');
  if (amount.count != null && !Number.isInteger(amount.count)) fail('INVALID_RESPONSE');
  if (amount.reason != null && typeof amount.reason !== 'string') fail('INVALID_RESPONSE');
  return { block_id: value.block_id, title: value.title, analysis_id: value.analysis_id, snapshot_id: value.snapshot_id,
    metric: value.metric, layout: projectLayout(value.layout), display: projectDisplay(value.display),
    filters: validateRequest(value.filters), metric_version: value.metric_version,
    value: { amount_fen: amount.amount_fen ?? null, denominator: amount.denominator ?? null, reason: amount.reason ?? null, count: amount.count ?? null },
    result_sha256: value.result_sha256 };
}
function projectBoard(value, dataKind) {
  if (!value || value.schema_version !== 'crm-board/v1' || !id(value.board_id, 'b') || !title(value.title)
      || !description(value.description ?? '') || !timestamp(value.saved_at) || !timestamp(value.updated_at)
      || !revision(value.revision) || !Array.isArray(value.components) || value.components.length < 1 || value.components.length > 12) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, board_id: value.board_id, title: value.title, description: value.description ?? '',
    saved_at: value.saved_at, updated_at: value.updated_at, revision: value.revision,
    components: value.components.map(item => projectComponent(item, dataKind)) };
}
function projectBoardPage(value, kind) {
  if (!value || value.schema_version !== 'crm-board-page/v1' || value.data_kind !== kind || !Array.isArray(value.items) || value.items.length > 20) fail('INVALID_RESPONSE');
  if (value.next_cursor != null && (typeof value.next_cursor !== 'string' || value.next_cursor.length > 200)) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, data_kind: kind, next_cursor: value.next_cursor ?? null, items: value.items.map(item => {
    if (!item || item.schema_version !== 'crm-board-summary/v1' || !id(item.board_id, 'b') || !title(item.title)
        || !description(item.description ?? '') || !timestamp(item.saved_at) || !timestamp(item.updated_at)
        || !revision(item.revision) || !Number.isInteger(item.component_count) || item.component_count < 1 || item.component_count > 12) fail('INVALID_RESPONSE');
    return { schema_version: item.schema_version, board_id: item.board_id, title: item.title, description: item.description ?? '',
      saved_at: item.saved_at, updated_at: item.updated_at, revision: item.revision, component_count: item.component_count };
  }) };
}

async function request(base, binding, signal, path, { method, body, key } = {}) {
  const verb = method ?? (body ? 'POST' : 'GET');
  const res = await fetch(new URL(path, base), { method: verb, redirect: 'error', signal,
    headers: { authorization: `Bearer ${binding.token}`, accept: 'application/json',
      ...(body ? { 'content-type': 'application/json', 'idempotency-key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    if (res.status === 401) fail('AUTH_EXPIRED');
    if (res.status === 403) fail('ACCESS_DENIED');
    if (!/^application\/json(?:\s*;|$)/i.test(res.headers.get('content-type') ?? '')) fail('SERVICE_UNAVAILABLE');
    const chunks = []; let size = 0;
    for await (const chunk of res.body) { size += chunk.length; if (size > 512 * 1024) fail('INVALID_RESPONSE'); chunks.push(Buffer.from(chunk)); }
    let raw; try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('INVALID_RESPONSE'); }
    if (!res.ok) {
      const code = raw?.detail?.code;
      fail(FILTER_CODES.includes(code) ? code : 'SERVICE_UNAVAILABLE');
    }
    if (res.headers.has('x-data-warning')) fail('DATA_WARNING');
    return raw;
  } finally { if (res.body && !res.body.locked) await res.body.cancel().catch(() => {}); }
}

function exactKeys(input, keys) {
  return keys && Object.keys(input).length === keys.length && Object.keys(input).every(k => keys.includes(k));
}

function draftComponent(value) {
  if (!value || typeof value !== 'object' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value.block_id) || !title(value.title)
      || !id(value.analysis_id, 'a') || !id(value.snapshot_id, 's') || !['gsv', 'aov', 'aus', 'orders', 'buyers'].includes(value.metric)) fail('INVALID_REQUEST');
  if ('value' in value || 'result_sha256' in value || 'filters' in value || 'metric_version' in value) fail('INVALID_REQUEST');
  return { block_id: value.block_id, title: value.title, analysis_id: value.analysis_id, snapshot_id: value.snapshot_id,
    metric: value.metric, layout: projectLayout(value.layout), display: projectDisplay(value.display) };
}

function boardBody(input, patch) {
  if (!title(input.title) || !description(input.description ?? '') || !Array.isArray(input.components)
      || input.components.length < 1 || input.components.length > 12) fail('INVALID_REQUEST');
  if (patch && !revision(input.base_revision)) fail('INVALID_REQUEST');
  return { title: input.title, description: input.description ?? '', components: input.components.map(draftComponent),
    ...(patch ? { base_revision: input.base_revision } : {}) };
}

/** Operation and body are allowlisted before any authenticated network call. */
export async function crmAssetRequest(input, { sessionId, binding, signal, timeoutMs = 25000, hostCitations } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs); const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    combined.throwIfAborted();
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST');
    const { operation } = input;
    const shapes = {
      library: ['operation'], capture: ['operation', 'filters', 'key'],
      save: ['operation', 'snapshot_id', 'title', 'key'], pin: ['operation', 'analysis_id', 'key'],
      search: ['operation', 'q', 'cursor', 'limit', 'scope'], get: ['operation', 'analysis_id'],
      patch: ['operation', 'analysis_id', 'title', 'description', 'base_revision', 'key'],
      shares: ['operation', 'analysis_id'], share: ['operation', 'analysis_id', 'username', 'key'],
      unshare: ['operation', 'analysis_id', 'username', 'key'],
      boards: ['operation', 'q', 'cursor', 'limit'], get_board: ['operation', 'board_id'],
      save_board: ['operation', 'title', 'description', 'components', 'key'],
      patch_board: ['operation', 'board_id', 'title', 'description', 'components', 'base_revision', 'key'],
    };
    const keys = shapes[operation];
    const saveKeys = operation === 'save' ? (Object.hasOwn(input, 'description') ? [...shapes.save, 'description'] : shapes.save) : keys;
    if (!exactKeys(input, saveKeys)) fail('INVALID_REQUEST');
    if (['capture', 'save', 'pin', 'patch', 'share', 'unshare', 'save_board', 'patch_board'].includes(operation)
        && (typeof input.key !== 'string' || !/^[!-~]{1,100}$/.test(input.key))) fail('INVALID_REQUEST');
    let filters;
    if (operation === 'capture') { try { filters = validateRequest(input.filters); } catch { fail('INVALID_REQUEST'); } }
    if (operation === 'save' && (!id(input.snapshot_id, 's') || !title(input.title) || (input.description != null && !description(input.description)))) fail('INVALID_REQUEST');
    if (operation === 'pin' && !id(input.analysis_id, 'a')) fail('INVALID_REQUEST');
    if (['search', 'boards'].includes(operation)) {
      if (typeof input.q !== 'string' || input.q.length > 80 || /[\x00-\x1f\x7f]/.test(input.q)
          || (input.cursor != null && (typeof input.cursor !== 'string' || input.cursor.length > 200))
          || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) fail('INVALID_REQUEST');
      if (operation === 'search' && !['owned', 'shared', 'all'].includes(input.scope)) fail('INVALID_REQUEST');
    }
    if (['get', 'patch', 'shares', 'share', 'unshare'].includes(operation) && !id(input.analysis_id, 'a')) fail('INVALID_REQUEST');
    if (operation === 'patch' && (!title(input.title) || !description(input.description) || !revision(input.base_revision))) fail('INVALID_REQUEST');
    if (['share', 'unshare'].includes(operation) && !username(input.username)) fail('INVALID_REQUEST');
    if (['get_board', 'patch_board'].includes(operation) && !id(input.board_id, 'b')) fail('INVALID_REQUEST');
    if (['save_board', 'patch_board'].includes(operation)) boardBody(input, operation === 'patch_board');
    if (!binding) fail('NOT_CONNECTED');
    const base = validateBinding(binding, sessionId);
    const me = await request(base, binding, combined, '/api/v1/auth/me');
    if (me?.username !== binding.username) fail('ACCOUNT_MISMATCH');
    const query = (q, cursor, limit, extra = '') => `crm-analyses?q=${encodeURIComponent(q)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${extra}`;
    const boardQuery = (q, cursor, limit) => `crm-boards?q=${encodeURIComponent(q)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const routes = {
      library: () => ['GET', 'crm-library', undefined, projectLibrary],
      capture: () => ['POST', 'dashboard-snapshots', filters, projectSnapshot],
      save: () => ['POST', 'crm-analyses', { snapshot_id: input.snapshot_id, title: input.title, ...(input.description != null ? { description: input.description } : {}) }, projectAnalysis],
      pin: () => ['POST', 'crm-cockpit-references', { analysis_id: input.analysis_id }, projectReference],
      search: () => ['GET', query(input.q, input.cursor, input.limit, `&scope=${input.scope}`), undefined, projectPage],
      get: () => ['GET', `crm-analyses/${input.analysis_id}`, undefined, projectAnalysis],
      patch: () => ['PATCH', `crm-analyses/${input.analysis_id}`, { title: input.title, description: input.description, base_revision: input.base_revision }, projectAnalysis],
      shares: () => ['GET', `crm-analyses/${input.analysis_id}/shares`, undefined, projectShareList],
      share: () => ['POST', `crm-analyses/${input.analysis_id}/shares`, { username: input.username }, projectShareList],
      unshare: () => ['POST', `crm-analyses/${input.analysis_id}/shares/${input.username}/revoke`, {}, projectShareList],
      boards: () => ['GET', boardQuery(input.q, input.cursor, input.limit), undefined, projectBoardPage],
      get_board: () => ['GET', `crm-boards/${input.board_id}`, undefined, projectBoard],
      save_board: () => ['POST', 'crm-boards', boardBody(input, false), projectBoard],
      patch_board: () => ['PATCH', `crm-boards/${input.board_id}`, boardBody(input, true), projectBoard],
    };
    const [method, path, body, project] = routes[operation]();
    const raw = await request(base, binding, combined, '/api/v1/metrics/' + path, { method, body, key: input.key });
    let value = project(raw, binding.dataKind);
    if (operation === 'save' && hostCitations?.length) {
      const bound = await request(base, binding, combined, `/api/v1/metrics/crm-analyses/${value.analysis_id}/knowledge-citations`,
        { method: 'POST', body: { citations: hostCitations }, key: `${input.key}:citations` });
      value = projectAnalysis(bound, binding.dataKind);
      if (value.knowledge_citations.length !== hostCitations.length) fail('INVALID_RESPONSE');
    }
    if ((operation === 'save' && (value.snapshot.snapshot_id !== input.snapshot_id || value.title !== input.title)) ||
        (operation === 'pin' && value.analysis.analysis_id !== input.analysis_id) ||
        (operation === 'capture' && JSON.stringify(canonical(value.result.filters)) !== JSON.stringify(canonical(filters))) ||
        (operation === 'patch' && (value.analysis_id !== input.analysis_id || value.title !== input.title || value.description !== input.description)) ||
        (['share', 'unshare', 'shares'].includes(operation) && value.analysis_id !== input.analysis_id) ||
        (operation === 'get_board' && value.board_id !== input.board_id) ||
        (operation === 'save_board' && value.title !== input.title) ||
        (operation === 'patch_board' && (value.board_id !== input.board_id || value.title !== input.title))) fail('INVALID_RESPONSE');
    combined.throwIfAborted();
    return { ok: true, value };
  } catch (error) {
    const code = signal?.aborted ? 'CANCELLED' : timeout.aborted ? 'TIMEOUT' : error instanceof AssetError ? error.code : 'SERVICE_UNAVAILABLE';
    return { ok: false, code, message: ASSET_MESSAGES[code] };
  }
}

export function captureRequest(filters) { return { operation: 'capture', filters, key: randomUUID() }; }
