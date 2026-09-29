import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreeHtmlLibraryStore } from './store.mjs';
import { createMockPageAdapters, SAMPLE_PACKAGE } from './mock-adapters.mjs';

function page(binding_manifest = { bindings: [], result_refs: [] }) {
  return { page_id: 'page_source', session_id: 'session_source', title: '源码样例', version: 1, base_version: 0,
    binding_state: binding_manifest.result_refs.length ? 'BOUND_VERIFIED' : 'UNBOUND_SAMPLE', binding_manifest,
    package: structuredClone(SAMPLE_PACKAGE), savedPackage: structuredClone(SAMPLE_PACKAGE), dirty: false,
    updated_at: 1, history: [{ version: 1, title: '源码样例', at: 1, package: structuredClone(SAMPLE_PACKAGE) }] };
}

function pageWith(id, title, text) {
  const pkg = structuredClone(SAMPLE_PACKAGE);
  pkg.html = `<h1 data-shine-node="n_title">${text}</h1>`;
  return { ...page(), page_id: id, title, package: pkg, savedPackage: structuredClone(pkg),
    history: [{ version: 1, title, at: 1, package: structuredClone(pkg) }] };
}

test('manual source draft previews and confirms through the same save boundary', async () => {
  const store = createFreeHtmlLibraryStore({ adapters: createMockPageAdapters({ pages: [page()] }) });
  await store.openPage('page_source');
  store.enterEdit();
  store.setSourceText('css', `${store.getSnapshot().current.package.css}\nbody{background:#FEFCFF}`);
  assert.equal(store.hasUnsavedChanges(), true);
  await store.previewSourceDraft();
  assert.equal(store.getSnapshot().preview.operation, 'SAVE');
  await store.confirmPatch();
  assert.equal(store.getSnapshot().current.version, 2);
  assert.match(store.getSnapshot().current.package.css, /background:#FEFCFF/);
  assert.equal(store.getSnapshot().sourceDraft, null);
  store.dispose();
});

test('bound manual source fallback allows CSS while refusing HTML and JS', async () => {
  const store = createFreeHtmlLibraryStore({ adapters: createMockPageAdapters({ pages: [page({ bindings: [], result_refs: ['result_1'] })] }) });
  await store.openPage('page_source');
  store.openContext('source');
  const original = store.getSnapshot().current.package.html;
  store.setSourceText('html', original + '<p>拒绝</p>');
  assert.equal(store.getSnapshot().sourceDraft, null);
  store.setSourceText('css', `${store.getSnapshot().current.package.css}\nbody{color:#201426}`);
  assert.equal(store.getSnapshot().sourceDraft.changed, true);
  store.dispose();
});

test('cancelling a source preview keeps the draft for another review', async () => {
  const store = createFreeHtmlLibraryStore({ adapters: createMockPageAdapters({ pages: [page()] }) });
  await store.openPage('page_source');
  store.setSourceText('css', `${store.getSnapshot().current.package.css}\nbody{padding:8px}`);
  await store.previewSourceDraft();
  await store.cancelPreview();
  assert.equal(store.getSnapshot().preview, null);
  assert.equal(store.getSnapshot().sourceDraft.changed, true);
  assert.match(store.getSnapshot().sourceDraft.package.css, /padding:8px/);
  store.dispose();
});

test('opening another page clears a reverted source draft', async () => {
  const store = createFreeHtmlLibraryStore({ adapters: createMockPageAdapters({ pages: [pageWith('page_one', '一页', 'ONE'), pageWith('page_two', '二页', 'TWO')] }) });
  await store.openPage('page_one');
  store.openContext('source');
  const css = store.getSnapshot().current.package.css;
  store.setSourceText('css', `${css}\nbody{padding:8px}`);
  store.setSourceText('css', css);
  assert.equal(store.getSnapshot().sourceDraft.changed, false);
  await store.openPage('page_two');
  assert.equal(store.getSnapshot().sourceDraft, null);
  assert.equal(store.getSnapshot().current.title, '二页');
  store.dispose();
});

test('structured text route refuses a dynamic region instead of widening it', async () => {
  const store = createFreeHtmlLibraryStore({ adapters: createMockPageAdapters({ pages: [page()] }) });
  await store.openPage('page_source');
  store.enterEdit();
  store.selectLocatable({ kind: 'dynamic_region', node_id: 'r_chart', mapping: 'valid' });
  await store.previewPatch('不应直接写入');
  assert.match(store.getSnapshot().message, /源码入口/);
  assert.equal(store.getSnapshot().preview, null);
  store.dispose();
});
