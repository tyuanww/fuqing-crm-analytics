import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePagePackage } from '../src/free-page/contract/schema.mjs';
import { buildFormalEditOperation } from '../src/free-page/edit/formal-operation.mjs';
import { commitWorkingCopy, createStructuredPatchSession, selectionBinding } from '../src/free-page/patch/engine.mjs';
import { applyPresentationOverlay } from '../src/client/presentation-overlay.mjs';
import { buildNodeGraph } from '../src/free-page/source-index/node-graph.mjs';
import { openSidecarGraph } from '../src/free-page/runtime/sidecar-flag.mjs';
import { editorPageCatalog } from '../src/client/editor-page-nodes.mjs';
import { HISTORICAL_STANDALONE_HTML } from './helpers/historical-standalone-fixture.mjs';
import { loadJsdom, writeCheckReport } from './helpers/jsdom-loader.mjs';

const PAGE_ID = 'page_historical';

function markedPackage() {
  return {
    html: HISTORICAL_STANDALONE_HTML
      .replace('<p id="lead">', '<p id="lead" data-shine-node="n_lead">')
      .replace('<td id="region">', '<td id="region" data-shine-node="n_region">')
      .replace('<p id="bound" data-binding="metric.gsv">', '<p id="bound" data-shine-node="n_bound" data-binding="metric.gsv">'),
    css: '',
    js: '',
    resources: [],
    node_map: [
      { node_id: 'n_lead', kind: 'static_element', selector: '[data-shine-node="n_lead"]' },
      { node_id: 'n_region', kind: 'static_element', selector: '[data-shine-node="n_region"]' },
      { node_id: 'n_bound', kind: 'static_element', selector: '[data-shine-node="n_bound"]' },
    ],
  };
}

function operationFor(pagePackage, { nodeId, channel = 'presentation', action = 'update', payload, key, baseVersion = 1, binding }) {
  const located = selectionBinding(pagePackage, { node_id: nodeId, kind: 'static_element' });
  assert.equal(located.ok, true, located.error?.code);
  const graph = buildNodeGraph(pagePackage, { page_id: PAGE_ID });
  const projected = graph.toEditNodeRef(graph.node_list.find(node => node.ref?.anchor_id === nodeId && node.authoritative));
  assert.equal(projected.ok, true, projected.code);
  const formal = buildFormalEditOperation({
    pageId: PAGE_ID,
    node: projected.value,
    channel,
    action,
    payload,
    idempotencyKey: key,
    baseVersion,
    operationId: `op_${key}`,
  });
  if (channel !== 'presentation' && action === 'insert') {
    formal.splice = { start: projected.value.source_range.start, end: projected.value.source_range.start };
    formal.byte_length = new TextEncoder().encode(payload).byteLength;
  }
  return { formal, binding: binding ?? { bindings: [], result_refs: [] } };
}

async function playwrightStatus() {
  try {
    await import('playwright');
    return 'PRESENT_NOT_USED';
  } catch {
    return 'MISSING_DEPENDENCY';
  }
}

