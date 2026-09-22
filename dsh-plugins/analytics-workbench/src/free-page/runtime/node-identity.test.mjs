import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNodeGraph, createSourceNodeRef } from '../source-index/node-graph.mjs';
import { createRuntimeIdentityStore } from './node-identity.mjs';

test('runtime identities are sidecar-only and stable for the same node', () => {
  const html = '<main><p data-shine-node="n_title">Title</p></main>';
  const pkg = { html, css: '', js: '', node_map: [{ node_id: 'n_title', kind: 'static_element' }] };
  const graph = buildNodeGraph(pkg, { page_id: 'page-a' });
  const ref = graph.sourceRef('n_title');
  const node = {};
  const store = createRuntimeIdentityStore({ sessionId: 's1' });
  const first = store.source(node, ref);
  const second = store.source(node, ref);
  assert.equal(first.identity, second.identity);
  assert.equal(first.identity, ref.identity);
  assert.equal(store.resolve(ref).state, 'resolved');
  assert.equal(pkg.html, html);
});

test('template, dynamic and temporary refs are distinct and deterministic where keyed', () => {
  const store = createRuntimeIdentityStore({ sessionId: 's2' });
  const template = createSourceNodeRef({ pageId: 'p', anchorId: 'card', path: 'card[0]' });
  const a = store.template({}, template, 'a');
  const b = store.template({}, template, 'a');
  const dynamic = store.dynamic({}, 'region:r', 'row-1');
  const temp = store.temporary({}, 'drag');
  assert.equal(a.identity, b.identity);
  assert.notEqual(a.identity, dynamic.identity);
  assert.match(temp.identity, /^tmp:/);
});

test('MutationObserver records are delivered as one microtask batch', async () => {
  let callback;
  const observers = [];
  class FakeObserver {
    constructor(fn) { callback = fn; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const batches = [];
  const store = createRuntimeIdentityStore({ observerFactory: FakeObserver, onBatch: batch => batches.push(batch) });
  const target = {};
  assert.equal(store.observe(target).ok, true);
  const one = { addedNodes: [{}], removedNodes: [] };
  const two = { addedNodes: [], removedNodes: [{}] };
  callback([one]);
  callback([two]);
  assert.equal(batches.length, 0);
  await Promise.resolve();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].records.length, 2);
  assert.equal(batches[0].added.length, 1);
  assert.equal(batches[0].removed.length, 1);
  assert.equal(observers[0].options.subtree, true);
});

test('lazy resolve does not scan until requested and reports missing safely', async () => {
  const store = createRuntimeIdentityStore();
  const ref = createSourceNodeRef({ pageId: 'p', anchorId: 'late', path: 'late[0]' });
  const node = {};
  let calls = 0;
  const resolved = await store.resolveLazy(ref, () => { calls += 1; return node; });
  assert.equal(calls, 1);
  assert.equal(resolved.node, node);
  const again = await store.resolveLazy(ref, () => { calls += 1; return {}; });
  assert.equal(calls, 1);
  assert.equal(again.node, node);
  const missing = await store.resolveLazy('src:missing', () => null);
  assert.equal(missing.state, 'missing');
  const cachedMiss = await store.resolveLazy('src:missing', () => { calls += 1; return {}; });
  assert.equal(calls, 1);
  assert.equal(cachedMiss.state, 'missing');
});

test('dynamic re-render rebinds the same instance key and deletion fans out', async () => {
  let callback;
  class FakeObserver {
    constructor(fn) { callback = fn; }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
    takeRecords() { return []; }
  }
  const graph = buildNodeGraph({
    html: '<section data-shine-region="r_card"></section>',
    css: '',
    js: '',
    node_map: [{ node_id: 'r_card', kind: 'dynamic_region' }],
  }, { page_id: 'page_live' });
  const template = graph.sourceRef('r_card', { attr: 'region' });
  const store = createRuntimeIdentityStore({ graph, sessionId: 'live', observerFactory: FakeObserver });
  const first = {};
  const bound = store.dynamicRef(first, template, 'row-1');
  const child = {};
  const chip = store.temporaryRef(child, 'chip', { parent_identity: bound.identity });
  const second = {};
  const rebound = store.dynamicRef(second, template, 'row-1');
  assert.equal(rebound.identity, bound.identity);
  assert.equal(store.resolve(bound).node, second);
  assert.equal(store.resolve(bound).state, 'resolved');
  const third = {};
  store.dynamicRef(third, template, 'row-1');
  store.observe({});
  callback([{ addedNodes: [], removedNodes: [third] }]);
  await Promise.resolve();
  assert.equal(store.resolve(bound).state, 'deleted');
  assert.equal(store.resolve(chip).state, 'deleted');
  assert.equal(graph.get(bound).status, 'deleted');
  assert.equal(graph.toSidecar().source_bytes_unchanged, true);
  const revivedNode = {};
  const revived = store.dynamicRef(revivedNode, template, 'row-1');
  assert.equal(revived.identity, bound.identity);
  assert.equal(store.resolve(bound).node, revivedNode);
  assert.equal(graph.get(bound).status, 'runtime');
  const lazyCalls = [];
  const lazy = await store.resolveLazy(bound, () => { lazyCalls.push(1); return {}; });
  assert.equal(lazy.node, revivedNode);
  assert.equal(lazyCalls.length, 0);
  store.markDeleted(revivedNode);
  const afterDelete = await store.resolveLazy(bound, () => { lazyCalls.push(1); return {}; });
  assert.equal(afterDelete.state, 'deleted');
  assert.equal(lazyCalls.length, 0);
});

