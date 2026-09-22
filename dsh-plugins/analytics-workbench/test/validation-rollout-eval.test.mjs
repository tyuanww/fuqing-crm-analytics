import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormalEditOperation } from '../src/free-page/edit/formal-operation.mjs';
import { createStructuredPatchSession, selectionBinding } from '../src/free-page/patch/engine.mjs';
import { buildNodeGraph } from '../src/free-page/source-index/node-graph.mjs';
import { HISTORICAL_STANDALONE_HTML } from './helpers/historical-standalone-fixture.mjs';
import { EVAL_MATRIX, credentialStatus } from './helpers/model-eval-matrix.mjs';
import { writeCheckReport } from './helpers/jsdom-loader.mjs';

const PAGE_ID = 'page_historical';

function markedPackage() {
  return {
    html: HISTORICAL_STANDALONE_HTML
      .replace('<p id="lead">', '<p id="lead" data-shine-node="n_lead">')
      .replace('<td id="region">', '<td id="region" data-shine-node="n_region">')
      .replace('<p id="bound" data-binding="metric.gsv">', '<p id="bound" data-shine-node="n_bound" data-binding="metric.gsv">'),
    css: '',
    js: 'document.querySelector(\'[data-shine-node="n_lead"]\');',
    resources: [],
    node_map: [
      { node_id: 'n_lead', kind: 'static_element', selector: '[data-shine-node="n_lead"]' },
      { node_id: 'n_region', kind: 'static_element', selector: '[data-shine-node="n_region"]' },
      { node_id: 'n_bound', kind: 'static_element', selector: '[data-shine-node="n_bound"]' },
    ],
  };
}

function project(pagePackage, nodeId) {
  const graph = buildNodeGraph(pagePackage, { page_id: PAGE_ID });
  const projected = graph.toEditNodeRef(graph.node_list.find(node => node.ref?.anchor_id === nodeId && node.authoritative));
  if (!projected.ok) throw new Error(projected.code);
  return projected.value;
}

function runCase(pagePackage, row) {
  const targetId = row.target === 'outside' ? 'n_region' : row.target === 'bound' ? 'n_bound' : 'n_lead';
  const channel = row.channel === 'logic' ? 'logic' : row.op === 'insert' ? 'source' : 'presentation';
  const node = project(pagePackage, targetId);
  let action = 'update';
  let payload = { text: row.value };
  if (row.op === 'set_style') payload = { style: { color: '#09050D' } };
  if (row.op === 'set_html') payload = { text: row.value };
  if (row.channel === 'logic') payload = `${pagePackage.js}\n/*${row.value}*/`;
  if (row.op === 'insert') {
    action = 'insert';
    payload = row.value;
  }
  const operation = buildFormalEditOperation({
    pageId: PAGE_ID,
    node: channel === 'logic' ? logicNode(pagePackage, node) : node,
    channel,
    action,
    payload,
    idempotencyKey: `eval_${row.id}`,
    baseVersion: 1,
    operationId: `op_${row.id}`,
    capabilities: [`edit:${channel}`],
  });
  if (action === 'insert') {
    const outer = pagePackage.html.slice(node.source_range.start, node.source_range.end);
    const inner = node.source_range.start + outer.indexOf('>') + 1;
    operation.splice = { start: inner, end: inner };
    operation.byte_length = new TextEncoder().encode(payload).byteLength;
  }
  const binding = row.target === 'bound'
    ? { bindings: [{ node_id: 'n_bound', binding_id: 'bind_bound', result_ref: 'result_1' }], result_refs: ['result_1'] }
    : { bindings: [], result_refs: [] };
  const result = createStructuredPatchSession().execute({
    pagePackage,
    operation,
    capabilities: row.channel === 'logic'
      ? ['edit:presentation']
      : row.target === 'bound'
        ? ['edit:presentation', 'edit:source']
        : ['edit:presentation', 'edit:source', 'node:bound'],
    headVersion: 1,
    selectedNodeId: row.target === 'outside' ? 'n_lead' : targetId,
    binding,
  });
  if (result.ok) return 'ACCEPTED';
  if (result.error.code === 'SCOPE_VIOLATION') return 'OUT_OF_SELECTION';
  if (result.error.code === 'DANGEROUS_CONTENT') return 'ILLEGAL_HTML';
  if (result.error.code === 'BOUND_NODE') return 'BOUND_NODE';
  if (result.error.code === 'CAPABILITY_DENIED' || result.error.code === 'LOGIC_REGION_UNAVAILABLE') return 'LOGIC_OVERREACH';
  return result.error.code;
}

function logicNode(pagePackage, htmlNode) {
  const binding = selectionBinding(pagePackage, { node_id: 'n_lead', kind: 'static_element' });
  return {
    ...htmlNode,
    source_range: { start: binding.js_range.start, end: binding.js_range.end },
    region_hash: binding.logic_region_hash,
    source_hash: binding.logic_source_hash,
  };
}

test('the fixed seven-case rubric runs on the production patch engine without a live model', () => {
  const pagePackage = markedPackage();
  assert.equal(HISTORICAL_STANDALONE_HTML.includes('data-shine-node'), false);
  const results = EVAL_MATRIX.cases.map(row => {
    const actual = runCase(pagePackage, row);
    return { id: row.id, expected: row.expected, actual, matched: actual === row.expected };
  });
  const credentials = credentialStatus();
  const matched = results.filter(row => row.matched).length / results.length;
  const report = {
    harness: 'local-synthetic-fixture',
    cockpit_e2e: false,
    patch_engine: 'free-page/patch/engine.mjs',
    matrix: {
      model: EVAL_MATRIX.model,
      threshold: EVAL_MATRIX.threshold,
      baseline: EVAL_MATRIX.baseline,
      case_count: EVAL_MATRIX.cases.length,
    },
    canned_gate: matched === 1 ? 'MATCHED' : 'MISMATCH',
    matched_ratio: matched,
    cases: results,
    live_model: 'NOT_RUN',
    credential: {
      status: credentials.status,
      live: credentials.live,
      reason: credentials.reason || null,
    },
  };
  writeCheckReport('model-eval.json', report);
  assert.equal(report.canned_gate, 'MATCHED', JSON.stringify(results, null, 2));
  assert.notEqual(report.live_model, 'PASS');
  assert.notEqual(report.credential.status, 'PASS');
  assert.equal(report.credential.live, 'NOT_RUN');
});
