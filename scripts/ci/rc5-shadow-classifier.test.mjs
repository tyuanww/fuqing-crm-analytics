import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACP_RC5_COMMIT, ACP_SOURCE_REFS, projectSession, projectTurnSettlement, sessionUpdateNotification,
  toolCallUpdate, toolResultUpdate, turnEndToStopReason,
} from './rc5-acp-projection.mjs';
import {
  CLASSIFICATIONS, SEVERITY_BY_CLASSIFICATION, SHADOW_DIFF_KEYS, SHADOW_DIFF_SCHEMA,
  buildReport, buildShadowRow, classifyEvidence, classifyToolStatus, classifyTurnEnd, validateReport,
} from './rc5-shadow-classifier.mjs';

const row = overrides => buildShadowRow({
  sessionId: 'sess-a', turnId: 1, eventKey: 'turn.outcome', legacy: 'SUCCEEDED', acp: 'SUCCEEDED',
  classification: 'EQUAL', ...overrides,
});

test('the projection copy is frozen to the pinned rc.5 commit and cites every source', () => {
  assert.equal(ACP_RC5_COMMIT, 'b830ec950faba0a46dda564be3e2d854afed94f1');
  assert.equal(ACP_SOURCE_REFS.commit, ACP_RC5_COMMIT);
  assert.match(ACP_SOURCE_REFS.codec, /codec\.ts:14-35$/);
  assert.match(ACP_SOURCE_REFS.updates, /updates\.ts:52-87$/);
  assert.match(ACP_SOURCE_REFS.settlement, /session\.ts:531-556$/);
});

test('turnEndToStopReason matches the upstream codec.spec.ts table', () => {
  // Verbatim table from packages/acp/acp/tests/codec.spec.ts @ b830ec95.
  const cases = [
    [{ kind: 'completed' }, 'end_turn'],
    [{ kind: 'max-tokens' }, 'max_tokens'],
    [{ kind: 'aborted', reason: { kind: 'user' } }, 'end_turn'],
    [{ kind: 'interrupted' }, 'cancelled'],
    [{ kind: 'blocked' }, 'end_turn'],
    [{ kind: 'error', error: { message: 'failed', code: 'UNKNOWN' } }, 'end_turn'],
  ];
  for (const [reason, expected] of cases) assert.equal(turnEndToStopReason(reason), expected, reason.kind);
  // The codec's default arm is idempotent for merge-extensible/seed-only kinds.
  assert.equal(turnEndToStopReason({ kind: 'forked' }), 'end_turn');
  assert.equal(turnEndToStopReason({ kind: 'not-yet-defined' }), 'end_turn');
});

test('projectTurnSettlement follows the prompt settlement order, not the codec alone', () => {
  assert.deepEqual(projectTurnSettlement({ kind: 'completed' }), { settlement: 'stop', stopReason: 'end_turn' });
  assert.deepEqual(projectTurnSettlement({ kind: 'interrupted' }), { settlement: 'stop', stopReason: 'cancelled' });
  // session.ts:553 rejects the prompt for a live error; the codec's end_turn arm is not observable.
  assert.deepEqual(projectTurnSettlement({ kind: 'error', error: { message: 'x' } }), { settlement: 'error' });
  // Fork-seed closers never settle an ACP prompt turn (codec.ts:30-33).
  assert.equal(projectTurnSettlement({ kind: 'forked' }), null);
  assert.equal(projectTurnSettlement(undefined), null);
});

test('tool updates match rc.5 update shapes and fail closed on unprojectable content', () => {
  const call = toolCallUpdate({ data: { callId: 'call-1', name: 'analytics_b0_query', arguments: '{"q":1}' } });
  assert.deepEqual(call, {
    sessionUpdate: 'tool_call', toolCallId: 'call-1', title: 'analytics_b0_query',
    kind: 'other', status: 'in_progress', rawInput: { q: 1 },
  });
  assert.equal(toolCallUpdate({ data: { callId: 'c', name: 'n', arguments: 'not-json' } }).rawInput, 'not-json');

  const completed = toolResultUpdate({
    data: {
      message: {
        toolCallId: 'call-1', isError: false,
        content: [{ type: 'text', text: 'ok' }, { type: 'text', text: '' }, { type: 'tool-result', toolCallId: 'call-1' }],
      },
    },
  });
  assert.deepEqual(completed, {
    sessionUpdate: 'tool_call_update', toolCallId: 'call-1', status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: 'ok' } }],
  });
  assert.equal(toolResultUpdate({ data: { message: { toolCallId: 'c', isError: true, content: [] } } }).status, 'failed');
  assert.throws(() => toolResultUpdate({ data: { message: { toolCallId: 'c', content: [{ type: 'image' }] } } }),
    /attachment store/);

  assert.deepEqual(sessionUpdateNotification('sess-1', call), {
    jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess-1', update: call },
  });
});

