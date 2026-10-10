import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { verifyPluginService } from './plugin-service-evidence.mjs';
import { SERVICE_ARTIFACT_INPUTS } from './service-artifact-evidence.mjs';
import { assertServicePromotion, serviceDigest as hash } from './service-compatibility.mjs';
import { readState } from './state.mjs';
import { createServiceArtifactFixture, json, parse, repackServiceFixture } from './test-fixtures/service-artifacts.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
let baseline;
before(async () => {
  baseline = await mkdtemp(join(tmpdir(), 'service-artifact-fixture-'));
  await createServiceArtifactFixture(baseline);
});
after(async () => { if (baseline) await rm(baseline, { recursive: true, force: true }); });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'service-artifact-case-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['candidate', 'pair', 'stages', 'state.json']) await cp(join(baseline, name), join(directory, name), { recursive: true });
  return { directory, candidatePath: join(directory, 'candidate/candidate.json'), evidencePath: join(directory, 'pair/receipt.json'), statePath: join(directory, 'state.json') };
}
async function change(input, mutate) {
  const evidence = await parse(input.evidencePath); mutate(evidence); await json(input.evidencePath, evidence);
}
async function rejectsWithoutWrite(input, error) {
  const previous = await readFile(input.statePath), candidate = await readFile(input.candidatePath);
  await assert.rejects(verifyPluginService(input), error);
  assert.deepEqual(await readFile(input.statePath), previous);
  assert.deepEqual(await readFile(input.candidatePath), candidate);
}

test('service artifact receipt survives a new-process retry without rewriting candidate/journal or allowing activation', async t => {
  const input = await fixture(t), candidateBytes = await readFile(input.candidatePath);
  const first = await verifyPluginService(input);
  assert.equal(first.status, 'LOCAL_SERVICE_ARTIFACTS_VERIFIED');
  assert.equal(first.release_ready, false);
  assert.equal(first.target_host, 'NOT_RUN');
  assert.equal(first.supply_chain, 'NOT_RUN');
  assert.equal(first.activation, 'BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED');
  assert.equal(first.scenario_count, 9);
  const previous = await readFile(input.statePath);
  const retry = await exec(process.execPath, [join(root, 'scripts/dsh.mjs'), 'plugin', 'verify-service',
    '--candidate', input.candidatePath, '--evidence', input.evidencePath, '--state-path', input.statePath], { cwd: root });
  assert.deepEqual(JSON.parse(retry.stdout), first);
  assert.deepEqual(await readFile(input.statePath), previous);
  assert.deepEqual(await readFile(input.candidatePath), candidateBytes);
  const journal = await readState(input.statePath), candidate = JSON.parse(candidateBytes);
  assert.equal(journal.journal.at(-1).status, 'CANDIDATE_SERVICE_ARTIFACTS_VERIFIED');
  await assert.rejects(assertServicePromotion({ journal, marker: { tag: 'fixture', source_sha: candidate.source_sha,
    service_compatibility: candidate.service_compatibility } }), /SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE/);
  assert.deepEqual(await readFile(input.statePath), previous);
});

