import test from 'node:test';
import assert from 'node:assert/strict';
import { openSidecarGraph, readSidecarFlag } from './sidecar-flag.mjs';

test('the sidecar flag gates the production node graph and defaults off', () => {
  const html = '<p>历史</p>';
  const pagePackage = { html, css: '', js: '', node_map: [] };
  assert.equal(readSidecarFlag({}), 'off');
  assert.equal(openSidecarGraph(pagePackage).code, 'FLAG_DISABLED');
  assert.equal(pagePackage.html, html);
  const opened = openSidecarGraph(pagePackage, { flag: 'on', page_id: 'page_flag' });
  assert.equal(opened.ok, true);
  assert.equal(opened.mode, 'on');
  assert.equal(opened.metrics.source_bytes_unchanged, true);
  assert.equal(opened.metrics.node_count > 0, true);
  assert.equal(opened.graph.source_bytes_unchanged, true);
  globalThis.FQ_FREE_PAGE_SIDECAR_INDEX = 'smoke';
  try {
    assert.equal(readSidecarFlag({}), 'smoke');
  } finally {
    delete globalThis.FQ_FREE_PAGE_SIDECAR_INDEX;
  }
  assert.equal(readSidecarFlag({}), 'off');
});
