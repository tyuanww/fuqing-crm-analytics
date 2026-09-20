import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitFileClient } from '../src/client/cockpit-file-client.mjs';

function setup(save) {
  const requests = [];
  const client = createCockpitFileClient({ base: 'http://fixture', token: 'synthetic', async fetchImpl(url, init) {
    const path = new URL(url).pathname;
    requests.push({ path, ...init });
    if (path.endsWith('/preferences')) return Response.json({ removed: [], order: [], rail_width: 248 });
    if (path.endsWith('/edit')) return Response.json({ edit_key: 'edit-1', script_url: 'http://fixture/api.js', config: {} });
    if (path.endsWith('/save')) {
      const body = JSON.parse(init.body), response = await save(body);
      return Response.json({ id: body.receipt_id, edit_key: 'edit-1', ...await response.json() }, { status: response.status });
    }
    if (path.endsWith('/cancel')) return Response.json({ ok: true });
    return Response.json({ items: [], next_offset: null });
  } });
  return { client, requests };
}

test('sync event is not a cabinet save; waits for sync then persists receipt', async () => {
  const { client, requests } = setup(() => Response.json({ status: 'SAVED', version: 2 }));
  await client.openEditor('file-a'); client.changed(true);
  const saved = client.save();
  assert.equal(requests.some(row => row.path.endsWith('/save')), false);
  client.changed(false);
  assert.equal(client.hasUnsavedChanges(), true);
  assert.deepEqual(await saved, { ok: true, reason: undefined });
  assert.equal(client.hasUnsavedChanges(), false);
});

test('unknown receipt locks selection and discard; retry uses the same request', async () => {
  const ids = []; let fail = true;
  const { client } = setup(body => { ids.push(body.receipt_id); if (fail) throw new Error('connection interrupted'); return Response.json({ status: 'SAVED', version: 2 }); });
  await client.openEditor('file-a'); client.changed(true); client.changed(false);
  assert.equal((await client.save()).reason, 'uncertain');
  assert.equal(await client.openEditor('file-b'), false);
  assert.equal((await client.discardForLeave()).ok, false);
  fail = false;
  assert.equal((await client.save()).ok, true);
  assert.equal(ids[0], ids[1]);
});

test('changes arriving during a save remain dirty', async () => {
  let resolve;
  const { client } = setup(() => new Promise(done => { resolve = done; }));
  await client.openEditor('file-a'); client.changed(true); client.changed(false);
  const save = client.save();
  client.changed(true);
  resolve(Response.json({ status: 'SAVED', version: 2 }));
  assert.equal((await save).ok, false);
  assert.equal(client.getSnapshot().dirty, true);
});

test('recovering a lost receipt never acknowledges edits newer than the original request', async () => {
  const ids = []; let reject;
  const { client } = setup(body => {
    ids.push(body.receipt_id);
    if (ids.length === 1) return new Promise((_resolve, fail) => { reject = fail; });
    return Response.json({ status: 'SAVED', version: ids.length === 2 ? 2 : 3 });
  });
  await client.openEditor('file-a'); client.changed(true); client.changed(false);
  const saving = client.save();
  client.changed(true); client.changed(false);
  reject(new Error('receipt lost after commit'));
  assert.equal((await saving).reason, 'uncertain');
  assert.deepEqual(await client.save(), { ok: false, reason: 'changed' });
  assert.equal(client.hasUnsavedChanges(), true);
  assert.equal(ids[0], ids[1]);
  assert.equal((await client.save()).ok, true);
  assert.notEqual(ids[1], ids[2]);
});

test('a verified failed save permits a fresh request without discarding edits', async () => {
  const ids = [];
  const { client } = setup(body => {
    ids.push(body.receipt_id);
    return Response.json(ids.length === 1 ? { status: 'FAILED', version: null } : { status: 'SAVED', version: 2 });
  });
  await client.openEditor('file-a'); client.changed(true); client.changed(false);
  assert.equal((await client.save()).reason, 'failed');
  assert.equal(client.getSnapshot().confirmationUncertain, false);
  assert.equal(client.getSnapshot().dirty, true);
  assert.equal((await client.save()).ok, true);
  assert.notEqual(ids[0], ids[1]);
});

test('discard cancels the edit, and oversize upload performs no request', async () => {
  const { client, requests } = setup(() => { throw new Error('unexpected save'); });
  await client.openEditor('file-a'); client.changed(true);
  assert.equal((await client.discardForLeave()).ok, true);
  assert.equal(client.getSnapshot().editor, null);
  const count = requests.length;
  assert.equal(await client.upload({ size: 21 * 1024 * 1024 }), null);
  assert.equal(requests.length, count);
});

test('foreign or malformed receipts keep edits dirty and recover using the same ID', async () => {
  for (const wrong of [{ id: 'another-save' }, { edit_key: 'another-editor' }, { version: -1 }, { version: '2' }]) {
    const ids = []; let mismatch = true;
    const { client } = setup(body => {
      ids.push(body.receipt_id);
      return Response.json({ status: 'SAVED', version: 2, ...(mismatch ? wrong : {}) });
    });
    await client.openEditor('file-a'); client.changed(true); client.changed(false);
    assert.equal((await client.save()).reason, 'uncertain');
    assert.equal(client.hasUnsavedChanges(), true);
    assert.equal(await client.openEditor('file-b'), false);
    mismatch = false;
    assert.equal((await client.save()).ok, true);
    assert.equal(ids[0], ids[1]);
  }
});

