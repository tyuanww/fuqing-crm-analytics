import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceTargets, sourceTextPreview, selectionForAI, instrumentSourceTargets } from './html-source-selection.mjs';
import { sourceHash } from '../free-page/presentation/model.mjs';
import { createFreeHtmlLibraryStore } from './free-html-library/store.mjs';
import { createLivePageAdapters } from './free-html-library/live-adapters.mjs';
import { createIsolatedFetch } from './free-html-library/p12-http-fakes.mjs';
const pkg = { html: '<header><h1>你好 🌟</h1><p title="a > b">Plain &amp; safe</p></header><section><p>Keep</p></section>', css: '', js: '', node_map: [], resources: [] };
test('ordinary HTML gets source selections without changing or inventing persisted mappings', () => {
  const nodes = sourceTargets(pkg), title = nodes.find(node => node.tag === 'h1'), paragraph = nodes.find(node => node.text.startsWith('Plain'));
  assert.ok(title.editableText); assert.ok(nodes.find(node => node.tag === 'header').block);
  const changed = sourceTextPreview(pkg, title, '<new>', null);
  assert.match(changed.html, /<h1>&lt;new&gt;<\/h1>/); assert.match(changed.html, /<section><p>Keep<\/p><\/section>$/);
  assert.deepEqual(changed.node_map, []); assert.equal(pkg.html.includes('data-cockpit-source'), false);
  assert.match(instrumentSourceTargets(pkg, nodes).html, /data-cockpit-source/);
  assert.equal(selectionForAI(pkg, paragraph).start, [...pkg.html.slice(0, paragraph.source.start)].length);
  assert.throws(() => sourceTextPreview({ ...pkg, html: pkg.html + 'changed' }, title, 'x'));
});
test('source edits and instrumentation rebind presentation to the new source hash', () => {
  const source = { ...pkg, html: '<header id="hero"><h1>你好 🌟</h1></header><section><p>Keep</p></section>' };
  const heading = sourceTargets(source).find(node => node.tag === 'h1');
  const withCopy = { ...source, presentation: { version: 1, source_hash: sourceHash(source),
    edits: [{ target: { anchor: { attribute: 'id', value: 'hero' }, path: [{ tag: 'h1' }] }, text: 'x' }] } };
  const edited = sourceTextPreview(withCopy, heading, '新标题');
  assert.equal(edited.presentation.source_hash, sourceHash(edited));
  assert.notEqual(edited.presentation.source_hash, withCopy.presentation.source_hash);
  const marked = instrumentSourceTargets(withCopy, sourceTargets(withCopy));
  assert.equal(marked.presentation.source_hash, sourceHash(marked));
  assert.notEqual(marked.presentation.source_hash, withCopy.presentation.source_hash);
});
test('ambiguous markup, bindings and active regions remain unavailable', () => {
  for (const html of ['<p><b>broken</p></b>', '<section data-shine-region="chart"><p>Dynamic</p></section>', '<div onclick="run()"><p>Active</p></div>', '<template><p>Hidden</p></template>']) {
    assert.deepEqual(sourceTargets({ ...pkg, html }), []);
  }
  assert.deepEqual(sourceTargets(pkg, { bindings: [{ node_id: 'protected' }] }), []);
  const nodes = sourceTargets({ ...pkg, html: '<script>const x="<p>fake</p>";</script><p>Real</p>' });
  assert.equal(nodes.length, 1); assert.equal(nodes[0].text, 'Real');
  for (const active of ['<button onclick="go()">Go</button>', '<svg><title>Icon</title></svg>', '<style>p{color:red}</style>']) {
    const siblings = sourceTargets({ ...pkg, html: '<section><p>Safe</p>' + active + '</section><p>Other</p>' });
    assert.deepEqual(siblings.map(node => node.text), ['Safe', 'Other']);
  }
  assert.deepEqual(sourceTargets({ ...pkg, html: '<section><div /></section>' }), []);
});
test('temporary identities reserve mapped, unmapped and encoded DOM marker identities', () => {
  const mixed = { ...pkg, html: '<p data-shine-node="source_1">First</p><p data-shine-node=source_2>Second</p><p data-shine-node="source_&#51;">Third</p><p>Fourth</p>',
    node_map: [{ node_id: 'source_0', kind: 'static_element' }] };
  const nodes = sourceTargets(mixed);
  assert.deepEqual(nodes.map(node => node.node_id), ['source_4', 'source_5', 'source_6', 'source_7']);
  assert.equal(sourceTextPreview(mixed, nodes[1], 'Edited').html, mixed.html.replace('Second', 'Edited'));
});
test('SVG and MathML self-closing content stays read-only without disabling static siblings', () => {
  for (const graphic of ['<svg><path d="M0 0"/><use href="#icon" /></svg>', '<svg/>', '<math><mi>x</mi><mspace width="1em" /></math>']) {
    const html = '<section><h1>Before</h1>' + graphic + '<p>After</p></section>';
    assert.deepEqual(sourceTargets({ ...pkg, html }).map(node => node.text), ['Before', 'After']);
  }
  assert.deepEqual(sourceTargets({ ...pkg, html: '<h1>Before</h1><div/><p>After</p>' }), []);
});
test('excessive nesting fails closed before scanning all descendant ancestry', () => {
  assert.deepEqual(sourceTargets({ ...pkg, html: '<div>'.repeat(257) + 'Deep' + '</div>'.repeat(257) }), []);
  assert.ok(sourceTargets({ ...pkg, html: '<div>'.repeat(32) + 'Bounded' + '</div>'.repeat(32) }).length);
});
test('unmapped literal edit follows the real HTTP preview and confirmation path', async () => {
  const http = createIsolatedFetch({ token: 'library-page-isolated-test-token-32chars' });
  const adapters = createLivePageAdapters({ documentsHttp: { base: 'http://127.0.0.1:18091', token: 'library-page-isolated-test-token-32chars', fetchImpl: http.fetchImpl } });
  const store = createFreeHtmlLibraryStore({ adapters });
  await store.previewImport({ html: pkg.html, path: 'plain.html', sessionId: 'sess-a' });
  await store.confirmImport();
  assert.ok(store.getSnapshot().current, store.getSnapshot().message);
  store.enterEdit();
  const node = sourceTargets(store.getSnapshot().current.package).find(node => node.tag === 'h1');
  store.selectLocatable(node); store.setReplacementText('新标题', '你好 🌟');
  await store.previewPatch('新标题');
  assert.ok(store.getSnapshot().preview, store.getSnapshot().message);
  await store.confirmPatch();
  assert.equal(store.getSnapshot().current.version, 2, store.getSnapshot().message);
  assert.match(store.getSnapshot().current.package.html, /新标题/); store.dispose();
});
