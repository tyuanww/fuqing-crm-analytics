import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERACTIVE_CHART_PACKAGE } from '../src/free-page/runtime/fixtures.mjs';
import { selectionSrcdoc, selectableNodes } from '../src/client/html-selection-bridge.mjs';
import { buildSelectionContext } from '../src/free-page/edit/selection-context.mjs';
import { routeEditIntent } from '../src/free-page/edit/intent-router.mjs';

test('dynamic chart fixture keeps browser runtime and exposes a bounded source route', () => {
  const chartPackage = { ...INTERACTIVE_CHART_PACKAGE,
    js: `${INTERACTIVE_CHART_PACKAGE.js}\nconst region = document.querySelector('[data-shine-region="r_plot"]');` };
  const nodes = selectableNodes(chartPackage, { bindings: [], result_refs: [] });
  const chart = nodes.find(node => node.node_id === 'r_plot');
  assert.ok(chart);
  const srcdoc = selectionSrcdoc(chartPackage, {
    channel: 'fixture-channel', pageId: 'page-chart', version: 1, nodes, editing: true,
  });
  assert.match(srcdoc, /data-shine-region="r_plot"/);
  assert.match(srcdoc, /ctx\.fillStyle/);
  assert.match(srcdoc, /cockpit\.selection/);

  const context = buildSelectionContext({
    pagePackage: chartPackage, pageId: 'page-chart', sessionId: 'session-chart',
    version: 1, node: chart, bindingManifest: { bindings: [], result_refs: [] },
  });
  assert.equal(context.ok, true);
  assert.equal(context.context.allowed_scope, 'dynamic_source_range');
  assert.ok(context.context.allowed_ranges.some(range => range.file === 'js'));
  assert.equal(routeEditIntent({ instruction: '把图表改成紫色', ...context.context }).intent, 'source_range');
});
