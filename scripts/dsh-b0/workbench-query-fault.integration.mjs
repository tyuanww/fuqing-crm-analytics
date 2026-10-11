import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCardHarness } from './test-support/workbench-card-harness.mjs';
import { loadWorkbenchClient } from './workbench-client-pack-inputs.mjs';
const runtime = await loadWorkbenchClient({ scope: 'workbench-query-fault' });

const queryCall = { callId: 'query-fault-call', name: 'analytics_channel_followup_query', argsRaw: '{}', turn: 1, step: 1, time: 0, subCalls: [] };
const unknownBlock = {
  kind: 'tool-result', seq: 2, time: 1, callId: queryCall.callId,
  call: { name: queryCall.name, argsRaw: queryCall.argsRaw }, callTime: 0, content: [], isError: false, subCalls: [],
  meta: { schema_version: 'future/v999', run_id: 'run_1', result: { facts: { observation_days: 30, totals: { channel_repeat_count: 99 } } } },
};
const extraBlock = { ...unknownBlock, meta: { schema_version: 'analytics-run-channel-followup-native-receipt/v1', html: '<img src=x onerror=bad()>' } };
const errorBlock = { ...unknownBlock, isError: true, meta: undefined, content: [{ type: 'text', text: 'N=30 1100.00 元 SENSITIVE' }] };

test('published query fault cards hide channel digits', async () => {
  const harness = await loadCardHarness(runtime);
  for (const [id, block, expected, fault] of [
    ['unknown', unknownBlock, '版本不支持', 'unknown-version'],
    ['extra', extraBlock, '无法识别', 'malformed'],
    ['error', errorBlock, '查询工具失败', 'tool-error'],
    ['running', queryCall, '合成查询运行中', 'running'],
  ]) {
    const html = harness.renderQuery(block);
    assert.ok(html.includes(expected), id);
    assert.ok(html.includes(`data-query-fault="${fault}"`), id);
    assert.equal(html.includes('data-testid="analytics-query-tool-result"'), false, id);
    assert.equal(html.includes('data-testid="analytics-query-cancel"'), id === 'running');
    assert.doesNotMatch(html, /N=30|1100\.00 元|result_ref|25%|SENSITIVE|onerror=/i);
  }
});