test('projectSession projects only the generic tool surface and records settlements per turn', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'tool/call', data: { turn: 1, callId: 'c1', name: 'n', arguments: '{}' } },
    { type: 'tool/result', data: { turn: 1, message: { toolCallId: 'c1', isError: false, content: [] } } },
    { type: 'assistant/message', data: { turn: 1, message: { content: [] } } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const projection = projectSession(events);
  assert.deepEqual(projection.updates.map(entry => entry.update.sessionUpdate), ['tool_call', 'tool_call_update']);
  assert.deepEqual(projection.settlements.get(1), { settlement: 'stop', stopReason: 'end_turn' });
  assert.deepEqual(projection.calls.get('c1'), { turn: 1, status: 'completed' });
});

test('classifyTurnEnd allows only the documented collapses and direct translations', () => {
  const settlement = kind => projectTurnSettlement({ kind });
  assert.equal(classifyTurnEnd({ kind: 'completed' }, settlement('completed')), 'EQUAL');
  assert.equal(classifyTurnEnd({ kind: 'max-tokens' }, settlement('max-tokens')), 'EQUAL');
  assert.equal(classifyTurnEnd({ kind: 'error' }, settlement('error')), 'EQUAL');
  assert.equal(classifyTurnEnd({ kind: 'aborted' }, { settlement: 'stop', stopReason: 'end_turn' }), 'EXPECTED_CODEC_COLLAPSE');
  assert.equal(classifyTurnEnd({ kind: 'blocked' }, { settlement: 'stop', stopReason: 'end_turn' }), 'EXPECTED_CODEC_COLLAPSE');
  assert.equal(classifyTurnEnd({ kind: 'interrupted' }, { settlement: 'stop', stopReason: 'cancelled' }), 'EXPECTED_CODEC_COLLAPSE');
  assert.equal(classifyTurnEnd({ kind: 'forked' }, null), 'MISSING_IN_ACP');
  // A direct translation that drifted is not a documented collapse.
  assert.equal(classifyTurnEnd({ kind: 'completed' }, { settlement: 'stop', stopReason: 'cancelled' }), 'UNEXPECTED');
  assert.equal(classifyTurnEnd({ kind: 'blocked' }, { settlement: 'stop', stopReason: 'cancelled' }), 'UNEXPECTED');
  // A future live variant collapses silently in the codec; the harness flags it.
  assert.equal(classifyTurnEnd({ kind: 'not-yet-defined' }, { settlement: 'stop', stopReason: 'end_turn' }), 'UNEXPECTED');
  // A recording cut before turn/end has no terminal fact on either path.
  assert.equal(classifyTurnEnd(undefined, null), 'MISSING_IN_ACP');
});

test('classifyEvidence collapses only the turn outcome and never hides missing ACP evidence', () => {
  const interrupted = { kind: 'interrupted' };
  assert.equal(classifyEvidence({ field: 'turn.outcome', reason: interrupted, legacy: 'FAILED', acp: 'CANCELLED' }), 'EXPECTED_CODEC_COLLAPSE');
  assert.equal(classifyEvidence({ field: 'turn.outcome', reason: { kind: 'blocked' }, legacy: 'NEEDS_INPUT', acp: 'SUCCEEDED' }), 'EXPECTED_CODEC_COLLAPSE');
  assert.equal(classifyEvidence({ field: 'turn.outcome', reason: { kind: 'completed' }, legacy: 'SUCCEEDED', acp: 'SUCCEEDED' }), 'EQUAL');
  assert.equal(classifyEvidence({ field: 'turn.outcome', reason: { kind: 'completed' }, legacy: 'FAILED', acp: 'SUCCEEDED' }), 'UNEXPECTED');
  // Losing a successful call id is never explained by the cancellation collapse.
  assert.equal(classifyEvidence({
    field: 'turn.successful_call_ids', reason: interrupted, legacy: ['call-1'], acp: [],
  }), 'UNEXPECTED');
  assert.equal(classifyEvidence({
    field: 'turn.execution_exited', reason: { kind: 'blocked' }, legacy: false, acp: true,
  }), 'UNEXPECTED');
  assert.equal(classifyEvidence({ field: 'turn.outcome', reason: { kind: 'forked' }, legacy: 'FAILED', acp: null }), 'MISSING_IN_ACP');
  assert.throws(() => classifyEvidence({ field: 'turn.unknown', reason: interrupted, legacy: 1, acp: 1 }), /unknown evidence field/);
});

