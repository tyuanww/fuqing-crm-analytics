import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { verifyPluginService } from './plugin-service-evidence.mjs';
import { assertServicePromotion, serviceDigest as hash } from './service-compatibility.mjs';
import { readState } from './state.mjs';
import { createServiceArtifactFixture, json, parse } from './test-fixtures/service-artifacts.mjs';
import { bindSourceFixtureCandidate, createSourceTargetFixture, refreshSourceInput } from './test-fixtures/source-target.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
let baseline;
before(async () => {
  baseline = await mkdtemp(join(tmpdir(), 'source-target-fixture-'));
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await createServiceArtifactFixture(baseline, { sourceRevision: revision });
  await createSourceTargetFixture(baseline, revision);
});
after(async () => { if (baseline) await rm(baseline, { recursive: true, force: true }); });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'source-target-case-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['candidate', 'pair', 'state.json', 'target-input', 'target-result'])
    await cp(join(baseline, name), join(directory, name), { recursive: true });
  return { directory, candidatePath: join(directory, 'candidate/candidate.json'), evidencePath: join(directory, 'pair/receipt.json'),
    statePath: join(directory, 'state.json'), targetEvidencePath: join(directory, 'target-result/receipt.json'),
    targetInputPath: join(directory, 'target-input/input.json') };
}
async function change(path, mutate) { const value = await parse(path); mutate(value); await json(path, value); }
async function rejected(input, pattern) {
  const before = await readFile(input.statePath), info = await stat(input.statePath);
  const candidate = await readFile(input.candidatePath);
  await assert.rejects(verifyPluginService(input), pattern);
  assert.deepEqual(await readFile(input.statePath), before);
  assert.equal((await stat(input.statePath)).mtimeMs, info.mtimeMs);
  assert.deepEqual(await readFile(input.candidatePath), candidate);
}
const args = input => [join(root, 'scripts/dsh.mjs'), 'plugin', 'verify-service', '--candidate', input.candidatePath,
  '--evidence', input.evidencePath, '--state-path', input.statePath, '--target-evidence', input.targetEvidencePath,
  '--target-input', input.targetInputPath];

test('source HTTP joins the existing artifact event; CLI retry leaves bytes and mtime unchanged, promotion stays blocked', async t => {
  const input = await fixture(t), candidate = await readFile(input.candidatePath);
  const base = await verifyPluginService({ ...input, targetEvidencePath: undefined, targetInputPath: undefined });
  const result = await verifyPluginService(input);
  assert.equal(result.status, 'LOCAL_WSL_SYNTHETIC_SOURCE_HTTP_OBSERVATION_VERIFIED');
  assert.equal(result.scenario_count, 10);
  assert.equal(result.evidence_authenticity, 'UNATTESTED_OPERATOR_OBSERVATION');
  for (const name of ['dsh_host', 'cross_version_service_recovery', 'production_identity', 'supply_chain'])
    assert.equal(result[name], 'NOT_RUN');
  assert.equal(result.release_ready, false); assert.equal(result.activation, 'BLOCKED');
  assert.equal(result.journal_seq, base.journal_seq + 1);
  assert.equal(result.service_artifact_journal_seq, base.journal_seq);
  const stateBytes = await readFile(input.statePath), info = await stat(input.statePath), state = await readState(input.statePath);
  assert.equal(state.journal.at(-1).status, 'CANDIDATE_SERVICE_TARGET_OBSERVED');
  assert.deepEqual(state.journal.at(-1).service_artifact_event, { seq: base.journal_seq, digest: base.journal_digest });
  const retry = await exec(process.execPath, args(input), { cwd: root });
  assert.deepEqual(JSON.parse(retry.stdout), result);
  assert.deepEqual(await readFile(input.statePath), stateBytes);
  assert.equal((await stat(input.statePath)).mtimeMs, info.mtimeMs);
  assert.deepEqual(await readFile(input.candidatePath), candidate);
  await assert.rejects(assertServicePromotion({ journal: state, marker: { tag: 'fixture',
    source_sha: JSON.parse(candidate).source_sha, service_compatibility: JSON.parse(candidate).service_compatibility } }),
  /SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE/);
});

