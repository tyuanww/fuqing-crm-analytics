import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitAIClient, nativeEditContextPrompt } from '../src/client/cockpit-ai-client.mjs';

const CONTEXT = `editctx_${'ab'.repeat(16)}`;

test('native handoff carries only the context id and the patch uses cas idempotency', async () => {
  const native = [];
  const requests = [];
  const client = createCockpitAIClient({
    base: 'http://fixture',
    token: 'test',
    async fetchImpl(url, init) {
      requests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
      return Response.json({ preview_id: 'preview_1', ok: true });
    },
  }, { openNative: async (...args) => native.push(args) });

  const prompt = nativeEditContextPrompt(CONTEXT);
  assert.match(prompt, new RegExp(CONTEXT));
  assert.equal(prompt.includes('source_hash'), false);
  assert.equal(prompt.includes('channel:'), false);
  assert.equal(prompt.includes('capability'), false);
  assert.equal(await client.openEditContext(CONTEXT), true);
  assert.deepEqual(native[0][0], { context_id: CONTEXT });
  assert.deepEqual(Object.keys(native[0][0]), ['context_id']);

  const operation = {
    schema_version: 'free-page-edit/v1',
    operation_id: 'op_title',
    channel: 'presentation',
    action: 'update',
    capabilities: ['edit:presentation'],
    node: { node_id: 'n_title', kind: 'static_element', page_id: 'page_1' },
    cas: { base_version: 1, source_hash: 'a'.repeat(64), region_hash: 'b'.repeat(64), idempotency_key: 'idem_1' },
  };
  await client.submitEditPatch(CONTEXT, operation, 'idem_1');
  assert.equal(requests[0].method, 'POST');
  assert.match(requests[0].url, /\/api\/v1\/analytics\/page-edit-contexts\/editctx_ab/);
  assert.equal(requests[0].headers['idempotency-key'], 'idem_1');
  assert.deepEqual(requests[0].body.capabilities, ['edit:presentation']);
  assert.equal(requests[0].body.cas.idempotency_key, 'idem_1');
  await assert.rejects(() => client.submitEditPatch(CONTEXT, { ...operation, capabilities: 'edit:logic' }, 'idem_2'));
  client.getSnapshot = client.getSnapshot;
  await assert.rejects(async () => {
    const failing = createCockpitAIClient({
      base: 'http://fixture',
      token: 'test',
      async fetchImpl() {
        return Response.json({ error: { code: 'VERSION_CONFLICT', message: '页面版本已变化，请重新下载、重新选择、重新应用。' } }, { status: 409 });
      },
    });
    await failing.openEditContext(CONTEXT);
    await failing.submitEditPatch(CONTEXT, operation, 'idem_1');
  });
});
