import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  FIXTURE_SCHEMA, compareFixture, loadFixtures, parseArgs, run, validateFixture,
} from './rc5-shadow-compare.mjs';
import { validateReport } from './rc5-shadow-classifier.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES_DIR = join(REPO_ROOT, 'scripts/ci/fixtures/rc5-shadow');
const SCRIPT = join(REPO_ROOT, 'scripts/ci/rc5-shadow-compare.mjs');

async function tempDir(t, prefix = 'rc5-shadow-') {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function fixture(overrides = {}) {
  return {
    schema_version: FIXTURE_SCHEMA,
    name: 'temp',
    description: 'temporary compare fixture',
    sessionId: 'sess-temp',
    intent: { run_id: 'run-temp', attempt_id: 'att-temp' },
    observations: [{ request_id: 'req-temp', execution_exited: true }],
    events: [],
    ...overrides,
  };
}

function cli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('the checked-in corpus covers the required recordings', async () => {
  const fixtures = await loadFixtures(FIXTURES_DIR);
  assert.deepEqual(fixtures.map(entry => entry.name),
    ['cancelled', 'error', 'forked', 'normal-end-turn', 'tool-call']);
  for (const entry of fixtures) {
    assert.equal(validateFixture(entry), true);
    assert.equal(entry.observations.length, 1);
  }
});

test('the corpus compares cleanly with a stable, deterministic report', async t => {
  const dir = await tempDir(t);
  const outPath = join(dir, 'nested', 'shadow-diff.json');
  const report = await run({ fixturesDir: FIXTURES_DIR, outPath });
  assert.equal(validateReport(report), true);
  assert.equal(report.fixtures.length, 5);
  assert.deepEqual(report.summary.classifications,
    { EQUAL: 17, EXPECTED_CODEC_COLLAPSE: 2, MISSING_IN_ACP: 4, UNEXPECTED: 0 });
  assert.deepEqual(report.summary.severities, { none: 17, low: 2, medium: 4, high: 0 });
  assert.equal(report.summary.rows, 23);
  assert.equal(report.summary.unexpected, 0);

  const normal = report.shadow_diff.filter(entry => entry.sessionId === 'sess-shadow-normal');
  assert.deepEqual(normal.map(entry => entry.eventKey),
    ['turn.reason', 'turn.outcome', 'turn.execution_exited', 'turn.successful_call_ids']);
  assert.deepEqual(normal.find(entry => entry.eventKey === 'turn.reason').legacy, 'completed');
  assert.deepEqual(normal.find(entry => entry.eventKey === 'turn.reason').acp, 'end_turn');
  assert.ok(normal.every(entry => entry.classification === 'EQUAL' && entry.severity === 'none'));

  const first = await readFile(outPath, 'utf8');
  await run({ fixturesDir: FIXTURES_DIR, outPath });
  assert.equal(await readFile(outPath, 'utf8'), first, 'report bytes must be deterministic');
});

test('cancellation is the only documented codec collapse in the corpus', async () => {
  const rows = (await loadFixtures(FIXTURES_DIR)).flatMap(compareFixture);
  const collapsed = rows.filter(entry => entry.classification === 'EXPECTED_CODEC_COLLAPSE');
  assert.deepEqual(collapsed.map(entry => `${entry.sessionId}/${entry.turnId}/${entry.eventKey}`), [
    'sess-shadow-cancelled/3/turn.reason',
    'sess-shadow-cancelled/3/turn.outcome',
  ]);
  assert.ok(collapsed.every(entry => entry.severity === 'low'));
  assert.deepEqual(collapsed.map(entry => [entry.legacy, entry.acp]),
    [['interrupted', 'cancelled'], ['FAILED', 'CANCELLED']]);

  const forked = rows.filter(entry => entry.sessionId === 'sess-shadow-forked');
  assert.equal(forked.length, 4);
  assert.ok(forked.every(entry => entry.classification === 'MISSING_IN_ACP' && entry.acp === null));
  assert.ok(forked.every(entry => entry.severity === 'medium'));
});

test('the tool-call corpus keeps the successful call id in both paths', async () => {
  const rows = (await loadFixtures(FIXTURES_DIR)).flatMap(compareFixture);
  const tools = rows.filter(entry => entry.sessionId === 'sess-shadow-tools');
  const successful = tools.find(entry => entry.eventKey === 'turn.successful_call_ids');
  assert.deepEqual(successful.legacy, ['call-shadow-query']);
  assert.deepEqual(successful.acp, ['call-shadow-query']);
  assert.equal(successful.classification, 'EQUAL');
  assert.deepEqual(
    tools.filter(entry => entry.eventKey.startsWith('tool_call.'))
      .map(entry => [entry.eventKey, entry.legacy, entry.acp, entry.classification]),
    [
      ['tool_call.call-shadow-export.status', 'failed', 'failed', 'EQUAL'],
      ['tool_call.call-shadow-query.status', 'completed', 'completed', 'EQUAL'],
    ],
  );
});

test('the CLI writes the schema-valid report and exits 0', async t => {
  const dir = await tempDir(t);
  const outPath = join(dir, 'shadow-diff.json');
  const result = cli(['--fixtures', FIXTURES_DIR, '--out', outPath]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5 fixtures, 23 rows/);
  assert.match(result.stdout, /UNEXPECTED 0/);
  assert.equal(validateReport(JSON.parse(await readFile(outPath, 'utf8'))), true);
});

test('usage failures exit 2 instead of writing a report', async t => {
  const dir = await tempDir(t);
  const missing = cli([]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--fixtures and --out are required/);

  const unknown = cli(['--fixtures', FIXTURES_DIR, '--out', join(dir, 'x.json'), '--wat']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown argument: --wat/);

  const missingValue = cli(['--fixtures']);
  assert.equal(missingValue.status, 2);
  assert.match(missingValue.stderr, /--fixtures requires a value/);

  assert.deepEqual(parseArgs(['--fixtures', 'a', '--out=b', '--summary', 'c']),
    { fixturesDir: 'a', outPath: 'b', summaryPath: 'c', help: false });
});

test('--summary appends a compact CI summary', async t => {
  const dir = await tempDir(t);
  const summary = join(dir, 'summary.md');
  const result = cli(['--fixtures', FIXTURES_DIR, '--out', join(dir, 'diff.json'), '--summary', summary]);
  assert.equal(result.status, 0, result.stderr);
  const text = await readFile(summary, 'utf8');
  assert.match(text, /legacy↔ACP offline shadow compare/);
  assert.match(text, /EXPECTED_CODEC_COLLAPSE 2/);
  assert.match(text, /MISSING_IN_ACP 4/);
});

test('an unexplained field difference fails the run with severity high', async t => {
  const dir = await tempDir(t);
  // Legacy trusts the nested tool-result block; rc.5 trusts message.isError.
  // When a recording disagrees, the successful ids and lifecycle status diverge.
  const drifted = fixture({
    name: 'drifted',
    events: [
      { seq: 0, type: 'turn/start', data: { turn: 1 } },
      { seq: 1, type: 'user/message', data: { id: 'u', source: { kind: 'user', rpcId: 'req-temp' } } },
      { seq: 2, type: 'tool/call', data: { turn: 1, callId: 'call-drift', name: 'n', arguments: '{}' } },
      {
        seq: 3,
        type: 'tool/result',
        data: {
          turn: 1,
          message: {
            toolCallId: 'call-drift', isError: false,
            content: [{ type: 'tool-result', toolCallId: 'call-drift', isError: true }],
          },
        },
      },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  });
  await writeFile(join(dir, 'drifted.json'), JSON.stringify(drifted, null, 2));
  const outPath = join(dir, 'diff.json');
  const result = cli(['--fixtures', dir, '--out', outPath]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /UNEXPECTED 2/);
  const report = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(validateReport(report), true);
  const unexpected = report.shadow_diff.filter(entry => entry.classification === 'UNEXPECTED');
  assert.deepEqual(unexpected.map(entry => entry.eventKey),
    ['turn.successful_call_ids', 'tool_call.call-drift.status']);
  assert.ok(unexpected.every(entry => entry.severity === 'high'));
});

test('a malformed fixture stops the run instead of passing it', async t => {
  const dir = await tempDir(t);
  const broken = fixture({ schema_version: 'dsh-rc5-shadow-fixture/v0' });
  await writeFile(join(dir, 'broken.json'), JSON.stringify(broken, null, 2));
  await assert.rejects(run({ fixturesDir: dir, outPath: join(dir, 'diff.json') }), /schema_version/);
  const result = cli(['--fixtures', dir, '--out', join(dir, 'diff.json')]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /schema_version/);
});

test('validateFixture rejects gaps, duplicate requests and missing provenance', () => {
  const valid = fixture({
    events: [
      { seq: 0, type: 'turn/start', data: { turn: 1 } },
      { seq: 1, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  });
  assert.equal(validateFixture(valid), true);

  const gap = structuredClone(valid);
  gap.events[1].seq = 2;
  assert.throws(() => validateFixture(gap, 'gap.json'), /seq must be 1/);

  const duplicate = structuredClone(valid);
  duplicate.observations = [duplicate.observations[0], { ...duplicate.observations[0] }];
  assert.throws(() => validateFixture(duplicate, 'dup.json'), /duplicate observation/);

  const noDescription = structuredClone(valid);
  delete noDescription.description;
  assert.throws(() => validateFixture(noDescription, 'desc.json'), /description/);
});
