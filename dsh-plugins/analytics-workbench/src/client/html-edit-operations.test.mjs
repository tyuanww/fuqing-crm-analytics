import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptOperation, createEditOperation, operationBoundary, toFormalEditOperation } from './html-edit-operations.mjs';

const textNode = {
  node_id: 'a', mapping: 'valid', mapping_token: 'tok', version_hash: 'hash', tag: 'h1', kind: 'static_element',
  text: '旧标题', parent_node_id: 'root', breadcrumb: [{ node_id: 'root', tag: 'section', kind: 'static_element' }, { node_id: 'a', tag: 'h1', kind: 'static_element' }],
  capabilities: { select: true, direct_text: true, ai: true, attribute: true, style: true, structure: true },
};

test('builds a versioned operation payload with breadcrumb and channel', () => {
  const node = { node_id: 'a', mapping: 'valid', mapping_token: 'tok', version_hash: 'hash', tag: 'h1',
    parent_node_id: 'root', breadcrumb: [{ node_id: 'a', tag: 'h1', kind: 'static_element' }],
    capabilities: { direct_text: true, ai: true, attribute: true, style: true, structure: true } };
  const op = createEditOperation({ pageId: 'p', baseVersion: 4, node, channel: 'presentation', kind: 'set_style', styles: { color: 'var(--sm-brand-purple)' } });
  assert.equal(op.page_id, 'p');
  assert.equal(op.base_version, 4);
  assert.equal(op.channel, 'presentation');
  assert.equal(op.action, 'set_style');
  assert.equal(op.target.parent_node_id, 'root');
  assert.equal(op.target.node_id, 'a');
  assert.equal(op.breadcrumb[0].tag, 'h1');
  assert.equal(op.proposed_value, 'color: var(--sm-brand-purple)');
  assert.equal(op.capability.style, true);
  assert.equal(op.payload.styles.color, 'var(--sm-brand-purple)');
  assert.equal(op.status, 'ready_for_adapter');
});

test('direct text payload keeps original and proposed values and can be applied', () => {
  const op = createEditOperation({
    pageId: 'p', baseVersion: 4, node: textNode, action: 'set_text', original: '旧标题', proposed: '新标题', value: '新标题',
  });
  assert.equal(op.channel, 'presentation');
  assert.equal(op.action, 'set_text');
  assert.equal(op.original_value, '旧标题');
  assert.equal(op.proposed_value, '新标题');
  assert.equal(op.target.kind, 'static_element');
  assert.deepEqual(op.breadcrumb.map(row => row.tag), ['section', 'h1']);
  assert.equal(acceptOperation(op, { pageId: 'p', version: 4, selection: textNode, nodes: [textNode], apply: true }).ok, true);
});

test('rejects wrong page, wrong version, unknown nodes, outside selection and boundary writes', () => {
  const op = createEditOperation({ pageId: 'p', baseVersion: 4, node: textNode, action: 'set_text', value: '新标题', proposed: '新标题' });
  const context = { pageId: 'p', version: 4, selection: textNode, nodes: [textNode] };
  assert.equal(acceptOperation(op, { ...context, pageId: 'other' }).reason, 'wrong_page');
  assert.equal(acceptOperation(op, { ...context, version: 3 }).reason, 'wrong_version');
  const ghost = { ...textNode, node_id: 'missing' };
  const ghostOp = createEditOperation({ pageId: 'p', baseVersion: 4, node: ghost, action: 'set_text', value: 'x', proposed: 'x' });
  assert.equal(acceptOperation(ghostOp, { ...context, selection: ghost }).reason, 'unknown_node');
  const other = { ...textNode, node_id: 'b' };
  assert.equal(acceptOperation(op, { ...context, selection: other, nodes: [textNode, other] }).reason, 'outside_selection');
  const outside = createEditOperation({ pageId: 'p', baseVersion: 4, node: textNode, action: 'set_text', proposed: '<i data-shine-node="other">越界</i>' });
  assert.equal(acceptOperation(outside, context).reason, 'outside_selection');
  const bound = { ...textNode, node_id: 'bound', capabilities: { bound: true, direct_text: true, ai: true } };
  const boundOp = createEditOperation({ pageId: 'p', baseVersion: 4, node: bound, action: 'set_text', value: 'x', proposed: 'x' });
  assert.equal(acceptOperation(boundOp, { ...context, selection: bound, nodes: [bound], apply: true }).reason, 'bound_write');
  const frame = { node_id: 'runtime:iframe:0', mapping: 'runtime', tag: 'iframe', boundary: 'cross_origin_iframe', capabilities: { ai: true, cross_origin: true } };
  const frameOp = createEditOperation({ pageId: 'p', baseVersion: 4, node: frame, action: 'ai_instruction', instruction: '改内部' });
  assert.equal(acceptOperation(frameOp, { ...context, selection: frame, nodes: [] }).reason, 'capability_boundary');
  const canvas = { node_id: 'runtime:canvas:0', mapping: 'runtime', tag: 'canvas', boundary: 'canvas_visual', capabilities: { canvas: true, ai: true } };
  const canvasOp = createEditOperation({ pageId: 'p', baseVersion: 4, node: canvas, action: 'set_text', value: 'x' });
  assert.equal(acceptOperation(canvasOp, { ...context, selection: canvas, nodes: [] }).reason, 'capability_boundary');
  const region = { ...textNode, node_id: 'live', kind: 'dynamic_region', capabilities: { dynamic: true, ai: true, direct_text: false, script_generated: true } };
  const regionWrite = createEditOperation({ pageId: 'p', baseVersion: 4, node: region, action: 'set_text', value: 'x', proposed: 'x' });
  assert.equal(acceptOperation(regionWrite, { ...context, selection: region, nodes: [region], apply: true }).reason, 'capability_boundary');
  const styleOp = createEditOperation({ pageId: 'p', baseVersion: 4, node: textNode, action: 'set_style', styles: { color: '#805D9D' } });
  assert.equal(styleOp.status, 'ready_for_adapter');
  assert.equal(acceptOperation(styleOp, { ...context, apply: true }).ok, true);
  const runtimeStyle = createEditOperation({
    pageId: 'p', baseVersion: 4, node: frame, action: 'set_style', styles: { color: '#805D9D' },
  });
  assert.equal(acceptOperation(runtimeStyle, { ...context, selection: frame, nodes: [], apply: true }).reason, 'capability_boundary');
  assert.equal(acceptOperation({ ...op, channel: 'nope' }, context).reason, 'forged_message');
});

