import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_GRAPH_BUDGETS, buildNodeGraph } from '../src/free-page/source-index/node-graph.mjs';
import { writeCheckReport } from './helpers/jsdom-loader.mjs';

function htmlWith(count) {
  return Array.from({ length: count }, (_, index) => `<div>n${index}</div>`).join('');
}

test('production node graph stays inside the 2k and 10k build budgets', () => {
  const samples = [];
  for (const count of [NODE_GRAPH_BUDGETS.nodes2k, NODE_GRAPH_BUDGETS.nodes10k]) {
    const html = htmlWith(count);
    const pkg = { html, css: '', js: '', node_map: [] };
    const graph = buildNodeGraph(pkg, { page_id: 'page_budget' });
    assert.equal(pkg.html, html);
    assert.equal(graph.budget.degraded, false, JSON.stringify(graph.budget));
    assert.equal(graph.budget.node_count >= count, true);
    samples.push({
      node_count: graph.budget.node_count,
      elapsed_ms: graph.budget.elapsed_ms,
      limit_ms: graph.budget.limit_ms,
      degraded: graph.budget.degraded,
    });
  }
  writeCheckReport('performance.json', {
    status: 'OK',
    indexer: 'free-page/source-index/node-graph.mjs',
    production: true,
    samples,
  });
});
