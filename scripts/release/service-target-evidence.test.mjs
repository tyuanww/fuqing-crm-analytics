import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { verifyPluginService } from './plugin-service-evidence.mjs';
import { assertServicePromotion, serviceDigest as hash } from './service-compatibility.mjs';
import { readState } from './state.mjs';
import { TARGET_RUNNER_SHA256 } from './service-target-evidence.mjs';
import { createServiceArtifactFixture, json, parse } from './test-fixtures/service-artifacts.mjs';
import { createTargetFixture, refreshTargetInput, refreshTargetReceipt } from './test-fixtures/service-target.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
let baseline;
before(async () => {
  baseline = await mkdtemp(join(tmpdir(), 'target-evidence-fixture-'));
  await createServiceArtifactFixture(baseline); await createTargetFixture(baseline);
});
after(async () => { if (baseline) await rm(baseline, { recursive: true, force: true }); });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'target-evidence-case-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['candidate', 'pair', 'state.json', 'target-input', 'target-result'])
    await cp(join(baseline, name), join(directory, name), { recursive: true });
  return { directory, candidatePath: join(directory, 'candidate/candidate.json'), evidencePath: join(directory, 'pair/receipt.json'),
    statePath: join(directory, 'state.json'), targetEvidencePath: join(directory, 'target-result/receipt.json'),
    targetInputPath: join(directory, 'target-input/input-manifest.json') };
}
async function change(path, mutate) { const value = await parse(path); mutate(value); await json(path, value); }
async function rejectsWithoutWrite(input, pattern) {
  const state = await readFile(input.statePath), candidate = await readFile(input.candidatePath);
  await assert.rejects(verifyPluginService(input), pattern);
  assert.deepEqual(await readFile(input.statePath), state);
  assert.deepEqual(await readFile(input.candidatePath), candidate);
}
const args = input => [join(root, 'scripts/dsh.mjs'), 'plugin', 'verify-service',
  '--candidate', input.candidatePath, '--evidence', input.evidencePath, '--state-path', input.statePath,
  '--target-evidence', input.targetEvidencePath, '--target-input', input.targetInputPath];

test('WSL observation appends after artifact event; a process retry is byte-idempotent and promotion remains blocked', async t => {
  const input = await fixture(t), candidate = await readFile(input.candidatePath);
  assert.equal(hash(await readFile(join(root, 'scripts/release/test-fixtures/target-acceptance-20261006.py'))), TARGET_RUNNER_SHA256);
  const result = await verifyPluginService(input);
  assert.equal(result.status, 'LOCAL_WSL_SYNTHETIC_SERVICE_OBSERVATION_VERIFIED');
  assert.equal(result.scenario_count, 14);
  assert.equal(result.evidence_authenticity, 'UNATTESTED_OPERATOR_OBSERVATION');
  assert.equal(result.candidate_policy, 'SYNTHETIC_A64_ONLY');
  assert.equal(result.release_ready, false); assert.equal(result.activation, 'BLOCKED');
  assert.equal(result.production_identity, 'NOT_RUN'); assert.equal(result.supply_chain, 'NOT_RUN');
  const prior = await readFile(input.statePath), state = await readState(input.statePath);
  assert.equal(state.journal.at(-1).status, 'CANDIDATE_SERVICE_TARGET_OBSERVED');
  assert.equal(state.journal.at(-2).status, 'CANDIDATE_SERVICE_ARTIFACTS_VERIFIED');
  assert.deepEqual(state.journal.at(-1).service_artifact_event, { seq: state.journal.at(-2).seq, digest: state.journal.at(-2).digest });
  const retry = await exec(process.execPath, args(input), { cwd: root });
  assert.deepEqual(JSON.parse(retry.stdout), result);
  assert.deepEqual(await readFile(input.statePath), prior);
  assert.deepEqual(await readFile(input.candidatePath), candidate);
  await assert.rejects(assertServicePromotion({ journal: state, marker: { tag: 'fixture',
    source_sha: JSON.parse(candidate).source_sha, service_compatibility: JSON.parse(candidate).service_compatibility } }),
  /SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE/);
});

test('a previously recorded artifact event is reused, then the target observation is appended', async t => {
  const input = await fixture(t);
  const artifact = await verifyPluginService({ ...input, targetEvidencePath: undefined, targetInputPath: undefined });
  const result = await verifyPluginService(input);
  assert.equal(result.service_artifact_journal_seq, artifact.journal_seq);
  assert.equal(result.journal_seq, artifact.journal_seq + 1);
});

