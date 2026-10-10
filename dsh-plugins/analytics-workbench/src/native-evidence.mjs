/** Projection of the pinned native journal, NOT another run state machine. */
import { isDeepStrictEqual } from 'node:util';

export function requestIdOf(message) {
  return message?.source?.kind === 'user' ? message.source.rpcId : undefined;
}

export function emptyJournal() {
  return {
    queues: { 'next-turn': [], 'next-step': [] },
    turn: undefined,
    currentRequestId: undefined,
    requestByTurn: new Map(),
    toolToRequest: new Map(),
    byRequest: new Map(),
  };
}

function requestSlot(state, requestId) {
  let slot = state.byRequest.get(requestId);
  if (!slot) {
    slot = { received: false, discarded: false, targetTurn: undefined, reason: undefined, successful_call_ids: [], ambiguous: false };
    state.byRequest.set(requestId, slot);
  }
  return slot;
}

/** Incremental fold. Does not retain the event list. */
export function applyJournal(state, event) {
  const next = {
    queues: {
      'next-turn': state.queues['next-turn'].slice(),
      'next-step': state.queues['next-step'].slice(),
    },
    turn: state.turn,
    currentRequestId: state.currentRequestId,
    requestByTurn: new Map(state.requestByTurn),
    toolToRequest: new Map(state.toolToRequest),
    byRequest: new Map([...state.byRequest].map(([id, slot]) => [id, { ...slot, successful_call_ids: slot.successful_call_ids.slice() }])),
  };
  const data = event.data;
  if (event.type === 'agent/inbox/spliced') {
    const queue = next.queues[data.target];
    if (queue) {
      const removed = queue.splice(data.start, data.removedCount ?? 0, ...data.inserted);
      for (const message of data.inserted) {
        const id = requestIdOf(message);
        if (id) requestSlot(next, id).received = true;
      }
      if (data.outcome === 'canceled') {
        for (const message of removed) {
          const id = requestIdOf(message);
          if (id) requestSlot(next, id).discarded = true;
        }
      }
    }
  }
  if (event.type === 'turn/start') {
    next.turn = data.turn;
    next.currentRequestId = undefined;
  }
  if (event.type === 'user/message' && requestIdOf(data)) {
    const id = requestIdOf(data);
    if (next.currentRequestId && next.currentRequestId !== id) {
      requestSlot(next, next.currentRequestId).ambiguous = true;
      requestSlot(next, id).ambiguous = true;
    }
    next.currentRequestId = id;
    next.requestByTurn.set(next.turn, id);
    const slot = requestSlot(next, id);
    slot.received = true;
    slot.targetTurn = next.turn;
  }
  if (event.type === 'tool/call' && data.callId != null && data.turn === next.turn && next.currentRequestId) {
    next.toolToRequest.set(data.callId, next.currentRequestId);
  }
  if (event.type === 'turn/end' && data.turn != null) {
    for (const slot of next.byRequest.values()) {
      if (slot.targetTurn === data.turn) slot.reason = data.reason;
    }
  }
  if (event.type === 'tool/result' && data.turn != null) {
    for (const slot of next.byRequest.values()) {
      if (slot.targetTurn !== data.turn) continue;
      for (const block of data.message.content) {
        if (block.type === 'tool-result' && block.isError === false) slot.successful_call_ids.push(block.toolCallId);
      }
    }
  }
  return next;
}

export function journalFromEvents(events) {
  let state = emptyJournal();
  for (const event of events) state = applyJournal(state, event);
  return state;
}

const journals = new WeakMap();

