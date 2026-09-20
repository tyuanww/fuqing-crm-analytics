import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitAIClient, nativeArtifactPrompt } from '../src/client/cockpit-ai-client.mjs';

function setup({ failSave = false, saveStatus = 200, badReceipt = false, failRepeatBegin = false, onSaved } = {}) {
  const requests = [], native = [];
  let job = null, fail = failSave;
  const client = createCockpitAIClient({ base: 'http://fixture', token: 'test', async fetchImpl(url, init) {
    const path = new URL(url).pathname.replace('/api/v1/analytics/cockpit-ai', '');
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ path, body, method: init.method });
    if (!path && init.method === 'POST') {
      if (job && failRepeatBegin) { failRepeatBegin = false; return Response.json({ error: { message: '新请求失败' } }, { status: 503 }); }
      job = { ...body, status: 'WAITING', candidate_hash: null, filename: 'file.csv', session_id: 'session-' + body.id, workspace: '/isolated/task', source_name: 'source.csv', output_name: 'candidate.csv' }; return Response.json(job);
    }
    if (!path) return Response.json({ items: job && !['SAVED','CANCELLED'].includes(job.status) ? [job] : [] });
    if (path.endsWith('/collect')) return Response.json(job = { ...job, status: 'READY', candidate_hash: 'candidate-sha' });
    if (path.endsWith('/comparison')) return Response.json({ text_diff: '-before\n+after', note: 'preview', source_size: 1, candidate_size: 2 });
    if (path.endsWith('/viewer')) return Response.json({ script_url: 'http://fixture/api.js', config: { editorConfig: { mode: 'view' } } });
    if (path.endsWith('/confirm')) {
      if (fail) { fail = false; throw new Error('lost response'); }
      if (saveStatus !== 200) return Response.json({ error: { message: 'base changed' } }, { status: saveStatus });
      return Response.json(job = { ...job, status: 'SAVED', saved_version: badReceipt ? 99 : 2 });
    }
    if (path.endsWith('/cancel')) return Response.json(job = { ...job, status: 'CANCELLED' });
    throw new Error('Unexpected request: ' + path);
  } }, { openNative: async (...args) => native.push(args), onSaved });
  return { client, requests, native };
}

test('native edit selects a durable version and never auto-confirms', async () => {
  const { client, requests, native } = setup();
  assert.equal(await client.begin('file', 'file-1', 1), true);
  assert.equal(native.length, 1);
  const job = client.getSnapshot().active;
  assert.match(nativeArtifactPrompt(job), /等我提出要求后再动手/);
  assert.match(nativeArtifactPrompt(job), /TASK.md/);
  await client.collect(); await client.preview('source');
  assert.equal(client.getSnapshot().previewVariant, 'source');
  await client.preview();
  assert.equal(client.getSnapshot().previewVariant, 'candidate');
  assert.equal(client.getSnapshot().active.status, 'READY');
  assert.equal(requests.some(x => x.path.endsWith('/confirm')), false);
  assert.equal(client.getSnapshot().viewer.config.editorConfig.mode, 'view');
  assert.equal((await client.confirm()).ok, true);
  assert.equal(client.getSnapshot().active.saved_version, 2);
});

test('lost confirm receipt locks selection and uses identical candidate on retry', async () => {
  const { client, requests } = setup({ failSave: true });
  await client.begin('file', 'file-1', 1); await client.collect();
  assert.equal((await client.confirm()).ok, false);
  const original = client.getSnapshot().active;
  client.select('file', 'file-2');
  assert.equal(client.getSnapshot().active.id, original.id);
  assert.equal(await client.begin('file', 'file-2', 1), false);
  assert.equal(await client.collect(), false);
  assert.equal(await client.cancel(), false);
  assert.equal((await client.discardForLeave()).ok, false);
  assert.equal((await client.confirm()).ok, true);
  const writes = requests.filter(x => x.path.endsWith('/confirm'));
  assert.deepEqual(writes[0], writes[1]);
});

test('definitive CAS rejection permits discard; mismatched receipt remains uncertain', async () => {
  const conflict = setup({ saveStatus: 409 }).client;
  await conflict.begin('file', 'file-1', 1); await conflict.collect(); await conflict.confirm();
  assert.equal(conflict.getSnapshot().confirmationUncertain, false);
  assert.equal(await conflict.cancel(), true);
  const mismatch = setup({ badReceipt: true }).client;
  await mismatch.begin('file', 'file-1', 1); await mismatch.collect(); await mismatch.confirm();
  assert.equal(mismatch.getSnapshot().confirmationUncertain, true);
});

test('reopening a pending job creates no extra task and no unrequested edit', async () => {
  const { client, requests, native } = setup();
  await client.begin('file', 'file-1', 1);
  await client.refresh(); client.select('file', 'file-2'); client.select('file', 'file-1');
  assert.equal(client.getSnapshot().active.status, 'WAITING');
  await client.begin('file', 'file-1', 1);
  assert.equal(requests.filter(x => !x.path && x.method === 'POST').length, 1);
  assert.equal(native.length, 2);
  assert.equal(native[1][1], false);
});