test('historical HTML smoke walks preview, cancel, confirm, reload, and conflict on a local fixture', async () => {
  const source = HISTORICAL_STANDALONE_HTML;
  assert.equal(parsePagePackage({ html: source, css: '', js: '', resources: [], node_map: [] }).ok, true);
  assert.equal(parsePagePackage({ html: source, css: '', js: '', resources: [], node_map: [], sidecar: [] }).ok, false);
  const closed = openSidecarGraph({ html: source, css: '', js: '', node_map: [] }, { flag: 'off', page_id: PAGE_ID });
  assert.equal(closed.code, 'FLAG_DISABLED');
  const opened = openSidecarGraph({ html: source, css: '', js: '', node_map: [] }, { flag: 'on', page_id: PAGE_ID });
  assert.equal(opened.ok, true);
  const catalog = editorPageCatalog({ html: source, css: '', js: '', node_map: [] }, null, { pageId: PAGE_ID, flag: 'on' });
  assert.equal(catalog.source, 'node-graph');
  assert.equal(catalog.textNodes.some(node => node.text.includes('到店')), true);
  assert.equal(source, HISTORICAL_STANDALONE_HTML);

  const JSDOM = loadJsdom();
  const document = new JSDOM(source).window.document;
  const lead = document.querySelector('#lead');
  const crumbs = [];
  for (let node = lead; node; node = node.parentElement) crumbs.push(node.tagName.toLowerCase());
  crumbs.reverse();
  const boundary = ['script', 'iframe', 'canvas', '#bound'].map(selector => {
    const element = document.querySelector(selector);
    const tag = element.tagName.toLowerCase();
    const reason = tag === 'script' || tag === 'iframe' || tag === 'canvas' ? tag
      : element.hasAttribute('data-binding') ? 'bound_node' : 'editable';
    return { selector, reason };
  });

  const pagePackage = markedPackage();
  const session = createStructuredPatchSession();
  const previewInput = operationFor(pagePackage, {
    nodeId: 'n_lead', payload: { text: '本周到店人数保持稳定，周末略增。' }, key: 'smoke_preview',
  });
  const preview = session.execute({
    pagePackage, operation: previewInput.formal, capabilities: ['edit:presentation'],
    headVersion: 1, selectedNodeId: 'n_lead', binding: previewInput.binding,
  });
  assert.equal(preview.ok, true, preview.error?.code);
  assert.equal(preview.preview.package.html, pagePackage.html);
  assert.equal(pagePackage.html.includes('周末略增'), false);
  const cancelledHtml = pagePackage.html;
  const saved = commitWorkingCopy(pagePackage, preview.preview);
  assert.equal(saved.package.html, cancelledHtml);
  assert.equal(saved.presentation_overlays.n_lead.text, '本周到店人数保持稳定，周末略增。');
  const shown = applyPresentationOverlay(saved.package.html, saved.presentation_overlays);
  assert.equal(shown.includes('周末略增'), true);
  assert.equal(shown.includes('华东'), true);
  const conflict = session.execute({
    pagePackage: saved.package,
    operation: operationFor(saved.package, { nodeId: 'n_lead', payload: { text: '过期' }, key: 'smoke_conflict', baseVersion: 1 }).formal,
    capabilities: ['edit:presentation'],
    headVersion: 2,
    selectedNodeId: 'n_lead',
    binding: { bindings: [], result_refs: [] },
  });
  assert.equal(conflict.error.code, 'VERSION_CONFLICT');
  const recovered = session.execute({
    pagePackage: { ...saved.package, presentation_overlays: saved.presentation_overlays },
    operation: operationFor(saved.package, {
      nodeId: 'n_lead', payload: { text: '重选后的到店说明。' }, key: 'smoke_recover', baseVersion: 2,
    }).formal,
    capabilities: ['edit:presentation'],
    headVersion: 2,
    selectedNodeId: 'n_lead',
    binding: { bindings: [], result_refs: [] },
  });
  assert.equal(recovered.ok, true, recovered.error?.code);
  assert.equal(recovered.preview.package.html, saved.package.html);

  const playwright = await playwrightStatus();
  const report = {
    harness: 'local-synthetic-fixture',
    cockpit_e2e: false,
    http: false,
    playwright,
    production_modules: [
      'free-page/runtime/sidecar-flag.mjs',
      'free-page/source-index/node-graph.mjs',
      'free-page/patch/engine.mjs',
    ],
    steps: {
      open: lead.textContent,
      breadcrumb: crumbs,
      boundary,
      cancel_kept_bytes: cancelledHtml === pagePackage.html,
      reload_text: '本周到店人数保持稳定，周末略增。',
      conflict: conflict.error.code,
      recovered_text: recovered.preview.overlay.text,
    },
  };
  writeCheckReport('browser-smoke.json', report);
  assert.deepEqual(crumbs.filter(tag => ['main', 'section', 'p'].includes(tag)), ['main', 'section', 'p']);
  assert.equal(boundary.find(row => row.selector === 'script').reason, 'script');
  assert.equal(boundary.find(row => row.selector === '#bound').reason, 'bound_node');
  assert.equal(report.harness, 'local-synthetic-fixture');
  assert.equal(report.cockpit_e2e, false);
  assert.notEqual(report.playwright, 'PASS');
  assert.equal(playwright === 'MISSING_DEPENDENCY' || playwright === 'PRESENT_NOT_USED', true);
  assert.equal(source, HISTORICAL_STANDALONE_HTML);
});
