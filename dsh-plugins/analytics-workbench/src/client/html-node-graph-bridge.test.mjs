import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createEditOperation } from './html-edit-operations.mjs';
import { acceptOperationMessage, acceptSelection, editablePageNodes, editableTextNodes, selectionRuntime, selectionSrcdoc } from './html-node-graph-bridge.mjs';
import { previewLiteralText } from './free-html-library/html-edit-kernel.mjs';
import { visualEditorCss } from './html-visual-editor-chrome.mjs';

const pkg = { html: '<h1 data-shine-node="a">相同</h1><h2 data-shine-node="b">相同</h2><p data-shine-node="bound">42</p><div data-shine-node="nested">文本<strong>子节点</strong></div>',
  css: '', js: '', resources: [], node_map: ['a','b','bound','nested'].map(node_id => ({ node_id, kind: 'static_element', selector: `[data-shine-node="${node_id}"]` })) };
test('only mapped static leaf text is selectable; bound values and nested markup stay read-only', () => {
  const nodes = editableTextNodes(pkg, { bindings: [{ node_id: 'bound' }] });
  assert.deepEqual(nodes.map(row => row.node_id), ['a','b']);
  assert.equal(previewLiteralText({ pkg, selection: { kind: 'static_element', node_id: 'nested' }, replacementText: 'x' }).error.code, 'TEXT_REPLACE_UNSUPPORTED');
  const dynamic = { ...pkg, js: 'document.querySelector(\'[data-shine-node="a"]\').textContent = "dynamic";' };
  assert.equal(editableTextNodes(dynamic).some(row => row.node_id === 'a'), false);
});
test('opaque-origin bridge rejects wrong window, token, page, version, unknown nodes and write-shaped messages', () => {
  const source = {}, nodes = editableTextNodes(pkg);
  const context = { source, channel: 'nonce', pageId: 'page_a', version: 2, nodes };
  const data = { type: 'cockpit.selection', channel: 'nonce', pageId: 'page_a', version: 2, nodeId: 'b' };
  const event = { source, origin: 'null', data };
  assert.equal(acceptSelection(event, context).node_id, 'b');
  for (const patch of [{ source: {} }, { origin: 'https://example.invalid' },
    ...[{ channel: 'wrong' }, { pageId: 'other' }, { version: 1 }, { nodeId: 'unknown' }, { replacementText: 'write' }].map(patch => ({ data: { ...data, ...patch } }))]) {
    assert.equal(acceptSelection({ ...event, ...patch }, context), undefined);
  }
  assert.equal(acceptSelection({ ...event, data: { ...data, nodeId: null } }, context), null);
});
test('browse retains normal interactions; editing adds only the selection bridge under the unchanged CSP', () => {
  const config = { channel: 'nonce', pageId: 'page_a', version: 1, nodes: editableTextNodes(pkg) };
  const browse = selectionSrcdoc(pkg, config);
  const edit = selectionSrcdoc(pkg, { ...config, editing: true });
  assert.doesNotMatch(browse, /cockpit\.selection/);
  assert.match(edit, /cockpit\.selection/);
  assert.match(edit, /Content-Security-Policy/);
  assert.doesNotMatch(edit, /allow-same-origin/);
  assert.match(edit, /data-cockpit-target.*data-cockpit-selected/);
  assert.match(edit, /parent_block/);
  assert.match(edit, /#805D9D/);
  assert.doesNotMatch(edit, /#00e5ff|cyan/i);
});

const blockPkg = {
  html: [
    '<section data-shine-node="sec"><article data-shine-node="card">',
    '<h2 data-shine-node="title">嵌套标题</h2>',
    '<div data-shine-node="panel"><button data-shine-node="go">按钮</button></div>',
    '<table data-shine-node="grid"><tr data-shine-node="row"><td data-shine-node="cell">单元格</td></tr></table>',
    '</article></section>',
    '<iframe data-shine-node="frame" title="外链"></iframe>',
    '<canvas data-shine-node="paint"></canvas>',
    '<div data-shine-region="live">动态</div>',
  ].join(''),
  css: '', js: '', resources: [],
  node_map: [
    ['sec', 'static_element'], ['card', 'static_element'], ['title', 'static_element'], ['panel', 'static_element'],
    ['go', 'static_element'], ['grid', 'static_element'], ['row', 'static_element'], ['cell', 'static_element'],
    ['frame', 'static_element'], ['paint', 'static_element'], ['live', 'dynamic_region'],
  ].map(([node_id, kind]) => ({
    node_id, kind,
    selector: kind === 'dynamic_region' ? `[data-shine-region='${node_id}']` : `[data-shine-node='${node_id}']`,
  })),
};

test('block clicks expose the current node, parent block, breadcrumb, kind and capability', () => {
  const page = Object.fromEntries(editablePageNodes(blockPkg).map(row => [row.node_id, row]));
  assert.equal(page.title.tag, 'h2');
  assert.equal(page.title.kind, 'static_element');
  assert.equal(page.title.parent_block.node_id, 'card');
  assert.equal(page.title.parent_block.tag, 'article');
  assert.deepEqual(page.title.breadcrumb.map(row => row.tag), ['section', 'article', 'h2']);
  assert.equal(page.title.capabilities.direct_text, true);
  assert.equal(page.go.tag, 'button');
  assert.equal(page.go.parent_block.node_id, 'panel');
  assert.equal(page.cell.tag, 'td');
  assert.equal(page.cell.parent_block.node_id, 'row');
  assert.equal(page.card.parent_block.node_id, 'sec');
  assert.equal(page.sec.kind, 'static_element');
  assert.equal(page.frame.capabilities.cross_origin, true);
  assert.equal(page.frame.capabilities.direct_text, false);
  assert.equal(page.frame.boundary, 'cross_origin_iframe');
  assert.equal(page.paint.capabilities.canvas, true);
  assert.equal(page.paint.capabilities.direct_text, false);
  assert.equal(page.live.kind, 'dynamic_region');
  assert.equal(page.live.capabilities.direct_text, false);
  assert.equal(page.live.capabilities.ai, true);
  const boundCell = editablePageNodes(blockPkg, { bindings: [{ node_id: 'cell' }] }).find(row => row.node_id === 'cell');
  assert.equal(boundCell.capabilities.bound, true);
  assert.equal(boundCell.capabilities.direct_text, false);
  assert.equal(editableTextNodes(blockPkg).some(row => row.node_id === 'go'), true);
  assert.equal(editableTextNodes(blockPkg).some(row => row.node_id === 'cell'), true);
  assert.equal(editableTextNodes(blockPkg).some(row => ['sec', 'frame', 'paint', 'live'].includes(row.node_id)), false);
});

test('runtime selection is read-only and forged messages are rejected', () => {
  const source = {};
  const nodes = editablePageNodes(blockPkg);
  const context = { source, channel: 'nonce', pageId: 'page_a', version: 2, nodes, allowRuntime: true };
  const ref = {
    node_id: 'runtime:section:0/article:0/h2:0', kind: 'static_element', mapping: 'runtime', tag: 'h2', text: '嵌套标题',
    parent_node_id: 'runtime:section:0/article:0',
    parent_block: { node_id: 'runtime:section:0/article:0', tag: 'article', kind: 'static_element' },
    breadcrumb: [
      { node_id: 'runtime:section:0', tag: 'section', kind: 'static_element' },
      { node_id: 'runtime:section:0/article:0', tag: 'article', kind: 'static_element' },
      { node_id: 'runtime:section:0/article:0/h2:0', tag: 'h2', kind: 'static_element' },
    ],
    capabilities: { direct_text: true, ai: true },
  };
  const data = { type: 'cockpit.selection', channel: 'nonce', pageId: 'page_a', version: 2, nodeId: ref.node_id, parentNodeId: ref.parent_node_id, ref };
  const selected = acceptSelection({ source, origin: 'null', data }, context);
  assert.equal(selected.tag, 'h2');
  assert.equal(selected.kind, 'static_element');
  assert.equal(selected.parent_block.tag, 'article');
  assert.equal(selected.capabilities.direct_text, false);
  assert.equal(selected.boundary, 'runtime_dom');
  assert.equal(acceptSelection({ source: {}, origin: 'null', data }, context), undefined);
  assert.equal(acceptSelection({ source, origin: 'https://evil.example', data }, context), undefined);
  assert.equal(acceptSelection({ source, origin: 'null', data: { ...data, pageId: 'other' } }, context), undefined);
  assert.equal(acceptSelection({ source, origin: 'null', data: { ...data, version: 9 } }, context), undefined);
  assert.equal(acceptSelection({ source, origin: 'null', data: { ...data, nodeId: 'unknown' } }, context), undefined);
  assert.equal(acceptSelection({ source, origin: 'null', data: { ...data, nodeId: 'runtime:script:0', ref: { ...ref, node_id: 'runtime:script:0', tag: 'script' } } }, context), undefined);
  const title = nodes.find(row => row.node_id === 'title');
  const op = createEditOperation({ pageId: 'page_a', baseVersion: 2, node: title, action: 'set_text', value: '新标题', proposed: '新标题' });
  const message = { source, origin: 'null', data: { type: 'cockpit.operation', channel: 'nonce', pageId: 'page_a', version: 2, operation: op } };
  assert.equal(acceptOperationMessage(message, { ...context, selection: title, apply: true }).ok, true);
  assert.equal(acceptOperationMessage({ ...message, source: {} }, { ...context, selection: title }).reason, 'forged_message');
  assert.equal(acceptOperationMessage({ ...message, data: { ...message.data, pageId: 'other' } }, { ...context, selection: title }).reason, 'wrong_page');
  assert.equal(acceptOperationMessage({ ...message, data: { ...message.data, version: 8 } }, { ...context, selection: title }).reason, 'wrong_version');
  assert.equal(acceptOperationMessage({ ...message, data: { ...message.data, replacementText: 'write' } }, { ...context, selection: title }).reason, 'forged_message');
  const frame = nodes.find(row => row.node_id === 'frame');
  const frameOp = createEditOperation({ pageId: 'page_a', baseVersion: 2, node: frame, action: 'set_attribute', attributes: { src: 'https://example.invalid' } });
  assert.equal(acceptOperationMessage({ ...message, data: { ...message.data, operation: frameOp } }, { ...context, selection: frame, nodes }).reason, 'capability_boundary');
});

test('editor chrome keeps the brand palette', () => {
  assert.match(visualEditorCss, /#09050D/);
  assert.match(visualEditorCss, /#805D9D/);
  assert.match(visualEditorCss, /#D3C3E8/);
  assert.match(visualEditorCss, /#F2FFDC/);
  assert.match(visualEditorCss, /#FEFCFF/);
  assert.match(visualEditorCss, /PingFang SC/);
  assert.match(visualEditorCss, /rgba\(255, 255, 255, 0\.03\)/);
  assert.doesNotMatch(visualEditorCss, /cyan|#00e5ff|#22d3ee|#0ea5e9/i);
});

function loadJsdom() {
  const candidates = [
    process.env.B0_BUILD_UPSTREAM && join(process.env.B0_BUILD_UPSTREAM, 'node_modules/jsdom/package.json'),
    join(new URL('../../.context/dsh-b0/upstream/node_modules/jsdom/package.json', import.meta.url).pathname),
    '/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics/.context/dsh-b0/upstream/node_modules/jsdom/package.json',
  ].filter(Boolean);
  const found = candidates.find(path => existsSync(path));
  if (!found) return null;
  return createRequire(found)('jsdom').JSDOM;
}

test('clicking ordinary blocks, buttons, cells and opaque surfaces reports a selection', async t => {
  const JSDOM = loadJsdom();
  if (!JSDOM) { t.skip('jsdom is not installed'); return; }
  const dom = new JSDOM(`<!doctype html><html><body>
    <section data-shine-node="sec"><article data-shine-node="card"><h2 data-shine-node="title">嵌套标题</h2>
      <div data-shine-node="panel"><button type="button">按钮</button></div>
      <table><tr><td>单元格</td></tr></table>
    </article></section>
    <iframe title="外链"></iframe>
    <canvas></canvas>
    <script>window.__mutated = true;</script>
  </body></html>`, { pretendToBeVisual: true });
  const messages = [];
  const win = dom.window;
  const previous = ['document', 'window', 'parent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: win.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: win });
  Object.defineProperty(globalThis, 'parent', { configurable: true, writable: true, value: { postMessage: data => messages.push(data) } });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });
  const nodes = [
    { node_id: 'sec', kind: 'static_element', tag: 'section', text: '', capabilities: { direct_text: false, ai: true, style: true, attribute: true, structure: true } },
    { node_id: 'card', kind: 'static_element', tag: 'article', text: '', capabilities: { direct_text: false, ai: true, style: true, attribute: true, structure: true } },
    { node_id: 'title', kind: 'static_element', tag: 'h2', text: '嵌套标题', capabilities: { direct_text: true, ai: true, style: true, attribute: true, structure: true } },
    { node_id: 'panel', kind: 'static_element', tag: 'div', text: '', capabilities: { direct_text: false, ai: true, style: true, attribute: true, structure: true } },
  ];
  selectionRuntime({
    channel: 'nonce', pageId: 'page_a', version: 3, ids: nodes.map(row => row.node_id), nodes, allowRuntime: true,
    blocks: ['div', 'section', 'article', 'table', 'tr', 'td', 'ul', 'ol'],
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const click = selector => {
    messages.length = 0;
    win.document.querySelector(selector).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    return messages.at(-1);
  };
  const heading = click('h2');
  assert.equal(heading.ref.node_id, 'title');
  assert.equal(heading.ref.kind, 'static_element');
  assert.equal(heading.ref.parent_block.tag, 'article');
  assert.equal(heading.ref.parent_block.node_id, 'card');
  assert.deepEqual(heading.ref.breadcrumb.map(row => row.tag), ['section', 'article', 'h2']);
  const button = click('button');
  assert.equal(button.ref.tag, 'button');
  assert.equal(button.ref.parent_block.tag, 'div');
  assert.equal(button.ref.kind, 'static_element');
  const cell = click('td');
  assert.equal(cell.ref.tag, 'td');
  assert.equal(cell.ref.parent_block.tag, 'tr');
  assert.match(cell.ref.node_id, /td:0$/);
  const frame = click('iframe');
  assert.equal(frame.ref.boundary, 'cross_origin_iframe');
  assert.equal(frame.ref.capabilities.direct_text, false);
  assert.equal(frame.ref.capabilities.cross_origin, true);
  const paint = click('canvas');
  assert.equal(paint.ref.boundary, 'canvas_visual');
  assert.equal(paint.ref.capabilities.canvas, true);
  assert.equal(paint.ref.capabilities.direct_text, false);
  messages.length = 0;
  win.document.querySelector('script').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(messages.length, 0);
  const source = {};
  const host = acceptSelection({ source, origin: 'null', data: paint }, { source, channel: 'nonce', pageId: 'page_a', version: 3, nodes, allowRuntime: true });
  assert.equal(host.capabilities.direct_text, false);
  assert.equal(host.kind, 'static_element');
});
