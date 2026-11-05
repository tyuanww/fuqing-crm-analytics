/**
 * Classification and schema for the offline legacy↔ACP `shadow_diff` report.
 *
 * One row compares exactly one field of the dispatcher evidence shape that the
 * design diffs (`/tmp/p3-3-design.md` §3c): the turn's terminal reason, then
 * `{outcome, execution_exited, successful_call_ids}`, plus one status row per
 * observed tool call. The classification vocabulary is closed:
 *
 * - `EQUAL` — both paths agree, including the direct codec translations
 *   (`completed -> end_turn`, `max-tokens -> max_tokens`, and `error` settling
 *   as a JSON-RPC error rather than a stop reason).
 * - `EXPECTED_CODEC_COLLAPSE` — only the collapses codec.ts documents:
 *   `blocked -> end_turn` (NEEDS_INPUT lost), `aborted -> end_turn`
 *   (CANCELLED indistinguishable from completion), `interrupted -> cancelled`
 *   (a crash orphan looks like a user cancel). Only the turn outcome may
 *   differ under a collapse; execution/tool evidence must still match.
 * - `MISSING_IN_ACP` — the legacy observation contains a fact this projection
 *   cannot produce at all (a `forked` fork-seed closer, which is never a live
 *   prompt turn, or a tool lifecycle with no ACP update/turn).
 * - `UNEXPECTED` — anything not explained by the table above, including drift
 *   between the projection copy and the recorded stream.
 *
 * Severity is fixed per classification so the report is reviewable without a
 * second lookup: `none` / `low` / `medium` / `high`.
 */

import { isDeepStrictEqual } from 'node:util';
import { ACP_SOURCE_REFS, projectTurnSettlement } from './rc5-acp-projection.mjs';

/** Stable schema id of the emitted report. */
export const SHADOW_DIFF_SCHEMA = 'dsh-rc5-shadow-diff/v1';

/** Closed classification vocabulary, in review order. */
export const CLASSIFICATIONS = Object.freeze([
  'EQUAL',
  'EXPECTED_CODEC_COLLAPSE',
  'MISSING_IN_ACP',
  'UNEXPECTED',
]);

/** Fixed severity per classification: no per-row judgement calls. */
export const SEVERITY_BY_CLASSIFICATION = Object.freeze({
  EQUAL: 'none',
  EXPECTED_CODEC_COLLAPSE: 'low',
  MISSING_IN_ACP: 'medium',
  UNEXPECTED: 'high',
});

/** Exactly the fields every `shadow_diff` row carries; enforced by validateReport. */
export const SHADOW_DIFF_KEYS = Object.freeze([
  'sessionId',
  'turnId',
  'eventKey',
  'legacy',
  'acp',
  'classification',
  'severity',
]);

/** Turn-level comparison keys, in emission order. */
export const TURN_EVENT_KEYS = Object.freeze([
  'turn.reason',
  'turn.outcome',
  'turn.execution_exited',
  'turn.successful_call_ids',
]);