for (const [name, mutate, error] of [
  ['unknown field', e => { e.extra = true; }, /SERVICE_TARGET_RECEIPT_SHAPE/],
  ['failed run', e => { e.status = 'FAIL'; }, /SERVICE_TARGET_RECEIPT_NOT_PASS/],
  ['production claim', e => { e.release_ready = true; }, /SERVICE_TARGET_FALSE_RELEASE_CLAIM/],
  ['scope inflation', e => { e.scope = 'production'; }, /SERVICE_TARGET_RECEIPT_SCOPE/],
  ['attestation inflation', e => { e.supply_chain = 'PASS'; }, /SERVICE_TARGET_UNVERIFIED_CLAIM/],
  ['wrong source', e => { e.artifacts.candidate.service_source.commit = 'f'.repeat(40); }, /SERVICE_TARGET_SOURCE_MISMATCH/],
  ['wrong archive', e => { e.artifacts.baseline.archive_sha256 = 'f'.repeat(64); }, /SERVICE_TARGET_ARTIFACT_MISMATCH/],
  ['wrong installed version', e => { e.artifacts.baseline.installed.fastapi = '0.0.0'; }, /SERVICE_TARGET_DEPENDENCIES/],
  ['missing case', e => { e.observations.pop(); }, /SERVICE_TARGET_OBSERVATIONS/],
  ['duplicate case', e => { e.observations[3] = e.observations[2]; }, /SERVICE_TARGET_OBSERVATIONS/],
  ['missing crash', e => { e.processes[1].exit_code = 0; }, /SERVICE_TARGET_PROCESS_EXIT/],
  ['owned process alive', e => { e.processes[0].stopped = false; }, /SERVICE_TARGET_PROCESSES/],
  ['duplicate pid', e => { e.processes[1].pid = e.processes[0].pid; }, /SERVICE_TARGET_PROCESSES/],
  ['wrong identity', e => { e.platform.uid = 0; }, /SERVICE_TARGET_PLATFORM/],
  ['wrong OS', e => { e.platform.system = 'Darwin'; }, /SERVICE_TARGET_PLATFORM/],
  ['false cleanup', e => { e.cleanup = 'PENDING'; }, /SERVICE_TARGET_CLEANUP/],
  ['false downgrade', e => { e.compatibility.old_service_write = 'PASS'; }, /SERVICE_TARGET_COMPATIBILITY/],
]) test('target rejects ' + name + ' before any journal write', async t => {
  const input = await fixture(t);
  await change(input.targetEvidencePath, mutate); await refreshTargetReceipt(input.directory);
  await rejectsWithoutWrite(input, error);
});

for (const [name, mutate, error] of [
  ['runner replaced and rehashed', async d => writeFile(join(d, 'target-input/run-acceptance.py'), 'print("fake")'), /SERVICE_TARGET_RUNNER_NOT_REVIEWED/],
  ['helper replaced and rehashed', async d => writeFile(join(d, 'target-input/helpers/service-runtime.fixture.py'), '# fake helper'), /SERVICE_TARGET_HELPER_DRIFT/],
  ['package receipt rehashed', async d => change(join(d, 'target-input/pair/candidate/candidate-receipt.json'), e => { e.source.worktree_dirty = false; }), /SERVICE_TARGET_PACKAGE_RECEIPT/],
  ['preparation manifest drift', async d => change(join(d, 'target-input/wheel-preparation.json'), e => { e.service_manifest_sha256 = 'f'.repeat(64); }), /SERVICE_TARGET_PREPARATION_DIGEST/],
  ['preparation dependency drift', async d => change(join(d, 'target-input/wheel-preparation.json'), e => { e.wheels.fastapi.version = '9.9.9'; }), /SERVICE_TARGET_PREPARATION_WHEEL/],
  ['seed source drift', async d => change(join(d, 'target-input/synthetic-seed.json'), e => { e.source = 'f'.repeat(40); }), /SERVICE_TARGET_SEED_SOURCE/],
  ['seed path escape', async d => change(join(d, 'target-input/synthetic-seed.json'), e => { e.files[0].path = '../outside'; }), /SERVICE_TARGET_SEED_PATH/],
]) test('target rejects ' + name, async t => {
  const input = await fixture(t); await mutate(input.directory); await refreshTargetInput(input.directory);
  await rejectsWithoutWrite(input, error);
});

