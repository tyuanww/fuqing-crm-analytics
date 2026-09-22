import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKER_IS_CREDENTIAL,
  NODE_GRAPH_BUDGETS,
  buildNodeGraph,
  hydrateNodeGraph,
  toEditNodeRef,
} from './node-graph.mjs';

const CONTRACT_KEYS = ['kind', 'mapping_token', 'node_id', 'page_id', 'region_hash', 'selector', 'source_hash', 'source_range'];
const SHA256 = /^[0-9a-f]{64}$/;

function page(html, nodeMap = []) {
  return { html, css: '', js: '', node_map: nodeMap };
}

test('historical HTML keeps its original bytes while inferred nodes stay distinct', () => {
  const html = '<main><section><h1>标题</h1><p>甲</p><p>甲</p></section></main>';
  const pkg = page(html);
  const graph = buildNodeGraph(pkg, { page_id: 'page_hist' });
  assert.equal(pkg.html, html);
  assert.equal(graph.source_bytes_unchanged, true);
  assert.equal(html.includes('data-shine-node'), false);
  assert.equal(MARKER_IS_CREDENTIAL, false);
  const paragraphs = graph.node_list.filter(node => node.tag === 'p');
  assert.equal(paragraphs.length, 2);
  assert.notEqual(paragraphs[0].identity, paragraphs[1].identity);
  assert.equal(paragraphs[0].region_hash, paragraphs[1].region_hash);
  assert.equal(paragraphs[0].identity.includes('甲'), false);
  assert.equal(paragraphs[0].selector, null);
  const projected = graph.toEditNodeRef(paragraphs[0], { channel: 'source' });
  assert.equal(projected.ok, true);
  assert.equal(projected.projection, 'synthetic');
  assert.equal(projected.reselect, false);
  assert.equal('channel' in projected.value, false);
  assert.equal(projected.channel_policy.source, true);
  assert.equal(projected.channel_policy.logic, false);
  assert.equal(projected.channel_policy.reason, 'inferred_html_source_only');
  assert.deepEqual(Object.keys(projected.value).sort(), CONTRACT_KEYS);
  assert.equal(projected.value.page_id, 'page_hist');
  assert.match(projected.value.source_hash, SHA256);
  assert.match(projected.value.region_hash, SHA256);
  assert.equal(projected.value.region_hash, paragraphs[0].region_hash);
  assert.deepEqual(projected.value.source_range, { start: paragraphs[0].source_range.start, end: paragraphs[0].source_range.end });
  assert.equal(projected.value.kind, 'static_element');
  assert.equal(graph.toEditNodeRef(paragraphs[0], { channel: 'logic' }).code, 'CHANNEL_DENIED');
});

test('duplicate anchors stay separate and are not an edit credential', () => {
  const html = '<h1 data-shine-node="n_title">A</h1><h2 data-shine-node="n_title">B</h2>';
  const pkg = page(html, [{ node_id: 'n_title', kind: 'static_element', selector: 'h1, h2' }]);
  const graph = buildNodeGraph(pkg, { page_id: 'page_dup' });
  const first = graph.sourceRef('n_title', { occurrence: 0 });
  const second = graph.sourceRef('n_title', { occurrence: 1 });
  assert.ok(first && second);
  assert.notEqual(first.identity, second.identity);
  assert.equal(graph.diagnostics.duplicate_anchors.includes('n_title'), true);
  assert.equal(graph.get(first).duplicate, true);
  assert.equal(graph.get(second).duplicate, true);
  assert.notEqual(graph.get(first).region_hash, graph.get(second).region_hash);
  const duplicate = graph.toEditNodeRef(first);
  assert.equal(duplicate.code, 'DUPLICATE_ANCHOR');
  assert.equal(duplicate.reselect, true);
  assert.equal(duplicate.value, undefined);
  assert.equal(pkg.html, html);
  const selectorChanged = buildNodeGraph({
    ...pkg,
    node_map: [{ node_id: 'n_title', kind: 'static_element', selector: '.other' }],
  }, { page_id: 'page_dup' });
  assert.equal(selectorChanged.sourceRef('n_title', { occurrence: 0 }).identity, first.identity);
});

