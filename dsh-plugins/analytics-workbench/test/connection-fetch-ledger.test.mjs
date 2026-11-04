import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionFetchLedger } from '../src/connection-fetch-ledger.mjs';

/** Minimal Connection owner: records registered routes and their removal order. */
function fakeContext({ rejectPath, deferred = false } = {}) {
  const routes = [];
  const removed = [];
  const effects = [];
  const releases = [];
  let settle;
  const ctx = {
    logger: { error() {} },
    effect(execute, label) {
      const disposer = execute();
      effects.push({ disposer, label });
      return async () => { await (typeof disposer === 'function' ? disposer() : disposer); };
    },
    connection: {
      fetch: {
        register(route) {
          const mount = () => {
            if (rejectPath === route.path) throw new Error(`duplicate exact route ${route.path}`);
            routes.push(route);
            return async () => {
              removed.push(route.path);
              const index = routes.indexOf(route);
              if (index >= 0) routes.splice(index, 1);
            };
          };
          if (deferred) {
            const promise = new Promise((resolve, reject) => { settle = () => { try { resolve(mount()); } catch (error) { reject(error); } }; });
            releases.push(() => settle());
            return promise;
          }
          return Promise.resolve().then(mount);
        },
      },
    },
  };
  return { ctx, routes, removed, effects, releases };
}

const route = (path = '/api/example', extra = {}) => ({
  path,
  methods: ['POST'],
  requestBody: 'buffered',
  fetch: async () => Response.json({ ok: true }),
  ...extra,
});

test('the ledger mounts below /api and releases newest-first when its fiber unloads', async () => {
  const { ctx, routes, removed, effects } = fakeContext();
  const ledger = new ConnectionFetchLedger(ctx, { label: 'unit' });
  await ledger.own('first', route('/api/one'));
  await ledger.own('second', route('/api/two', { requestBody: 'streaming' }));
  assert.deepEqual(routes.map(row => row.path), ['/api/one', '/api/two']);
  assert.equal(ledger.describe().every(row => row.state === 'live'), true);
  // The ledger's own effect is the only framework hook it needs.
  assert.equal(effects.length, 1);
  assert.match(effects[0].label, /release owned routes/);
  await effects[0].disposer();
  assert.deepEqual(removed, ['/api/two', '/api/one']);
  assert.equal(routes.length, 0);
  assert.equal(ledger.describe().every(row => row.state === 'released'), true);
});

test('release unwinds one owner tag and leaves the rest of the ledger mounted', async () => {
  const { ctx, routes, removed } = fakeContext();
  const ledger = new ConnectionFetchLedger(ctx);
  await ledger.own('child-a', route('/api/a'));
  await ledger.own('child-b', route('/api/b'));
  await ledger.release('child-a');
  assert.deepEqual(removed, ['/api/a']);
  assert.deepEqual(routes.map(row => row.path), ['/api/b']);
  // Releasing a tag twice is a no-op, not a second dispose.
  await ledger.release('child-a');
  assert.deepEqual(removed, ['/api/a']);
  await ledger.close();
  assert.deepEqual(removed, ['/api/a', '/api/b']);
});

test('close is idempotent, awaitable twice, and refuses later ownership', async () => {
  const { ctx, routes, removed } = fakeContext();
  const ledger = new ConnectionFetchLedger(ctx);
  await ledger.own('child', route());
  const first = ledger.close();
  const second = ledger.close();
  assert.equal(first, second);
  await first;
  await second;
  assert.deepEqual(removed, ['/api/example']);
  assert.equal(routes.length, 0);
  assert.throws(() => ledger.own('late', route('/api/late')), /after close/);
});

test('a rerun of the same owner registration is rejected instead of double-mounting', async () => {
  const { ctx, routes } = fakeContext();
  const ledger = new ConnectionFetchLedger(ctx);
  await ledger.own('child', route('/api/dup'));
  assert.throws(() => ledger.own('child', route('/api/dup')), /already owns \/api\/dup/);
  assert.equal(routes.length, 1);
});

test('route shape drift fails the load before the host is touched', async () => {
  const { ctx, routes } = fakeContext();
  const ledger = new ConnectionFetchLedger(ctx);
  for (const [label, bad] of [
    ['kernel path', route('/internal/native/query')],
    ['method', route('/api/x', { methods: ['PUT'] })],
    ['empty methods', route('/api/x', { methods: [] })],
    ['request body', route('/api/x', { requestBody: 'chunked' })],
    ['handler', route('/api/x', { fetch: undefined })],
    ['query string', route('/api/x?y=1')],
    ['blank owner', route('/api/x')],
  ]) {
    assert.throws(() => label === 'blank owner' ? ledger.own('', bad) : ledger.own('child', bad), TypeError, label);
  }
  assert.equal(routes.length, 0);
  assert.equal(ledger.describe().length, 0);
});

test('a failed registration is recorded and raised again during release', async () => {
  const { ctx } = fakeContext({ rejectPath: '/api/conflict' });
  const ledger = new ConnectionFetchLedger(ctx);
  await ledger.own('child', route('/api/conflict'));
  const [row] = ledger.describe();
  assert.equal(row.state, 'failed');
  assert.match(row.error, /duplicate exact route/);
  await assert.rejects(ledger.close(), /duplicate exact route/);
});

test('releasing while the host registration is still in flight disposes exactly once', async () => {
  const { ctx, routes, removed, releases } = fakeContext({ deferred: true });
  const ledger = new ConnectionFetchLedger(ctx);
  const pending = ledger.own('child', route('/api/slow'));
  const released = ledger.release('child');
  releases[0]();
  await pending;
  await released;
  assert.deepEqual(removed, ['/api/slow']);
  assert.equal(routes.length, 0);
  await ledger.close();
  assert.deepEqual(removed, ['/api/slow']);
});

test('the diagnostic view never exposes the route handler', async () => {
  const { ctx } = fakeContext();
  const ledger = new ConnectionFetchLedger(ctx);
  await ledger.own('child', route('/api/report'));
  const [row] = ledger.describe();
  assert.deepEqual(Object.keys(row).sort(), ['error', 'methods', 'owner', 'path', 'requestBody', 'seq', 'state']);
  assert.equal(Object.hasOwn(row, 'fetch'), false);
});