for (const [file, mutate, error] of [
  ['candidate-inventory.stdout', e => { e.fastapi = '0.0.0'; }, /SERVICE_TARGET_INSTALLED_INVENTORY/],
  ['candidate-cold-install.stdout', e => { e.mode = 'network-install'; }, /SERVICE_TARGET_INSTALL_MODE/],
  ['candidate-preflight.stdout', e => { e.platform.wsl2_detected = false; }, /SERVICE_TARGET_PREFLIGHT_MISMATCH/],
  ['candidate-final-check.stdout', e => { e.manifest_sha256 = 'f'.repeat(64); }, /SERVICE_TARGET_PACKAGE_CHECK/],
  ['crash-replay.stdout', e => { e.openapi = 'DIFFERS'; }, /SERVICE_TARGET_PROCESS_RECEIPT/],
  ['cleanup-verification.json', e => { e.owned_pids_alive = [1001]; }, /SERVICE_TARGET_CLEANUP/],
  ['seed-unpack.stdout', e => { e.ok = false; }, /SERVICE_TARGET_UNPACK/],
]) test('target rejects mismatched sidecar ' + file, async t => {
  const input = await fixture(t); await change(join(input.directory, 'target-result', file), mutate);
  await rejectsWithoutWrite(input, error);
});

test('changed wheel bytes, extra files and symlinked evidence roots cannot enter the journal', async t => {
  for (const kind of ['wheel', 'extra', 'symlink']) {
    const input = await fixture(t);
    if (kind === 'wheel') {
      const report = await parse(input.targetEvidencePath);
      await writeFile(join(input.directory, 'target-input/wheels', report.artifacts.candidate.wheels.fastapi.file), 'tampered');
    } else if (kind === 'extra') await writeFile(join(input.directory, 'target-input/unknown.txt'), 'x');
    else {
      await symlink(join(input.directory, 'target-result'), join(input.directory, 'result-link'));
      input.targetEvidencePath = join(input.directory, 'result-link/receipt.json');
    }
    await rejectsWithoutWrite(input, /SERVICE_TARGET_(FILE_DIGEST|INPUT_FILES|DIRECTORY_INVALID)/);
  }
});

test('missing logs, changed production listeners and FIFO fail closed without hanging', async t => {
  for (const kind of ['missing', 'listeners', 'fifo']) {
    const input = await fixture(t), path = join(input.directory, 'target-result/candidate-check.stdout');
    if (kind === 'missing') await rm(path);
    else if (kind === 'listeners') await writeFile(join(input.directory, 'target-result/production-listeners-after.txt'), 'changed\n');
    else { await rm(path); execFileSync('mkfifo', [path], { cwd: input.directory }); }
    await rejectsWithoutWrite(input, /ENOENT|SERVICE_TARGET_PRODUCTION_CHANGED|SERVICE_TARGET_ENTRY_INVALID/);
  }
});

test('changed supporting bytes cannot overwrite an existing target observation on retry', async t => {
  const input = await fixture(t); await verifyPluginService(input);
  const path = join(input.directory, 'target-result/production-listeners-after.txt');
  await writeFile(path, (await readFile(path, 'utf8')) + '\n');
  await rejectsWithoutWrite(input, /RELEASE_EVENT_CONFLICT/);
});

test('target CLI rejects partial options, sanitizes failures and cannot pass target flags to verify-host', async t => {
  const input = await fixture(t), command = args(input);
  await rejectsWithoutWrite({ ...input, targetInputPath: undefined }, /PLUGIN_SERVICE_TARGET_ARGUMENTS_REQUIRED/);
  await assert.rejects(exec(process.execPath, command.slice(0, -2), { cwd: root }),
    e => e.code === 2 && e.stderr === 'DSH_ERROR PLUGIN_SERVICE_TARGET_ARGUMENTS_REQUIRED\n');
  const sentinel = 'PRIVATE_VALIDATOR_SENTINEL';
  await change(input.targetEvidencePath, e => { e.platform.system = sentinel; });
  const prior = await readFile(input.statePath);
  await assert.rejects(exec(process.execPath, command, { cwd: root }),
    e => e.code === 2 && e.stdout === '' && e.stderr === 'DSH_ERROR SERVICE_TARGET_PLATFORM\n');
  assert.deepEqual(await readFile(input.statePath), prior);
  command[2] = 'verify-host';
  await assert.rejects(exec(process.execPath, command, { cwd: root }), e => e.code === 2 && /PLUGIN_OPTION_UNKNOWN/.test(e.stderr));
  const help = await exec(process.execPath, [command[0], 'plugin', '--help'], { cwd: root });
  assert.match(help.stdout, /--target-evidence.*--target-input/);
  assert.match(help.stdout, /not remote attestation/);
});
