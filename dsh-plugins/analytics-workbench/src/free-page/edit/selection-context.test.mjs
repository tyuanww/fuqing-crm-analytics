import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSelectionContext, SELECTION_CONTEXT_SCHEMA } from './selection-context.mjs';
import { d48Package } from '../source-index/page-fixture.mjs';
import { sha256Hex } from '../hash.mjs';

test('host canonicalizes a static selection and emits bounded resource-link context', () => {
  const pkg = d48Package({ html: '<h1 data-shine-node="n_title" onclick="alert(1)">示例标题</h1>', css: '[data-shine-node="n_title"]{color:#111}' });
  const node = {
    node_id: 'n_title', kind: 'static_element', mapping: 'valid',
    mapping_token: undefined, version_hash: undefined,
  };
  const result = buildSelectionContext({
    pagePackage: pkg, pageId: 'page_fixture_unbound', sessionId: 'session_fixture', version: 1, node,
  });
  assert.equal(result.ok, true);
  assert.equal(result.context.schema_version, SELECTION_CONTEXT_SCHEMA);
  assert.equal(result.context.allowed_scope, 'exact_source_range');
  assert.equal(result.context.selectedText, '示例标题');
  assert.ok(result.context.allowed_ranges.some(range => range.file === 'html'));
  assert.ok(result.context.allowed_ranges.some(range => range.file === 'css'));
  assert.doesNotMatch(result.context.htmlSelection, /onclick/i);
  assert.match(result.context.uri, /page_fixture_unbound/);
});

test('host marks runtime regions and bound selections instead of widening scope', () => {
  const pkg = d48Package();
  const dynamic = buildSelectionContext({
    pagePackage: pkg, pageId: 'page_fixture_unbound', sessionId: 'session_fixture', version: 1,
    node: { node_id: 'r_chart', kind: 'dynamic_region', mapping: 'valid' },
  });
  assert.equal(dynamic.ok, true);
  assert.equal(dynamic.context.allowed_scope, 'dynamic_source_range');
  assert.ok(dynamic.context.allowed_ranges.some(range => range.file === 'js'));
  const bound = buildSelectionContext({
    pagePackage: pkg, pageId: 'page_fixture_bound', sessionId: 'session_fixture', version: 1,
    node: { node_id: 'n_title', kind: 'static_element', mapping: 'valid' },
    bindingManifest: { bindings: [{ node_id: 'n_title', state: 'BOUND_VERIFIED' }] },
  });
  assert.equal(bound.ok, true);
  assert.equal(bound.context.allowed_scope, 'readonly_bound');
  const pageBound = buildSelectionContext({
    pagePackage: pkg, pageId: 'page_fixture_bound', sessionId: 'session_fixture', version: 1,
    node: { node_id: 'n_title', kind: 'static_element', mapping: 'valid' },
    bindingManifest: { bindings: [], result_refs: ['result_fixture_1'] },
  });
  assert.equal(pageBound.ok, true);
  assert.equal(pageBound.context.binding_state, 'BOUND_VERIFIED');
  assert.equal(pageBound.context.allowed_scope, 'readonly_bound');
});

test('host marks shared CSS selectors and excludes them from writable ranges', () => {
  const pkg = d48Package({ css: 'h1{color:red}' });
  const result = buildSelectionContext({
    pagePackage: pkg, pageId: 'page_shared', sessionId: 'session_fixture', version: 1,
    node: { node_id: 'n_title', kind: 'static_element', mapping: 'valid' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.context.allowed_scope, 'shared_scope');
  assert.deepEqual(result.context.allowed_ranges.map(range => range.file), ['html']);
  assert.equal(result.context.related_css[0].shared_scope, true);
});

test('stale and forged selection context refuses canonicalization', () => {
  const result = buildSelectionContext({
    pagePackage: d48Package(), pageId: 'page_fixture_unbound', sessionId: 'session_fixture', version: 1,
    node: { node_id: 'n_title', kind: 'static_element', mapping: 'forged' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MAPPING_STALE');
});

test('large selection context is reduced below the host transport limit', () => {
  const html = '<div data-shine-node="n_title">' + '标题 '.repeat(5000) + '</div>';
  const css = Array.from({ length: 20 }, (_, index) => '[data-shine-node="n_title"]{--x-' + index + ':' + 'y'.repeat(2000) + '}').join('\n');
  const result = buildSelectionContext({
    pagePackage: d48Package({ html, css }), pageId: 'page_fixture_unbound', sessionId: 'session_fixture', version: 1,
    node: { node_id: 'n_title', kind: 'static_element', mapping: 'valid' },
  });
  assert.equal(result.ok, true);
  assert.ok(new TextEncoder().encode(JSON.stringify(result.context)).length <= 32000);
});

test('selection ranges and mapping tokens use Unicode code-point offsets', () => {
  const html = '<div data-shine-node="n_title">😀<p>标题</p></div>';
  const pkg = d48Package({ html, node_map: [{ node_id: 'n_title', kind: 'static_element', selector: '[data-shine-node="n_title"]' }] });
  const result = buildSelectionContext({
    pagePackage: pkg, pageId: 'page_unicode', sessionId: 'session_fixture', version: 1,
    node: { node_id: 'n_title', kind: 'static_element', mapping: 'valid' },
  });
  assert.equal(result.ok, true);
  const range = result.context.allowed_ranges.find(item => item.file === 'html');
  assert.deepEqual(range, { file: 'html', start: 0, end: [...html].length });
  const expected = [...html.slice(0, html.indexOf('😀'))].length;
  assert.equal(expected, 31);
  assert.equal(result.context.mapping_token,
    sha256Hex(`${result.context.version_hash}:n_title:0:${[...html].length}`).slice(0, 32));
});
