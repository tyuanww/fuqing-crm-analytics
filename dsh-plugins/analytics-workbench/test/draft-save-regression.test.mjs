import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePageAdapters } from '../src/client/free-html-library/live-adapters.mjs';
import { createFreeHtmlLibraryStore } from '../src/client/free-html-library/store.mjs';
import { sourceTargets } from '../src/client/html-source-selection.mjs';

function fixture({ pending = false, confirmStatus = null } = {}) {
  const pkg = { html: '<p id="title">Before</p>', css: '', js: '', resources: [], node_map: [] };
  const spec = { page_id: 'page_fixture', session_id: 'session_fixture', title: 'Synthetic', version: 1,
    binding_state: 'UNBOUND_SAMPLE', binding_manifest: { bindings: [], result_refs: [] }, package: pkg };
  const calls = [];
  let release;
  const adapters = createLivePageAdapters({ documentsHttp: {
    base: 'http://127.0.0.1:18999', token: 'synthetic-only-no-network', async fetchImpl(url, options) {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith('/pages/page_fixture')) return Response.json({ spec });
      if (url.endsWith('/patch-preview')) {
        if (pending) await new Promise(resolve => { release = resolve; });
        if (confirmStatus !== null) return Response.json({ preview_id: 'preview_fixture', status: 'PENDING' });
        return Response.json({ error: { code: 'TEMPORARY_UNAVAILABLE', message: 'Synthetic preview failure' } }, { status: 503 });
      }
      if (url.endsWith('/confirm')) {
        if (confirmStatus === 'network') throw new TypeError('Synthetic network loss');
        return Response.json({ error: { code: 'SYNTHETIC_CONFIRM_FAILURE', message: 'Synthetic confirm failure' } }, { status: confirmStatus });
      }
      throw new Error('Unexpected HTTP call: ' + url);
    },
  } });
  const store = createFreeHtmlLibraryStore({ adapters });
  return { store, calls, spec, release: () => release() };
}

test('failed text preview preserves unsaved text and reports failure without confirming old bytes', async t => {
  const { store, calls, spec } = fixture(); t.after(() => store.dispose());
  assert.equal(await store.openPage(spec.page_id), true);
  const originalHtml = store.getSnapshot().current.package.html;
  store.enterEdit();
  const selected = sourceTargets(store.getSnapshot().current.package).find(row => row.text === 'Before');
  store.selectLocatable(selected);
  store.setReplacementText('After', 'Before');
  assert.equal(store.hasUnsavedChanges(), true);
  const result = await store.commitTextDrafts();
  // Independent invariants: a preview failure must never confirm any package.
  assert.equal(calls.some(call => call.url.endsWith('/confirm')), false);
  assert.equal(store.getSnapshot().current.version, 1);
  assert.equal(store.getSnapshot().current.package.html, originalHtml);
  assert.match(store.getSnapshot().message, /Synthetic preview failure/);
  assert.equal(result, false, 'must not report successful save when preview failed');
  assert.equal(store.getSnapshot().textDraft.value, 'After');
  assert.equal(store.hasUnsavedChanges(), true);
});

test('inputs while preview awaits are refused by the busy guard', async t => {
  const { store, spec, release } = fixture({ pending: true }); t.after(() => store.dispose());
  await store.openPage(spec.page_id); store.enterEdit();
  store.selectLocatable(sourceTargets(store.getSnapshot().current.package).find(row => row.text === 'Before'));
  store.setReplacementText('After', 'Before');
  const committing = store.commitTextDrafts();
  assert.equal(store.getSnapshot().busy, true);
  store.setReplacementText('New while awaiting', 'Before');
  assert.equal(store.getSnapshot().textDraft.value, 'After');
  release(); await committing;
});

