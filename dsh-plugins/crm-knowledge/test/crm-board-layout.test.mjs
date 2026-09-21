import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBlockId, nextLayout } from '../src/client/crm-board-layout.mjs';

test('block ids stay unique after a middle component is removed', () => {
  const added = ['m1', 'm2'];
  added.splice(0, 1);
  assert.equal(nextBlockId(added), 'm1');
  assert.deepEqual([...added, nextBlockId(added)].sort(), ['m1', 'm2']);
});

test('layout fills the hole instead of stacking on the remaining card', () => {
  const remaining = [{ x: 4, y: 0, w: 4, h: 4 }];
  assert.deepEqual(nextLayout(remaining), { x: 0, y: 0, w: 4, h: 4 });
});