for (const [name, mutate, error] of [
  ['unknown field', e => { e.override = true; }, /SERVICE_ARTIFACT_EVIDENCE_SHAPE/],
  ['wrong schema', e => { e.schema_version = 'v2'; }, /SERVICE_ARTIFACT_SCHEMA/],
  ['failed pair', e => { e.status = 'FAIL'; }, /SERVICE_ARTIFACT_NOT_PASS/],
  ['false production claim', e => { e.release_ready = true; }, /SERVICE_ARTIFACT_FALSE_RELEASE_CLAIM/],
  ['wrong scope', e => { e.scope = 'wsl-production'; }, /SERVICE_ARTIFACT_SCOPE/],
  ['wrong activation', e => { e.activation = 'READY'; }, /SERVICE_ARTIFACT_ACTIVATION/],
  ['different source pair', e => { e.baseline = 'f'.repeat(40); }, /SERVICE_ARTIFACT_SOURCE_PAIR_MISMATCH/],
  ['shared dependencies', e => { e.runtime_mode = 'shared'; }, /SERVICE_ARTIFACT_RUNTIME_MODE/],
  ['missing scenario', e => { e.observations.pop(); }, /SERVICE_ARTIFACT_OBSERVATIONS/],
  ['changed read-only database', e => { e.observations[2].database_unchanged = false; }, /SERVICE_ARTIFACT_OBSERVATIONS/],
  ['duplicate scenario', e => { e.observations[1] = e.observations[0]; }, /SERVICE_ARTIFACT_OBSERVATIONS/],
  ['old writable rollback claim', e => { e.compatibility.candidate_state_old_writes = 'PASS'; }, /SERVICE_ARTIFACT_COMPATIBILITY_MISMATCH/],
  ['stale verifier', e => { e.verifiers[SERVICE_ARTIFACT_INPUTS[0]] = '0'.repeat(64); }, /SERVICE_ARTIFACT_VERIFIER_DRIFT/],
  ['wrong package source', e => { e.artifacts.candidate.service_source.commit = e.baseline; }, /SERVICE_ARTIFACT_SOURCE_PAIR_MISMATCH/],
  ['changed recipe', e => { e.artifacts.candidate.source.inputs_sha256 = '0'.repeat(64); }, /SERVICE_ARTIFACT_RECIPE_DRIFT/],
  ['unknown package field', e => { e.artifacts.baseline.override = true; }, /SERVICE_ARTIFACT_PACK_SHAPE/],
  ['dependency drift', e => { e.artifacts.candidate.installed.dependencies.fastapi = '9.9.9'; }, /SERVICE_ARTIFACT_DEPENDENCIES_MISMATCH/],
  ['missing wheel', e => { delete e.artifacts.candidate.installed.wheels.fastapi; }, /SERVICE_ARTIFACT_WHEELS_MISMATCH/],
  ['wheel path escape', e => { e.artifacts.candidate.installed.wheels.fastapi.file = '../outside.whl'; }, /SERVICE_ARTIFACT_WHEEL_NAME/],
  ['unhashed wheel', e => { e.artifacts.candidate.installed.wheels.fastapi.sha256 = 'unknown'; }, /SERVICE_ARTIFACT_WHEEL_DIGEST/],
  ['wrong interpreter', e => { e.artifacts.candidate.installed.python = '3.13.0'; }, /SERVICE_ARTIFACT_PYTHON_MISMATCH/],
]) test('rejects ' + name + ' before journal write', async t => {
  const input = await fixture(t); await change(input, mutate); await rejectsWithoutWrite(input, error);
});

test('checks both service archives and the selected plugin bytes', async t => {
  for (const label of ['baseline', 'candidate', 'plugin']) {
    const input = await fixture(t), evidence = await parse(input.evidencePath), candidate = await parse(input.candidatePath);
    const path = label === 'plugin' ? join(input.directory, 'candidate', candidate.pack.name)
      : join(input.directory, 'pair', label, evidence.artifacts[label].artifact);
    const bytes = await readFile(path); bytes[0] ^= 1; await writeFile(path, bytes);
    await rejectsWithoutWrite(input, label === 'plugin' ? /PLUGIN_SERVICE_PACK_DIGEST/ : /SERVICE_ARTIFACT_ARCHIVE_DIGEST/);
  }
});

test('repacking modified business code with fresh checksums still fails source-proof binding', async t => {
  const input = await fixture(t), name = 'backend/services/analytics/first_purchase/saved.py';
  const manifestPath = join(input.directory, 'stages/candidate/service-manifest.json'), manifest = await parse(manifestPath);
  const bytes = Buffer.from('# modified after observation\n');
  await writeFile(join(input.directory, 'stages/candidate', name), bytes);
  manifest.files[name] = { ...manifest.files[name], sha256: hash(bytes), bytes: bytes.length };
  await json(manifestPath, manifest); await repackServiceFixture(input.directory, 'candidate');
  await rejectsWithoutWrite(input, /SERVICE_ARTIFACT_SOURCE_CONTENT_MISMATCH/);
});

