#!/usr/bin/env node
/** Opt-in exact-artifact drill; no deployment, user DB paths or release approval. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { machine, tmpdir, type } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { packService } from './package-service.mjs';
import { startPackedService } from './service-process.fixture.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const exec = promisify(execFile);
const hash = data => createHash('sha256').update(data).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const driver = join(ROOT, 'scripts/crm-calibration/first-purchase-package.fixture.py');
const sourceDrill = join(ROOT, 'scripts/dsh-b0/service-save-compatibility.py');
const BASE = '/api/v1/analytics-first-purchase';
const DB = 'analyses/first_purchase_analyses.sqlite3';
const marker = 'owned-synthetic-state/v1\n';

async function run(python, args, cwd) {
  return exec(python, args, { cwd, timeout: 90000, maxBuffer: 2 * 1024 * 1024,
    env: { PATH: dirname(python) + ':' + (process.env.PATH ?? '/usr/bin:/bin'),
      HOME: cwd, TMPDIR: cwd, PYTHON_DOTENV_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1',
      GIT_NO_REPLACE_OBJECTS: '1' } });
}

export async function verifyPackagePair({ baseline, candidate, baselinePython, candidatePython,
  baselineWheelhouse, candidateWheelhouse, output, signal }) {
  assert.ok(!signal?.aborted, 'SERVICE_PAIR_CANCELLED');
  assert.ok(['darwin', 'linux'].includes(process.platform), 'SERVICE_PAIR_POSIX_REQUIRED');
  for (const sha of [baseline, candidate]) assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'SERVICE_PAIR_EXACT_SOURCE_REQUIRED');
  assert.notEqual(baseline, candidate, 'SERVICE_PAIR_DISTINCT_SOURCE_REQUIRED');
  for (const path of [baselinePython, candidatePython, baselineWheelhouse, candidateWheelhouse, output]) {
    assert.ok(typeof path === 'string' && isAbsolute(path), 'SERVICE_PAIR_ABSOLUTE_PATH_REQUIRED');
  }
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output, { mode: 0o700 });
  const receipt = { schema_version: 'shinemage-service-artifact-compatibility/v1', status: 'RUNNING',
    scope: 'local-posix-synthetic-service-artifacts-http', release_ready: false,
    activation: 'BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED',
    platform: { system: type(), machine: machine() }, baseline, candidate,
    runtime_mode: 'separate-offline-hashed-wheel-install', artifacts: {}, observations: [], verifiers: {} };
  const report = async () => {
    if (signal?.aborted && receipt.status === 'RUNNING') throw new Error('SERVICE_PAIR_CANCELLED');
    await writeFile(join(output, 'receipt.json'), json(receipt));
  };
  let temp, active;
  const credentials = { writer: randomBytes(32).toString('hex'), reader: randomBytes(32).toString('hex') };
  try {
    await report();
    temp = await mkdtemp(join(tmpdir(), 'crm-packed-service-pair-'));
    const runtimes = {};
    for (const path of ['scripts/crm-calibration/service-package-compatibility.mjs',
      'scripts/crm-calibration/package-service.mjs', 'scripts/crm-calibration/service-entry.py',
      'scripts/crm-calibration/service-runtime.fixture.py', 'scripts/crm-calibration/service-process.fixture.mjs',
      'scripts/crm-calibration/first-purchase-package.fixture.py', 'scripts/dsh-b0/service-save-compatibility.py']) {
      receipt.verifiers[path] = hash(await readFile(join(ROOT, path)));
    }
    for (const [label, revision, python, wheelhouse] of [
      ['baseline', baseline, baselinePython, baselineWheelhouse],
      ['candidate', candidate, candidatePython, candidateWheelhouse],
    ]) {
      const out = join(output, label);
      const packed = await packService({ domain: 'first-purchase', output: out, python, revision,
        compatibilityBaseline: label === 'baseline' });
      const archive = join(out, packed.artifact), app = join(temp, label + '-app');
      assert.equal(hash(await readFile(archive)), packed.sha256, 'SERVICE_PAIR_ARCHIVE_MISMATCH');
      await run(python, [join(ROOT, 'scripts/release/secure-unpack.py'), archive, app,
        '--max-bytes', '8388608', '--max-entries', '100'], temp);
      assert.equal(hash(await readFile(join(app, 'service-manifest.json'))), packed.manifest_sha256,
        'SERVICE_PAIR_MANIFEST_MISMATCH');
      const runtime = JSON.parse((await run(python, ['-I', join(ROOT, 'scripts/crm-calibration/service-runtime.fixture.py'),
        join(app, 'service-manifest.json'), join(temp, label + '-venv'), '--wheelhouse', wheelhouse], temp)).stdout);
      const checked = JSON.parse((await run(runtime.python, ['-I', join(app, 'service.py'), 'check'], temp)).stdout);
      assert.equal(checked.manifest_sha256, packed.manifest_sha256, 'SERVICE_PAIR_INSTALL_MISMATCH');
      const installed = JSON.parse((await run(runtime.python, ['-I', '-c',
        'import importlib.metadata as m,json,sys;print(json.dumps({"python":sys.version.split()[0],"dependencies":{d.metadata["Name"].lower().replace("_","-"):d.version for d in m.distributions()}}))'], temp)).stdout);
      const manifest = JSON.parse(await readFile(join(app, 'service-manifest.json')));
      assert.deepEqual(installed.dependencies, manifest.dependencies, 'SERVICE_PAIR_RUNTIME_CLOSURE_MISMATCH');
      assert.deepEqual(packed.service_source, manifest.service_source, 'SERVICE_PAIR_SOURCE_MISMATCH');
      runtimes[label] = { python: runtime.python, app };
      receipt.artifacts[label] = { ...packed, installed: { ...installed, mode: runtime.mode, wheels: runtime.wheels } };
      await report();
    }
    const state = join(temp, 'analysis-state');
    await mkdir(state, { mode: 0o700 });
    for (const file of ['.synthetic-package-test', '.synthetic-save-compatibility']) await writeFile(join(state, file), marker);
    // Seed with the baseline's real worker in a separate full test environment.
    // Saved-analysis processes never import that worker or the source checkout.
    const seed = join(temp, 'seed-source');
    const exportScript = 'import pathlib,runpy,sys; m=runpy.run_path(sys.argv[1]); m["export_source"](sys.argv[2],pathlib.Path(sys.argv[3]))';
    await run(baselinePython, ['-I', '-c', exportScript, sourceDrill, baseline, seed], temp);
    await run(baselinePython, ['-I', driver, 'seed', seed, state], temp);
    const context = JSON.parse(await readFile(join(state, 'context.json')));
    receipt.seed = { source: baseline, scope: 'exact-source-synthetic-worker-outside-service-packages' };
    async function start(label, operation, currentState, name) {
      assert.ok(!active, 'SERVICE_PAIR_PROCESS_OWNERSHIP');
      active = await startPackedService({ ...runtimes[label], driver, operation, state: currentState, home: temp,
        credentials, log: join(output, name), signal });
      assert.equal(active.receipt.manifest_sha256, receipt.artifacts[label].manifest_sha256);
    }
    async function stop() { if (active) { const service = active; active = null; await service.stop(); } }
    async function request(path, status, body, key = 'd15-save', version) {
      const response = await fetch(active.origin + BASE + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: 'Bearer ' + credentials.writer, 'content-type': 'application/json',
          'idempotency-key': key, ...(version === undefined ? {} : { 'if-match': String(version) }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
      });
      const value = await response.json();
      assert.equal(response.status, status, 'SERVICE_PAIR_HTTP_STATUS ' + path);
      return value;
    }
    const observed = async (name, more = {}) => {
      receipt.observations.push({ case: name, status: 'PASS', ...more }); await report();
    };
    await start('baseline', 'legacy-write', state, 'seed-legacy');
    const legacy = await request('/analyses', 201, { created_from_run_id: context.run_id, title: 'synthetic legacy' }, 'legacy-save');
    await stop(); await observed('seed-legacy');

    await start('candidate', 'serve', state, 'upgrade');
    assert.deepEqual(await request('/analyses/' + legacy.analysis_id, 200), legacy);
    assert.equal((await request('/analyses/' + legacy.analysis_id + '/provenance', 404)).error.code, 'PROVENANCE_NOT_RECORDED');
    assert.equal((await request('/analyses', 409, { created_from_run_id: context.run_id, title: 'legacy bypass' }, 'bypass')).error.code, 'VERSIONED_SAVE_REQUIRED');
    const identity = { schema_version: 'analytics-first-purchase-save-identity/v1', action_id: 'pair-save',
      candidate_digest: 'a'.repeat(64), correlation_id: 'pair-correlation' };
    const command = { schema_version: 'analytics-first-purchase-save-command/v1', identity,
      created_from_run_id: context.run_id, title: 'synthetic D15', evidence_digest: context.evidence_digest };
    const saved = await request('/save-receipts', 201, command);
    const path = '/analyses/' + saved.analysis_ref.analysis_id;
    const record = await request(path, 200), provenance = await request(path + '/provenance', 200);
    await stop(); await observed('upgrade');
    const beforeRead = hash(await readFile(join(state, DB)));
    await start('baseline', 'legacy-readonly', state, 'old-readonly');
    assert.deepEqual(await request(path, 200), record);
    await request('/save-receipts/reconcile', 404, identity);
    assert.equal((await request(path + '/versions', 403, { title: 'forbidden' }, 'old-readonly', 1)).error.code, 'FORBIDDEN');
    await stop();
    assert.equal(hash(await readFile(join(state, DB))), beforeRead, 'SERVICE_PAIR_READONLY_CHANGED_STATE');
    await observed('old-readonly', { database_unchanged: true });

    async function recover(currentState, label) {
      await start('candidate', 'recover', currentState, label);
      assert.deepEqual(await request('/save-receipts/reconcile', 200, identity), saved);
      assert.deepEqual(await request('/save-receipts', 201, command), saved);
      assert.equal((await request('/analyses', 200)).items.length, 2);
      assert.deepEqual(await request(path + '/provenance?version=1', 200), provenance);
      const fixed = await request(path + '/versions', 201, { title: 'synthetic corrected' }, 'forward-fix', 1);
      assert.equal(fixed.version, 2); assert.deepEqual(fixed.facts, record.facts);
      assert.deepEqual((await request(path + '/provenance', 200)).provenance, provenance.provenance);
      assert.deepEqual(await request('/save-receipts/reconcile', 200, identity), saved);
      await stop(); await observed(label);
    }
    await recover(state, 'recover');
    async function copyState(label) {
      const parent = join(temp, 'crm-packed-service-' + label); await mkdir(parent, { mode: 0o700 });
      const target = join(parent, 'analysis-state');
      const backupScript = 'import pathlib,runpy,sys; m=runpy.run_path(sys.argv[1]); m["backup_owned"](pathlib.Path(sys.argv[2]),pathlib.Path(sys.argv[3]))';
      await run(candidatePython, ['-I', '-c', backupScript, sourceDrill, state, target], temp);
      await writeFile(join(target, '.synthetic-package-test'), marker);
      return target;
    }
    await recover(await copyState('cold-restore'), 'cold-backup-restore');
    const unsafe = await copyState('unsupported-old-write');
    await start('baseline', 'legacy-write', unsafe, 'old-write');
    const overwritten = await request(path + '/versions', 201, { title: 'synthetic unsupported downgrade' }, 'unsafe-old-title', 2);
    assert.equal(overwritten.version, 3); assert.deepEqual(overwritten.facts, record.facts);
    await stop(); await observed('old-write');
    await start('candidate', 'recover', unsafe, 'detect-old-write');
    assert.equal((await request(path + '/provenance', 404)).error.code, 'PROVENANCE_NOT_RECORDED');
    assert.deepEqual(await request('/save-receipts/reconcile', 200, identity), saved);
    await stop(); await observed('detect-old-write');
    const unknown = await copyState('unknown-schema');
    await run(candidatePython, ['-I', '-c',
      'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("PRAGMA user_version=99"); c.close()', join(unknown, DB)], temp);
    const unknownHash = hash(await readFile(join(unknown, DB)));
    for (const [label, operation, name] of [['baseline', 'legacy-readonly', 'old-unknown-schema'],
      ['candidate', 'recover', 'new-unknown-schema']]) {
      await assert.rejects(start(label, operation, unknown, name),
        error => error.message === 'SERVICE_PROCESS_EXIT' && error.detail.includes('schema differs'));
      assert.equal(hash(await readFile(join(unknown, DB))), unknownHash);
      await observed(name, { rejected: true, database_unchanged: true });
    }
    // Verify the final immutable installs after all processes have closed.
    for (const runtime of Object.values(runtimes)) await run(runtime.python, ['-I', join(runtime.app, 'service.py'), 'check'], temp);
    assert.ok(!signal?.aborted, 'SERVICE_PAIR_CANCELLED');
    receipt.status = 'PASS';
    receipt.compatibility = { old_v1_to_candidate: 'PASS', candidate_state_old_readonly: 'PASS_WITH_READ_ONLY_IDENTITY',
      candidate_replay_after_old_read: 'PASS', candidate_forward_fix_and_backup_restore: 'PASS',
      candidate_state_old_writes: 'BLOCKED_PROVENANCE_NOT_PRESERVED', old_service_d15_api: 'NOT_AVAILABLE',
      unknown_state_schema: 'REJECTED_WITHOUT_DB_CHANGE', profile_rollback: 'KEEP_CANDIDATE_SERVICE_AND_DURABLE_STATE' };
  } catch (error) {
    receipt.status = 'FAIL';
    receipt.error = signal?.aborted ? 'SERVICE_PAIR_CANCELLED' : error.message.match(/SERVICE_[A-Z_]+/)?.[0] ?? 'SERVICE_PAIR_FAILED';
    throw error;
  } finally {
    try { if (active) await active.stop(); }
    finally {
      try { if (temp) await rm(temp, { recursive: true, force: true }); }
      finally { await report(); }
    }
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const { values, tokens } = parseArgs({ options: Object.fromEntries(
      ['baseline', 'candidate', 'baseline-python', 'candidate-python', 'baseline-wheelhouse', 'candidate-wheelhouse', 'output']
        .map(name => [name, { type: 'string' }])), tokens: true, strict: true });
    const names = tokens.filter(token => token.kind === 'option').map(token => token.name);
    assert.equal(new Set(names).size, names.length, 'SERVICE_PAIR_ARGUMENT_REPEATED');
    const receipt = await verifyPackagePair({ baseline: values.baseline, candidate: values.candidate,
      baselinePython: values['baseline-python'], candidatePython: values['candidate-python'],
      baselineWheelhouse: values['baseline-wheelhouse'], candidateWheelhouse: values['candidate-wheelhouse'], output: values.output,
      signal: controller.signal });
    console.log(json({ status: receipt.status, observations: receipt.observations.length,
      release_ready: false, receipt: join(values.output, 'receipt.json') }));
  } catch (error) {
    console.error(error.message.match(/SERVICE_[A-Z_]+/)?.[0] ?? 'SERVICE_PAIR_FAILED');
    process.exitCode = 2;
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  }
}
