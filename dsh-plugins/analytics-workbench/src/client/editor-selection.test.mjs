import test from 'node:test';
import assert from 'node:assert/strict';
import { editorSelectionReady, visibleEditorNodes } from './editor-selection.mjs';

test('a clicked runtime element stays editable before the iframe list arrives', () => {
  const listed = [{ node_id: 'source_0', editableText: true }];
  const clicked = { ok: true, node_id: 'runtime_card', runtime: { path: [] }, editableText: true };
  const nodes = visibleEditorNodes(listed, null);
  assert.deepEqual(nodes.map(node => node.node_id), ['source_0']);
  assert.equal(nodes.some(node => node.node_id === clicked.node_id), false);
  assert.equal(editorSelectionReady(clicked), true);
});

test('verified script nodes join static text instead of replacing it', () => {
  const listed = [{ node_id: 'source_0' }, { node_id: 'source_1' }];
  const verified = [{ node_id: 'source_1' }, { node_id: 'runtime_card' }];
  assert.deepEqual(visibleEditorNodes(listed, verified).map(node => node.node_id), ['source_0', 'source_1', 'runtime_card']);
  assert.equal(editorSelectionReady({ ok: false, node_id: 'runtime_card' }), false);
});