for (const [name, mutate, code] of [
  ['unknown schema', r => { r.schema_version += '-unknown'; }, /SERVICE_TARGET_RECEIPT/],
  ['extra field', r => { r.extra = 'x'; }, /SERVICE_SOURCE_TARGET_RECEIPT/],
  ['failed receipt', r => { r.status = 'FAIL'; }, /SERVICE_SOURCE_TARGET_NOT_PASS/],
  ['local run relabeled as target', r => { r.scope = 'local-synthetic-package-http'; }, /SERVICE_SOURCE_TARGET_SCOPE/],
  ['release claim', r => { r.release_ready = true; }, /SERVICE_SOURCE_TARGET_FALSE_RELEASE_CLAIM/],
  ['DSH claim', r => { r.dsh_host = 'PASS'; }, /SERVICE_SOURCE_TARGET_UNVERIFIED_CLAIM/],
  ['wrong candidate', r => { r.candidate_digest = 'f'.repeat(64); }, /SERVICE_SOURCE_TARGET_CANDIDATE_BINDING/],
  ['wrong source', r => { r.source_sha = 'f'.repeat(40); }, /SERVICE_SOURCE_TARGET_SOURCE_BINDING/],
  ['wrong query archive', r => { r.artifacts.query.archive_sha256 = 'f'.repeat(64); }, /SERVICE_SOURCE_TARGET_ARCHIVE/],
  ['wrong installed dependency', r => { r.artifacts.save.installed.fastapi = '0.0.0'; }, /SERVICE_SOURCE_TARGET_DEPENDENCIES/],
  ['root runtime', r => { r.platform.uid = 0; }, /SERVICE_SOURCE_TARGET_PLATFORM/],
  ['missing case', r => { r.observations.pop(); }, /SERVICE_SOURCE_TARGET_OBSERVATIONS/],
  ['duplicate case', r => { r.observations[3] = r.observations[2]; }, /SERVICE_SOURCE_TARGET_OBSERVATIONS/],
  ['missing crash', r => { r.processes[1].exit_code = 0; }, /SERVICE_SOURCE_TARGET_PROCESS_EXIT/],
  ['duplicate process', r => { r.processes[1].pid = r.processes[0].pid; }, /SERVICE_SOURCE_TARGET_PROCESS/],
  ['unreaped process', r => { r.processes[0].stopped = false; }, /SERVICE_SOURCE_TARGET_PROCESS/],
  ['failed cleanup', r => { r.cleanup = 'PENDING'; }, /SERVICE_SOURCE_TARGET_CLEANUP/],
]) test('rejects ' + name + ' without changing the journal', async t => {
  const input = await fixture(t); await change(input.targetEvidencePath, mutate); await rejected(input, code);
});

for (const [name, file, mutate, code] of [
  ['candidate replacement', 'candidate.json', r => { r.source_sha = 'f'.repeat(40); }, /SERVICE_SOURCE_TARGET_CANDIDATE_BINDING/],
  ['pair replacement', 'save/pair.json', r => { r.release_ready = true; }, /SERVICE_SOURCE_TARGET_PAIR_BINDING/],
  ['input identity', 'input.json', r => { r.candidate_digest = 'f'.repeat(64); }, /SERVICE_SOURCE_TARGET_CANDIDATE_BINDING/],
  ['query source identity', 'query/receipt.json', r => { r.source_sha = 'f'.repeat(40); }, /SERVICE_SOURCE_TARGET_QUERY_BINDING/],
  ['fixture substituted', 'fixtures/snapshot.json', r => { r.contains_real_data = true; }, /SERVICE_SOURCE_TARGET_FIXTURE/],
]) test('rejects rehashed ' + name, async t => {
  const input = await fixture(t); await change(join(input.directory, 'target-input', file), mutate);
  await refreshSourceInput(input.directory); await rejected(input, code);
});

for (const [file, mutate, code] of [
  ['query-install.stdout', r => { r.mode = 'network-install'; }, /SERVICE_SOURCE_TARGET_INSTALL_MODE/],
  ['save-final-integrity.stdout', r => { r.manifest_sha256 = 'f'.repeat(64); }, /SERVICE_SOURCE_TARGET_FINAL_CHECK/],
  ['save-after-crash.json', r => { r.sqlite_files.push('runs/runs.sqlite3'); }, /SERVICE_SOURCE_TARGET_SAVE_HANDSHAKE/],
  ['query-restart.json', r => { r.worker_pid += 1; }, /SERVICE_SOURCE_TARGET_QUERY_REPLAY/],
  ['query-initial.json', r => { r.imports['backend.analytics_app'] = '../../outside.py'; }, /SERVICE_SOURCE_TARGET_IMPORTS/],
]) test('rejects mismatched sidecar ' + file, async t => {
  const input = await fixture(t); await change(join(input.directory, 'target-result', file), mutate); await rejected(input, code);
});

