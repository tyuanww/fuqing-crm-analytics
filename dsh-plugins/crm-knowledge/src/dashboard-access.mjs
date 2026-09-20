/** CRM credentials stay in this host closure, never env, disk, RPC or tool output. */
import { dashboardOrigin, queryDashboardGsv, queryDashboardPurchases, dashboardCapabilities } from './dashboard.mjs';

import { crmAssetRequest, captureRequest, ASSET_MESSAGES } from './crm-assets.mjs';

export const CRM_UI_PATH = '/api/crm-knowledge/connection';
export const CRM_ASSETS_UI_PATH = '/api/crm-knowledge/assets';
const TTL = 8 * 60 * 60 * 1000;
const MAX_BODY = 8192;
const ERRORS = {
  INVALID_REQUEST: '请求无效，请重新打开连接窗口。',
  SESSION_UNAVAILABLE: '当前对话已不可用，请重新选择对话。',
  HOST_AUTH_REQUIRED: 'DSH 登录已过期，请重新打开本地 DSH 页面。',
  LOGIN_FAILED: 'CRM 账号或密码不正确。',
  LOGIN_LIMITED: '登录尝试过于频繁，请稍后再试。',
  SERVICE_UNAVAILABLE: 'CRM 服务暂不可用，请确认看板可以打开后重试。',
  LOGIN_BUSY: '连接正在处理中，请稍后重试。',
  ALREADY_CONNECTED: '当前对话已连接，请先断开再更换账号。',
  CONNECTION_LIMIT: '同时连接的对话已达上限，请先断开不再使用的连接。',
  CANCELLED: '本次连接已取消。',
};
const response = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'pragma': 'no-cache', 'x-content-type-options': 'nosniff' } });
const error = (code, status = 400) => response(status, { ok: false, code, message: ERRORS[code] });
const validSession = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
class InputError extends Error {}