test('missing source range, untrusted marker and deletion do not rewrite HTML', () => {
  const html = '<p data-shine-node="n_forged">伪造</p><p>保留</p>';
  const pkg = page(html, [{ node_id: 'n_missing', kind: 'static_element', selector: '#gone' }]);
  const graph = buildNodeGraph(pkg, { page_id: 'page_miss' });
  const missing = graph.node_list.find(node => node.diagnostic === 'MISSING_SOURCE_RANGE');
  const forged = graph.node_list.find(node => node.ref.anchor_id === 'n_forged');
  assert.equal(missing.source_range, null);
  assert.equal(missing.marker_is_credential, false);
  assert.equal(graph.toEditNodeRef(missing).code, 'MISSING_SOURCE_RANGE');
  assert.equal(forged.status, 'untrusted');
  assert.equal(forged.authoritative, false);
  assert.equal(graph.toEditNodeRef(forged).code, 'UNTRUSTED_MARKER');
  const kept = graph.node_list.find(node => node.tag === 'p' && node.status === 'inferred');
  graph.markDeleted(kept);
  assert.equal(graph.get(kept).status, 'deleted');
  assert.equal(graph.toEditNodeRef(kept).code, 'DELETED');
  assert.equal(pkg.html, html);
  const sidecar = graph.toSidecar();
  const hydrated = hydrateNodeGraph(pkg, sidecar, { page_id: 'page_miss' });
  assert.equal(hydrated.get(kept).status, 'deleted');
  assert.equal(pkg.html, html);
});

test('template, dynamic and temporary nodes round-trip without entering the HTML', () => {
  const html = '<section data-shine-region="r_card">卡片</section>';
  const pkg = page(html, [{ node_id: 'r_card', kind: 'dynamic_region', selector: "[data-shine-region='r_card']" }]);
  const graph = buildNodeGraph(pkg, { page_id: 'page_tpl' });
  const template = graph.sourceRef('r_card', { attr: 'region' });
  const mapped = graph.toEditNodeRef(template, { channel: 'source' });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.projection, 'node_map');
  assert.equal(mapped.value.node_id, 'r_card');
  assert.equal(mapped.value.kind, 'dynamic_region');
  assert.deepEqual(Object.keys(mapped.value).sort(), CONTRACT_KEYS);
  const instance = graph.templateRef(template, 'row-1');
  const dynamic = graph.dynamicRef(template, 'row-1');
  const temporary = graph.temporaryRef('drag');
  assert.equal(graph.get(instance).kind, 'template_instance');
  assert.equal(graph.get(dynamic).kind, 'dynamic_instance');
  assert.equal(graph.get(temporary).kind, 'temporary');
  assert.notEqual(instance.identity, dynamic.identity);
  assert.equal(graph.templateRef(template, 'row-1').identity, instance.identity);
  assert.equal(graph.toEditNodeRef(instance, { channel: 'source' }).code, 'PRESENTATION_ONLY');
  assert.equal(graph.toEditNodeRef(instance, { channel: 'logic' }).code, 'PRESENTATION_ONLY');
  const overlay = graph.toEditNodeRef(instance, { channel: 'presentation' });
  assert.equal(overlay.ok, true);
  assert.equal('channel' in overlay.value, false);
  assert.equal(overlay.channel_policy.presentation, true);
  assert.equal(overlay.channel_policy.source, false);
  assert.equal(overlay.channel_policy.logic, false);
  assert.equal(overlay.channel_policy.reason, 'runtime_without_stable_source_range');
  assert.equal(overlay.value.kind, 'dynamic_region');
  assert.equal(overlay.value.source_range, null);
  assert.equal(overlay.value.kind === 'whole_page', false);
  graph.markDeleted(dynamic);
  assert.equal(pkg.html, html);
  const hydrated = hydrateNodeGraph(pkg, graph.toSidecar(), { page_id: 'page_tpl' });
  assert.equal(hydrated.get(instance).kind, 'template_instance');
  assert.equal(hydrated.get(dynamic).status, 'deleted');
  assert.equal(hydrated.get(temporary).kind, 'temporary');
  assert.equal(pkg.html, html);
  assert.equal(toEditNodeRef(hydrated.get(dynamic)).code, 'DELETED');
});

