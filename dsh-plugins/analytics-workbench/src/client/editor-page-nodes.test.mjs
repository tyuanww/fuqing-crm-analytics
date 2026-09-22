import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editorPageCatalog } from './editor-page-nodes.mjs';
import { previewDirectText, previewNodeEdit } from './presentation-preview.mjs';
import { selectionBinding } from '../free-page/patch/engine.mjs';
import { HISTORICAL_STANDALONE_HTML } from '../../test/helpers/historical-standalone-fixture.mjs';

const PAGE_ID = 'page_historical';

function historicalPackage() {
  return { html: HISTORICAL_STANDALONE_HTML, css: '', js: '', resources: [], node_map: [] };
}

test('the cockpit catalog follows the sidecar flag and does not splice on preview failure', () => {
  const editor = readFileSync(new URL('./cockpit-page-editor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /editorPageCatalog\(/);
  assert.match(editor, /previewDirectText\(/);
  assert.match(editor, /previewNodeEdit\(/);
  assert.equal(editor.includes('previewPatch(value)'), true);
  const pagePackage = historicalPackage();
  const closed = editorPageCatalog(pagePackage, null, { pageId: PAGE_ID, flag: 'off' });
  assert.equal(closed.source, 'source-index');
  assert.equal(closed.code, 'FLAG_DISABLED');
  assert.equal(closed.pageNodes.length, 0);
  const opened = editorPageCatalog(pagePackage, null, { pageId: PAGE_ID, flag: 'on' });
  assert.equal(opened.source, 'node-graph');
  const lead = opened.textNodes.find(node => node.tag === 'p' && node.text.includes('到店'));
  assert.ok(lead);
  assert.equal(lead.mapping, 'valid');
  assert.equal(typeof lead.source_range?.start, 'number');
  const runtime = opened.pageNodes.find(node => node.tag === 'iframe' || node.tag === 'canvas');
  assert.equal(runtime?.capabilities?.direct_text, false);
  const missed = selectionBinding(pagePackage, { node_id: lead.node_id, kind: 'static_element', page_id: PAGE_ID }, { flag: 'off' });
  assert.equal(missed.ok, false);
  const located = selectionBinding(pagePackage, { node_id: lead.node_id, kind: lead.kind, page_id: PAGE_ID }, { flag: 'on' });
  assert.equal(located.ok, true, located.error?.code);
  assert.equal(located.catalog, 'node-graph');
  const preview = previewDirectText({
    pagePackage, pageId: PAGE_ID, version: 1, nodeId: lead.node_id, text: '到店人数上升。', flag: 'on',
  });
  assert.equal(preview.ok, true, preview.code);
  assert.equal(preview.html, HISTORICAL_STANDALONE_HTML);
  assert.equal(pagePackage.html, HISTORICAL_STANDALONE_HTML);
});

test('flag off still previews a mapped text node as an overlay', () => {
  const html = '<h1 data-shine-node="n_title">示例</h1>';
  const pagePackage = {
    html,
    css: '',
    js: '',
    resources: [],
    node_map: [{ node_id: 'n_title', kind: 'static_element', selector: '[data-shine-node="n_title"]' }],
  };
  const preview = previewDirectText({
    pagePackage, pageId: 'page_shine', version: 1, nodeId: 'n_title', text: '新标题', flag: 'off',
  });
  assert.equal(preview.ok, true, preview.code);
  assert.equal(preview.overlay.text, '新标题');
  assert.equal(preview.html, html);
  assert.equal(pagePackage.html, html);
});

test('style stays an overlay and structure replace changes only the preview package', () => {
  const html = '<p id="lead">本周到店人数保持稳定。</p>';
  const pagePackage = { html, css: '', js: '', resources: [], node_map: [] };
  const catalog = editorPageCatalog(pagePackage, null, { pageId: 'page_qa', flag: 'on' });
  const lead = catalog.pageNodes.find(node => node.tag === 'p');
  assert.equal(lead.capabilities.style, true);
  assert.equal(lead.capabilities.structure, true);
  const style = previewNodeEdit({
    pagePackage, pageId: 'page_qa', version: 1, nodeId: lead.node_id, flag: 'on',
    channel: 'presentation', action: 'update', payload: { style: { color: '#805D9D' } }, keyPrefix: 'style',
  });
  assert.equal(style.ok, true, style.code);
  assert.equal(style.overlay.style.color, '#805D9D');
  assert.equal(style.source_bytes_unchanged, true);
  assert.equal(pagePackage.html, html);
  const replaced = previewNodeEdit({
    pagePackage, pageId: 'page_qa', version: 1, nodeId: lead.node_id, flag: 'on',
    channel: 'source', action: 'replace', payload: html.replace('稳定', '上升'), keyPrefix: 'structure',
  });
  assert.equal(replaced.ok, true, replaced.code);
  assert.match(replaced.package.html, /上升/);
  assert.equal(pagePackage.html, html);
  const runtime = catalog.pageNodes.find(node => node.tag === 'script' || node.mapping === 'runtime');
  if (runtime) assert.equal(runtime.capabilities.structure, false);
});
