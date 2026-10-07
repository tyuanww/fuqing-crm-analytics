import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { summarizeRequest, evidenceFor, requestForTool, nativeJournal, summarizeJournal } from '../src/native-evidence.mjs';

const e = (type, data) => ({ type, data });
const user = id => ({ id, source: { kind: 'user', rpcId: id } });
const turn = (id, number, reason = 'completed') => [e('turn/start', { turn: number }), e('user/message', user(id)),
  e('tool/call', { turn: number, callId: `call-${id}`, name: 'analytics_b0_query' }),
  e('tool/result', { turn: number, message: { role: 'tool', content: [{ type: 'tool-result', toolCallId: `call-${id}`, isError: false, content: [] }] } }),
  e('turn/end', { turn: number, reason: { kind: reason } })];
const intent = { run_id: 'run-1', attempt_id: 'attempt-1', session_id: 'session-1', request_id: 'first' };

test('native journal turn/end without actual exit cannot finish a run', () => {
  const summary = summarizeRequest(turn('first', 1), 'first');
  assert.equal(evidenceFor(intent, summary, false).outcome, 'RUNNING');
  assert.equal(evidenceFor(intent, summary, false).execution_exited, false);
  assert.equal(evidenceFor(intent, summary, true).outcome, 'SUCCEEDED');
});

test('second question and old late result remain correlated to their own turn', () => {
  const events = [...turn('first', 1), ...turn('second', 2, 'error')];
  const first = summarizeRequest(events, 'first');
  assert.deepEqual(first.successful_call_ids, ['call-first']);
  assert.equal(first.reason.kind, 'completed');
  const second = summarizeRequest(events, 'second');
  assert.deepEqual(second.successful_call_ids, ['call-second']);
  assert.equal(second.reason.kind, 'error');
  assert.equal(second.currentRequestId, 'second');
  assert.equal(requestForTool(events, 'call-first'), 'first');
  assert.equal(requestForTool(events, 'call-second'), 'second');
  assert.equal(requestForTool(events, 'missing'), undefined);
});

