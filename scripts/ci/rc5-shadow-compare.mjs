#!/usr/bin/env node
/**
 * Offline legacy↔ACP shadow compare (P3-3c, design §3c S-A).
 *
 * Replays a recorded legacy bridge observation (the `session/event` stream the
 * current bridge folds with `native-evidence.mjs`) twice — once through that
 * legacy fold and once through the frozen rc.5 ACP projection copy — and diffs
 * the dispatcher evidence shape field by field. It performs no model call, no
 * transport I/O and no session mutation, so it can run in CI and over any
 * checked-in recording.
 *
 * Usage:
 *   node scripts/ci/rc5-shadow-compare.mjs --fixtures <dir> --out <file>
 *        [--summary <file>]
 *
 * Exit codes: 0 = no UNEXPECTED rows (EXPECTED_CODEC_COLLAPSE/MISSING_IN_ACP
 * are reported in the summary), 1 = at least one UNEXPECTED row, 2 = usage,
 * fixture or report-schema failure.
 */

import { readFile, readdir, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { journalFromEvents, summarizeJournal, evidenceFor } from '../../dsh-plugins/analytics-workbench/src/native-evidence.mjs';
import { projectSession } from './rc5-acp-projection.mjs';
import {
  buildReport, buildShadowRow, classifyEvidence, classifyToolStatus, classifyTurnEnd,
} from './rc5-shadow-classifier.mjs';

/** Fixture schema id; one JSON file is one recorded session. */
export const FIXTURE_SCHEMA = 'dsh-rc5-shadow-fixture/v1';

/**
 * ACP stop reasons that rc.5 can put on the wire. Only the first three are
 * emitted by `turnEndToStopReason`; the rest are legal `StopReason` members and
 * map fail-closed so a future codec arm does not silently become SUCCEEDED.
 */
const ACP_STOP_REASON_OUTCOME = Object.freeze({
  end_turn: 'SUCCEEDED',
  max_tokens: 'FAILED',
  cancelled: 'CANCELLED',
  refusal: 'FAILED',
  max_turn_requests: 'FAILED',
});

const USAGE = `Usage: node scripts/ci/rc5-shadow-compare.mjs --fixtures <dir> --out <file> [--summary <file>]

  --fixtures <dir>   directory of checked-in dsh-rc5-shadow-fixture/v1 JSON files
  --out <file>       write the dsh-rc5-shadow-diff/v1 report here
  --summary <file>   append a markdown summary (GITHUB_STEP_SUMMARY in CI)
  --help             show this message

Exit codes: 0 no UNEXPECTED differences, 1 UNEXPECTED differences, 2 input failure.`;

/**
 * Load and validate every `*.json` fixture in one directory.
 * @param {string} fixturesDir - directory containing fixture files.
 * @returns {Promise<Array<object>>} fixtures sorted by file name.
 */
export async function loadFixtures(fixturesDir) {
  const directory = resolve(fixturesDir);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`cannot read fixtures directory ${directory}: ${error.message}`);
  }
  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) throw new Error(`no *.json fixtures in ${directory}`);

  const fixtures = [];
  const names = new Set();
  for (const file of files) {
    const path = join(directory, file);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw new Error(`${file}: cannot read fixture: ${error.message}`);
    }
    validateFixture(parsed, file);
    if (names.has(parsed.name)) throw new Error(`${file}: duplicate fixture name ${parsed.name}`);
    names.add(parsed.name);
    fixtures.push(parsed);
  }
  return fixtures;
}

/**
 * Validate one fixture before it reaches the fold.
 * @param {unknown} fixture - parsed fixture.
 * @param {string} source - file name for error messages.
 * @returns {true} always true; throws on the first violation.
 */
