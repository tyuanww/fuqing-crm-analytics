import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { linkWorkspaceContract } from '../../../scripts/dsh-b0/plugin-kit-link.mjs';
import { ConnectionFetchLedger } from '../src/connection-fetch-ledger.mjs';
import * as boardBrowserApi from '../src/board-browser-api.ts';
import * as cockpitHistoryApi from '../src/cockpit-history-api.ts';

// This file executes plugin sources directly, so bind the same workspace link
// the B0 pipeline creates: the rows consume the owned generated-contract
// package, which a source checkout has not installed.
const repository = fileURLToPath(new URL('../../..', import.meta.url));
for (const plugin of ['analytics-workbench', 'crm-knowledge']) {
  await linkWorkspaceContract(join(repository, 'dsh-plugins', plugin), join(repository, 'dsh-plugins/contracts'));
}
const firstPurchaseSaveApi = await import('../src/first-purchase-save-api.ts');
// crm-knowledge ships to its own author repository; the host row is still the
// real production route owner, not a fixture.
const crmHost = await import('../../crm-knowledge/src/host.ts');

const WORKBENCH_ROUTES = [
  '/api/analytics-first-purchase/save',
  '/api/shine-mage-board',
  '/api/shine-mage-deliveries',
];
const CRM_ROUTES = ['/api/crm-knowledge/assets', '/api/crm-knowledge/connection'];
const PRODUCTION_ROUTES = [...WORKBENCH_ROUTES, ...CRM_ROUTES].sort();

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

/** The Host services the CRM login row injects, either lazy or absent here. */
const hostServices = () => ({
  webServer: { port: 50107 },
  sessions: { get: () => undefined },
  provide() {},
  get() { return undefined; },
});

test('the two independently published packages carry the same ledger contract', async () => {
  for (const file of ['connection-fetch-ledger.mjs', 'connection-fetch-ledger.d.mts']) {
    const [workbench, crm] = await Promise.all([
      readFile(new URL(`../src/${file}`, import.meta.url)),
      readFile(new URL(`../../crm-knowledge/src/${file}`, import.meta.url)),
    ]);
    // A plugin ships to its own author repository, so it cannot import a
    // sibling's source. The copies must stay byte-identical instead of drifting.
    assert.ok(workbench.equals(crm), `${file} must stay byte-identical in both packages`);
  }
});

test('both plugins mount five production routes through their own ledgers', async () => {
  const host = fakeHost();
  const workbenchEntry = fakeFiber(host);
  const workbench = new ConnectionFetchLedger(workbenchEntry, { label: 'workbench-entry' });
  const board = fakeFiber(host);
  boardBrowserApi.apply(board, { routes: workbench });
  const history = fakeFiber(host);
  cockpitHistoryApi.apply(history, { routes: workbench });
  const save = fakeFiber(host, hostServices());
  firstPurchaseSaveApi.apply(save, { routes: workbench });

  const crmEntry = fakeFiber(host, hostServices());
  const crmLedger = new ConnectionFetchLedger(crmEntry, { label: 'crm-entry' });
  const crm = fakeFiber(host, hostServices());
  crmHost.apply(crm, { routes: crmLedger });

  assert.deepEqual(host.routes.map(row => row.path).sort(), PRODUCTION_ROUTES);
  assert.deepEqual(Object.fromEntries(host.routes.map(row => [row.path, [row.methods.join(','), row.requestBody]])), {
    '/api/analytics-first-purchase/save': ['POST', 'streaming'],
    '/api/shine-mage-board': ['POST', 'buffered'],
    '/api/shine-mage-deliveries': ['POST', 'buffered'],
    '/api/crm-knowledge/assets': ['POST', 'streaming'],
    '/api/crm-knowledge/connection': ['POST', 'streaming'],
  });

  // The CRM row releases only its own two routes; the workbench rows stay mounted.
  await crm.unload();
  assert.deepEqual(host.routes.map(row => row.path).sort(), WORKBENCH_ROUTES);

  // Reloading the CRM row must not collide with the routes it just released.
  const crmReload = fakeFiber(host, hostServices());
  crmHost.apply(crmReload, { routes: crmLedger });
  assert.deepEqual(host.routes.map(row => row.path).sort(), PRODUCTION_ROUTES);

  // Workbench rows unwind newest-first through their own tags.
  const before = host.disposed.length;
  await save.unload();
  await history.unload();
  await board.unload();
  assert.deepEqual(host.disposed.slice(before), [
    '/api/analytics-first-purchase/save',
    '/api/shine-mage-deliveries',
    '/api/shine-mage-board',
  ]);
  await workbenchEntry.unload();
  assert.deepEqual(host.routes.map(row => row.path).sort(), CRM_ROUTES);

  // The CRM entry closes its ledger: the reloaded assets route (newest) first.
  // The two routes the earlier unload already released are not disposed twice.
  await crmEntry.unload();
  assert.deepEqual(host.disposed.slice(before + 3), [
    '/api/crm-knowledge/assets',
    '/api/crm-knowledge/connection',
  ]);
  assert.deepEqual(host.routes, []);
  await crmReload.unload();
});

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

test('the CRM host owns both streaming routes in its own package ledger', async () => {
  const host = fakeHost();
  const fiber = fakeFiber(host, hostServices());
  crmHost.apply(fiber);
  assert.deepEqual(host.routes.map(row => [row.path, row.methods.join(','), row.requestBody]), [
    ['/api/crm-knowledge/connection', 'POST', 'streaming'],
    ['/api/crm-knowledge/assets', 'POST', 'streaming'],
  ]);
  await fiber.unload();
  assert.deepEqual(host.routes, []);
  // Newest registration first, exactly like the workbench ledger.
  assert.deepEqual(host.disposed, ['/api/crm-knowledge/assets', '/api/crm-knowledge/connection']);
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
