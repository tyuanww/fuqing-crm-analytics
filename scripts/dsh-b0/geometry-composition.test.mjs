/** Repository composition proof; standalone plugin tests do not import siblings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseComponentProps } from '../../dsh-plugins/analytics-workbench/src/board-spec/component-catalog.mjs';
import { projectComponent } from '../../dsh-plugins/analytics-workbench/src/board-spec/component-view.mjs';

for (const item of JSON.parse(await readFile(new URL('../../dsh-plugins/board-components/test/waterfall-cases.json', import.meta.url)))) {
  test(`workbench waterfall projection: ${item.name}`, () => {
    const view = projectComponent({ kind: 'WATERFALL', source_result_id: 'r', props: {} }, {
      schema_version: 'board-component-facts/v1', waterfall: item.data });
    assert.equal(view.status, item.valid ? 'ready' : 'error');
  });
}
test('funnel workbench props cannot introduce facts, units or executable content', () => {
  for (const key of ['counts', 'stages', 'unit', 'counting_rule', 'cohort_label', 'script']) {
    assert.equal(parseComponentProps('FUNNEL', { [key]: [] }).ok, false);
  }
  assert.equal(projectComponent({ kind: 'FUNNEL', props: {}, source_result_id: 'r1' },
    { schema_version: 'board-component-facts/v1', scalar: { value: 100, unit: '元' } }).code, 'COMPONENT_DATA');
});
test('waterfall AI changes display only and cannot replace contributions or invent a legacy total', () => {
  assert.equal(parseComponentProps('WATERFALL', { show_values: false, show_table: false }).ok, true);
  for (const props of [{ contributions: [] }, { unit: '元' }, { start: 100 }, { script: 'x' }, { show_values: 1 }]) {
    assert.equal(parseComponentProps('WATERFALL', props).ok, false);
  }
  assert.equal(projectComponent({ kind: 'WATERFALL', props: {} }, null).status, 'empty');
  assert.equal(projectComponent({ kind: 'WATERFALL', source_result_id: 'r', props: {} }, {
    current_gsv: 100, comparison_gsv: 80 }).status, 'error');
});
