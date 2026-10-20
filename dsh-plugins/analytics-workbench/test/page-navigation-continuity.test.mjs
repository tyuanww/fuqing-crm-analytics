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

function fixture(t) {
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