export function nativeJournal(ctx) {
  let api = journals.get(ctx);
  if (api) return api;
  if (typeof ctx?.on !== 'function') {
    api = { of() { return emptyJournal(); }, async ready() { throw Error('NATIVE_JOURNAL_UNAVAILABLE'); } };
    journals.set(ctx, api);
    return api;
  }
  const bySession = new WeakMap();
  const disposed = new WeakSet();
  let active = true;
  const available = session => active && !disposed.has(session) && ctx.sessions?.get(session.id) === session;
  function entryFor(session) {
    let entry = bySession.get(session);
    if (!entry) {
      // Only a genuinely empty live session needs no baseline. This also
      // handles a plugin attached after session/created was already emitted.
      entry = { state: emptyJournal(), nextSeq: 0, ready: session.seq === 0, pending: [], loading: undefined };
      bySession.set(session, entry);
    }
    return entry;
  }
  ctx.on('session/created', session => { entryFor(session); }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (!active || disposed.has(session)) return;
    const entry = entryFor(session);
    if (entry.ready && event.seq === entry.nextSeq) {
      entry.state = applyJournal(entry.state, event); entry.nextSeq++;
    } else {
      // A gap invalidates the whole projection, never just the missing turn.
      entry.ready = false;
      if (entry.loading) entry.pending.push(event);
    }
  }, { global: true });
  ctx.on('session/disposed', session => { disposed.add(session); bySession.delete(session); }, { global: true });
  ctx.effect(() => () => { active = false; }, 'native journal: invalidate pending reads on unload');
  api = {
    of(session) {
      const entry = bySession.get(session);
      return available(session) && entry?.ready && entry.nextSeq === session.seq ? entry.state : emptyJournal();
    },
    async ready(session) {
      if (!available(session)) throw Error('NATIVE_JOURNAL_UNAVAILABLE');
      const entry = entryFor(session);
      if (entry.ready && entry.nextSeq === session.seq) return entry.state;
      if (!entry.loading) {
        entry.ready = false;
        entry.pending = [];
        const requiredSeq = session.seq;
        entry.loading = Promise.resolve().then(async () => {
          try {
            // Official async query API includes the restored seed and the
            // constructor's unpublished marker; no deprecated sync snapshots.
            const query = ctx.get('sessionQuery');
            if (!query) throw Error('NATIVE_JOURNAL_UNAVAILABLE');
            const snapshot = await query.readSession(session.id);
            if (!available(session) || bySession.get(session) !== entry
              || snapshot.session?.id !== session.id || !Array.isArray(snapshot.events)
              || !Number.isSafeInteger(requiredSeq) || snapshot.events.length < requiredSeq) {
              throw Error('NATIVE_JOURNAL_UNAVAILABLE');
            }
            let state = emptyJournal(), nextSeq = 0;
            for (const event of snapshot.events) {
              if (event.seq !== nextSeq) throw Error('NATIVE_JOURNAL_SEQUENCE');
              state = applyJournal(state, event); nextSeq++;
            }
            // Live events may fall on either side of the async snapshot cut.
            // Verify overlaps, then fold only its contiguous, newer suffix.
            for (const event of entry.pending) {
              if (event.seq < snapshot.events.length) {
                if (!isDeepStrictEqual(event, snapshot.events[event.seq])) throw Error('NATIVE_JOURNAL_CONFLICT');
              } else {
                if (event.seq !== nextSeq) throw Error('NATIVE_JOURNAL_SEQUENCE');
                state = applyJournal(state, event); nextSeq++;
              }
            }
            if (nextSeq !== session.seq) throw Error('NATIVE_JOURNAL_SEQUENCE');
            entry.state = state; entry.nextSeq = nextSeq; entry.ready = true;
            return state;
          } finally {
            entry.pending = []; entry.loading = undefined;
          }
        });
      }
      return entry.loading;
    },
  };
  journals.set(ctx, api);
  return api;
}

export function summarizeJournal(state, requestId) {
  const slot = state.byRequest.get(requestId) ?? {
    received: false, discarded: false, targetTurn: undefined, reason: undefined, successful_call_ids: [], ambiguous: false,
  };
  return {
    received: slot.received,
    discarded: slot.discarded,
    targetTurn: slot.targetTurn,
    currentRequestId: state.currentRequestId,
    reason: slot.reason,
    ambiguous: slot.ambiguous,
    successful_call_ids: slot.successful_call_ids,
  };
}

/** Test helper: fold a complete event list. Production uses nativeJournal(ctx). */
export function summarizeRequest(events, requestId) {
  return summarizeJournal(journalFromEvents(events), requestId);
}

export function requestForTool(events, callId) {
  return journalFromEvents(events).toolToRequest.get(callId);
}

export function requestForToolIn(state, callId) {
  return state.toolToRequest.get(callId);
}

/** First pre-step's inbox is not journaled yet; later steps use the projected turn. */
export function requestForStep(events, messages, turn) {
  return requestForStepIn(journalFromEvents(events), messages, turn);
}

export function requestForStepIn(state, messages, turn) {
  const ids = new Set();
  const fromTurn = state.requestByTurn.get(turn);
  if (fromTurn) ids.add(fromTurn);
  for (const message of messages) if (requestIdOf(message)) ids.add(requestIdOf(message));
  return ids.size === 1 ? [...ids][0] : undefined;
}

export function evidenceFor(intent, summary, executionExited) {
  let outcome = 'UNKNOWN';
  if (!summary.ambiguous && summary.received) {
    if (!executionExited) outcome = 'RUNNING';
    else if (summary.discarded && !summary.targetTurn) outcome = 'CANCELLED';
    else outcome = ({ completed: 'SUCCEEDED', aborted: 'CANCELLED', blocked: 'NEEDS_INPUT',
      error: 'FAILED', interrupted: 'FAILED', 'max-tokens': 'FAILED' })[summary.reason?.kind] ?? 'UNKNOWN';
  }
  return { run_id: intent.run_id, attempt_id: intent.attempt_id, session_id: intent.session_id,
    request_id: intent.request_id, execution_exited: executionExited && outcome !== 'UNKNOWN', outcome,
    successful_call_ids: summary.successful_call_ids,
    ...(executionExited && outcome === 'FAILED' && summary.reason?.kind === 'interrupted'
      ? { error_code: 'EXECUTION_UNKNOWN' } : {}) };
}
