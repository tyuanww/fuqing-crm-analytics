import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { funnelGeometry } from '../src/funnel.mjs';
import { waterfallGeometry } from '../src/waterfall.mjs';

const funnel = counts => ({ unit: '人', cohort_label: '合成同一人群', counting_rule: '至少1/2/3笔有效订单',
  stages: counts.map((count, index) => ({ label: `阶段${index + 1}`, count })) });
for (const row of JSON.parse(readFileSync(new URL('./funnel-cases.json', import.meta.url)))) {
  test(`domain funnel: ${row.name}`, () => {
    const data = funnel(row.counts), before = structuredClone(data), actual = funnelGeometry(data);
    assert.equal(Boolean(actual), row.valid); assert.deepEqual(data, before);
    if (actual) assert.ok(actual.stages.every(stage => Number.isFinite(stage.width) && stage.width >= 0 && stage.width <= 100));
  });
}
test('funnel ratios stay raw and zero denominators stay unavailable', () => {
  assert.deepEqual(funnelGeometry(funnel([10, 5, 0])).stages.map(s => s.first_ratio), [1, .5, 0]);
  assert.deepEqual(funnelGeometry(funnel([0, 0, 0])).stages.map(s => s.first_ratio), [null, null, null]);
  assert.deepEqual(funnelGeometry(funnel([10, 0, 0])).stages.map(s => s.previous_ratio), [null, 0, null]);
});
for (const row of JSON.parse(readFileSync(new URL('./waterfall-cases.json', import.meta.url)))) {
  test(`domain waterfall: ${row.name}`, () => {
    const before = structuredClone(row.data), actual = waterfallGeometry(row.data);
    assert.equal(Boolean(actual), row.valid); assert.deepEqual(row.data, before);
    if (!actual) return;
    assert.equal(actual.bars.length, row.data.contributions.length + 2);
    actual.bars.forEach((bar, index) => {
      assert.ok(Number.isFinite(bar.top) && Number.isFinite(bar.bottom) && bar.top <= bar.bottom);
      assert.ok(bar.top >= 40 && bar.bottom <= 240);
      if (bar.role === 'delta') {
        assert.equal(bar.from, actual.bars[index - 1].to);
        assert.equal(bar.to, bar.from + bar.value);
        if (!bar.value) assert.equal(bar.top, bar.bottom);
      } else assert.equal(bar.from, 0);
    });
  });
}