test('updated sidecar receipt/manifest cannot conceal a different manifest inside the archive', async t => {
  const input = await fixture(t), base = join(input.directory, 'pair/candidate');
  const manifest = await parse(join(base, 'service-manifest.json'));
  manifest.source.worktree_dirty = false;
  await json(join(base, 'service-manifest.json'), manifest);
  const receipt = await parse(join(base, 'candidate-receipt.json'));
  receipt.source = manifest.source; receipt.manifest_sha256 = hash(await readFile(join(base, 'service-manifest.json')));
  await json(join(base, 'candidate-receipt.json'), receipt);
  await change(input, e => { e.artifacts.candidate = { ...receipt, installed: e.artifacts.candidate.installed }; });
  await rejectsWithoutWrite(input, /SERVICE_ARTIFACT_EMBEDDED_MANIFEST/);
});

test('package file allowlist rejects an extra file even with a freshly packed archive', async t => {
  const input = await fixture(t), stage = join(input.directory, 'stages/candidate');
  const manifest = await parse(join(stage, 'service-manifest.json')), bytes = Buffer.from('unexpected');
  manifest.files['extra.py'] = { source: 'extra.py', role: 'code', bytes: bytes.length, sha256: hash(bytes) };
  await writeFile(join(stage, 'extra.py'), bytes); await json(join(stage, 'service-manifest.json'), manifest);
  await repackServiceFixture(input.directory, 'candidate');
  await rejectsWithoutWrite(input, /SERVICE_ARTIFACT_MANIFEST_FILES/);
});

test('rejects oversized, FIFO and linked evidence without hanging', async t => {
  const input = await fixture(t), actual = input.evidencePath;
  const huge = join(input.directory, 'huge.json'); await writeFile(huge, Buffer.alloc(1024 * 1024 + 1));
  await rejectsWithoutWrite({ ...input, evidencePath: huge }, /SERVICE_ARTIFACT_FILE_INVALID/);
  const fifo = join(input.directory, 'fifo'); execFileSync('mkfifo', [fifo], { cwd: input.directory });
  await rejectsWithoutWrite({ ...input, evidencePath: fifo }, /SERVICE_ARTIFACT_FILE_INVALID/);
  const link = join(input.directory, 'receipt-link'); await symlink(actual, link);
  await rejectsWithoutWrite({ ...input, evidencePath: link }, { code: 'ELOOP' });
  await rm(join(input.directory, 'pair/baseline'), { recursive: true });
  await symlink(join(baseline, 'pair/baseline'), join(input.directory, 'pair/baseline'));
  await rejectsWithoutWrite(input, /SERVICE_ARTIFACT_SYMLINK/);
});

test('rejects missing journal and changed profile/candidate without minting an observation', async t => {
  const input = await fixture(t), absent = join(input.directory, 'absent.json');
  await assert.rejects(verifyPluginService({ ...input, statePath: absent }), /PLUGIN_SERVICE_NOT_PREPARED/);
  await assert.rejects(readFile(absent), { code: 'ENOENT' });
  const candidate = await parse(input.candidatePath);
  candidate.service_compatibility.binding.access = 'read-only'; await json(input.candidatePath, candidate);
  await rejectsWithoutWrite(input, /PLUGIN_SERVICE_CANDIDATE_DIGEST/);
  await cp(join(baseline, 'candidate/candidate.json'), input.candidatePath);
  await writeFile(join(input.directory, 'candidate/profile.json'), '{}');
  await rejectsWithoutWrite(input, /PLUGIN_SERVICE_PROFILE_DIGEST/);
});

