import test from 'node:test';
import assert from 'node:assert/strict';
import { saveIdentity } from '../src/first-purchase-save-gateway.mjs';
import { createSaveController, saveUiRequest } from '../src/first-purchase-save-client.mjs';
import { target, inspected, command, saved, unknown, status, ok, storage } from './first-purchase-save.fixture.mjs';
function setup(request, store = storage()) {
  const states = []; const controller = createSaveController({ target, request, storage: store, onChange: s => states.push(s) });
  return { controller, states, store };
}
test('save persists original command before HTTP; lost ACK recovers after reload without new save', async () => {
  let written = false; const sent = []; const store = storage();
  const request = async (_, op, payload) => {
    if (op === 'status') return status;
    if (op === 'inspect') return ok(inspected);
    if (op === 'reconcile') return ok(written ? saved : unknown);
    sent.push(payload); assert.equal(store.values.size, 1); written = true; throw new Error('lost ACK');
  };
  const a = setup(request, store); await a.controller.start(); assert.equal(a.controller.getState().phase, 'ready');
  await a.controller.save(command.title); assert.equal(a.controller.getState().phase, 'unknown'); a.controller.dispose();
  const b = setup(request, store); await b.controller.start(); assert.equal(b.controller.getState().phase, 'saved');
  await b.controller.save(command.title); assert.equal(sent.length, 1); b.controller.dispose();
});
test('explicit retry uses byte-identical original command, duplicate clicks never race', async () => {
  let count = 0; const sent = [];
  const { controller } = setup(async (_, op, payload) => {
    if (op === 'status') return status;
    if (op === 'inspect') return ok(inspected);
    if (op === 'reconcile') return ok(unknown);
    sent.push(JSON.stringify(payload)); if (++count === 1) throw new Error(); return ok(saved);
  });
  await controller.start(); await Promise.all([controller.save(command.title), controller.save('other title')]);
  assert.equal(count, 1); await controller.reconcile(); await controller.save('ignored retry title');
  assert.equal(controller.getState().phase, 'saved'); assert.equal(sent[0], sent[1]); controller.dispose();
});
test('blocked storage cannot be bypassed by reconcile; account changes cannot use old ready result', async () => {
  let account = status; let writes = 0;
  const request = async (_, op) => { if (op === 'save') writes++; return op === 'status' ? account : ok(op === 'inspect' ? inspected : unknown); };
  const bad = setup(request, { getItem: () => '{bad', setItem() {} }); await bad.controller.start(); await bad.controller.reconcile(); await bad.controller.save(command.title);
  assert.equal(bad.controller.getState().code, 'INTENT_STORAGE_UNAVAILABLE'); assert.equal(writes, 0); bad.controller.dispose();
  const a = setup(request); await a.controller.start(); account = { ...status, owner: 'another-user' }; await a.controller.save(command.title);
  assert.equal(a.controller.getState().code, 'ACCOUNT_CHANGED'); assert.equal(writes, 0); a.controller.dispose();
});
test('unmount ignores late response; conflict and stale candidate never create a fresh identity', async () => {
  let release;
  const a = setup(() => new Promise(resolve => { release = resolve; })); const work = a.controller.start();
  a.controller.dispose(); const before = a.states.length; release(status); await work; assert.equal(a.states.length, before);
  const b = setup(async (_, op) => op === 'status' ? status : op === 'inspect' ? ok(inspected) : op === 'reconcile' ? ok(unknown) : { ok: false, code: 'SAVE_CONFLICT' });
  await b.controller.start(); await b.controller.save(command.title); assert.equal(b.controller.getState().phase, 'conflict');
  assert.equal(b.store.values.size, 1); b.controller.dispose();
});
test('browser transport uses exact authenticated path, abort, bounded JSON and rejects contradictory HTTP', async t => {
  const before = globalThis.fetch; t.after(() => { globalThis.fetch = before; });
  globalThis.fetch = async (url, options) => { assert.equal(url, '/api/analytics-first-purchase/save'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error'); return Response.json(status); };
  assert.deepEqual(await saveUiRequest(target, 'status', null, new AbortController().signal), status);
  globalThis.fetch = async () => Response.json(status, { status: 403 });
  await assert.rejects(saveUiRequest(target, 'status', null, new AbortController().signal));
  globalThis.fetch = async () => new Response('x'.repeat(512 * 1024 + 1), { headers: { 'content-type': 'application/json' } });
  await assert.rejects(saveUiRequest(target, 'status', null, new AbortController().signal));
});
test('expired CRM grant clears previously displayed receipt and provenance', async () => {
  let connected = true;
  const { controller } = setup(async (_, op) => op === 'status'
    ? (connected ? status : { ok: false, code: 'NOT_CONNECTED' }) : ok(saved));
  await controller.start(); assert.equal(controller.getState().phase, 'saved');
  connected = false; await controller.reconcile();
  assert.equal(controller.getState().code, 'NOT_CONNECTED'); assert.equal(controller.getState().receipt, null); assert.equal(controller.getState().result, null);
  controller.dispose();
});
test('unresolved old candidate keeps original intent but offers no write retry after candidate change', async () => {
  const store = storage(); let active = status;
  const request = async (_, op) => op === 'status' ? active : op === 'inspect' ? ok(inspected) : op === 'reconcile' ? ok(unknown) : { ok: false, code: 'SAVE_UNKNOWN' };
  const a = setup(request, store); await a.controller.start(); await a.controller.save(command.title); a.controller.dispose();
  const before = [...store.values]; active = { ...status, identity: saveIdentity(status.owner, target, 'd'.repeat(64)) };
  const b = setup(request, store); await b.controller.start();
  assert.equal(b.controller.getState().code, 'CANDIDATE_CHANGED'); assert.deepEqual([...store.values], before); b.controller.dispose();
});
