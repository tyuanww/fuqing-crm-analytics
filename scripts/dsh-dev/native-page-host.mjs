import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { installNativePageAITools } from './native-page-ai-tools.mjs';

export const name = 'native-page-host';
export const inject = ['connection', 'crmDashboard', 'webServer', 'tools', 'agents', 'nativePageAIPolicy'];
export const NATIVE_PAGE_PATH = '/api/shine-mage-pages';
const DOCUMENTS = '/api/v1/analytics/page-documents';
const RESULTS = '/api/v1/analytics/page-result-access';
const EDITS = '/api/v1/analytics/page-edit-contexts';
const AI = '/api/v1/analytics/cockpit-ai';
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const routeId = value => typeof value === 'string' && ID.test(value) && value !== '.' && value !== '..';
const REF = /^crm_ref_[0-9a-f]{32}$/;
const OPERATIONS = {
  generate: ['POST', `${DOCUMENTS}/previews`],
  preview: ['GET', `${DOCUMENTS}/previews/:id`],
  confirm: ['POST', `${DOCUMENTS}/previews/:id/confirm`],
  cancel: ['POST', `${DOCUMENTS}/previews/:id/cancel`],
  list: ['GET', `${DOCUMENTS}/pages`],
  get: ['GET', `${DOCUMENTS}/pages/:id`],
  history: ['GET', `${DOCUMENTS}/pages/:id/versions`],
  patch: ['POST', `${DOCUMENTS}/pages/:id/patch-preview`],
  save: ['POST', `${DOCUMENTS}/pages/:id/save-preview`],
  rollback: ['POST', `${DOCUMENTS}/pages/:id/rollback-preview`],
  read: ['POST', `${RESULTS}/read`],
  bindingState: ['POST', `${RESULTS}/binding-state`],
  cancelRead: ['POST', `${RESULTS}/cancel`],
  editCreate: ['POST', EDITS],
  editOverlay: ['GET', `${EDITS}/overlay`],
  editNative: ['POST', `${EDITS}/:id/native`],
  editApply: ['POST', `${EDITS}/:id/patches`],
  editConfirm: ['POST', `${EDITS}/:id/patches/:preview_id/confirm`],
  editReceipt: ['GET', `${EDITS}/:id/patches/:preview_id/receipt`],
  editAcknowledge: ['POST', `${EDITS}/:id/patches/:preview_id/receipt`],
  aiBegin: ['POST', AI],
  aiList: ['GET', AI],
  aiGet: ['GET', `${AI}/:id`],
  aiReadPart: ['POST', `${AI}/:id/read-part`],
  aiPropose: ['POST', `${AI}/:id/candidate`],
  aiCollect: ['POST', `${AI}/:id/collect`],
  aiComparison: ['GET', `${AI}/:id/comparison`],
  aiContent: ['GET', `${AI}/:id/content`],
  aiConfirm: ['POST', `${AI}/:id/confirm`],
  aiCancel: ['POST', `${AI}/:id/cancel`],
};
const CODES = new Map([[401, ['UNAUTHENTICATED']], [404, ['NOT_FOUND']], [403, ['RESULT_REVOKED']],
  [409, ['RESULT_STALE', 'RESULT_UNAVAILABLE']], [503, ['SOURCE_UNAVAILABLE', 'IDENTITY_UNAVAILABLE', 'STATE_UNAVAILABLE']]]);
