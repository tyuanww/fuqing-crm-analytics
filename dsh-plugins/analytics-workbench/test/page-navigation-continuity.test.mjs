import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreeHtmlLibraryStore } from '../src/client/free-html-library/store.mjs';

const page = pageId => ({
  page_id: pageId,
  session_id: 'session-synthetic',
  title: pageId,
  version: 1,
  binding_state: 'UNBOUND_SAMPLE',
  binding_manifest: { bindings: [], result_refs: [] },
  package: { html: `<p>${pageId}</p>`, css: '', js: '', resources: [], node_map: [] },
});

function fixture(t, documents = {}) {
  let release;
  const opened = new Promise(resolve => { release = resolve; });
  const pages = new Map([['page_a', page('page_a')], ['page_b', page('page_b')]]);
  const adapters = {
    kind: 'p12-live',
    assets: {
      get: id => pages.get(id),
      list: () => [...pages.values()],
      put: value => pages.set(value.page_id, value),
    },
    documents: {
      async pullPage(pageId) {
        if (pageId === 'page_a') await opened;
        return { ok: true, spec: pages.get(pageId) };
      },
      ...documents,
      async generatePreview() { return { ok: false }; },
      async confirmPreview() { return { ok: false }; },
      async cancelPreview() { return { ok: false }; },
    },
    nextId: prefix => `${prefix}_fixture`,
  };
  const store = createFreeHtmlLibraryStore({ adapters });
  t.after(() => store.dispose());
  return { store, release };
}

test('an external native-panel switch invalidates an older page read', async t => {
  const f = fixture(t);
  const pending = f.store.openPage('page_a');
  await new Promise(resolve => setImmediate(resolve));
  f.store.beginNavigation('panel');
  f.release();
  assert.equal(await pending, false);
  assert.equal(f.store.getSnapshot().current, null);
  assert.equal(f.store.getSnapshot().message, '');
  assert.equal(await f.store.openPage('page_b'), true);
  assert.equal(f.store.getSnapshot().current.page_id, 'page_b');
});

test('an external native-panel switch drops a late history response', async t => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const f = fixture(t, {
    async pullHistory() { return response; },
  });
  await f.store.openPage('page_b');

  const pending = f.store.loadHistory();
  await new Promise(resolve => setImmediate(resolve));
  f.store.beginNavigation('panel');
  release({ ok: true, items: [{ version: 1, title: 'stale' }] });
  await pending;

  assert.deepEqual(f.store.getSnapshot().historyItems, []);
  assert.equal(f.store.getSnapshot().contextPanel, null);
});

test('an external native-panel switch drops a late rollback preview', async t => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const f = fixture(t, {
    async rollbackPreview() { return response; },
  });
  await f.store.openPage('page_b');

  const pending = f.store.previewRollback(1);
  await new Promise(resolve => setImmediate(resolve));
  f.store.beginNavigation('panel');
  release({
    ok: true,
    body: {
      preview_id: 'preview_stale',
      snapshot: { spec: { package: page('page_a').package } },
    },
  });
  await pending;

  assert.equal(f.store.getSnapshot().preview, null);
  assert.equal(f.store.getSnapshot().lastIdempotencyKey, null);
});

test('an external native-panel switch drops a late page failure', async t => {
  let reject;
  const response = new Promise((_, fail) => { reject = fail; });
  const f = fixture(t, {
    async pullPage() { return response; },
  });

  const pending = f.store.openPage('page_a');
  await new Promise(resolve => setImmediate(resolve));
  f.store.beginNavigation('panel');
  reject(new Error('stale page failure'));
  await pending;

  assert.equal(f.store.getSnapshot().current, null);
  assert.equal(f.store.getSnapshot().message, '');
  assert.equal(f.store.getSnapshot().liveStatus, '');
});

test('an external native-panel switch drops a late history failure', async t => {
  let reject;
  const response = new Promise((_, fail) => { reject = fail; });
  const f = fixture(t, {
    async pullHistory() { return response; },
  });
  await f.store.openPage('page_b');

  const pending = f.store.loadHistory();
  await new Promise(resolve => setImmediate(resolve));
  f.store.beginNavigation('panel');
  reject(new Error('stale history failure'));
  await pending;

  assert.deepEqual(f.store.getSnapshot().historyItems, []);
  assert.equal(f.store.getSnapshot().contextPanel, null);
  assert.equal(f.store.getSnapshot().message, '');
  assert.doesNotMatch(f.store.getSnapshot().liveStatus, /stale history failure/);
});

test('an external native-panel switch drops a late rollback failure', async t => {
  let reject;
  const response = new Promise((_, fail) => { reject = fail; });
  const f = fixture(t, {
    async rollbackPreview() { return response; },
  });
  await f.store.openPage('page_b');

  const pending = f.store.previewRollback(1);
  await new Promise(resolve => setImmediate(resolve));
  f.store.beginNavigation('panel');
  reject(new Error('stale rollback failure'));
  await pending;

  assert.equal(f.store.getSnapshot().preview, null);
  assert.equal(f.store.getSnapshot().lastIdempotencyKey, null);
  assert.equal(f.store.getSnapshot().message, '');
  assert.doesNotMatch(f.store.getSnapshot().liveStatus, /stale rollback failure/);
});