test('discarded pending prompt needs native idle before cancellation proof', () => {
  const events = [e('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [user('first')] }),
    e('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [], outcome: 'canceled' })];
  const summary = summarizeRequest(events, 'first');
  assert.equal(evidenceFor(intent, summary, false).execution_exited, false);
  assert.equal(evidenceFor(intent, summary, true).outcome, 'CANCELLED');
});

test('missing or ambiguous request never manufactures completion', () => {
  const missing = evidenceFor(intent, summarizeRequest(turn('other', 1), 'first'), true);
  assert.equal(missing.outcome, 'UNKNOWN');
  assert.equal(missing.execution_exited, false);
  const ambiguous = summarizeRequest([...turn('first', 1), e('user/message', user('second'))], 'first');
  assert.equal(evidenceFor(intent, ambiguous, true).outcome, 'UNKNOWN');
});

test('official interrupted-tail repair is failure only after the resumed driver is idle and durable', () => {
  const summary = summarizeRequest(turn('first', 1, 'interrupted'), 'first');
  const waiting = evidenceFor(intent, summary, false);
  assert.equal(waiting.outcome, 'RUNNING');
  assert.equal(waiting.execution_exited, false);
  const stopped = evidenceFor(intent, summary, true);
  assert.equal(stopped.outcome, 'FAILED');
  assert.equal(stopped.execution_exited, true);
  assert.equal(stopped.error_code, 'EXECUTION_UNKNOWN');
  assert.equal(stopped.request_id, intent.request_id);
});

function ownedSession(seed = []) {
  const listeners = new Map();
  let events = seed.map((event, seq) => ({ ...event, seq }));
  const session = { id: 'session-1', seq: events.length };
  let live = session, reads = 0, disposeProjection;
  const snapshot = () => structuredClone({ session: { id: session.id }, events });
  let read = async () => snapshot();
  const ctx = {
    sessions: { get: () => live },
    get: name => name === 'sessionQuery' ? { readSession: id => {
      assert.equal(id, session.id); reads++; return read();
    } } : undefined,
    on(name, listener) { listeners.set(name, listener); },
    effect(setup) { disposeProjection = setup(); },
  };
  const journal = nativeJournal(ctx);
  listeners.get('session/created')(session);
  return { session, journal, snapshot, get reads() { return reads; },
    reader(fn) { read = fn; },
    append(event) {
      const next = { ...event, seq: events.length }; events.push(next); session.seq++;
      listeners.get('session/event')(session, next); return next;
    },
    dispose() { live = undefined; listeners.get('session/disposed')(session); },
    unmount() { disposeProjection(); },
  };
}

test('restored seed recovers request/turn/exit without replaying a prompt', async () => {
  const f = ownedSession([...turn('first', 1), ...turn('second', 2, 'interrupted')]);
  assert.equal(summarizeJournal(f.journal.of(f.session), 'second').received, false);
  const state = await f.journal.ready(f.session);
  assert.equal(summarizeJournal(state, 'first').reason.kind, 'completed');
  const recovered = evidenceFor({ ...intent, request_id: 'second' }, summarizeJournal(state, 'second'), true);
  assert.equal(recovered.outcome, 'FAILED'); assert.equal(recovered.execution_exited, true);
  assert.equal(recovered.error_code, 'EXECUTION_UNKNOWN');
  assert.equal(requestForToolFrom(state, 'call-second'), 'second');
  await f.journal.ready(f.session); assert.equal(f.reads, 1);
});

const requestForToolFrom = (state, call) => state.toolToRequest.get(call);

test('fresh sessions use ordered live events without reading persistence', async () => {
  const f = ownedSession();
  for (const event of turn('first', 1)) f.append(event);
  assert.equal(evidenceFor(intent, summarizeJournal(await f.journal.ready(f.session), 'first'), true).outcome, 'SUCCEEDED');
  assert.equal(f.reads, 0);
});

test('events overlapping an async read are applied once, including events after its cut', async () => {
  const f = ownedSession(turn('first', 1).slice(0, 2));
  let resolve; f.reader(() => new Promise(done => { resolve = done; }));
  const pending = f.journal.ready(f.session), same = f.journal.ready(f.session);
  await Promise.resolve();
  const tail = turn('first', 1).slice(2);
  f.append(tail[0]); f.append(tail[1]); const cut = f.snapshot();
  f.append(tail[2]); resolve(cut);
  const [state, other] = await Promise.all([pending, same]);
  assert.equal(f.reads, 1); assert.equal(state, other);
  assert.deepEqual(summarizeJournal(state, 'first').successful_call_ids, ['call-first']);
  assert.equal(summarizeJournal(state, 'first').reason.kind, 'completed');
});

test('read failure exposes no partial history and the next observation can retry', async () => {
  const f = ownedSession(turn('first', 1));
  f.reader(async () => { throw Error('owned read unavailable'); });
  await assert.rejects(f.journal.ready(f.session));
  assert.equal(summarizeJournal(f.journal.of(f.session), 'first').received, false);
  f.reader(async () => f.snapshot());
  assert.equal(summarizeJournal(await f.journal.ready(f.session), 'first').reason.kind, 'completed');
});

for (const invalid of ['wrong-session', 'truncated', 'gap', 'overlap-conflict']) {
  test(`invalid restored evidence is rejected: ${invalid}`, async () => {
    const f = ownedSession(turn('first', 1));
    f.reader(async () => {
      if (invalid === 'overlap-conflict') f.append(e('turn/start', { turn: 2 }));
      const cut = f.snapshot();
      if (invalid === 'wrong-session') cut.session.id = 'different-session';
      if (invalid === 'truncated') cut.events.pop();
      if (invalid === 'gap') cut.events[1].seq = 99;
      if (invalid === 'overlap-conflict') cut.events.at(-1).data.turn = 33;
      return cut;
    });
    await assert.rejects(f.journal.ready(f.session));
    assert.equal(summarizeJournal(f.journal.of(f.session), 'first').received, false);
  });
}

for (const action of ['dispose', 'unmount']) {
  test(`late async read cannot resurrect projection after ${action}`, async () => {
    const f = ownedSession(turn('first', 1));
    let resolve; f.reader(() => new Promise(done => { resolve = done; }));
    const pending = f.journal.ready(f.session); await Promise.resolve();
    f[action](); resolve(f.snapshot());
    await assert.rejects(pending);
    assert.equal(summarizeJournal(f.journal.of(f.session), 'first').received, false);
    await assert.rejects(f.journal.ready(f.session));
  });
}

test('official Cordis unload invalidates a hydrated journal for an otherwise live session', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit pinned built SDK required',
}, async () => {
  const upstream = process.env.B0_BUILD_UPSTREAM;
  const { Context } = await import(pathToFileURL(join(upstream, 'vendor/cordis/lib/index.js')));
  const { SessionStore } = await import(pathToFileURL(join(upstream, 'packages/core/session/lib/index.js')));
  const { default: SessionQuery } = await import(pathToFileURL(join(upstream, 'packages/session-query/session-query/lib/index.js')));
  const ctx = new Context();
  try {
    await ctx.plugin(SessionStore); await ctx.plugin(SessionQuery);
    const session = ctx.sessions.create('owned-journal-lifecycle');
    session.append('turn/start', { turn: 1 });
    session.append('user/message', { id: 'owned-user', role: 'user', source: { kind: 'user', rpcId: 'first' },
      content: [{ type: 'text', text: 'synthetic request' }] }, { surfaceOp: 'append' });
    session.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } });
    let journal;
    const fiber = ctx.plugin({ inject: ['sessions', 'sessionQuery'], apply(scoped) { journal = nativeJournal(scoped); } });
    await fiber;
    assert.equal(evidenceFor(intent, summarizeJournal(await journal.ready(session), 'first'), true).outcome, 'FAILED');
    await fiber.dispose();
    assert.equal(ctx.sessions.get(session.id), session);
    assert.equal(summarizeJournal(journal.of(session), 'first').received, false);
    await assert.rejects(journal.ready(session), /UNAVAILABLE/);
  } finally { await ctx.fiber.dispose(); }
});
