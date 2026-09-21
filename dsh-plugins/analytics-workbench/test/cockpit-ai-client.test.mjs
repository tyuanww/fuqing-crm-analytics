import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitAIClient, createCockpitArtifactClients, nativeArtifactPrompt } from '../src/client/cockpit-ai-client.mjs';

test('a remounted artifact joins its in-flight load instead of losing the initial preview handoff', async t => {
  let complete, requests = 0;
  const client = createCockpitAIClient({ base: 'http://fixture', fetchImpl: () => {
    requests++; return new Promise(resolve => { complete = resolve; });
  } });
  t.after(() => client.dispose());
  const first = client.load('ai_test'), remount = client.load('ai_test');
  complete(Response.json({ id: 'ai_test', status: 'WAITING' }));
  assert.deepEqual(await Promise.all([first, remount]), [true, true]);
  assert.equal(requests, 1);
  assert.equal(client.getSnapshot().active.id, 'ai_test');
  assert.equal(await client.load('ai_test'), true);
  assert.equal(requests, 1);
});

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

test('instruction prompts include SELECTED.json; empty instruction keeps the ask-first prompt', () => {
  const job = { title: 'standalone.html', base_version: 2, selection: { rendered: {} }, instruction: '把标题改成季度收入' };
  assert.match(nativeArtifactPrompt(job), /SELECTED\.json/);
  assert.match(nativeArtifactPrompt(job), /把标题改成季度收入/);
  assert.match(nativeArtifactPrompt(job), /只调整我在页面选中的板块/);
  assert.doesNotMatch(nativeArtifactPrompt({ ...job, instruction: '  ' }), /SELECTED\.json/);
  assert.match(nativeArtifactPrompt({ ...job, instruction: '' }), /等我提出要求后再动手/);
});

test('artifact clients reuse the same request across remounts', () => {
  const clients = createCockpitArtifactClients(() => createCockpitAIClient({ base: 'http://fixture', fetchImpl: async () => Response.json({ items: [] }) }));
  const first = clients.get('ai_one');
  assert.equal(clients.get('ai_one'), first);
  assert.notEqual(clients.get('ai_two'), first);
  clients.dispose();
});

test('waiting preview skips comparison; load and preview stay off while a save is still busy', async t => {
  const candidate = { html: '<section id="cards"></section>', css: '', js: '', resources: [], node_map: [] };
  let releaseConfirm, confirmStarted;
  const waiting = new Promise(resolve => { confirmStarted = resolve; });
  const paths = [];
  const client = createCockpitAIClient({ base: 'http://fixture', token: 't', async fetchImpl(url, init) {
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/api/v1/analytics/cockpit-ai', '');
    paths.push({ path, method: init?.method ?? 'GET', variant: parsed.searchParams.get('variant') });
    if (!path && init?.method === 'POST') {
      const body = JSON.parse(init.body);
      return Response.json({ ...body, status: 'WAITING', candidate_hash: null, filename: 'page-package.json',
        session_id: 's', workspace: '/w', source_name: 'source.json', output_name: 'candidate.json' });
    }
    if (path.endsWith('/collect')) {
      const job = client.getSnapshot().active;
      return Response.json({ ...job, status: 'READY', candidate_hash: 'c'.repeat(64) });
    }
    if (path.endsWith('/comparison')) return Response.json({ text_diff: '', note: '', source_size: 1, candidate_size: 2 });
    if (path.includes('/content')) return new Response(JSON.stringify(candidate));
    if (path.endsWith('/confirm')) {
      confirmStarted();
      await new Promise(resolve => { releaseConfirm = resolve; });
      const job = client.getSnapshot().active;
      return Response.json({ ...job, status: 'SAVED', saved_version: job.base_version + 1 });
    }
    if (path.startsWith('/')) return Response.json({ id: path.slice(1), status: 'WAITING', candidate_hash: null, filename: 'page-package.json' });
    throw new Error('unexpected ' + path);
  } }, { openNative: async () => {} });
  t.after(() => client.dispose());
  const waitingJob = createCockpitAIClient({ base: 'http://fixture', token: 't', async fetchImpl(url) {
    const parsed = new URL(url);
    paths.push({ path: parsed.pathname, variant: parsed.searchParams.get('variant') });
    if (parsed.pathname.endsWith('/content')) return new Response('<h1>source</h1>');
    return Response.json({ id: 'ai_wait', status: 'WAITING', candidate_hash: null, filename: 'page.html', target_kind: 'page' });
  } });
  t.after(() => waitingJob.dispose());
  assert.equal(await waitingJob.load('ai_wait'), true);
  assert.equal(await waitingJob.preview('source'), true);
  assert.equal(paths.some(row => String(row.path).endsWith('/comparison')), false);
  assert.equal(await client.begin('page', 'page-1', 1, { start: 0, end: 8, html_hash: 'b'.repeat(64) }, '改文案'), true);
  assert.equal(await client.collect(), true);
  assert.equal(client.getSnapshot().previewVariant, 'candidate');
  assert.deepEqual(client.getSnapshot().html, candidate);
  let loadDuringSave, previewDuringSave;
  const unsub = client.subscribe(() => {
    const snap = client.getSnapshot();
    if (snap.active?.status === 'SAVED' && snap.busy && loadDuringSave === undefined) {
      loadDuringSave = client.load(snap.active.id);
      previewDuringSave = client.preview('candidate');
    }
  });
  const saving = client.confirm();
  await waiting;
  releaseConfirm();
  assert.equal((await saving).ok, true);
  unsub();
  assert.equal(await loadDuringSave, false);
  assert.equal(await previewDuringSave, false);
  assert.equal(await client.preview('candidate'), true);
  assert.equal(client.getSnapshot().busy, false);
});
