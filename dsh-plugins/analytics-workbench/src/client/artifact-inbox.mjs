/** Plugin-owned candidate artifact inbox client. It never targets live 6677. */
import { refuseLivePort } from './free-html-library/page-http.mjs';

export const ARTIFACT_INBOX_PREFIX = '/api/v1/analytics/cockpit-artifacts';

/** @typedef {ReturnType<typeof createArtifactInboxClient>} ArtifactInboxClient */

export function digestBytes(bytes) {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle.digest('SHA-256', bytes).then(result =>
    [...new Uint8Array(result)].map(x => x.toString(16).padStart(2, '0')).join(''));
  return Promise.reject(Object.assign(new Error('当前环境无法计算产物内容哈希。'), { code: 'CONTENT_HASH_UNAVAILABLE' }));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonicalValue(value[key]);
      return out;
    }, {});
  }
  return value;
}

function digestValue(value) {
  const encoded = JSON.stringify(canonicalValue(value));
  return digestBytes(new TextEncoder().encode(encoded));
}

export function createArtifactInboxClient(http, { now = () => Date.now() } = {}) {
  const listeners = new Set();
  let state = { items: [], status: http?.base ? 'idle' : 'unavailable', message: '', busy: false, updatedAt: 0 };
  let disposed = false;
  const emit = patch => {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const request = async (path, { method = 'GET', body } = {}) => {
    if (!http?.base || typeof http.fetchImpl !== 'function') throw Object.assign(new Error('产物收件箱服务尚未配置。'), { code: 'ARTIFACT_HTTP_NOT_CONFIGURED' });
    const url = refuseLivePort(`${String(http.base).replace(/\/$/, '')}${ARTIFACT_INBOX_PREFIX}${path}`);
    const response = await http.fetchImpl(url, {
      method,
      headers: { ...(http.token ? { authorization: `Bearer ${http.token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload?.error?.message || '产物收件箱请求失败。'), { code: payload?.error?.code || 'ARTIFACT_HTTP', status: response.status });
    return payload;
  };
  const api = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async refresh() {
      if (!http?.base) return state;
      emit({ status: 'loading', message: '' });
      try {
        const items = [];
        let offset = 0;
        for (let page = 0; page < 100; page += 1) {
          const payload = await request(`?limit=100&offset=${offset}`);
          if (Array.isArray(payload?.items)) items.push(...payload.items);
          if (!Number.isSafeInteger(payload?.next_offset)) break;
          offset = payload.next_offset;
        }
        emit({ items, status: 'ready', updatedAt: now() });
      } catch (error) { emit({ status: 'error', message: error instanceof Error ? error.message : '产物收件箱读取失败。' }); }
      return state;
    },
    async intake(input) {
      const packageValue = input?.package ?? null;
      const contentHash = input?.content_hash || (packageValue ? await digestValue(packageValue) : null);
      if (!contentHash) throw Object.assign(new Error('工作区产物缺少内容哈希，暂不能登记。'), { code: 'CONTENT_HASH_REQUIRED' });
      const payload = await request('', { method: 'POST', body: { ...input, content_hash: contentHash } });
      const item = payload?.artifact_id ? payload : payload?.item;
      if (item) emit({ items: [item, ...state.items.filter(row => row.artifact_id !== item.artifact_id)], status: 'ready', updatedAt: now() });
      return item;
    },
    async get(artifactId) {
      if (!artifactId) return null;
      return request(`/${encodeURIComponent(artifactId)}`);
    },
    async confirm(artifactId, pageId) {
      const item = await request(`/${encodeURIComponent(artifactId)}/confirm`, { method: 'POST', body: { page_id: pageId } });
      emit({ items: state.items.map(row => row.artifact_id === artifactId ? item : row), updatedAt: now() });
      return item;
    },
    async dismiss(artifactId) {
      const item = await request(`/${encodeURIComponent(artifactId)}/dismiss`, { method: 'POST' });
      emit({ items: state.items.map(row => row.artifact_id === artifactId ? item : row), updatedAt: now() });
      return item;
    },
    dispose() { disposed = true; listeners.clear(); },
  };
  return api;
}
