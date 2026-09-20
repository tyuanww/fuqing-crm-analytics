/** Trusted CRM assets use account-bound HTTP only; never accept client facts. */
import { createHash, randomUUID } from 'node:crypto';
import { normalizePurchases, validateBinding, validateRequest } from './dashboard.mjs';

export const ASSET_MESSAGES = Object.freeze({
  INVALID_REQUEST: '请求无效，请重新打开 CRM 分析。', NOT_CONNECTED: '请先连接当前对话的 CRM。',
  AUTH_EXPIRED: 'CRM 登录已失效，请重新连接。', ACCOUNT_MISMATCH: 'CRM 账号已变化，请重新连接。',
  ACCESS_DENIED: '当前账号无权访问。', NOT_FOUND: '分析不存在或当前账号不可见。',
  CONFLICT: '请求内容已变化，或此快照已有其他标题的分析。请刷新核对。',
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
function projectAnalysis(value, dataKind) {
  if (!value || value.schema_version !== 'crm-saved-analysis/v1' || !id(value.analysis_id, 'a') || !title(value.title) || !timestamp(value.saved_at)) fail('INVALID_RESPONSE');
  return { schema_version: value.schema_version, analysis_id: value.analysis_id, title: value.title, saved_at: value.saved_at,
    snapshot: projectSnapshot(value.snapshot, dataKind) };
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

async function request(base, binding, signal, path, body, key) {
  const res = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', redirect: 'error', signal,
    headers: { authorization: `Bearer ${binding.token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json', 'idempotency-key': key } : {}) },
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
      fail(['NOT_FOUND', 'CONFLICT', 'STATE_NOT_CONFIGURED', 'STATE_LIMIT', 'STATE_UNAVAILABLE', 'DATA_WARNING'].includes(code) ? code : 'SERVICE_UNAVAILABLE');
    }
    if (res.headers.has('x-data-warning')) fail('DATA_WARNING');
    return raw;
  } finally { if (res.body && !res.body.locked) await res.body.cancel().catch(() => {}); }
}

/** Operation and body are allowlisted before any authenticated network call. */
export async function crmAssetRequest(input, { sessionId, binding, signal, timeoutMs = 25000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs); const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    combined.throwIfAborted();
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST');
    const { operation } = input;
    const keys = { library: ['operation'], capture: ['operation', 'filters', 'key'], save: ['operation', 'snapshot_id', 'title', 'key'],
      pin: ['operation', 'analysis_id', 'key'] }[operation];
    if (!keys || Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k))) fail('INVALID_REQUEST');
    if (operation !== 'library' && (typeof input.key !== 'string' || !/^[!-~]{1,100}$/.test(input.key))) fail('INVALID_REQUEST');
    let filters;
    if (operation === 'capture') { try { filters = validateRequest(input.filters); } catch { fail('INVALID_REQUEST'); } }
    if (operation === 'save' && (!id(input.snapshot_id, 's') || !title(input.title))) fail('INVALID_REQUEST');
    if (operation === 'pin' && !id(input.analysis_id, 'a')) fail('INVALID_REQUEST');
    if (!binding) fail('NOT_CONNECTED');
    const base = validateBinding(binding, sessionId);
    const me = await request(base, binding, combined, '/api/v1/auth/me');
    if (me?.username !== binding.username) fail('ACCOUNT_MISMATCH');
    const [path, body, project] = operation === 'library' ? ['crm-library', undefined, projectLibrary]
      : operation === 'capture' ? ['dashboard-snapshots', filters, projectSnapshot]
      : operation === 'save' ? ['crm-analyses', { snapshot_id: input.snapshot_id, title: input.title }, projectAnalysis]
      : ['crm-cockpit-references', { analysis_id: input.analysis_id }, projectReference];
    const raw = await request(base, binding, combined, '/api/v1/metrics/' + path, body, input.key);
    const value = project(raw, binding.dataKind);
    if ((operation === 'save' && (value.snapshot.snapshot_id !== input.snapshot_id || value.title !== input.title)) ||
        (operation === 'pin' && value.analysis.analysis_id !== input.analysis_id) ||
        (operation === 'capture' && JSON.stringify(canonical(value.result.filters)) !== JSON.stringify(canonical(filters)))) fail('INVALID_RESPONSE');
    combined.throwIfAborted();
    return { ok: true, value };
  } catch (error) {
    const code = signal?.aborted ? 'CANCELLED' : timeout.aborted ? 'TIMEOUT' : error instanceof AssetError ? error.code : 'SERVICE_UNAVAILABLE';
    return { ok: false, code, message: ASSET_MESSAGES[code] };
  }
}

export function captureRequest(filters) { return { operation: 'capture', filters, key: randomUUID() }; }