test('a verified conflict receipt preserves edits and permits deliberate discard', async () => {
  const { client } = setup(() => Response.json({ status: 'CONFLICT', version: null }));
  await client.openEditor('file-a'); client.changed(true); client.changed(false);
  assert.equal((await client.save()).reason, 'conflict');
  assert.equal(client.getSnapshot().dirty, true);
  assert.equal(client.getSnapshot().confirmationUncertain, false);
  assert.match(client.getSnapshot().message, /下载保留修改/);
  assert.equal((await client.discardForLeave()).ok, true);
});


test('failed organization retains the visible list; a stale refresh cannot resurrect a removed row', async () => {
  let prefs = { removed: [], order: [], rail_width: 248 }, fail = false, release;
  const client = createCockpitFileClient({ base: 'http://fixture', async fetchImpl(url, init) {
    if (url.endsWith('/preferences')) {
      if (init.method === 'PATCH') {
        if (fail) return Response.json({ error: { message: '保存失败' } }, { status: 503 });
        prefs = { ...prefs, removed: [JSON.parse(init.body).remove] };
      }
      return Response.json(prefs);
    }
    if (release === null) await new Promise(resolve => { release = resolve; });
    return Response.json({ items: [], next_offset: null });
  } });
  await client.refresh();
  fail = true; assert.equal(await client.organize({ remove: 'page:a' }), false);
  assert.deepEqual(client.getSnapshot().preferences.removed, []);
  fail = false; release = null; const refreshing = client.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await client.organize({ remove: 'page:a' }), true);
  release(); await refreshing;
  assert.deepEqual(client.getSnapshot().preferences.removed, ['page:a']);
  client.dispose();
});

test('organization requests serialize and a failed request does not drop the queued preference', async t => {
  let preferences = { removed: [], order: [], rail_width: 248, rail_layout: null }, release;
  const gate = new Promise(resolve => { release = resolve; }), patches = [];
  const client = createCockpitFileClient({ base: 'http://fixture', async fetchImpl(url, init) {
    if (!url.endsWith('/preferences')) return Response.json({ items: [], next_offset: null });
    if (init.method !== 'PATCH') return Response.json(preferences);
    const change = JSON.parse(init.body); patches.push(change);
    if (patches.length === 1) { await gate; return Response.json({ error: { message: 'first patch failed' } }, { status: 503 }); }
    preferences = { ...preferences, ...change };
    return Response.json(preferences);
  } });
  t.after(() => client.dispose());
  assert.equal(await client.organize({ rail_width: 300 }), false, 'unknown preferences must not be overwritten');
  await client.refresh();
  const first = client.organize({ remove: 'page:a' });
  const second = client.organize({ rail_width: 320 });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(patches, [{ remove: 'page:a' }]);
  assert.equal(client.getSnapshot().organizing, true);
  await client.refresh();
  assert.equal(client.getSnapshot().organizing, true);
  release();
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(patches, [{ remove: 'page:a' }, { rail_width: 320 }]);
  assert.deepEqual(client.getSnapshot().preferences, preferences);
  assert.deepEqual(preferences.removed, []);
  assert.equal(preferences.rail_width, 320);
  assert.equal(client.getSnapshot().organizing, false);
});

test('malformed preference receipts preserve the last valid state and permit recovery', async t => {
  const valid = { removed: ['page:keep'], order: ['page:keep'], rail_width: 248, rail_layout: null };
  let reply = valid;
  const client = createCockpitFileClient({ base: 'http://fixture', async fetchImpl(url) {
    return Response.json(url.endsWith('/preferences') ? reply : { items: [], next_offset: null });
  } });
  t.after(() => client.dispose());
  await client.refresh();
  const invalid = [null, { ...valid, removed: null }, { ...valid, order: [9] }, { ...valid, rail_width: true },
    { ...valid, rail_width: 481 }, { ...valid, rail_layout: {} },
    { ...valid, rail_layout: { x: -1, y: 0, width: 320, height: 400 } },
    { ...valid, rail_layout: { x: 0, y: 0, width: 320, height: 1001 } }];
  for (const value of invalid) {
    reply = value;
    assert.equal(await client.organize({ rail_width: 320 }), false);
    assert.deepEqual(client.getSnapshot().preferences, valid);
    assert.match(client.getSnapshot().message, /设置回执无效/);
    assert.equal(client.getSnapshot().organizing, false);
  }
  await client.refresh();
  assert.equal(client.getSnapshot().status, 'error');
  assert.deepEqual(client.getSnapshot().preferences, valid);
  reply = { ...valid, rail_width: 320 };
  assert.equal(await client.organize({ rail_width: 320 }), true);
  assert.deepEqual(client.getSnapshot().preferences, reply);
  assert.equal(client.getSnapshot().message, '');
});