test('refresh failure after save does not turn verified persistence into uncertain state', async () => {
  const { client } = setup({ onSaved: async () => { throw new Error('refresh failed'); } });
  await client.begin('file', 'file-1', 1); await client.collect();
  assert.equal((await client.confirm()).ok, true);
  assert.equal(client.getSnapshot().confirmationUncertain, false);
  assert.match(client.getSnapshot().message, /新版本已保存/);
  assert.equal(client.getSnapshot().messageError, true);
});

test('fresh begin failures remain distinguishable from a completed job and clear on retry', async () => {
  for (const finalStatus of ['SAVED', 'CANCELLED']) {
    const { client } = setup({ failRepeatBegin: true });
    await client.begin('file', 'file-1', 1);
    if (finalStatus === 'SAVED') { await client.collect(); await client.confirm(); } else await client.cancel();
    assert.equal(client.getSnapshot().messageError, false);
    assert.equal(await client.begin('file', 'file-1', 2), false);
    assert.equal(client.getSnapshot().active.status, finalStatus);
    assert.equal(client.getSnapshot().message, '新请求失败');
    assert.equal(client.getSnapshot().messageError, true);
    assert.equal(await client.begin('file', 'file-1', 2), true);
    assert.equal(client.getSnapshot().messageError, false);
    assert.equal(client.getSnapshot().message, '');
  }
});

test('refresh loads every pending task page and rejects a looping cursor', async () => {
  const offsets = [];
  const client = createCockpitAIClient({ base: 'http://fixture', token: 'synthetic', async fetchImpl(url) {
    const offset = Number(new URL(url).searchParams.get('offset')); offsets.push(offset);
    return Response.json({ items: [{ id: 'job-' + offset }], next_offset: offset === 0 ? 100 : null });
  } });
  await client.refresh();
  assert.deepEqual(offsets, [0, 100]);
  assert.deepEqual(client.getSnapshot().jobs.map(job => job.id), ['job-0', 'job-100']);
  const broken = createCockpitAIClient({ base: 'http://fixture', token: 'synthetic',
    fetchImpl: async () => Response.json({ items: [], next_offset: 0 }) });
  await broken.refresh();
  assert.match(broken.getSnapshot().message, /列表无效/);
});

test('selection jobs reopen only the same scope and reject whole-page or different-scope reuse', async t => {
  const { client, requests, native } = setup(); t.after(() => client.dispose());
  const selection = { start: 0, end: 18, html_hash: 'a'.repeat(64) };
  assert.equal(await client.begin('page', 'page-1', 1, selection), true);
  const original = client.getSnapshot().active;
  assert.deepEqual(requests[0].body.selection, selection);
  assert.match(nativeArtifactPrompt(original), /仅修改我在画布点选的板块/);
  assert.equal(await client.begin('page', 'page-1', 1, { ...selection }), true);
  assert.equal(native.at(-1)[1], false);
  assert.equal(client.getSnapshot().active.id, original.id);
  for (const scope of [null, { ...selection, end: 19 }]) {
    assert.equal(await client.begin('page', 'page-1', 1, scope), false);
    assert.equal(client.getSnapshot().active.id, original.id);
    assert.equal(client.getSnapshot().messageError, true);
    assert.match(client.getSnapshot().message, /已有其他范围/);
  }
  assert.equal(requests.filter(row => row.method === 'POST' && !row.path).length, 1);
  assert.equal(native.length, 2, 'rejected scope changes must not open a native conversation');
  assert.equal(await client.begin('page', 'page-1', 1, selection), true);
  assert.equal(client.getSnapshot().messageError, false);
});

test('lost selection begin receipts retry one identity and changed scopes receive a new identity', async t => {
  const requests = [], native = [];
  let fail = true;
  const client = createCockpitAIClient({ base: 'http://fixture', async fetchImpl(_url, init) {
    const body = JSON.parse(init.body); requests.push(body);
    if (fail) { fail = false; throw new Error('begin response lost'); }
    return Response.json({ ...body, status: 'WAITING', filename: 'page-package.json' });
  } }, { openNative: async (...args) => native.push(args) });
  t.after(() => client.dispose());
  const selection = { start: 2, end: 28, html_hash: 'b'.repeat(64) };
  assert.equal(await client.begin('page', 'page-1', 1, selection), false);
  assert.equal(native.length, 0);
  assert.equal(client.getSnapshot().active, null);
  assert.equal(await client.begin('page', 'page-1', 1, { ...selection }), true);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(native.length, 1);
  assert.equal(client.getSnapshot().messageError, false);
  fail = true;
  assert.equal(await client.begin('page', 'page-2', 1, selection), false);
  assert.equal(await client.begin('page', 'page-2', 1, { ...selection, start: 3 }), true);
  assert.notEqual(requests[3].id, requests[2].id);
  assert.equal(requests[3].selection.start, 3);
});