test('observer suppression drops self updates and batches the next real mutation', async () => {
  let callback;
  class FakeObserver {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  const batches = [];
  const store = createRuntimeIdentityStore({
    observerFactory: FakeObserver,
    onBatch(batch) {
      batches.push(batch.added.map(node => node.id));
      callback([{ addedNodes: [{ id: 'echo' }], removedNodes: [] }]);
    },
  });
  assert.equal(store.observe({}).ok, true);
  store.suppress(() => {
    callback([{ addedNodes: [{ id: 'self' }], removedNodes: [] }]);
  });
  callback([{ addedNodes: [{ id: 'user' }], removedNodes: [] }]);
  await Promise.resolve();
  assert.deepEqual(batches, [['user']]);
  await Promise.resolve();
  assert.deepEqual(batches, [['user']]);
});

test('disconnect, dispose and a missing observer degrade without dropping manual identity', () => {
  const ref = createSourceNodeRef({ pageId: 'p', anchorId: 'keep', path: 'keep[0]' });
  const unavailable = createRuntimeIdentityStore({ observerFactory: null });
  const node = {};
  const bound = unavailable.sourceRef(node, ref);
  assert.equal(unavailable.observe({}).reason, 'MUTATION_OBSERVER_UNAVAILABLE');
  assert.equal(unavailable.resolve(ref).identity, bound.identity);
  unavailable.disconnect();
  assert.equal(unavailable.resolve(ref).state, 'resolved');
  unavailable.dispose();
  assert.equal(unavailable.disposed, true);
  assert.equal(unavailable.observe({}).reason, 'DISPOSED');
  assert.equal(unavailable.resolve(ref).state, 'disposed');
  assert.equal(unavailable.sourceRef({}, ref).state, 'disposed');
  assert.equal(unavailable.dynamicRef({}, 'region', 'row').state, 'disposed');
});

test('a slow observer batch degrades after the microtask and keeps identities', async () => {
  let callback;
  class FakeObserver {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() {}
  }
  let tick = 0;
  const ref = createSourceNodeRef({ pageId: 'p', anchorId: 'slow', path: 'slow[0]' });
  const node = {};
  const store = createRuntimeIdentityStore({
    now: () => tick,
    budgets: { batchMs: 1 },
    observerFactory: FakeObserver,
    onBatch() { tick = 20; },
  });
  store.sourceRef(node, ref);
  store.observe({});
  callback([{ addedNodes: [{ id: 'tick' }], removedNodes: [] }]);
  await Promise.resolve();
  assert.equal(store.degraded, true);
  assert.equal(store.degradeReason, 'OBSERVER_BUDGET');
  assert.equal(store.resolve(ref).node, node);
  assert.equal(store.observe({}).ok, false);
});

test('an over-budget observer batch disconnects and keeps resolved identities', async () => {
  let callback;
  class FakeObserver {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  let tick = 0;
  const ref = createSourceNodeRef({ pageId: 'p', anchorId: 'budget', path: 'budget[0]' });
  const node = {};
  const store = createRuntimeIdentityStore({
    now: () => tick,
    budgets: { batchMs: 0, maxBatchRecords: 1 },
    observerFactory: FakeObserver,
    onBatch() { tick = 5; },
  });
  store.sourceRef(node, ref);
  assert.equal(store.observe({}).ok, true);
  callback([
    { addedNodes: [{ id: 'a' }], removedNodes: [] },
    { addedNodes: [{ id: 'b' }], removedNodes: [] },
  ]);
  await Promise.resolve();
  assert.equal(store.degraded, true);
  assert.equal(store.degradeReason, 'BATCH_LIMIT');
  assert.equal(store.resolve(ref).node, node);
  assert.equal(store.observe({}).ok, false);
});