test('UI verbs become formal edit operations or an edit context', () => {
  const node = {
    ...textNode,
    page_id: 'page_formal',
    selector: '[data-shine-node="a"]',
    source_range: { start: 8, end: 40 },
    source_hash: 'a'.repeat(64),
    region_hash: 'b'.repeat(64),
    mapping_token: 'mt.0123456789abcdef',
  };
  const text = createEditOperation({ pageId: 'page_formal', baseVersion: 4, node, action: 'set_text', proposed: '新标题', value: '新标题' });
  assert.equal(text.formal.channel, 'presentation');
  assert.equal(text.formal.action, 'update');
  assert.equal(text.formal.encoding, 'overlay');
  assert.equal(text.formal.payload.text, '新标题');
  assert.equal(text.formal.cas.idempotency_key.length > 0, true);
  assert.equal(text.formal.node.channel, undefined);
  assert.deepEqual(text.formal.capabilities, ['edit:presentation']);
  const style = toFormalEditOperation(createEditOperation({
    pageId: 'page_formal', baseVersion: 4, node, action: 'set_style', styles: { color: '#805D9D' },
  }));
  assert.equal(style.operation.payload.style.color, '#805D9D');
  const attribute = toFormalEditOperation(createEditOperation({
    pageId: 'page_formal', baseVersion: 4, node, action: 'set_attribute', attributes: { title: '说明' },
  }));
  assert.equal(attribute.operation.payload.attributes.title, '说明');
  const structure = toFormalEditOperation(createEditOperation({
    pageId: 'page_formal', baseVersion: 4, node, action: 'replace_structure', structure: '<h1 data-shine-node="a">新</h1>',
  }));
  assert.equal(structure.operation.channel, 'source');
  assert.equal(structure.operation.action, 'replace');
  assert.equal(structure.operation.encoding, 'bytes');
  assert.deepEqual(structure.operation.splice, { start: 8, end: 40 });
  assert.equal(structure.operation.expected_region_hash, node.region_hash);
  const ai = toFormalEditOperation(createEditOperation({
    pageId: 'page_formal', baseVersion: 4, node, action: 'ai_instruction', instruction: '改短一点',
  }));
  assert.equal(ai.context_only, true);
  assert.equal(ai.operation, null);
  const bound = { ...node, node_id: 'bound', capabilities: { bound: true, direct_text: true } };
  assert.equal(toFormalEditOperation(createEditOperation({
    pageId: 'page_formal', baseVersion: 4, node: bound, action: 'set_text', value: 'x', proposed: 'x',
  })).operation, null);
});

test('marks runtime, bound, iframe and canvas operations as contract-bound', () => {
  const runtime = { node_id: 'runtime:div:0', mapping: 'runtime', tag: 'div', capabilities: { ai: true } };
  assert.match(operationBoundary(runtime), /Node Graph/);
  assert.equal(createEditOperation({ node: runtime }).status, 'needs_contract');
  const bound = { node_id: 'b', mapping: 'valid', tag: 'p', capabilities: { bound: true, ai: true } };
  assert.match(operationBoundary(bound), /绑定/);
  assert.match(operationBoundary({ node_id: 'f', mapping: 'runtime', tag: 'iframe', boundary: 'cross_origin_iframe' }), /跨域/);
  assert.match(operationBoundary({ node_id: 'c', mapping: 'runtime', tag: 'canvas', boundary: 'canvas_visual' }), /canvas/);
});