test('classifyToolStatus is strict about a missing side', () => {
  assert.equal(classifyToolStatus('completed', 'completed'), 'EQUAL');
  assert.equal(classifyToolStatus('failed', 'failed'), 'EQUAL');
  assert.equal(classifyToolStatus('completed', 'failed'), 'UNEXPECTED');
  assert.equal(classifyToolStatus(undefined, 'completed'), 'MISSING_IN_ACP');
  assert.equal(classifyToolStatus('completed', undefined), 'MISSING_IN_ACP');
});

test('a valid report satisfies the stable schema and derived summary', () => {
  const report = buildReport({
    fixtures: ['zeta', 'alpha'],
    shadowDiff: [
      row({ sessionId: 'sess-b', turnId: 2, eventKey: 'turn.reason', legacy: 'completed', acp: 'end_turn' }),
      row({ sessionId: 'sess-a', turnId: 1 }),
      row({ sessionId: 'sess-a', turnId: 1, eventKey: 'turn.reason', legacy: 'interrupted', acp: 'cancelled', classification: 'EXPECTED_CODEC_COLLAPSE' }),
      row({ sessionId: 'sess-a', turnId: 1, eventKey: 'tool_call.c1.status', legacy: 'completed', acp: 'completed' }),
    ],
  });
  assert.equal(validateReport(report), true);
  assert.equal(report.schema_version, SHADOW_DIFF_SCHEMA);
  assert.deepEqual(report.fixtures, ['alpha', 'zeta']);
  // Canonical order: session, turn, turn fields, then tool rows.
  assert.deepEqual(report.shadow_diff.map(entry => entry.eventKey), [
    'turn.reason', 'turn.outcome', 'tool_call.c1.status', 'turn.reason',
  ]);
  assert.equal(report.summary.rows, 4);
  assert.equal(report.summary.classifications.EQUAL, 3);
  assert.equal(report.summary.classifications.EXPECTED_CODEC_COLLAPSE, 1);
  assert.equal(report.summary.severities.high, 0);
  for (const entry of report.shadow_diff) {
    assert.deepEqual(Object.keys(entry).sort(), [...SHADOW_DIFF_KEYS].sort());
    assert.equal(entry.severity, SEVERITY_BY_CLASSIFICATION[entry.classification]);
  }
});

test('buildShadowRow refuses values outside the closed vocabulary', () => {
  assert.throws(() => row({ classification: 'PROBABLY_FINE' }), /classification is unknown/);
  assert.throws(() => row({ eventKey: 'outcome' }), /eventKey/);
  assert.throws(() => row({ turnId: -1 }), /turnId/);
  assert.throws(() => row({ turnId: 1.5 }), /turnId/);
  assert.throws(() => row({ sessionId: '' }), /sessionId/);
  assert.throws(() => row({ legacy: undefined }), /must be a JSON value/);
  assert.throws(() => row({ acp: () => 1 }), /must be a JSON value/);
});

test('validateReport rejects every schema drift instead of passing it', () => {
  const base = () => structuredClone(buildReport({
    fixtures: ['fixture'],
    shadowDiff: [
      row({ eventKey: 'turn.reason', legacy: 'completed', acp: 'end_turn' }),
      row({ eventKey: 'turn.outcome' }),
    ],
  }));

  const wrongSchema = base();
  wrongSchema.schema_version = 'dsh-rc5-shadow-diff/v0';
  assert.throws(() => validateReport(wrongSchema), /schema_version/);

  const badCommit = base();
  badCommit.source.acp.commit = 'deadbeef';
  assert.throws(() => validateReport(badCommit), /40-character commit sha/);

  const missingKey = base();
  delete missingKey.shadow_diff[0].severity;
  assert.throws(() => validateReport(missingKey), /must carry exactly/);

  const extraKey = base();
  extraKey.shadow_diff[0].note = 'extra';
  assert.throws(() => validateReport(extraKey), /must carry exactly/);

  const badSeverity = base();
  badSeverity.shadow_diff[0].severity = 'critical';
  assert.throws(() => validateReport(badSeverity), /severity does not match/);

  const badEventKey = base();
  badEventKey.shadow_diff[0].eventKey = 'turn.whatever';
  assert.throws(() => validateReport(badEventKey), /eventKey/);

  const duplicate = base();
  duplicate.shadow_diff[1] = structuredClone(duplicate.shadow_diff[0]);
  assert.throws(() => validateReport(duplicate), /duplicate row/);

  const unsorted = base();
  unsorted.shadow_diff.reverse();
  assert.throws(() => validateReport(unsorted), /canonical order/);

  const staleSummary = base();
  staleSummary.summary.rows = 99;
  assert.throws(() => validateReport(staleSummary), /summary does not match/);

  const badFixtureName = base();
  badFixtureName.fixtures = ['fixture', 'fixture'];
  assert.throws(() => validateReport(badFixtureName), /unique and sorted/);

  assert.equal(CLASSIFICATIONS.length, 4);
});