const EVENT_KEY_PATTERN = /^(?:turn\.(?:reason|outcome|execution_exited|successful_call_ids)|tool_call\.[^/?#\s]+\.status)$/;

/**
 * Reviewed mapping table. `EQUAL` here means the codec's direct translation or
 * the client-visible error settlement; only the three collapses are allowed to
 * change evidence. Every other `TurnEndReason.kind` is `UNEXPECTED`.
 */
const TURN_END_POLICY = Object.freeze({
  completed: 'EQUAL',
  'max-tokens': 'EQUAL',
  error: 'EQUAL',
  aborted: 'EXPECTED_CODEC_COLLAPSE',
  blocked: 'EXPECTED_CODEC_COLLAPSE',
  interrupted: 'EXPECTED_CODEC_COLLAPSE',
  forked: 'MISSING_IN_ACP',
});

/** Evidence fields that a documented codec collapse is allowed to change. */
const COLLAPSE_EVIDENCE_FIELDS = new Set(['turn.outcome']);

/** Stable report header; versioned with the schema. */
export const SHADOW_DIFF_SOURCE = Object.freeze({
  harness: 'scripts/ci/rc5-shadow-compare.mjs',
  legacy: 'dsh-plugins/analytics-workbench/src/native-evidence.mjs:93-103,192-205,254-269',
  acp: ACP_SOURCE_REFS,
});

/**
 * Classify one turn-ending comparison.
 * @param {{kind: string}|undefined} reason - recorded harness turn outcome.
 * @param {{settlement: string, stopReason?: string}|null} settlement - projected ACP settlement.
 * @returns {string} one of {@link CLASSIFICATIONS}.
 */
export function classifyTurnEnd(reason, settlement) {
  if (!reason || typeof reason.kind !== 'string') {
    // A recorded stream cut before turn/end has no terminal fact on either path.
    return settlement === null || settlement === undefined ? 'MISSING_IN_ACP' : 'UNEXPECTED';
  }
  if (!sameSettlement(projectTurnSettlement(reason), settlement)) return 'UNEXPECTED';
  return TURN_END_POLICY[reason.kind] ?? 'UNEXPECTED';
}

/**
 * Classify one evidence field against the recorded turn ending.
 * @param {{field: string, reason: object, legacy: unknown, acp: unknown}} row - comparison inputs.
 * @returns {string} one of {@link CLASSIFICATIONS}.
 */
export function classifyEvidence({ field, reason, legacy, acp }) {
  if (!TURN_EVENT_KEYS.includes(field)) throw new Error(`unknown evidence field: ${String(field)}`);
  const expected = projectTurnSettlement(reason);
  // No ACP settlement exists for this turn (a fork-seed closer): every legacy
  // evidence fact is missing rather than coincidentally equal to an empty value.
  if (expected === null) return 'MISSING_IN_ACP';
  if (isDeepStrictEqual(legacy, acp)) return 'EQUAL';
  if (COLLAPSE_EVIDENCE_FIELDS.has(field)
    && TURN_END_POLICY[reason?.kind] === 'EXPECTED_CODEC_COLLAPSE') {
    return 'EXPECTED_CODEC_COLLAPSE';
  }
  return 'UNEXPECTED';
}

/**
 * Classify one tool lifecycle status.
 * @param {string|undefined} legacy - status derived from the legacy fold's input events.
 * @param {string|undefined} acp - status from the projected `tool_call_update`.
 * @returns {string} one of {@link CLASSIFICATIONS}.
 */
export function classifyToolStatus(legacy, acp) {
  if (legacy === undefined || legacy === null || acp === undefined || acp === null) return 'MISSING_IN_ACP';
  return legacy === acp ? 'EQUAL' : 'UNEXPECTED';
}

/**
 * Build one schema-valid row.
 * @param {{sessionId: string, turnId: number|null, eventKey: string, legacy: unknown, acp: unknown, classification: string}} input - row values.
 * @returns {object} frozen `shadow_diff` row.
 */
export function buildShadowRow({ sessionId, turnId, eventKey, legacy, acp, classification }) {
  assertNonEmptyString(sessionId, 'sessionId');
  if (turnId !== null && !(Number.isSafeInteger(turnId) && turnId >= 0)) {
    throw new Error(`shadow_diff turnId must be a non-negative integer or null: ${String(turnId)}`);
  }
  if (!EVENT_KEY_PATTERN.test(String(eventKey))) {
    throw new Error(`shadow_diff eventKey is not in the stable vocabulary: ${String(eventKey)}`);
  }
  if (!CLASSIFICATIONS.includes(classification)) {
    throw new Error(`shadow_diff classification is unknown: ${String(classification)}`);
  }
  assertJsonValue(legacy, `${eventKey}.legacy`);
  assertJsonValue(acp, `${eventKey}.acp`);
  return Object.freeze({
    sessionId,
    turnId,
    eventKey,
    legacy,
    acp,
    classification,
    severity: SEVERITY_BY_CLASSIFICATION[classification],
  });
}

/**
 * Assemble and validate the stable report.
 * @param {{fixtures: string[], shadowDiff: object[]}} input - fixture names and rows.
 * @returns {object} immutable report.
 */
export function buildReport({ fixtures, shadowDiff }) {
  const names = [...new Set(fixtures)].sort((a, b) => a.localeCompare(b));
  const rows = [...shadowDiff].sort(compareRows);
  const report = {
    schema_version: SHADOW_DIFF_SCHEMA,
    source: SHADOW_DIFF_SOURCE,
    fixtures: names,
    summary: summarize(rows),
    shadow_diff: rows,
  };
  // Refuse to emit anything the schema rejects; a silently malformed report is
  // worse than a failed shadow run.
  validateReport(report);
  return Object.freeze(report);
}

/**
 * Validate one report object, including its derived summary and ordering.
 * @param {unknown} report - candidate report.
 * @returns {true} always true; throws on the first violation.
 */
export function validateReport(report) {
  if (!isPlainObject(report)) throw new Error('report must be an object');
  if (report.schema_version !== SHADOW_DIFF_SCHEMA) {
    throw new Error(`report.schema_version must be ${SHADOW_DIFF_SCHEMA}`);
  }
  validateSource(report.source);
  if (!Array.isArray(report.fixtures) || report.fixtures.length === 0) {
    throw new Error('report.fixtures must be a non-empty array');
  }
  for (const name of report.fixtures) assertNonEmptyString(name, 'report.fixtures[]');
  const sortedNames = [...report.fixtures].sort((a, b) => a.localeCompare(b));
  if (!isDeepStrictEqual(report.fixtures, sortedNames)
    || new Set(report.fixtures).size !== report.fixtures.length) {
    throw new Error('report.fixtures must be unique and sorted');
  }
  if (!Array.isArray(report.shadow_diff)) throw new Error('report.shadow_diff must be an array');
  const seen = new Set();
  for (const [index, row] of report.shadow_diff.entries()) {
    validateRow(row, `report.shadow_diff[${index}]`);
    const identity = `${row.sessionId}\u0000${String(row.turnId)}\u0000${row.eventKey}`;
    if (seen.has(identity)) throw new Error(`report.shadow_diff has a duplicate row: ${row.sessionId}/${row.turnId}/${row.eventKey}`);
    seen.add(identity);
    if (index > 0 && compareRows(report.shadow_diff[index - 1], row) > 0) {
      throw new Error(`report.shadow_diff is not in canonical order at index ${index}`);
    }
  }
  const expected = summarize(report.shadow_diff);
  if (!isDeepStrictEqual(report.summary, expected)) {
    throw new Error('report.summary does not match report.shadow_diff');
  }
  return true;
}

/**
 * Canonical row order: session, turn, then turn fields before tool rows.
 * @param {object} a - left row.
 * @param {object} b - right row.
 * @returns {number} comparator result.
 */
export function compareRows(a, b) {
  const session = String(a.sessionId).localeCompare(String(b.sessionId));
  if (session !== 0) return session;
  // A turn-less observation sorts after numbered turns.
  const leftTurn = a.turnId === null ? Number.MAX_SAFE_INTEGER : a.turnId;
  const rightTurn = b.turnId === null ? Number.MAX_SAFE_INTEGER : b.turnId;
  if (leftTurn !== rightTurn) return leftTurn - rightTurn;
  const rank = fieldRank(a.eventKey) - fieldRank(b.eventKey);
  if (rank !== 0) return rank;
  return String(a.eventKey).localeCompare(String(b.eventKey));
}

function fieldRank(eventKey) {
  const index = TURN_EVENT_KEYS.indexOf(eventKey);
  return index < 0 ? TURN_EVENT_KEYS.length + 1 : index;
}

function summarize(rows) {
  const classifications = Object.fromEntries(CLASSIFICATIONS.map(name => [name, 0]));
  const severities = { none: 0, low: 0, medium: 0, high: 0 };
  for (const row of rows) {
    classifications[row.classification] += 1;
    severities[row.severity] += 1;
  }
  return {
    rows: rows.length,
    classifications,
    severities,
    unexpected: classifications.UNEXPECTED,
    missing: classifications.MISSING_IN_ACP,
  };
}

function validateSource(source) {
  if (!isPlainObject(source)) throw new Error('report.source must be an object');
  assertNonEmptyString(source.harness, 'report.source.harness');
  assertNonEmptyString(source.legacy, 'report.source.legacy');
  if (!isPlainObject(source.acp)) throw new Error('report.source.acp must be an object');
  if (!/^[0-9a-f]{40}$/.test(String(source.acp.commit))) {
    throw new Error('report.source.acp.commit must be a full 40-character commit sha');
  }
  for (const key of ['updates', 'codec', 'settlement', 'notification', 'content']) {
    assertNonEmptyString(source.acp[key], `report.source.acp.${key}`);
  }
  if (!isDeepStrictEqual(source.acp, ACP_SOURCE_REFS)) {
    throw new Error('report.source.acp does not match the pinned projection provenance');
  }
}

function validateRow(row, path) {
  if (!isPlainObject(row)) throw new Error(`${path} must be an object`);
  const keys = Object.keys(row).sort();
  const expected = [...SHADOW_DIFF_KEYS].sort();
  if (!isDeepStrictEqual(keys, expected)) {
    throw new Error(`${path} must carry exactly ${SHADOW_DIFF_KEYS.join(', ')}`);
  }
  assertNonEmptyString(row.sessionId, `${path}.sessionId`);
  if (row.turnId !== null && !(Number.isSafeInteger(row.turnId) && row.turnId >= 0)) {
    throw new Error(`${path}.turnId must be a non-negative integer or null`);
  }
  if (!EVENT_KEY_PATTERN.test(String(row.eventKey))) {
    throw new Error(`${path}.eventKey is not in the stable vocabulary`);
  }
  assertJsonValue(row.legacy, `${path}.legacy`);
  assertJsonValue(row.acp, `${path}.acp`);
  if (!CLASSIFICATIONS.includes(row.classification)) {
    throw new Error(`${path}.classification is unknown: ${String(row.classification)}`);
  }
  if (row.severity !== SEVERITY_BY_CLASSIFICATION[row.classification]) {
    throw new Error(`${path}.severity does not match classification ${row.classification}`);
  }
}

function sameSettlement(expected, actual) {
  if (expected === null || actual === null || actual === undefined) {
    return (expected ?? null) === (actual ?? null);
  }
  if (!isPlainObject(expected) || !isPlainObject(actual)) return false;
  if (expected.settlement !== actual.settlement) return false;
  if (expected.settlement === 'error') return true;
  return expected.stopReason === actual.stopReason;
}

function assertNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} must be a non-empty string`);
}

/** JSON-only values keep the report byte-stable and free of accidental functions. */
function assertJsonValue(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${path}.${key}`);
    return;
  }
  throw new Error(`${path} must be a JSON value: ${typeof value}`);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
