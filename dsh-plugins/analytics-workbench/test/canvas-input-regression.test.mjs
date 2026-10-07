import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectToolchain } from '@shine-mage/dsh-plugin-kit/toolchain';
import { resolve } from 'node:path';
import { loadJsdom } from './helpers/jsdom-loader.mjs';
import { fileURLToPath } from 'node:url';
import { createFreeHtmlLibraryStore } from '../src/client/free-html-library/store.mjs';
import { createMockPageAdapters } from '../src/client/free-html-library/mock-adapters.mjs';
import { editablePageNodes } from '../src/client/html-selection-bridge.mjs';

const plugin = fileURLToPath(new URL('..', import.meta.url));
const upstream = resolve(process.env.B0_BUILD_UPSTREAM ?? fileURLToPath(new URL('../../../.context/dsh-b0/upstream-0.1.7-rc.2/', import.meta.url))) + '/';
const toolchain = await inspectToolchain(upstream, process.env.B0_BUILD_TOOLS);
const React = toolchain.loadBrowserModule('react');
const { createRoot } = toolchain.loadBrowserModule('react-dom/client');
const JSDOM = loadJsdom();
const esbuild = toolchain.loadBundler();
const built = await esbuild.build({ absWorkingDir: plugin,
  entryPoints: ['src/client/cockpit-page-editor.tsx'], write: false, bundle: true, format: 'cjs', platform: 'node',
  jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom'], logLevel: 'silent' });
const mod = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(toolchain.loadBrowserModule, mod, mod.exports);
const { CockpitPageEditor } = mod.exports;

async function editorFixture(t, { bound = false, mode = 'edit', rich = false, dynamic = false } = {}) {
  const pkg = { html: rich ? '<p id="title">Revenue <b>100</b> CNY</p><p data-shine-node="other">Other</p>' : '<p id="title" data-shine-node="title">Before</p><p data-shine-node="other">Other</p>', css: '', js: '', resources: [],
    node_map: rich ? [] : [{ node_id: 'title', kind: dynamic ? 'dynamic_region' : 'static_element', selector: '[data-shine-node="title"]' }, { node_id:'other',kind:'static_element',selector:'[data-shine-node="other"]' }] };
  if (dynamic) { pkg.html = pkg.html.replace('data-shine-node="title"', 'data-shine-region="title"'); pkg.node_map[0].selector = '[data-shine-region="title"]'; }
  const page = { page_id: 'page_fixture', session_id: 'session_fixture', title: 'Synthetic', version: 1,
    binding_state: 'UNBOUND_SAMPLE', binding_manifest: { bindings: [], result_refs: bound ? ['result_synthetic'] : [] }, package: pkg,
    savedPackage: structuredClone(pkg), history: [], dirty: false };
  const store = createFreeHtmlLibraryStore({ adapters: createMockPageAdapters({ pages: [page] }) });
  await store.openPage(page.page_id); if (mode === 'edit') store.enterEdit();
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://127.0.0.1:4318', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'Element', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const root = createRoot(dom.window.document.querySelector('#root'));
  t.after(async () => {
    await React.act(async () => root.unmount()); store.dispose(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await React.act(async () => root.render(React.createElement(CockpitPageEditor, { store })));
  const iframe = dom.window.document.querySelector('iframe');
  const channel = /"channel":"([^"]+)"/.exec(iframe.srcdoc)[1];
  const nodes = editablePageNodes(pkg, page.binding_manifest);
  const send = data => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    origin: 'null', source: iframe.contentWindow, data: { channel, pageId: page.page_id, version: 1, ...data },
  }));
  const targets = async (runtimeNodes = []) => React.act(async () => send({type:'cockpit.targets',nodeIds:nodes.map(node=>node.node_id),runtimeNodes}));
  const input = async (nodeId, text, extra={}) => React.act(async () => send({type:'cockpit.selection',nodeId,selectedText:text,htmlSelection:'<p>'+text+'</p>',textValue:text,...extra}));
  await targets();
  return {store,nodes,targets,input};
}

test('canvas input records, repeats, switches away/back and reverts without changing source original', async t => {
  const {store,input}=await editorFixture(t);
  await input('title','After');
  assert.deepEqual(store.getSnapshot().textDraft,{value:'After',original:'Before',changed:true});
  await input('title','Again');
  assert.deepEqual(store.getSnapshot().textDraft,{value:'Again',original:'Before',changed:true});
  await input('other','Other'); await input('title','Last');
  assert.deepEqual(store.getSnapshot().textDraft,{value:'Last',original:'Before',changed:true});
  await input('title','Before');
  assert.equal(store.hasUnsavedChanges(),false);
});
test('runtime targets refresh to displayed drafts without changing original after a selection switch', async t => {
  const {store,nodes,input,targets}=await editorFixture(t);
  const root=nodes.find(n=>n.node_id==='title');
  const runtime = text => ({node_id:'runtime_title_[]',root_id:root.node_id,tag:'p',text,editableText:true,block:false,
    runtime:{anchor:root.anchor,path:[],package_hash:root.packageHash,html:'<p id="title">'+text+'</p>'}});
  await targets([runtime('Before')]); await input('runtime_title_[]','After');
  assert.equal(store.getSnapshot().textDraft.original,'Before');
  await targets([runtime('After')]); await input('runtime_title_[]','Again');
  await input('other','Other'); await targets([runtime('Again')]); await input('runtime_title_[]','Before');
  assert.equal(store.getSnapshot().textDraft.original,'Before');
  assert.equal(store.hasUnsavedChanges(),false);
});
test('rich sentence original uses editorText and reverting leaves no false dirty state', async t => {
  const {store,nodes,input}=await editorFixture(t,{rich:true});
  const rich=nodes.find(n=>n.richText);
  assert.equal(rich.editorText,'Revenue 100 CNY');
  await input(rich.node_id,'Total 100 CNY');
  assert.equal(store.getSnapshot().textDraft.original,'Revenue 100 CNY');
  await input(rich.node_id,'Revenue 100 CNY');
  assert.equal(store.hasUnsavedChanges(),false);
});
for (const [name,options] of [['browse',{mode:'browse'}],['bound page',{bound:true}],['inspectOnly dynamic region',{dynamic:true}]]) {
  test(`${name} refuses canvas text payloads`,async t=>{
    const {store,nodes,input}=await editorFixture(t,options);
    if(name==='inspectOnly dynamic region') assert.ok(nodes.find(n=>n.node_id==='title').inspectOnly);
    await input('title','Forbidden');
    assert.equal(store.getSnapshot().textDraft,null);
    assert.deepEqual(store.getSnapshot().textDrafts,{});
    assert.equal(store.hasUnsavedChanges(),false);
  });
}
test('stale frame version refuses canvas input',async t=>{
  const {store,input}=await editorFixture(t); await input('title','Stale',{version:0});
  assert.equal(store.hasUnsavedChanges(),false);
});