async function readBoundedJson(stream, max) {
  if (!stream) throw new InputError();
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > max) throw new InputError();
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** @param {{baseUrl?: string, browserOrigin: string, dataKind?: 'real'|'synthetic', hasSession: (id: string) => boolean, now?: () => number, ttlMs?: number}} options */
export function createDashboardAccess({ baseUrl = 'http://127.0.0.1:8000', browserOrigin, dataKind = 'real', hasSession, now = Date.now, ttlMs = TTL }) {
  const origin = dashboardOrigin(baseUrl);
  const trustedBrowserOrigin = dashboardOrigin(browserOrigin);
  if (!['real', 'synthetic'].includes(dataKind) || typeof hasSession !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > TTL) throw new Error('Invalid CRM host configuration');
  const records = new Map(); const pending = new Map();
  let disposed = false;
  function forget(sessionId) {
    records.get(sessionId)?.controller.abort(); records.delete(sessionId);
    pending.get(sessionId)?.abort(); pending.delete(sessionId);
  }
  function prune() {
    for (const [id, record] of records) if (record.expiresAt <= now() || !hasSession(id)) forget(id);
    for (const id of pending.keys()) if (!hasSession(id)) forget(id);
  }
  function status(sessionId) {
    prune(); const record = records.get(sessionId);
    return record ? { connected: true, username: record.binding.username, expires_at: new Date(record.expiresAt).toISOString() }
      : { connected: false, username: null, expires_at: null };
  }
  const cleanup = setInterval(prune, 60000); cleanup.unref();
  const unavailable = (purchases = false) => ({ status: 'UNAVAILABLE', schema_version: purchases ? 'crm-dashboard-purchases/v1' : 'crm-dashboard-read/v1',
    metric_version: purchases ? 'dashboard-gsv-purchases/v1' : dashboardCapabilities().metric_version,
    reason: { code: 'NOT_CONNECTED', message: '当前对话尚未连接 CRM，请点击“连接 CRM”。' } });
  async function query(sessionId, input, signal, purchases = false) {
      prune(); const record = records.get(sessionId);
      if (disposed || !record || !hasSession(sessionId)) return unavailable(purchases);
      const combined = signal ? AbortSignal.any([signal, record.controller.signal]) : record.controller.signal;
      const result = await (purchases ? queryDashboardPurchases : queryDashboardGsv)(input, { sessionId, binding: record.binding, signal: combined });
      if (records.get(sessionId) !== record) return unavailable(purchases);
      if (record.expiresAt <= now() || !hasSession(sessionId)) { forget(sessionId); return unavailable(purchases); }
      if (['AUTH_EXPIRED', 'ACCOUNT_MISMATCH'].includes(result.reason?.code)) forget(sessionId);
      return result;
  }
  async function asset(sessionId, input, signal) {
    prune(); const record = records.get(sessionId);
    const missing = () => ({ ok: false, code: 'NOT_CONNECTED', message: ASSET_MESSAGES.NOT_CONNECTED });
    if (disposed || !record || !hasSession(sessionId)) return missing();
    const combined = signal ? AbortSignal.any([signal, record.controller.signal]) : record.controller.signal;
    const result = await crmAssetRequest(input, { sessionId, binding: record.binding, signal: combined });
    if (records.get(sessionId) !== record) return missing();
    if (record.expiresAt <= now() || !hasSession(sessionId)) { forget(sessionId); return missing(); }
    if (['AUTH_EXPIRED', 'ACCOUNT_MISMATCH'].includes(result.code)) forget(sessionId);
    return result;
  }
  const service = Object.freeze({
    capabilities(sessionId) { return dashboardCapabilities(status(sessionId).connected ? 'LOGIN_BOUND' : 'NOT_CONNECTED'); },
    query: (sessionId, input, signal) => query(sessionId, input, signal),
    querySnapshot: (sessionId, input, signal) => asset(sessionId, captureRequest(input), signal),
    queryPurchases: (sessionId, input, signal) => query(sessionId, input, signal, true),
  });

  async function browser(request) {
    // Native Connection already verifies its cookie/Host. Require Origin as well
    // for credential submission, plus JSON/custom header to reject form CSRF.
    const url = new URL(request.url);
    // The pinned carrier rewrites Request.url's authority to dsh.internal.
    // Compare against the actual trusted listener, never that internal URL.
    if (request.headers.get('origin') !== trustedBrowserOrigin || request.headers.get('x-crm-ui') !== '1' || url.search ||
        request.headers.get('sec-fetch-site') === 'cross-site') return error('HOST_AUTH_REQUIRED', 403);
    if (request.method !== 'POST' || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return error('INVALID_REQUEST');
    let input;
    try { input = await readBoundedJson(request.body, MAX_BODY); } catch { return error('INVALID_REQUEST'); }
    if (!input || Array.isArray(input) || typeof input !== 'object' || !validSession(input.session_id)) return error('INVALID_REQUEST');
    const { operation, session_id: sessionId } = input;
    if (url.pathname === CRM_ASSETS_UI_PATH) {
      if (disposed || !hasSession(sessionId)) return error('SESSION_UNAVAILABLE', 409);
      if (!['library', 'save', 'pin'].includes(operation)) return error('INVALID_REQUEST');
      const { session_id: _session, ...payload } = input;
      const result = await asset(sessionId, payload, request.signal);
      return response(result.ok ? 200 : 409, result);
    }
    const keys = operation === 'login' ? ['operation', 'session_id', 'username', 'password'] : ['operation', 'session_id'];
    if (Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key)) ||
        !['status', 'login', 'disconnect'].includes(operation)) return error('INVALID_REQUEST');
    if (disposed || !hasSession(sessionId)) return error('SESSION_UNAVAILABLE', 409);
    prune();
    if (operation === 'status') return response(200, { ok: true, ...status(sessionId) });
    if (operation === 'disconnect') { forget(sessionId); return response(200, { ok: true, ...status(sessionId) }); }
    if (typeof input.username !== 'string' || !/^[A-Za-z0-9_.@-]{1,64}$/.test(input.username) ||
        typeof input.password !== 'string' || !input.password || Buffer.byteLength(input.password, 'utf8') > 72) return error('INVALID_REQUEST');
    if (records.has(sessionId)) return error('ALREADY_CONNECTED', 409);
    if (pending.has(sessionId) || pending.size >= 2) return error('LOGIN_BUSY', 409);
    if (records.size >= 20) return error('CONNECTION_LIMIT', 409);
    const controller = new AbortController(); pending.set(sessionId, controller);
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(15000)]);
    try {
      const upstream = await fetch(new URL('/api/v1/auth/login', origin), {
        method: 'POST', redirect: 'error', signal, headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ username: input.username, password: input.password }),
      });
      input.password = '';
      if (upstream.status === 401 || upstream.status === 403) { await upstream.body?.cancel(); return error('LOGIN_FAILED', 401); }
      if (upstream.status === 429) { await upstream.body?.cancel(); return error('LOGIN_LIMITED', 429); }
      if (!upstream.ok || !/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') ?? '')) {
        await upstream.body?.cancel(); return error('SERVICE_UNAVAILABLE', 503);
      }
      const result = await readBoundedJson(upstream.body, MAX_BODY);
      if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(result.token) || result.username !== input.username) return error('SERVICE_UNAVAILABLE', 503);
      if (signal.aborted || disposed || pending.get(sessionId) !== controller || !hasSession(sessionId)) return error('CANCELLED', 409);
      if (records.size >= 20) return error('CONNECTION_LIMIT', 409);
      records.set(sessionId, { binding: { token: result.token, username: result.username, sessionId, baseUrl: origin, dataKind },
        expiresAt: now() + ttlMs, controller: new AbortController() });
      return response(200, { ok: true, ...status(sessionId) });
    } catch { return error(signal.aborted ? 'CANCELLED' : 'SERVICE_UNAVAILABLE', 503); }
    finally { input.password = ''; if (pending.get(sessionId) === controller) pending.delete(sessionId); }
  }
  return { service, browser, dispose() { disposed = true; clearInterval(cleanup); for (const id of new Set([...records.keys(), ...pending.keys()])) forget(id); } };
}