test('unreviewed runners/helpers cannot be accepted by recomputing the input hash', async t => {
  for (const [file, code] of [['first-purchase-source-target.probe.py', /SERVICE_SOURCE_TARGET_RUNNER/],
    ['first-purchase-service.probe.py', /SERVICE_SOURCE_TARGET_HELPER/]]) {
    const input = await fixture(t);
    await writeFile(join(input.directory, 'target-input/helpers', file), '# replaced verifier');
    await refreshSourceInput(input.directory); await rejected(input, code);
  }
});
test('unexpected files, symlink roots and wheel tampering fail closed', async t => {
  for (const kind of ['extra-input', 'extra-result', 'symlink-input', 'symlink-result', 'wheel']) {
    const input = await fixture(t);
    if (kind.startsWith('extra')) await writeFile(join(input.directory, kind === 'extra-input' ? 'target-input' : 'target-result', 'unowned'), 'x');
    else if (kind.startsWith('symlink')) {
      const target = kind === 'symlink-input' ? 'target-input' : 'target-result';
      await symlink(join(input.directory, target), join(input.directory, 'linked'), 'dir');
      if (target === 'target-input') input.targetInputPath = join(input.directory, 'linked/input.json');
      else input.targetEvidencePath = join(input.directory, 'linked/receipt.json');
    } else {
      const receipt = await parse(input.targetEvidencePath);
      await writeFile(join(input.directory, 'target-input/query-wheels', receipt.artifacts.query.wheels.duckdb.file), 'changed');
    }
    await rejected(input, /SERVICE_SOURCE_TARGET_(?:INPUT_FILES|RESULT_FILES|DIRECTORY|FILE_DIGEST)/);
  }
});
test('invalid archive bytes cannot be blessed by a new receipt and hash', async t => {
  const input = await fixture(t), path = join(input.directory, 'target-input/query/archive.tar.zst'), data = Buffer.from('not zstd');
  await writeFile(path, data);
  await change(join(input.directory, 'target-input/query/receipt.json'), r => { r.sha256 = hash(data); r.bytes = data.length; });
  await change(input.targetEvidencePath, r => { r.artifacts.query.archive_sha256 = hash(data); });
  await refreshSourceInput(input.directory);
  await rejected(input, /ARCHIVE|Command failed/);
});
test('a valid candidate from another source cannot inherit this finite runner observation', async t => {
  const input = await fixture(t);
  const candidate = await bindSourceFixtureCandidate(input.directory, 'f'.repeat(40));
  await json(join(input.directory, 'target-input/candidate.json'), candidate);
  await change(input.targetEvidencePath, r => { r.candidate_digest = candidate.candidate_digest; });
  await change(input.targetInputPath, r => { r.candidate_digest = candidate.candidate_digest; });
  await refreshSourceInput(input.directory); await rejected(input, /SERVICE_SOURCE_TARGET_CANDIDATE_SOURCE/);
});
test('rewritten query code is rejected even with consistent archive, manifest and receipt hashes', async t => {
  const input = await fixture(t), stage = join(input.directory, 'stage');
  await cp(join(baseline, 'query-stage'), stage, { recursive: true });
  const name = 'backend/analytics_first_purchase_source_app.py', data = Buffer.from('# substituted query code\n');
  await writeFile(join(stage, name), data);
  await change(join(stage, 'kernel-manifest.json'), r => { r.files[name].sha256 = hash(data); r.files[name].bytes = data.length; });
  const query = join(input.directory, 'target-input/query'), manifest = await readFile(join(stage, 'kernel-manifest.json'));
  await json(join(input.directory, 'allow.json'), [...Object.keys(JSON.parse(manifest).files), 'kernel-manifest.json']);
  await exec('python3', [join(root, 'scripts/release/pack.py'), stage, join(input.directory, 'allow.json'),
    join(query, 'archive.tar.zst')], { cwd: input.directory });
  await writeFile(join(query, 'kernel-manifest.json'), manifest);
  const archive = await readFile(join(query, 'archive.tar.zst'));
  await change(join(query, 'receipt.json'), r => {
    r.sha256 = hash(archive); r.bytes = archive.length; r.manifest_sha256 = hash(manifest);
  });
  await change(input.targetEvidencePath, r => {
    r.artifacts.query.archive_sha256 = hash(archive); r.artifacts.query.manifest_sha256 = hash(manifest);
  });
  await refreshSourceInput(input.directory); await rejected(input, /SERVICE_SOURCE_TARGET_QUERY_SOURCE/);
});
test('CLI redacts untrusted values on errors and leaves the journal unchanged', async t => {
  const input = await fixture(t), before = await readFile(input.statePath), secret = 'not-a-real-secret-private-sentinel';
  await change(input.targetEvidencePath, r => { r.artifacts.save.installed.fastapi = secret; });
  await assert.rejects(exec(process.execPath, args(input), { cwd: root }), error => {
    assert.match(error.stderr, /SERVICE_SOURCE_TARGET_DEPENDENCIES/);
    assert.ok(!error.stderr.includes(secret) && !error.stdout.includes(secret)); return true;
  });
  assert.deepEqual(await readFile(input.statePath), before);
});