class PageError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status = 503, code = 'SOURCE_UNAVAILABLE') => { throw new PageError(status, code); };
const response = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
function errorResponse(error) {
  const status = CODES.get(error?.status)?.includes(error?.code) ? error.status : error?.status === 401 ? 401 : 503;
  const code = CODES.get(status)?.includes(error?.code) ? error.code : status === 401 ? 'UNAUTHENTICATED' : 'SOURCE_UNAVAILABLE';
  return response(status, { error: { code, message: '页面来源请求未完成。', retryable: status === 503 } });
}
async function bytes(stream, signal, max) {
  if (!stream) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > max) fail();
        chunks.push(Buffer.from(value));
      }
    } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  for await (const chunk of stream) {
    signal.throwIfAborted(); size += chunk.length;
    if (size > max) fail();
    chunks.push(Buffer.from(chunk));
  }
  signal.throwIfAborted();
  return Buffer.concat(chunks);
}
function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.origin !== value) throw new Error('Private loopback origin required');
  return value;
}
function route(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !['operation', 'id', 'preview_id', 'page_id', 'body', 'idempotency_key', 'version', 'limit', 'offset', 'variant'].includes(key))) fail(404, 'NOT_FOUND');
  if (!Object.hasOwn(OPERATIONS, input.operation)) fail(404, 'NOT_FOUND');
  const [method, template] = OPERATIONS[input.operation];
  if (template.includes(':id') && !routeId(input.id)) fail(404, 'NOT_FOUND');
  if (!template.includes(':id') && input.id !== undefined) fail(404, 'NOT_FOUND');
  if (template.includes(':preview_id') ? !routeId(input.preview_id) : input.preview_id !== undefined) fail(404, 'NOT_FOUND');
  if (method === 'GET' && input.body !== undefined) fail(404, 'NOT_FOUND');
  const path = template.replace(':id', encodeURIComponent(input.id)).replace(':preview_id', encodeURIComponent(input.preview_id));
  const query = new URLSearchParams();
  const allowedQuery = { list: ['limit', 'offset'], history: ['limit', 'offset'], get: ['version'],
    aiList: ['offset'], aiContent: ['variant'],
    editApply: ['page_id'], editOverlay: ['page_id', 'version'] }[input.operation] ?? [];
  for (const key of ['version', 'limit', 'offset', 'page_id', 'variant']) {
    if (input[key] !== undefined) {
      if (!allowedQuery.includes(key)) fail(404, 'NOT_FOUND');
      if (key === 'variant' ? !['source', 'candidate'].includes(input[key])
        : key === 'page_id' ? !routeId(input[key]) : !Number.isSafeInteger(input[key]) || input[key] < (key === 'offset' ? 0 : 1)) fail(404, 'NOT_FOUND');
      query.set(key, input[key]);
    }
  }
  if (input.operation === 'editOverlay' && (input.page_id === undefined || input.version === undefined)) fail(404, 'NOT_FOUND');
  if (input.idempotency_key !== undefined && (typeof input.idempotency_key !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(input.idempotency_key))) fail(404, 'NOT_FOUND');
  if (input.body && Object.keys(input.body).some(key => ['owner', 'scopes', 'generation', 'epoch', 'rows', 'service_url'].includes(key))) fail(404, 'NOT_FOUND');
  const body = input.body === undefined ? undefined : JSON.stringify(input.body);
  return { method, path, query: query.toString(), body, idempotencyKey: input.idempotency_key, digest: createHash('sha256').update(body ?? '').digest('hex') };
}

