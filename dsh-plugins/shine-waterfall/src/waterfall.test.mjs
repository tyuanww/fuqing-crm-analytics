import test from 'node:test';
import assert from 'node:assert/strict';
import { waterfallGeometry } from './waterfall.mjs';

test('large contribution list remains complete, scrollable and geometrically proportional', () => {
  const data = { unit: '个', start: { label: '起点', value: 0 }, end: { label: '终点', value: 200 },
    contributions: Array.from({ length: 200 }, (_, i) => ({ label: `渠道${i}`, value: 1 })) };
  const geometry = waterfallGeometry(data);
  assert.equal(geometry.bars.length, 202);
  assert.ok(geometry.width > 19000);
  assert.ok(Math.abs(geometry.bars[1].bottom - geometry.bars[1].top - 1) < 1e-8);
  data.contributions.push({ label: '不能截断', value: 0 });
  assert.equal(waterfallGeometry(data), null);
});