export function validateFixture(fixture, source = 'fixture') {
  if (!isPlainObject(fixture)) throw new Error(`${source}: fixture must be a JSON object`);
  if (fixture.schema_version !== FIXTURE_SCHEMA) {
    throw new Error(`${source}: schema_version must be ${FIXTURE_SCHEMA}`);
  }
  for (const key of ['name', 'sessionId', 'description']) {
    if (typeof fixture[key] !== 'string' || fixture[key].length === 0) {
      throw new Error(`${source}: ${key} must be a non-empty string`);
    }
  }
  if (!isPlainObject(fixture.intent)) throw new Error(`${source}: intent must be an object`);
  for (const key of ['run_id', 'attempt_id']) {
    if (typeof fixture.intent[key] !== 'string' || fixture.intent[key].length === 0) {
      throw new Error(`${source}: intent.${key} must be a non-empty string`);
    }
  }
  if (!Array.isArray(fixture.observations) || fixture.observations.length === 0) {
    throw new Error(`${source}: observations must be a non-empty array`);
  }
  const requestIds = new Set();
  for (const [index, observation] of fixture.observations.entries()) {
    if (!isPlainObject(observation)) throw new Error(`${source}: observations[${index}] must be an object`);
    if (typeof observation.request_id !== 'string' || observation.request_id.length === 0) {
      throw new Error(`${source}: observations[${index}].request_id must be a non-empty string`);
    }
    if (typeof observation.execution_exited !== 'boolean') {
      throw new Error(`${source}: observations[${index}].execution_exited must be a boolean`);
    }
    if (requestIds.has(observation.request_id)) {
      throw new Error(`${source}: duplicate observation request_id ${observation.request_id}`);
    }
    requestIds.add(observation.request_id);
  }
  if (!Array.isArray(fixture.events) || fixture.events.length === 0) {
    throw new Error(`${source}: events must be a non-empty array`);
  }
  for (const [index, event] of fixture.events.entries()) {
    if (!isPlainObject(event)) throw new Error(`${source}: events[${index}] must be an object`);
    if (event.seq !== index) {
      throw new Error(`${source}: events[${index}].seq must be ${index} (the native journal requires a contiguous log)`);
    }
    if (typeof event.type !== 'string' || event.type.length === 0) {
      throw new Error(`${source}: events[${index}].type must be a non-empty string`);
    }
    if (!isPlainObject(event.data)) throw new Error(`${source}: events[${index}].data must be an object`);
  }
  return true;
}

/**
 * Fold one fixture into compared rows: legacy evidence from the real projection
 * module, ACP evidence from the rc.5 copy, one row per field.
 * @param {object} fixture - validated fixture.
 * @returns {object[]} schema-valid rows.
 */
export function compareFixture(fixture) {
  const journal = journalFromEvents(fixture.events);
  const acp = projectSession(fixture.events);
  const legacyTools = legacyToolStatuses(fixture.events);
  const rows = [];

  for (const observation of fixture.observations) {
    const intent = {
      run_id: fixture.intent.run_id,
      attempt_id: fixture.intent.attempt_id,
      session_id: fixture.sessionId,
      request_id: observation.request_id,
    };
    const summary = summarizeJournal(journal, observation.request_id);
    const legacy = evidenceFor(intent, summary, observation.execution_exited);
    const turnId = Number.isSafeInteger(summary.targetTurn) ? summary.targetTurn : null;
    const reason = summary.reason;
    const settlement = turnId === null ? null : acp.settlements.get(turnId) ?? null;
    const projected = settlement === null ? null : acpEvidence(settlement, completedCallIds(acp, turnId));

    rows.push(buildShadowRow({
      sessionId: fixture.sessionId,
      turnId,
      eventKey: 'turn.reason',
      legacy: reason?.kind ?? null,
      acp: settlementLabel(settlement),
      classification: classifyTurnEnd(reason, settlement),
    }));

    for (const field of ['outcome', 'execution_exited', 'successful_call_ids']) {
      const eventKey = `turn.${field}`;
      // Without a projected settlement there is no ACP evidence record at all;
      // never let a coincidentally equal empty value read as EQUAL.
      const classification = projected === null
        ? 'MISSING_IN_ACP'
        : classifyEvidence({ field: eventKey, reason, legacy: legacy[field], acp: projected[field] });
      rows.push(buildShadowRow({
        sessionId: fixture.sessionId,
        turnId,
        eventKey,
        legacy: legacy[field],
        acp: projected === null ? null : projected[field],
        classification,
      }));
    }
  }

  const callIds = [...new Set([...legacyTools.keys(), ...acp.calls.keys()])].sort((a, b) => a.localeCompare(b));
  for (const callId of callIds) {
    const legacyTool = legacyTools.get(callId);
    const acpTool = acp.calls.get(callId);
    rows.push(buildShadowRow({
      sessionId: fixture.sessionId,
      turnId: acpTool?.turn ?? legacyTool?.turn ?? null,
      eventKey: `tool_call.${callId}.status`,
      legacy: legacyTool?.status ?? null,
      acp: acpTool?.status ?? null,
      classification: classifyToolStatus(legacyTool?.status, acpTool?.status),
    }));
  }

  return rows;
}

/**
 * Compare every fixture in one directory and write the report.
 * @param {{fixturesDir: string, outPath: string}} options - input directory and report path.
 * @returns {Promise<object>} the written report.
 */