test('CLI documents local-only service checks and rejects duplicate or unknown switches', async () => {
  const cli = join(root, 'scripts/dsh.mjs');
  assert.match((await exec(process.execPath, [cli, 'plugin', '--help'], { cwd: root })).stdout, /verify-service.*candidate[\s\S]*BLOCKED/);
  for (const [args, error] of [[['--force', 'yes'], /PLUGIN_OPTION_UNKNOWN/],
    [['--candidate', '/tmp/a', '--candidate', '/tmp/b'], /PLUGIN_OPTION_DUPLICATE/]]) {
    await assert.rejects(exec(process.execPath, [cli, 'plugin', 'verify-service', ...args], { cwd: root }), e => e.code === 2 && error.test(e.stderr));
  }
});

test('review: rejects a prepared cache entry absent from the durable journal', async t => {
  const input = await fixture(t), state = await parse(input.statePath);
  state.journal = []; state.updated_at = null;
  await json(input.statePath, state);
  await rejectsWithoutWrite(input, /PLUGIN_SERVICE_PREPARED_NOT_DURABLE/);
});

test('review: replaced journal during artifact verification cannot acquire an orphan success event', async t => {
  const input = await fixture(t), bin = join(input.directory, 'bin'), marker = join(input.directory, 'replaced');
  const python = (await exec('python3', ['-c', 'import sys; print(sys.executable)'], { cwd: input.directory })).stdout.trim();
  await mkdir(bin);
  const replacement = { schema_version: 'release-state/v2', phase: null, phase_status: 'IDLE',
    release_tag: null, journal: [], idempotency: {}, updated_at: null };
  const bytes = JSON.stringify(replacement) + '\n';
  const wrapper = `#!${python}\nimport os, sys\nfrom pathlib import Path\nmarker = Path(${JSON.stringify(marker)})\nif not marker.exists():\n Path(${JSON.stringify(input.statePath)}).write_text(${JSON.stringify(bytes)})\n marker.write_text('replaced')\nos.execv(sys.executable, [sys.executable, *sys.argv[1:]])\n`;
  await writeFile(join(bin, 'python3'), wrapper); await chmod(join(bin, 'python3'), 0o700);
  const command = [join(root, 'scripts/dsh.mjs'), 'plugin', 'verify-service', '--candidate', input.candidatePath,
    '--evidence', input.evidencePath, '--state-path', input.statePath];
  await assert.rejects(exec(process.execPath, command, { cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }),
    error => error.code === 2 && /RELEASE_EVENT_PREREQUISITE_CHANGED/.test(error.stderr));
  assert.deepEqual(await parse(input.statePath), replacement);
  assert.equal(await readFile(marker, 'utf8'), 'replaced');
});

test('review: FIFO state path fails promptly instead of hanging the CLI', async t => {
  const input = await fixture(t), fifo = join(input.directory, 'state-fifo');
  execFileSync('mkfifo', [fifo], { cwd: input.directory });
  await assert.rejects(exec(process.execPath, [join(root, 'scripts/dsh.mjs'), 'plugin', 'verify-service',
    '--candidate', input.candidatePath, '--evidence', input.evidencePath, '--state-path', fifo],
  { cwd: root, timeout: 1500, killSignal: 'SIGKILL' }), error => error.code === 2 && /RELEASE_STATE_FILE_INVALID/.test(error.stderr));
});

test('review: invalid service evidence never echoes supplied values into CLI logs', async t => {
  const input = await fixture(t), sentinel = 'SYNTHETIC_PRIVATE_VALUE_REVIEW';
  await change(input, e => { e.artifacts.candidate.installed.dependencies.fastapi = sentinel; });
  await assert.rejects(exec(process.execPath, [join(root, 'scripts/dsh.mjs'), 'plugin', 'verify-service',
    '--candidate', input.candidatePath, '--evidence', input.evidencePath, '--state-path', input.statePath], { cwd: root }), error => {
    assert.equal(error.code, 2);
    assert.equal(error.stdout, '');
    assert.equal(error.stderr, 'DSH_ERROR SERVICE_ARTIFACT_DEPENDENCIES_MISMATCH\n');
    assert.ok(!error.stderr.includes(sentinel));
    return true;
  });
});
