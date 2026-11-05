/**
 * Offline copy of the DSH 0.2.1-rc.5 ACP projection helpers.
 *
 * The repository still pins rc.3 and cannot import the rc.5 workspace, so the
 * offline shadow compare evaluates this frozen copy of the target surface
 * instead of whatever the current pin happens to accept. Every function keeps
 * the semantics of the cited source; the tests assert the upstream table from
 * `packages/acp/acp/tests/codec.spec.ts` and the update shapes so a future
 * refresh of the pin has to revisit this file explicitly.
 *
 * Source: deepseek-ai/deepseek-harness @ b830ec950faba0a46dda564be3e2d854afed94f1
 * - `packages/acp/acp/src/updates.ts:52-87`     toolCallUpdate / toolResultUpdate
 * - `packages/acp/acp/src/codec.ts:14-35`       turnEndToStopReason
 * - `packages/acp/acp/src/session.ts:531-556`   prompt settlement order
 * - `packages/acp/acp/src/content.ts:214-237`   assistantBlockToAcp (text path)
 * - `packages/acp/acp/src/index.ts:125-133`     session/update notification
 *
 * Deliberate differences from the upstream modules:
 * - `toolResultUpdate` is synchronous here. Upstream is `async` only because
 *   `assistantBlockToAcp` may read the attachment store; text is the only
 *   content this offline copy converts, and image blocks fail closed.
 * - Nothing here sends a notification or owns a session. The projection is a
 *   pure function of the recorded event stream.
 */

/** Exact upstream commit the copies below are frozen from. */
export const ACP_RC5_COMMIT = 'b830ec950faba0a46dda564be3e2d854afed94f1';

/** Provenance pointers kept in the report so every mapping stays reviewable. */
export const ACP_SOURCE_REFS = Object.freeze({
  commit: ACP_RC5_COMMIT,
  updates: 'packages/acp/acp/src/updates.ts:52-87',
  codec: 'packages/acp/acp/src/codec.ts:14-35',
  settlement: 'packages/acp/acp/src/session.ts:531-556',
  notification: 'packages/acp/acp/src/index.ts:125-133',
  content: 'packages/acp/acp/src/content.ts:214-237',
});

/**
 * Start one generic ACP tool lifecycle from the durable call fact.
 * Verbatim `toolCallUpdate` (`updates.ts:52-62`).
 * @param {object} event - committed DSH `tool/call` session event.
 * @returns {object} the standard generic tool-call update.
 */
export function toolCallUpdate(event) {
  return {
    sessionUpdate: 'tool_call',
    toolCallId: event.data.callId,
    title: event.data.name,
    kind: 'other',
    status: 'in_progress',
    rawInput: parseToolArguments(event.data.arguments),
  };
}

/**
 * Finish one generic ACP tool lifecycle from its committed model-facing result.
 * `updates.ts:69-87`; the content conversion follows `content.ts:214-237`.
 * @param {object} event - committed DSH `tool/result` session event.
 * @returns {object} the standard completed or failed tool-call update.
 */
export function toolResultUpdate(event) {
  const message = event.data.message;
  const content = [];
  for (const block of message.content) {
    const converted = assistantBlockToAcp(block);
    if (converted !== undefined) content.push({ type: 'content', content: converted });
  }
  return {
    sessionUpdate: 'tool_call_update',
    toolCallId: message.toolCallId,
    status: message.isError === true ? 'failed' : 'completed',
    content,
  };
}

/**
 * Map a harness turn ending to ACP's terminal reason vocabulary.
 * Verbatim `turnEndToStopReason` (`codec.ts:14-35`), including the default arm.
 * @param {{kind: string}} reason - harness turn outcome.
 * @returns {string} the closest legal ACP stop reason.
 */
export function turnEndToStopReason(reason) {
  switch (reason.kind) {
    case 'completed':
      return 'end_turn';
    case 'max-tokens':
      return 'max_tokens';
    // `cancelled` is reserved for explicit client cancellation (`session/cancel`)
    // and disposal, both settled out of band; a turn aborted by a hook or
    // another owner is ordinary quiescence and reports `end_turn`.
    case 'aborted':
      return 'end_turn';
    case 'interrupted':
      return 'cancelled';
    case 'blocked':
    case 'error':
      return 'end_turn';
    /* `TurnEndReason` is merge-extensible; every live-turn member is handled
     * above, and seed-only variants (`forked`) never end an ACP prompt turn. */
    default:
      return 'end_turn';
  }
}