export async function run({ fixturesDir, outPath }) {
  const fixtures = await loadFixtures(fixturesDir);
  const rows = fixtures.flatMap(compareFixture);
  const report = buildReport({ fixtures: fixtures.map(fixture => fixture.name), shadowDiff: rows });
  await mkdir(dirname(resolve(outPath)), { recursive: true });
  await writeFile(resolve(outPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

/**
 * Parse the fixed CLI shape.
 * @param {string[]} argv - arguments without `node` and script path.
 * @returns {{fixturesDir?: string, outPath?: string, summaryPath?: string, help: boolean}} options.
 */
export function parseArgs(argv) {
  const options = { fixturesDir: undefined, outPath: undefined, summaryPath: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const match = /^--(fixtures|out|summary)(?:=(.*))?$/.exec(argument);
    if (!match) throw new Error(`unknown argument: ${argument}`);
    const value = match[2] ?? argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${match[1]} requires a value`);
    if (match[1] === 'fixtures') options.fixturesDir = value;
    else if (match[1] === 'out') options.outPath = value;
    else options.summaryPath = value;
  }
  if (!options.help && (!options.fixturesDir || !options.outPath)) {
    throw new Error('--fixtures and --out are required');
  }
  return options;
}

/**
 * CLI entry point.
 * @param {string[]} argv - process arguments.
 * @param {{stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream}} [io] - output sinks.
 * @returns {Promise<number>} process exit code.
 */
export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`rc5 shadow compare: ${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  try {
    const report = await run({ fixturesDir: options.fixturesDir, outPath: options.outPath });
    const { summary } = report;
    io.stdout.write(`rc5 shadow compare: ${report.fixtures.length} fixtures, ${summary.rows} rows — `
      + `EQUAL ${summary.classifications.EQUAL}, `
      + `EXPECTED_CODEC_COLLAPSE ${summary.classifications.EXPECTED_CODEC_COLLAPSE}, `
      + `MISSING_IN_ACP ${summary.classifications.MISSING_IN_ACP}, `
      + `UNEXPECTED ${summary.classifications.UNEXPECTED}\n`);
    io.stdout.write(`wrote ${resolve(options.outPath)}\n`);
    if (options.summaryPath) {
      await appendFile(resolve(options.summaryPath), summaryMarkdown(report, options.outPath), 'utf8');
    }
    return summary.unexpected > 0 ? 1 : 0;
  } catch (error) {
    io.stderr.write(`rc5 shadow compare: ${error.message}\n`);
    return 2;
  }
}

function summaryMarkdown(report, outPath) {
  const { summary } = report;
  return [
    '### rc.5 legacy↔ACP offline shadow compare (non-blocking)',
    '',
    `- fixtures: ${report.fixtures.length} (${report.fixtures.join(', ')})`,
    `- rows: ${summary.rows} — EQUAL ${summary.classifications.EQUAL}, `
      + `EXPECTED_CODEC_COLLAPSE ${summary.classifications.EXPECTED_CODEC_COLLAPSE}, `
      + `MISSING_IN_ACP ${summary.classifications.MISSING_IN_ACP}, `
      + `UNEXPECTED ${summary.classifications.UNEXPECTED}`,
    `- report: \`${outPath}\``,
    '',
  ].join('\n');
}

/** Legacy successful-call projection, verbatim from `native-evidence.mjs:84-89`. */
function legacyToolStatuses(events) {
  const statuses = new Map();
  for (const event of events) {
    if (event.type === 'tool/call' && event.data.callId !== undefined) {
      if (!statuses.has(event.data.callId)) {
        statuses.set(event.data.callId, { turn: event.data.turn ?? null, status: 'in_progress' });
      }
    }
    if (event.type === 'tool/result') {
      for (const block of event.data.message?.content ?? []) {
        if (block?.type !== 'tool-result' || block.toolCallId === undefined) continue;
        // Only an explicit `isError: false` counts as success, exactly like the fold.
        const status = block.isError === true ? 'failed' : block.isError === false ? 'completed' : 'in_progress';
        statuses.set(block.toolCallId, { turn: event.data.turn ?? null, status });
      }
    }
  }
  return statuses;
}

function completedCallIds(acp, turnId) {
  const ids = [];
  for (const [callId, call] of acp.calls) {
    if (call.turn === turnId && call.status === 'completed') ids.push(callId);
  }
  return ids;
}

function acpEvidence(settlement, successfulCallIds) {
  const outcome = settlement.settlement === 'error'
    ? 'FAILED'
    : ACP_STOP_REASON_OUTCOME[settlement.stopReason] ?? 'UNKNOWN';
  return { outcome, execution_exited: true, successful_call_ids: successfulCallIds };
}

function settlementLabel(settlement) {
  if (settlement === null || settlement === undefined) return null;
  return settlement.settlement === 'error' ? 'error' : settlement.stopReason ?? null;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