async function independentPlugin(input, version) {
  const candidate = await bindSourceFixtureCandidate(input.directory, 'a'.repeat(40));
  await writeFile(join(input.directory, 'target-input/candidate.json'), await readFile(input.candidatePath));
  await change(input.targetInputPath, value => {
    value.schema_version = 'synthetic-source-http-target-input/' + version;
    value.candidate_digest = candidate.candidate_digest;
  });
  await change(input.targetEvidencePath, value => {
    value.schema_version = 'source-http-target-observation/' + version;
    value.candidate_digest = candidate.candidate_digest;
  });
  for (const name of await readdir(join(input.directory, 'target-result'))) {
    if (name.endsWith('.json') && name !== 'receipt.json') await change(join(input.directory, 'target-result', name), value => {
      if (Object.hasOwn(value, 'candidate_digest')) value.candidate_digest = candidate.candidate_digest;
    });
  }
  for (const label of ['query', 'save']) {
    const newRoot = '/tmp/owned-fp-terminal-fixture/source/source-http-owned-fixture';
    await change(join(input.directory, 'target-result', label + '-install.stdout'), value => {
      value.python = newRoot + '/' + label + '-venv/bin/python';
    });
    await change(join(input.directory, 'target-result', label + '-unpack.stdout'), value => {
      value.destination = newRoot + '/' + label + '-app';
    });
  }
  await refreshSourceInput(input.directory);
}

test('v2 accepts an independently updated plugin with unchanged service archives and explicit binding', async t => {
  const input = await fixture(t), pair = await readFile(input.evidencePath);
  await independentPlugin(input, 'v2');
  const result = await verifyPluginService(input);
  assert.equal(result.scenario_count, 10);
  assert.equal(result.release_ready, false);
  assert.deepEqual(await readFile(input.evidencePath), pair);
});

test('v1 cannot relabel an independent plugin update as historical shared-source evidence', async t => {
  const input = await fixture(t);
  await independentPlugin(input, 'v1');
  await rejected(input, /SERVICE_SOURCE_TARGET_CANDIDATE_SOURCE/);
});

test('v2 cannot substitute a plugin SHA for its service source', async t => {
  const input = await fixture(t);
  await independentPlugin(input, 'v2');
  await change(input.targetEvidencePath, value => { value.source_sha = 'a'.repeat(40); });
  await rejected(input, /SERVICE_SOURCE_TARGET_SOURCE_BINDING/);
});


for (const path of ['/srv/production/query-venv/bin/python',
  '/tmp/owned-fp-terminal-fixture/source/../source-http-owned-fixture/query-venv/bin/python',
  '/tmp/owned-fp-terminal-other/source/source-http-owned-fixture/query-venv/bin/python']) {
  test('v2 refuses an unowned, traversing or inconsistent install root: ' + path, async t => {
    const input = await fixture(t); await independentPlugin(input, 'v2');
    await change(join(input.directory, 'target-result/query-install.stdout'), value => { value.python = path; });
    await rejected(input, /SERVICE_SOURCE_TARGET_(INSTALL_PATH|UNPACK)/);
  });
}