test('node identity ignores DOM text and stays stable when only the selector changes', () => {
  const html = '<p data-shine-node="n_title">同一句</p>';
  const map = [{ node_id: 'n_title', kind: 'static_element', selector: "[data-shine-node='n_title']" }];
  const first = buildNodeGraph(page(html, map), { page_id: 'page_stable' });
  const retitled = buildNodeGraph(page(html.replace('同一句', '另一句'), map), { page_id: 'page_stable' });
  const reselected = buildNodeGraph(page(html, [
    { node_id: 'n_title', kind: 'static_element', selector: 'p.title' },
  ]), { page_id: 'page_stable' });
  const ref = first.sourceRef('n_title');
  assert.equal(retitled.sourceRef('n_title').identity, ref.identity);
  assert.equal(reselected.sourceRef('n_title').identity, ref.identity);
  assert.notEqual(first.get(ref).region_hash, retitled.get(ref).region_hash);
  assert.notEqual(first.source_hash, retitled.source_hash);
  assert.equal(first.get(ref).selector.includes('data-shine-node'), true);
  assert.equal(ref.identity.includes('同一句'), false);
});

test('malformed HTML and script text degrade without phantom nodes', () => {
  const broken = '<div><p>未闭合';
  const brokenPage = page(broken);
  const brokenGraph = buildNodeGraph(brokenPage);
  assert.equal(brokenPage.html, broken);
  assert.equal(brokenGraph.node_list.some(node => node.tag === 'p'), false);

  const html = '<div>可见</div><script>var s = "<span>脚本</span>";</script><p>后</p>';
  const pkg = page(html);
  const graph = buildNodeGraph(pkg);
  assert.equal(pkg.html, html);
  assert.equal(graph.node_list.some(node => node.tag === 'span'), false);
  assert.equal(graph.node_list.some(node => node.tag === 'p'), true);
  assert.equal(graph.node_list.some(node => node.tag === 'script'), false);
});

test('2k and 10k historical pages stay inside the build budget', () => {
  for (const count of [NODE_GRAPH_BUDGETS.nodes2k, NODE_GRAPH_BUDGETS.nodes10k]) {
    const html = repeatDivs(count);
    const pkg = page(html);
    const graph = buildNodeGraph(pkg, { page_id: 'page_budget' });
    assert.equal(pkg.html, html);
    assert.equal(graph.budget.node_count, count);
    assert.equal(graph.budget.degraded, false, JSON.stringify(graph.budget));
    assert.ok(graph.budget.elapsed_ms <= graph.budget.limit_ms, JSON.stringify(graph.budget));
  }
});

test('over-budget graphs degrade without rewriting HTML', () => {
  const html = '<p>小</p>';
  const pkg = page(html);
  let tick = 0;
  const slow = buildNodeGraph(pkg, {
    now: () => {
      tick += 1;
      return tick === 1 ? 0 : 10_000;
    },
    budgets: { build2kMs: 10, build10kMs: 10 },
  });
  assert.equal(slow.budget.degraded, true);
  assert.equal(slow.budget.reasons.includes('BUILD_BUDGET'), true);
  assert.equal(pkg.html, html);
  assert.equal(slow.get(slow.node_list[0]).status, 'inferred');

  const crowded = buildNodeGraph(page(repeatDivs(NODE_GRAPH_BUDGETS.maxNodes + 1)), {
    budgets: { maxNodes: 64, build2kMs: 60_000, build10kMs: 60_000 },
  });
  assert.equal(crowded.budget.degraded, true);
  assert.equal(crowded.budget.reasons.includes('NODE_LIMIT'), true);
  assert.equal(crowded.budget.node_count, 64);
});

function repeatDivs(count) {
  const parts = new Array(count);
  for (let i = 0; i < count; i += 1) parts[i] = `<div id="n${i}">x</div>`;
  return parts.join('');
}
