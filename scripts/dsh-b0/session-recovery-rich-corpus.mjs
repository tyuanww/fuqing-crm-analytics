/** Pinned rc2 attachment-reference and delegation metadata fixtures, not live agents/assets. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const RICH_CORPUS_ID = 'attachment-delegation-metadata/v1';
export const RICH_EVENTS_PER_TURN = 7; // The first turn also establishes one child descriptor.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Tiny synthetic inputs give the references real content identities. No upload/storage is exercised.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPm0AAAAASUVORK5CYII=', 'base64');
const file = Buffer.from('合成资料，仅用于会话引用恢复。\n');

export function richRecoveryHeader(id, version) {
  return { id, version, createdAt: 1000, isSeeded: false, origin: 'subagent',
    parentSession: 'owned-synthetic-parent', delegationDepth: 2, agentPreset: 'owned-synthetic-preset' };
}

export function richDescriptor() {
  return { version: 3, mode: 'continuable', provider: 'in-process', label: '合成附件检查',
    agentProvider: 'mock', agentModel: 'mock', persona: 'synthetic-only',
    toolFilter: { allow: ['synthetic_lookup'], deny: ['synthetic_write'] } };
}

export function richRecoveryTurn(turn, start) {
  assert.ok(Number.isSafeInteger(turn) && turn > 0 && Number.isSafeInteger(start) && start >= 0);
  const events = [];
  const push = (type, data, surface = false) => {
    const seq = start + events.length;
    events.push({ type, seq, time: seq + 1, ...(surface ? { surfaceOp: 'append' } : {}), data });
  };
  push('turn/start', { turn });
  if (turn === 1) push('subagent/descriptor', richDescriptor());
  push('user/message', { id: `owned-rich-user-${turn}`, role: 'user',
    source: { kind: 'agent-message', form: 'relay', senderSessionId: 'owned-synthetic-parent' },
    content: [
      { type: 'text', text: '合成委派：检查附件引用；不得访问真实附件。' },
      { type: 'image', attachment: { attachmentId: hash(png), mediaType: 'image/png',
        bytes: png.length, width: 1, height: 1, name: '合成像素.png' } },
      { type: 'file', attachment: { attachmentId: hash(file), bytes: file.length, name: '合成资料.txt' } },
    ] }, true);
  push('user/message', { id: `owned-rich-notice-${turn}`, role: 'user',
    source: { kind: 'subagent-settled', form: 'notice', summary: '合成子会话已结束',
      senderSessionId: `owned-synthetic-child-${turn}` },
    content: [{ type: 'text', text: '合成终态通知；没有实际执行子代理。' }] }, true);
  push('step/start', { turn, step: 1 });
  const content = [{ type: 'reasoning', text: '合成推理片段，不是模型输出。' }, { type: 'text', text: '合成引用已记录。' }];
  const time = start + events.length + 1;
  push('assistant/message', { turn, step: 1,
    message: { id: `owned-rich-assistant-${turn}`, role: 'assistant',
      source: { kind: 'model', provider: 'mock', model: 'mock', replayState: { fixture: true, turn } }, content },
    stream: [...content.flatMap((block, index) => [
      { type: 'chunk', time, chunk: { type: 'block-start', index, blockType: block.type } },
      { type: 'chunk', time, chunk: { type: 'block-end', index, block } },
    ]), { type: 'chunk', time, chunk: { type: 'finish', reason: { kind: 'stop' } } }] }, true);
  push('step/end', { turn, step: 1 });
  push('turn/end', { turn, reason: { kind: 'completed' } });
  assert.equal(events.length, RICH_EVENTS_PER_TURN + Number(turn === 1));
  return events;
}

export function assertRichCorpus(events) {
  assert.ok(events.length > 1 && (events.length - 1) % RICH_EVENTS_PER_TURN === 0, 'RECOVERY_RICH_CORPUS_COUNT');
  const expected = [];
  for (let turn = 1; turn <= (events.length - 1) / RICH_EVENTS_PER_TURN; turn++) {
    expected.push(...richRecoveryTurn(turn, expected.length));
  }
  assert.deepEqual(events, expected, 'RECOVERY_RICH_CORPUS_CONTENT');
}