export function createNativePageHost({ crmDashboard, pageOrigin, callbackPort, actorId = 'native_page_owner', timeoutMs = 15000, capacity = 8 }) {
  origin(pageOrigin);
  if (!ID.test(actorId) || !Number.isInteger(callbackPort) || callbackPort < 0 || callbackPort > 65535
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 8) throw new Error('Invalid native page configuration');
  const leases = new Map(); const epoch = randomBytes(16).toString('hex');
  const shutdown = new AbortController(); const sockets = new Set(); let callbackActive = 0; let active = 0;
  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const signal = AbortSignal.any([controller.signal, shutdown.signal, AbortSignal.timeout(5000)]);
    const expire = () => req.destroy();
    signal.addEventListener('abort', expire, { once: true });
    let admitted = false;
    try {
      const authorization = req.headers.authorization ?? '';
      const key = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const lease = leases.get(key);
      if (!lease || req.headersDistinct.authorization?.length !== 1 || req.headers.origin || req.method !== 'POST'
          || req.url !== '/native-pages/callback' || req.headers.host !== `127.0.0.1:${server.address().port}`) fail(401, 'UNAUTHENTICATED');
      lease.signal.throwIfAborted();
      if (callbackActive >= 32) fail();
      callbackActive++; admitted = true;
      const input = JSON.parse((await bytes(req, signal, 8192)).toString());
      const combined = AbortSignal.any([signal, lease.signal]);
      let value;
      if (input.operation === 'assertActive') {
        if (!lease.authenticated || Object.keys(input).join(',') !== 'operation') fail(401, 'UNAUTHENTICATED');
        value = { active: true };
      } else if (input.operation === 'authenticate') {
        if (Object.keys(input).sort().join(',') !== 'body_sha256,idempotency_key,method,operation,path,query' || input.method !== lease.route.method || input.path !== lease.route.path
            || input.query !== lease.route.query || input.body_sha256 !== lease.route.digest || input.idempotency_key !== (lease.route.idempotencyKey ?? null)) fail(401, 'UNAUTHENTICATED');
        lease.authenticated = true;
        value = { actor_id: actorId, capabilities: ['dashboard:read', 'dashboard:update'],
          data_scopes: ['native-page-documents', 'native-crm-aggregate'], deadline_ms: lease.deadline };
      } else if (input.operation === 'read') {
        if (!lease.authenticated || Object.keys(input).sort().join(',') !== 'operation,ref,session_id' || !ID.test(input.session_id ?? '') || !REF.test(input.ref ?? '')) fail(404, 'NOT_FOUND');
        if (lease.session !== undefined && lease.session !== input.session_id) fail(404, 'NOT_FOUND');
        lease.session = input.session_id;
        lease.crm ??= crmDashboard.openNativeSnapshotLease(input.session_id, combined);
        const crm = await lease.crm;
        if (crm.identity.native_session_id !== input.session_id) fail(404, 'NOT_FOUND');
        const snapshot = await crm.read(input.ref, combined);
        await crm.assertCurrent(combined);
        value = { ref: input.ref, snapshot, identity: crm.identity, epoch };
      } else fail(404, 'NOT_FOUND');
      combined.throwIfAborted();
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' });
      res.end(JSON.stringify(value));
    } catch (error) {
      const result = errorResponse(error);
      if (!res.destroyed && !res.writableEnded) { res.writeHead(result.status, { 'content-type': 'application/json', connection: 'close' }); res.end(await result.text()); }
    } finally { signal.removeEventListener('abort', expire); if (admitted) callbackActive--; }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  return {
    async start() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(callbackPort, '127.0.0.1', resolve); });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async fetch(request) {
      const controller = new AbortController();
      const signal = AbortSignal.any([request.signal, controller.signal, shutdown.signal]);
      const deadline = Date.now() + timeoutMs;
      const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref();
      let key; let admitted = false;
      try {
        if (request.method !== 'POST' || new URL(request.url).pathname !== NATIVE_PAGE_PATH) fail(404, 'NOT_FOUND');
        if (active >= capacity) fail();
        active++; admitted = true;
        const selected = route(JSON.parse((await bytes(request.body, signal, 4 * 1024 * 1024)).toString()));
        key = randomBytes(32).toString('hex');
        leases.set(key, { route: selected, signal, deadline, authenticated: false });
        const upstream = await fetch(`${pageOrigin}${selected.path}${selected.query ? '?' + selected.query : ''}`, {
          method: selected.method, redirect: 'error', signal,
          headers: { 'content-type': 'application/json', 'x-native-page-lease': key,
            ...(selected.idempotencyKey ? { 'idempotency-key': selected.idempotencyKey } : {}),
          }, body: selected.body,
        });
        const body = await bytes(upstream.body, signal, 4 * 1024 * 1024);
        return new Response(body, { status: upstream.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (error) { return errorResponse(error); }
      finally { if (admitted) active--; if (key) leases.delete(key); controller.abort(); clearTimeout(timer); }
    },
    async dispose() {
      shutdown.abort(); leases.clear();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

export async function apply(ctx, config = {}) {
  if (config.enabled !== true) return;
  const host = createNativePageHost({ ...config, crmDashboard: ctx.crmDashboard });
  ctx.effect(() => () => host.dispose(), 'native pages: discard request leases');
  await host.start();
  await installNativePageAITools(ctx, host);
  ctx.on('webserver/index-inject', table => { table.push({ kind: 'global', name: '__NATIVE_PAGE_TRANSPORT__', value: true }); });
  ctx.connection.fetch.register({ path: NATIVE_PAGE_PATH, methods: ['POST'], requestBody: 'streaming', fetch: request => host.fetch(request) });
}