test('switching selection must not allow a source draft to bypass pending text drafts', async t => {
  const { store, spec } = fixture(); t.after(() => store.dispose());
  await store.openPage(spec.page_id); store.enterEdit();
  const selected = sourceTargets(store.getSnapshot().current.package).find(row => row.text === 'Before');
  store.selectLocatable(selected);
  store.setReplacementText('After', 'Before');
  // Reselecting already stashes the text draft in textDrafts and clears textDraft.
  store.selectLocatable(selected);
  assert.equal(store.getSnapshot().textDraft, null);
  assert.equal(Object.values(store.getSnapshot().textDrafts)[0], 'After');
  store.setSourceText('css', 'p{color:red}');
  assert.equal(store.getSnapshot().sourceDraft, null, 'source editing must respect all pending text drafts');
});

async function draftFixture(t, options) {
  const f = fixture(options); t.after(() => f.store.dispose());
  await f.store.openPage(f.spec.page_id); f.store.enterEdit();
  f.store.selectLocatable(sourceTargets(f.store.getSnapshot().current.package).find(row => row.text === 'Before'));
  f.store.setReplacementText('After', 'Before');
  return f;
}
test('persistForLeave cannot leave after failed preview and preserves the original and all text', async t => {
  const {store,calls} = await draftFixture(t);
  assert.deepEqual(await store.persistForLeave(), {ok:false,reason:'save_failed'});
  assert.deepEqual(store.getSnapshot().textDraft, {value:'After', original:'Before', changed:true});
  assert.equal(store.hasUnsavedChanges(),true);
  assert.equal(calls.some(c=>c.url.endsWith('/confirm')),false);
});
for (const status of [409,503,'network']) test(`confirm ${status} failure keeps draft and blocks leaving`, async t => {
  const {store,calls}=await draftFixture(t,{confirmStatus:status});
  assert.equal(await store.commitTextDrafts(),false);
  assert.equal(calls.filter(c=>c.url.endsWith('/confirm')).length,1);
  assert.deepEqual(store.getSnapshot().textDraft,{value:'After',original:'Before',changed:true});
  assert.ok(store.getSnapshot().preview);
  assert.equal(store.getSnapshot().current.version,1);
  assert.equal(store.getSnapshot().confirmationUncertain,status!==409);
  assert.equal((await store.persistForLeave()).ok,false);
});
test('a pending source draft rejects both a new selection and replacement using the old selection', async t => {
  const {store,spec}=fixture(); t.after(()=>store.dispose());
  await store.openPage(spec.page_id); store.enterEdit();
  const target=sourceTargets(store.getSnapshot().current.package).find(row=>row.text==='Before');
  store.selectLocatable(target); store.setSourceText('css','p{color:red}');
  assert.equal(store.getSnapshot().sourceDraft.changed,true);
  const selection=store.getSnapshot().selection;
  store.selectLocatable({...target,node_id:'forged'});
  assert.equal(store.getSnapshot().selection,selection);
  store.setReplacementText('Lost text','Before');
  assert.equal(store.getSnapshot().textDraft,null);
  assert.deepEqual(store.getSnapshot().textDrafts,{});
  assert.equal(store.getSnapshot().sourceDraft.package.css,'p{color:red}');
});

test('explicit discard clears every text draft while preserving the saved package and version', async t => {
  const {store}=await draftFixture(t);
  const {savedPackage,version}=store.getSnapshot().current;
  const saved=structuredClone(savedPackage);
  store.selectLocatable(sourceTargets(store.getSnapshot().current.package).find(row=>row.text==='Before'));
  assert.equal(store.getSnapshot().textDraft,null);
  assert.notDeepEqual(store.getSnapshot().textDrafts,{});
  assert.deepEqual(await store.discardForLeave(),{ok:true});
  assert.deepEqual(store.getSnapshot().textDrafts,{});
  assert.deepEqual(store.getSnapshot().textDraftNodes,{});
  assert.equal(store.getSnapshot().textDraft,null);
  assert.equal(store.hasUnsavedChanges(),false);
  assert.deepEqual(store.getSnapshot().current.savedPackage,saved);
  assert.deepEqual(store.getSnapshot().current.package,saved);
  assert.equal(store.getSnapshot().current.version,version);
});
