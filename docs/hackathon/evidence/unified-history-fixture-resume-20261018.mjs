/** Synthetic-only history fixture for alpha2 target browser/restart proof. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const name = 'rc1-unified-history-fixture-rehydrate';
export const inject = ['agents', 'sessionController', 'sessions', 'webServer', 'connection'];
export const SESSION_ID = process.env.RC1_UNIFIED_SESSION_ID ?? 'session-rc1-unified-recovery-r1';
export const FILE_NAME = 'rc1-unified-history.html';

// Resolve through the official SessionController so a restart restores the
// durable Agent and its persistence writer instead of publishing a bare Session.
async function ensureLiveSession(ctx, sessionId) {
  const wasLive = ctx.agents.get(sessionId) !== undefined;
  const result = await ctx.sessionController.agents.resolveAgent(sessionId);
  if (result && 'error' in result) throw result.error;
  return { session: result.agent.session, restored: !wasLive };
}

export async function seed(session, sessionId = SESSION_ID) {
  assert.equal(String(session.id), sessionId);
  const cwd = resolve(session.header.cwd);
  assert.ok(cwd && cwd.includes('/runtime-browser-'), 'history fixture must stay in the disposable target runtime');
  const path = join(cwd, FILE_NAME);
  const content = '<!doctype html><meta charset="utf-8"><title>rc1 unified synthetic history</title><main>rc1 unified candidate synthetic history; source=85a92e05880d1b37b6d01491b7713d3cb23bf770; no model, no business data</main>\n';
  await mkdir(cwd, { recursive: true });
  await writeFile(path, content, { mode: 0o600 });
  if (!session.snapshotEvents().some(event => event.type === 'deliverables/presented')) {
    session.append('session/title', { title: 'rc1 unified history reread · synthetic', messageSeqs: [], source: { kind: 'user' } });
    session.append('turn/start', { turn: 1 });
    session.append('deliverables/presented', { turn: 1, callId: 'rc1-unified-synthetic-present', files: [{ path }] });
    session.append('step/start', { turn: 1, step: 1 });
    const callId = 'rc1-unified-board-call';
    const argumentsText = JSON.stringify({ title: 'rc1 unified synthetic restart board', blocks: [{ block_id: 'rc1_unified_note', kind: 'TEXT' }] });
    session.append('assistant/message', { turn: 1, step: 1, stream: [], message: {
      id: 'rc1-unified-board-assistant', role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'synthetic' },
      content: [{ type: 'tool-call', id: callId, name: 'competition_board_generate', arguments: argumentsText }],
    } }, { surfaceOp: 'append' });
    const callEvent = session.append('tool/call', { turn: 1, step: 1, callId, name: 'competition_board_generate', arguments: argumentsText });
    const boardMeta = { schema_version: 'board-tool-result/v1', status: 'PREVIEW_READY', operation: 'GENERATE', session_id: sessionId, preview_id: 'rc1_unified_preview', board_id: 'rc1_unified_board', title: 'rc1 unified synthetic restart board', component_count: 1, expires_at_ms: Date.now() + 600000, published: false, source_sha: '85a92e05880d1b37b6d01491b7713d3cb23bf770', next_action: '在原生对话工具卡中打开预览；用户确认后才保存。' };
    session.append('tool/result', { turn: 1, step: 1, meta: boardMeta, message: { id: 'rc1-unified-board-message', source: { kind: 'tool', callId }, role: 'tool', toolCallId: callId, isError: false, content: [{ type: 'text', text: '{\"status\":\"PREVIEW_READY\",\"title\":\"rc1 unified synthetic restart board\"}' }] } }, { surfaceOp: 'append', sourceEventSeqs: [callEvent.seq] });
    session.append('step/end', { turn: 1, step: 1 });
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
  }
  assert.equal(await session.__flush__?.() ?? true, true);
  return { sessionId: sessionId, path, sha256: createHash('sha256').update(content).digest('hex') };
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/__rc1_unified_history_seed__', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection) { res.writeHead(rejection); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const sessionId = requestUrl.searchParams.get('session_id') ?? SESSION_ID;
    try {
      const adopted = await ensureLiveSession(ctx, sessionId);
      const result = await seed(adopted.session, sessionId);
      assert.equal(await ctx.sessions.flush(adopted.session), true, 'native persistence must acknowledge the fixture');
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ seeded: true, restored: adopted.restored, modelCalls: 0, containsRealData: false, derived: adopted.session.deriveMessages().map(message => ({ role: message.role, toolCallId: message.toolCallId, meta: message.meta, content: message.content })), ...result }));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(error?.message ?? error) }));
    }
  } }), 'rc1 unified target synthetic history fixture');
}