/**
 * Project one recorded turn ending to the settlement a client would observe on
 * `session/prompt`. This mirrors the settlement order in `session.ts:531-556`
 * rather than calling the codec blindly, because two live outcomes never reach
 * `turnEndToStopReason`:
 * - `error` rejects the prompt with an internal error (`session.ts:553`); the
 *   codec's `error -> end_turn` arm is therefore not what a client sees.
 * - `forked` is a fork-seed boundary, not a live prompt turn (`codec.ts:30-33`);
 *   ACP has no settlement for it at all.
 * @param {{kind: string}} reason - harness turn outcome, or a shape carrying it.
 * @returns {{settlement: 'stop'|'error', stopReason?: string}|null} observable settlement.
 */
export function projectTurnSettlement(reason) {
  if (!reason || typeof reason.kind !== 'string') return null;
  if (reason.kind === 'forked') return null;
  if (reason.kind === 'error') return { settlement: 'error' };
  return { settlement: 'stop', stopReason: turnEndToStopReason(reason) };
}

/**
 * Encode one projected update as the standard ACP `session/update` notification.
 * Shape only: `index.ts:125-133` is the only place rc.5 sends this envelope.
 * @param {string} sessionId - ACP session id.
 * @param {object} update - value returned by one of the helpers above.
 * @returns {object} JSON-RPC notification.
 */
export function sessionUpdateNotification(sessionId, update) {
  return { jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } };
}

/**
 * Project the evidence-relevant slice of one recorded session event stream.
 *
 * Subscribed events are exactly the ACP bridge's generic tool surface
 * (`updates.ts`): `tool/call` and `tool/result`. `assistant/message` would add
 * `agent_message_chunk`/`usage_update` updates, which do not feed the compared
 * `{outcome, execution_exited, successful_call_ids}` shape; every other event
 * type is not projected by the ACP bridge either (`session.ts:349-389`).
 * @param {Array<object>} events - recorded session events in seq order.
 * @returns {{updates: Array<object>, settlements: Map<number, object|null>, calls: Map<string, object>}}
 */
export function projectSession(events) {
  const updates = [];
  const settlements = new Map();
  const calls = new Map();
  for (const [index, event] of events.entries()) {
    if (event.type === 'tool/call') {
      const update = toolCallUpdate(event);
      calls.set(update.toolCallId, { turn: event.data.turn, status: update.status });
      updates.push({ eventIndex: index, eventType: event.type, update });
    } else if (event.type === 'tool/result') {
      const update = toolResultUpdate(event);
      const previous = calls.get(update.toolCallId);
      calls.set(update.toolCallId, { turn: previous?.turn ?? event.data.turn, status: update.status });
      updates.push({ eventIndex: index, eventType: event.type, update });
    } else if (event.type === 'turn/end') {
      settlements.set(event.data.turn, projectTurnSettlement(event.data.reason));
    }
  }
  return { updates, settlements, calls };
}

/**
 * Preserve malformed model output as opaque input instead of dropping the call
 * update (`updates.ts:89-95`).
 * @param {string} value - raw model arguments string.
 * @returns {unknown} parsed JSON or the original string.
 */
function parseToolArguments(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Convert one assistant/tool-result content block to ACP content.
 * Only the pure text path of `content.ts:214-237` is copied; image delivery
 * needs the attachment store and must fail loudly rather than silently diff an
 * empty content array.
 * @param {object} block - DSH content block.
 * @returns {object|undefined} ACP content block, or undefined when not projected.
 */
function assistantBlockToAcp(block) {
  if (block?.type === 'text') {
    return block.text.length === 0 ? undefined : { type: 'text', text: block.text };
  }
  if (block?.type === 'image') {
    throw new Error('rc5 shadow compare: image blocks need the rc.5 attachment store; '
      + 'the offline projection cannot reproduce that content');
  }
  // Retired/unknown block shapes (for example the legacy nested `tool-result`
  // wrapper) are not ACP content; the call status still comes from isError.
  return undefined;
}
