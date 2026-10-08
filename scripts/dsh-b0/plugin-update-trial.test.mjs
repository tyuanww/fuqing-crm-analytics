import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  SCENARIOS, EXPECTED_OUTCOMES, SCENARIO_COVERAGE, aggregateTrial, redactText,
  validateTrialInputs, assertFreshOutput, assertPnpmBinary, handleTrialSignal, installPackage,
} from './plugin-update-trial.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('ten plugin-update scenarios have one exact outcome and do not treat other labels as success', () => {
  assert.equal(SCENARIOS.length, 10);
  assert.equal(new Set(SCENARIOS).size, 10);
  assert.equal(SCENARIOS[7], '08-prepare-reject-restore-old');
  assert.equal(EXPECTED_OUTCOMES[SCENARIOS[7]], 'FAILED_OLD_RESTORED');
  const coverage = SCENARIO_COVERAGE[SCENARIOS[7]];
  assert.equal(coverage.historical_scenario_id, '08-load-failure-restore-old');
  assert.equal(coverage.proves, 'PREPARE_STAGE_REJECTION_AND_OLD_COMPOSITION_RESTORE');
  assert.ok(coverage.does_not_prove.includes('RUNTIME_PLUGIN_LOAD_FAILURE_AFTER_HOST_START'));
  assert.equal(aggregateTrial(SCENARIOS.map(scenario => ({ scenario, status: EXPECTED_OUTCOMES[scenario] }))), 'PASS');
  const unexpected = SCENARIOS.map(scenario => ({ scenario, status: EXPECTED_OUTCOMES[scenario] }));
  unexpected[0] = { scenario: unexpected[0].scenario, status: 'NOT_A_FAILURE' };
  assert.equal(aggregateTrial(unexpected), 'FAIL');
  assert.equal(aggregateTrial(unexpected.slice(1)), 'FAIL');
});

test('relative inputs are rejected before any host or package read', async () => {
  await assert.rejects(validateTrialInputs({
    upstream: 'relative-upstream', output: '/tmp/out', python: '/tmp/python',
    oldCrm: '/tmp/old', knowledge: '/tmp/knowledge', metricsService: '/tmp/metrics',
    knowledgeService: '/tmp/knowledge-service', sdkReceipt: '/tmp/receipt',
  }), /PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED/);
});

test('output directories that already contain evidence are rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-update-output-'));
  try {
    const filled = join(root, 'filled');
    await mkdir(filled);
    await writeFile(join(filled, 'summary.json'), '{}\n');
    await assert.rejects(assertFreshOutput(filled), /PLUGIN_UPDATE_OUTPUT_EXISTS/);
    const empty = join(root, 'empty');
    await mkdir(empty);
    assert.equal(await assertFreshOutput(empty), empty);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('redaction keeps the prepare failure reason and removes credential material', () => {
  const text = redactText('ENOENT lib/host.js token=secret sk-abcdefghij authorization: Bearer hidden', ['/Users/hidden/output']);
  assert.match(text, /ENOENT/);
  assert.match(text, /lib\/host\.js/);
  assert.match(text, /token=\[REDACTED\]/);
  assert.doesNotMatch(text, /secret/);
  assert.doesNotMatch(text, /sk-abcdefghij/);
  assert.match(text, /authorization: \[REDACTED\]/);
});

test('a pnpm binary that prints a different version is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-update-pnpm-'));
  try {
    const bin = join(root, 'pnpm');
    await writeFile(bin, '#!/bin/sh\necho 11.19.0\n', { mode: 0o700 });
    await chmod(bin, 0o700);
    await assert.rejects(assertPnpmBinary(bin, '11.28.2'), /PLUGIN_UPDATE_PNPM_VERSION/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SIGINT aborts the active controllers and signals owned pids', () => {
  const runSignal = new AbortController();
  const currentAbort = new AbortController();
  const state = { ctx: { runSignal, currentAbort, owned: new Set([2147483646]) }, currentAbort: null };
  handleTrialSignal(state, 'SIGINT');
  assert.equal(state.signal, 'SIGINT');
  assert.equal(runSignal.signal.aborted, true);
  assert.equal(currentAbort.signal.aborted, true);
  assert.equal(state.signaled[0].pid, 2147483646);
  assert.equal(state.signaled[0].error, 'ESRCH');
  handleTrialSignal(state, 'SIGTERM');
  assert.equal(state.signal, 'SIGINT');
});

test('archive digest mismatch is rejected before the unpack interpreter runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-update-unpack-'));
  const marker = join(root, 'interpreter-ran');
  try {
    const archive = join(root, 'plugin.tgz');
    const bytes = Buffer.from('not-a-package');
    await writeFile(archive, bytes);
    const python = join(root, 'python');
    await writeFile(python, `#!/bin/sh\nmkdir -p "$3/package"\ntouch ${JSON.stringify(marker)}\n`, { mode: 0o700 });
    await chmod(python, 0o700);
    await mkdir(join(root, 'home'), { mode: 0o700 });
    await mkdir(join(root, 'tmp'), { mode: 0o700 });
    const upstreamModules = join(root, 'upstream/apps/cli/node_modules');
    await mkdir(upstreamModules, { recursive: true });
    const ctx = { python, root, upstream: join(root, 'upstream'), runSignal: new AbortController() };
    await assert.rejects(installPackage(ctx, archive, join(root, 'dest'), ctx.upstream, {
      sha256: 'f'.repeat(64), bytes: bytes.length,
    }), /PLUGIN_UPDATE_ARCHIVE_DIGEST/);
    await assert.rejects(import('node:fs/promises').then(fs => fs.lstat(marker)), { code: 'ENOENT' });
    await installPackage(ctx, archive, join(root, 'dest'), ctx.upstream, { sha256: sha(bytes), bytes: bytes.length });
    await import('node:fs/promises').then(fs => fs.lstat(marker));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
