import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitFileClient } from '../src/client/cockpit-file-client.mjs';

function setup(save) {
  const requests = [];
  const client = createCockpitFileClient({ base: 'http://fixture', token: 'synthetic', async fetchImpl(url, init) {
    const path = new URL(url).pathname;
    requests.push({ path, ...init });
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
