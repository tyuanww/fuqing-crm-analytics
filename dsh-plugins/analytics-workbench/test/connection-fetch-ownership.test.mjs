import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionFetchLedger } from '../src/connection-fetch-ledger.mjs';
import * as boardBrowserApi from '../src/board-browser-api.ts';
import * as cockpitHistoryApi from '../src/cockpit-history-api.ts';

/** Connection Fetch carrier that refuses a duplicate exact route, like rc.5. */
function fakeHost() {
  const routes = [];
  const disposed = [];
  return {
    routes,
    disposed,
    connection: {
      fetch: {
        register(route) {
          if (routes.some(row => row.path === route.path)) throw new Error(`duplicate exact route ${route.path}`);
          routes.push(route);
          return Promise.resolve(async () => {
            disposed.push(route.path);
            const index = routes.indexOf(route);
            if (index >= 0) routes.splice(index, 1);
          });
        },
      },
    },
  };
}

/** One plugin fiber: effects run in reverse order on unload, as cordis does. */
function fakeFiber(host, extra = {}) {
  const effects = [];
  const ctx = {
    ...extra,
    logger: { error() {} },
    connection: host.connection,
    effect(execute, label) {
      const disposer = execute();
      effects.push({ disposer, label });
      return async () => { await (typeof disposer === 'function' ? disposer() : disposer); };
    },
    async unload() {
      for (const effect of [...effects].reverse()) await effect.disposer();
      effects.length = 0;
    },
  };
  return ctx;
}

test('a row mounted without a shared ledger owns and releases its own route', async t => {
  const host = fakeHost();
  const fiber = fakeFiber(host);
  boardBrowserApi.apply(fiber);
  assert.deepEqual(host.routes.map(row => [row.path, row.methods, row.requestBody]), [
    ['/api/shine-mage-board', ['POST'], 'buffered'],
  ]);
  await fiber.unload();
  assert.deepEqual(host.routes, []);
  assert.deepEqual(host.disposed, ['/api/shine-mage-board']);
});

test('two rows on one ledger release separately, and a reload re-registers cleanly', async t => {
  const host = fakeHost();
  const entry = fakeFiber(host);
  const ledger = new ConnectionFetchLedger(entry, { label: 'fixture-entry' });

  const board = fakeFiber(host);
  boardBrowserApi.apply(board, { routes: ledger });
  const history = fakeFiber(host);
  cockpitHistoryApi.apply(history, { routes: ledger });
  assert.deepEqual(host.routes.map(row => row.path).sort(), ['/api/shine-mage-board', '/api/shine-mage-deliveries']);

  // The entry's ledger keeps both rows' disposers; one row leaving removes only its own route.
  await board.unload();
  assert.deepEqual(host.routes.map(row => row.path), ['/api/shine-mage-deliveries']);

  // Reload of the same row must not collide with the route it just released.
  const reloaded = fakeFiber(host);
  boardBrowserApi.apply(reloaded, { routes: ledger });
  assert.deepEqual(host.routes.map(row => row.path).sort(), ['/api/shine-mage-board', '/api/shine-mage-deliveries']);

  // Unloading the entry closes the ledger and releases whatever is left, newest first.
  await entry.unload();
  assert.deepEqual(host.routes, []);
  // LIFO by registration sequence: the reloaded board route (newest) first.
  assert.deepEqual(host.disposed, ['/api/shine-mage-board', '/api/shine-mage-board', '/api/shine-mage-deliveries']);
  await reloaded.unload();
  await history.unload();
  assert.deepEqual(host.routes, []);
});
