/** Synthetic persistence corpus, following the pinned rc2 SessionEventMap and LLM messages.
 * No tool is executed. Tests cover retained call/result/error/meta identities, not model dispatch.
 */
import assert from 'node:assert/strict';

export const TOOL_CORPUS_ID = 'tool-roundtrip/v1';
export const TOOL_EVENTS_PER_TURN = 13;

export function toolRecoveryTurn(turn, start) {
  assert.ok(Number.isSafeInteger(turn) && turn > 0 && Number.isSafeInteger(start) && start >= 0);
  const events = [];
  const push = (type, data, surface = false) => {
    const seq = start + events.length;
    events.push({ type, seq, time: seq + 1, ...(surface ? { surfaceOp: 'append' } : {}), data });
  };
  const calls = ['ok', 'error'].map(outcome => ({ type: 'tool-call', id: `owned-${turn}-${outcome}`,
    name: 'synthetic_lookup', arguments: JSON.stringify({ outcome, label: '合成资料', turn }) }));
  const assistant = (step, content, reason) => {
    const time = start + events.length + 1;
    return { turn, step, message: { id: `owned-assistant-${turn}-${step}`, role: 'assistant',
      source: { kind: 'model', provider: 'mock', model: 'mock' }, content },
    stream: [...content.flatMap((block, index) => [
      { type: 'chunk', time, chunk: { type: 'block-start', index, blockType: block.type } },
      { type: 'chunk', time, chunk: { type: 'block-end', index, block } },
    ]), { type: 'chunk', time, chunk: { type: 'finish', reason: { kind: reason } } }] };
  };
  push('turn/start', { turn });
  push('user/message', { id: `owned-user-${turn}`, role: 'user', source: { kind: 'user' },
    content: [{ type: 'text', text: '合成工具调用；不得连接真实数据。' }] }, true);
  push('step/start', { turn, step: 1 });
  push('assistant/message', assistant(1, calls, 'tool-calls'), true);
  for (const [index, call] of calls.entries()) {
    const isError = index === 1;
    push('tool/call', { turn, step: 1, callId: call.id, name: call.name, arguments: call.arguments });
    push('tool/result', { turn, step: 1,
      message: { id: `owned-result-${turn}-${index}`, role: 'tool', source: { kind: 'tool', callId: call.id },
        toolCallId: call.id, isError, content: [{ type: 'text', text: isError ? '合成拒绝' : '合成结果：一条' }] },
      meta: { scope: 'synthetic-only', rows: isError ? [] : [{ count: 1 }], optional: null },
      ...(isError ? { error: { name: 'SyntheticDenied', code: 'SYNTHETIC_DENIED', reason: 'fixture-only' } } : {}),
    }, true);
  }
  push('step/end', { turn, step: 1 });
  push('step/start', { turn, step: 2 });
  push('assistant/message', assistant(2, [{ type: 'text', text: '已核对合成成功和失败结果。' }], 'stop'), true);
  push('step/end', { turn, step: 2 });
  push('turn/end', { turn, reason: { kind: 'completed' } });
  assert.equal(events.length, TOOL_EVENTS_PER_TURN);
  return events;
}

export function assertToolCorpus(events) {
  assert.ok(events.length > 0 && events.length % TOOL_EVENTS_PER_TURN === 0, 'RECOVERY_TOOL_CORPUS_COUNT');
  const expected = Array.from({ length: events.length / TOOL_EVENTS_PER_TURN }, (_, index) =>
    toolRecoveryTurn(index + 1, index * TOOL_EVENTS_PER_TURN)).flat();
  assert.deepEqual(events, expected, 'RECOVERY_TOOL_CORPUS_CONTENT');
}
