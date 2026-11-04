import { PAGE_DOCUMENTS_PREFIX, PAGE_RESULT_PREFIX } from './page-http.mjs';
const EDIT_CONTEXT_PREFIX = '/api/v1/analytics/page-edit-contexts';
const AI_PREFIX = '/api/v1/analytics/cockpit-ai';

const ROUTES = [
  [PAGE_DOCUMENTS_PREFIX, 'POST', /^\/previews$/, 'generate'],
  [PAGE_DOCUMENTS_PREFIX, 'GET', /^\/previews\/([^/]+)$/, 'preview'],
  [PAGE_DOCUMENTS_PREFIX, 'POST', /^\/previews\/([^/]+)\/confirm$/, 'confirm'],
  [PAGE_DOCUMENTS_PREFIX, 'POST', /^\/previews\/([^/]+)\/cancel$/, 'cancel'],
  [PAGE_DOCUMENTS_PREFIX, 'GET', /^\/pages$/, 'list'],
  [PAGE_DOCUMENTS_PREFIX, 'GET', /^\/pages\/([^/]+)$/, 'get'],
  [PAGE_DOCUMENTS_PREFIX, 'GET', /^\/pages\/([^/]+)\/versions$/, 'history'],
  [PAGE_DOCUMENTS_PREFIX, 'POST', /^\/pages\/([^/]+)\/patch-preview$/, 'patch'],
  [PAGE_DOCUMENTS_PREFIX, 'POST', /^\/pages\/([^/]+)\/save-preview$/, 'save'],
  [PAGE_DOCUMENTS_PREFIX, 'POST', /^\/pages\/([^/]+)\/rollback-preview$/, 'rollback'],
  [PAGE_RESULT_PREFIX, 'POST', /^\/read$/, 'read'],
  [PAGE_RESULT_PREFIX, 'POST', /^\/binding-state$/, 'bindingState'],
  [PAGE_RESULT_PREFIX, 'POST', /^\/cancel$/, 'cancelRead'],
  [EDIT_CONTEXT_PREFIX, 'POST', /^$/, 'editCreate'],
  [EDIT_CONTEXT_PREFIX, 'GET', /^\/overlay$/, 'editOverlay'],
  [EDIT_CONTEXT_PREFIX, 'POST', /^\/([^/]+)\/native$/, 'editNative'],
  [EDIT_CONTEXT_PREFIX, 'POST', /^\/([^/]+)\/patches$/, 'editApply'],
  [EDIT_CONTEXT_PREFIX, 'POST', /^\/([^/]+)\/patches\/([^/]+)\/confirm$/, 'editConfirm'],
  [EDIT_CONTEXT_PREFIX, 'GET', /^\/([^/]+)\/patches\/([^/]+)\/receipt$/, 'editReceipt'],
  [EDIT_CONTEXT_PREFIX, 'POST', /^\/([^/]+)\/patches\/([^/]+)\/receipt$/, 'editAcknowledge'],
  [AI_PREFIX, 'POST', /^$/, 'aiBegin'],
  [AI_PREFIX, 'GET', /^$/, 'aiList'],
  [AI_PREFIX, 'GET', /^\/([^/]+)$/, 'aiGet'],
  [AI_PREFIX, 'POST', /^\/([^/]+)\/collect$/, 'aiCollect'],
  [AI_PREFIX, 'GET', /^\/([^/]+)\/comparison$/, 'aiComparison'],
  [AI_PREFIX, 'GET', /^\/([^/]+)\/content$/, 'aiContent'],
  [AI_PREFIX, 'POST', /^\/([^/]+)\/confirm$/, 'aiConfirm'],
  [AI_PREFIX, 'POST', /^\/([^/]+)\/cancel$/, 'aiCancel'],
];

export function createNativePageTransport({ fetchImpl = globalThis.fetch } = {}) {
  return async (prefix, method, path, { body, idempotencyKey, signal } = {}) => {
    const [pathname, query = ''] = path.split('?');
    const found = ROUTES.find(([scope, verb, pattern]) => scope === prefix && verb === method && pattern.test(pathname));
    if (!found) throw Object.assign(new Error('原生页面操作不可用。'), { code: 'INVALID_PAGE' });
    const [, , pattern, operation] = found;
    const match = pathname.match(pattern);
    const envelope = { operation, ...(match[1] ? { id: decodeURIComponent(match[1]) } : {}),
      ...(match[2] ? { preview_id: decodeURIComponent(match[2]) } : {}),
      ...(body !== undefined ? { body } : {}), ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) };
    for (const [key, value] of new URLSearchParams(query)) {
      if (!['version', 'limit', 'offset', 'page_id', 'variant'].includes(key) || Object.hasOwn(envelope, key)) throw new Error('INVALID_PAGE');
      envelope[key] = ['page_id', 'variant'].includes(key) ? value : Number(value);
    }
    const res = await fetchImpl('/api/shine-mage-pages', { method: 'POST', credentials: 'same-origin', signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope) });
    const json = await res.json();
    if (!res.ok) throw Object.assign(new Error(json?.error?.message || '页面请求失败。'), { code: json?.error?.code || 'PAGE_HTTP', status: res.status });
    return { ok: true, body: json, status: res.status };
  };
}

export function nativePageTarget(page) {
  if (page?.preview_id) return { kind: 'preview', preview_id: page.preview_id };
  if (page?.page_id && Number.isSafeInteger(page.version) && page.version > 0) return { kind: 'page', page_id: page.page_id, version: page.version };
  throw Object.assign(new Error('请先选择已保存页面或预览。'), { code: 'INVALID_PAGE' });
}

export function nativePagesEnabled() {
  return globalThis.__NATIVE_PAGE_TRANSPORT__ === true;
}

export function nativeAIHttpOptions() {
  const transport = createNativePageTransport();
  const base = 'http://native-pages.invalid';
  return { base, token: '', async fetchImpl(url, init = {}) {
    const address = new URL(url);
    if (address.origin !== base || !address.pathname.startsWith(AI_PREFIX)) throw new Error('INVALID_AI_REQUEST');
    try {
      const result = await transport(AI_PREFIX, init.method ?? 'GET', address.pathname.slice(AI_PREFIX.length) + address.search, {
        ...(init.body ? { body: JSON.parse(init.body) } : {}), signal: init.signal,
      });
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      if (!error.status) throw error;
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
  } };
}
