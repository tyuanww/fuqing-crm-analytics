import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtifactInboxClient, digestBytes } from '../src/client/artifact-inbox.mjs';

function response(body, ok = true, status = 200) {
  return { ok, status, async json() { return body; } };
}

test('artifact inbox refresh/intake/confirm/dismiss uses the isolated page service', async () => {
  const calls = [];
  const item = { artifact_id: 'artifact_1', source: 'page_package', session_id: 'session_1', title: '页面', status: 'PREVIEWABLE', content_hash: 'a'.repeat(64), package: { html: '<h1>页面</h1>' } };
  const client = createArtifactInboxClient({ base: 'http://127.0.0.1:18091', token: 'token', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST' && url.endsWith('/confirm')) return response({ ...item, status: 'SAVED', page_id: 'page_1' });
    if (init.method === 'POST' && url.endsWith('/dismiss')) return response({ ...item, status: 'DISMISSED' });
    if (init.method === 'POST') return response({ ...item, idempotent: false }, true, 201);
    return response({ items: [item] });
  } });
  await client.refresh();
  assert.equal(client.getSnapshot().items.length, 1);
  await client.intake({ source: 'page_package', session_id: 'session_1', title: '页面', package: item.package, request_id: 'req_1' });
  await client.confirm('artifact_1', 'page_1');
  await client.dismiss('artifact_1');
  assert.equal(calls.every(call => !call.url.includes(':6677')), true);
  assert.equal(calls.some(call => call.url.endsWith('/cockpit-artifacts')), true);
});

test('artifact inbox refuses the live 6677 port', async () => {
  await assert.rejects(() => createArtifactInboxClient({ base: 'http://127.0.0.1:6677', fetchImpl: async () => response({}) }).intake({ source: 'workspace_file', session_id: 's', path: 'a.html', title: 'a', content_hash: 'a'.repeat(64) }), /REFUSED_LIVE_PORT/);
});

test('byte hashes distinguish changed content at the same path', async () => {
  const first = await digestBytes(new TextEncoder().encode('<h1>a</h1>'));
  const second = await digestBytes(new TextEncoder().encode('<h1>b</h1>'));
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test('workspace intake refuses a path-only fallback hash', async () => {
  const client = createArtifactInboxClient({ base: 'http://127.0.0.1:18091', fetchImpl: async () => response({}) });
  await assert.rejects(
    () => client.intake({ source: 'workspace_file', session_id: 's', path: 'a.html', title: 'a' }),
    error => error.code === 'CONTENT_HASH_REQUIRED',
  );
});

test('package hashes include nested node maps and resources', async () => {
  const hashes = [];
  const client = createArtifactInboxClient({ base: 'http://127.0.0.1:18091', fetchImpl: async (_url, init) => {
    hashes.push(JSON.parse(init.body).content_hash);
    return response({ artifact_id: `artifact_${hashes.length}`, status: 'PREVIEWABLE' });
  } });
  const base = { html: '<h1>页面</h1>', css: '', js: '', resources: [{ resource_id: 'logo', sha256: 'a'.repeat(64) }], node_map: [{ node_id: 'n1', selector: 'h1' }] };
  await client.intake({ source: 'page_package', session_id: 's', title: '页面', package: base });
  await client.intake({ source: 'page_package', session_id: 's', title: '页面', package: { ...base, node_map: [{ node_id: 'n2', selector: 'h1' }] } });
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0], hashes[1]);
});

test('refresh follows inbox pagination without carrying full packages in list rows', async () => {
  const urls = [];
  const client = createArtifactInboxClient({ base: 'http://127.0.0.1:18091', fetchImpl: async url => {
    urls.push(url);
    const offset = new URL(url).searchParams.get('offset');
    if (offset === '0') return response({ items: [{ artifact_id: 'a1', status: 'PREVIEWABLE' }], next_offset: 100 });
    return response({ items: [{ artifact_id: 'a2', status: 'RECEIVED' }], next_offset: null });
  } });
  await client.refresh();
  assert.deepEqual(client.getSnapshot().items.map(item => item.artifact_id), ['a1', 'a2']);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].includes('limit=100&offset=0'), true);
  assert.equal(urls[1].includes('limit=100&offset=100'), true);
});

test('artifact inbox reports missing configuration, HTTP failures, and empty ids', async () => {
  const unavailable = createArtifactInboxClient();
  assert.equal(unavailable.getSnapshot().status, 'unavailable');
  assert.equal(await unavailable.refresh(), unavailable.getSnapshot());
  assert.equal(await unavailable.get(''), null);
  await assert.rejects(() => unavailable.get('artifact_1'), error => error.code === 'ARTIFACT_HTTP_NOT_CONFIGURED');
  await assert.rejects(
    () => createArtifactInboxClient({ base: 'http://127.0.0.1:18091' }).get('artifact_1'),
    error => error.code === 'ARTIFACT_HTTP_NOT_CONFIGURED',
  );

  const failing = createArtifactInboxClient({
    base: 'http://127.0.0.1:18091',
    fetchImpl: async () => ({ ok: false, status: 503, async json() { throw new Error('invalid json'); } }),
  });
  const snapshot = await failing.refresh();
  assert.equal(snapshot.status, 'error');
  assert.match(snapshot.message, /产物收件箱请求失败/);
});

test('intake accepts an item envelope and dispose suppresses later notifications', async () => {
  const notifications = [];
  const client = createArtifactInboxClient({
    base: 'http://127.0.0.1:18091',
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers['content-type'], 'application/json');
      return response({ item: { artifact_id: 'artifact_enveloped', status: 'RECEIVED' } }, true, 201);
    },
  }, { now: () => 123 });
  client.subscribe(() => notifications.push(client.getSnapshot()));
  const item = await client.intake({ source: 'workspace_file', session_id: 's', path: 'a.html', title: 'a', content_hash: 'a'.repeat(64) });
  assert.equal(item.artifact_id, 'artifact_enveloped');
  assert.equal(client.getSnapshot().updatedAt, 123);
  const count = notifications.length;
  client.dispose();
  await client.intake({ source: 'workspace_file', session_id: 's', path: 'b.html', title: 'b', content_hash: 'b'.repeat(64) });
  assert.equal(notifications.length, count);
});

test('digestBytes exposes a stable error when Web Crypto is unavailable', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    await assert.rejects(
      () => digestBytes(new TextEncoder().encode('no crypto')),
      error => error.code === 'CONTENT_HASH_UNAVAILABLE',
    );
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete globalThis.crypto;
  }
});
