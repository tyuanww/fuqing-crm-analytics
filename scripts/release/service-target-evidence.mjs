/** Verify archived WSL synthetic observations. No execution, network or activation. */
import assert from 'node:assert/strict';
import { lstat, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insideArtifact, readArtifactFile } from './service-artifact-evidence.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { verifySourceTargetEvidence } from './source-target-evidence.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HEX = /^[a-f0-9]{64}$/;
// Reviewed finite runner archived verbatim as test evidence, not a production installer.
export const TARGET_RUNNER_SHA256 = '08a1650f0c8af1bea785d9d2c30f8086e06c6757737e70b41c7a0f13c505df79';
export const TARGET_HELPERS = Object.freeze(['scripts/crm-calibration/service-target-preflight.py',
  'scripts/crm-calibration/service-runtime.fixture.py', 'scripts/crm-calibration/first-purchase-package.fixture.py',
  'scripts/release/secure-unpack.py']);
export const TARGET_CASES = Object.freeze(['baseline-preflight-cold-install', 'candidate-preflight-cold-install',
  'legacy-save', 'legacy-state-upgrade', 'freshness-admission-and-permission', 'save-conflict-and-owned-process-crash',
  'crash-reconcile-idempotency-and-unknown', 'old-service-readonly-fallback', 'candidate-forward-fix',
  'synthetic-backup-cold-restore', 'unsupported-old-write-detected', 'baseline-unknown-schema',
  'candidate-unknown-schema', 'input-and-installed-artifact-integrity']);
export const TARGET_PROCESSES = Object.freeze([
  ['legacy-seed', 'legacy-write', 'baseline'], ['candidate-save', 'serve', 'candidate'],
  ['crash-replay', 'recover', 'candidate'], ['old-readonly', 'legacy-readonly', 'baseline'],
  ['forward-fix', 'recover', 'candidate'], ['cold-restore', 'recover', 'candidate'],
  ['unsupported-old-write', 'legacy-write', 'baseline'], ['detect-old-write', 'recover', 'candidate'],
  ['baseline-unknown-schema', 'legacy-readonly', 'baseline'], ['candidate-unknown-schema', 'recover', 'candidate'],
]);
const decode = bytes => JSON.parse(bytes.toString('utf8'));
function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}
async function fileSet(directory) {
  assert.ok((await lstat(directory)).isDirectory() && !(await lstat(directory)).isSymbolicLink(), 'SERVICE_TARGET_DIRECTORY_INVALID');
  const files = []; let entries = 0;
  async function walk(path, prefix = '', depth = 0) {
    assert.ok(depth < 5, 'SERVICE_TARGET_DIRECTORY_LIMIT');
    for (const entry of await readdir(path, { withFileTypes: true })) {
      assert.ok(++entries <= 100, 'SERVICE_TARGET_DIRECTORY_LIMIT');
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), name + '/', depth + 1);
      else { assert.ok(entry.isFile(), 'SERVICE_TARGET_ENTRY_INVALID'); files.push(name); }
    }
  }
  await walk(directory); return files.sort();
}

function verifyPreparation(content, input, pair, wheels) {
  const prep = decode(content.get('wheel-preparation.json'));
  exact(prep, ['schema_version', 'status', 'scope', 'platform_observation_sha256', 'service_manifest_sha256',
    'wheelhouse', 'wheels', 'release_ready', 'target_preflight', 'cold_install', 'http_recovery',
    'supply_chain_attestation', 'activation'], 'SERVICE_TARGET_PREPARATION_SHAPE');
  assert.equal(prep.schema_version, 'shinemage-target-wheel-preparation/v1', 'SERVICE_TARGET_PREPARATION_SCHEMA');
  assert.equal(prep.status, 'PINNED_TARGET_WHEELS_PREPARED', 'SERVICE_TARGET_PREPARATION_STATUS');
  assert.equal(prep.scope, 'local-download-for-observed-target', 'SERVICE_TARGET_PREPARATION_SCOPE');
  assert.equal(prep.release_ready, false, 'SERVICE_TARGET_FALSE_RELEASE_CLAIM');
  for (const key of ['target_preflight', 'cold_install', 'http_recovery', 'supply_chain_attestation', 'activation'])
    assert.equal(prep[key], 'NOT_RUN', 'SERVICE_TARGET_PREPARATION_CLAIM');
  assert.match(prep.platform_observation_sha256 ?? '', HEX, 'SERVICE_TARGET_PREPARATION_DIGEST');
  assert.equal(prep.service_manifest_sha256, pair.artifacts.candidate.manifest_sha256, 'SERVICE_TARGET_PREPARATION_DIGEST');
  assert.match(prep.wheelhouse ?? '', /^[A-Za-z0-9_-]{1,128}$/, 'SERVICE_TARGET_PREPARATION_PATH');
  exact(prep.wheels, Object.keys(wheels), 'SERVICE_TARGET_PREPARATION_WHEELS');
  for (const [name, wheel] of Object.entries(wheels)) {
    const row = prep.wheels[name];
    exact(row, ['version', 'file', 'bytes', 'sha256', 'url', 'metadata_url', 'metadata_sha256', 'matched_target_tags'], 'SERVICE_TARGET_PREPARATION_WHEEL');
    for (const key of ['file', 'sha256', 'version']) assert.equal(row[key], wheel[key], 'SERVICE_TARGET_PREPARATION_WHEEL');
    assert.equal(row.bytes, input.files['wheels/' + wheel.file].bytes, 'SERVICE_TARGET_PREPARATION_WHEEL');
    assert.match(row.metadata_sha256 ?? '', HEX, 'SERVICE_TARGET_PREPARATION_DIGEST');
    // These URLs are recorded provenance, not authenticated publisher evidence.
    assert.ok(typeof row.url === 'string' && row.url.startsWith('https://files.pythonhosted.org/packages/')
      && row.url.endsWith('/' + wheel.file), 'SERVICE_TARGET_PREPARATION_ORIGIN');
    assert.equal(row.metadata_url, 'https://pypi.org/pypi/' + name + '/' + wheel.version + '/json', 'SERVICE_TARGET_PREPARATION_ORIGIN');
    assert.ok(Array.isArray(row.matched_target_tags) && row.matched_target_tags.length > 0
      && row.matched_target_tags.length <= 20 && row.matched_target_tags.every(tag => typeof tag === 'string'
        && /^[A-Za-z0-9_.-]{1,128}$/.test(tag)), 'SERVICE_TARGET_PREPARATION_TAGS');
  }
  const seed = decode(content.get('synthetic-seed.json'));
  exact(seed, ['scope', 'source', 'files', 'release_ready'], 'SERVICE_TARGET_SEED_SHAPE');
  assert.equal(seed.scope, 'locally-generated-synthetic-worker-only', 'SERVICE_TARGET_SEED_SCOPE');
  assert.equal(seed.source, pair.baseline, 'SERVICE_TARGET_SEED_SOURCE');
  assert.equal(seed.release_ready, false, 'SERVICE_TARGET_FALSE_RELEASE_CLAIM');
  assert.ok(Array.isArray(seed.files) && seed.files.length > 0 && seed.files.length <= 64, 'SERVICE_TARGET_SEED_FILES');
  const seen = new Set();
  for (const row of seed.files) {
    exact(row, ['path', 'bytes', 'sha256'], 'SERVICE_TARGET_SEED_FILE');
    assert.ok(typeof row.path === 'string' && /^[A-Za-z0-9_.\/-]{1,256}$/.test(row.path)
      && row.path.split('/').every(part => part && part !== '.' && part !== '..')
      && !seen.has(row.path), 'SERVICE_TARGET_SEED_PATH');
    seen.add(row.path);
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 16 * 1024 * 1024, 'SERVICE_TARGET_SEED_SIZE');
    assert.match(row.sha256 ?? '', HEX, 'SERVICE_TARGET_SEED_DIGEST');
  }
  assert.ok(seen.has('.synthetic-package-test') && seen.has('context.json') && seen.has('runs/runs.sqlite3'), 'SERVICE_TARGET_SEED_FILES');
}

export async function verifyServiceTargetEvidence({ artifactObservation, evidencePath, targetEvidencePath, targetInputPath, candidate, candidateBytes }) {
  for (const path of [evidencePath, targetEvidencePath, targetInputPath]) {
    assert.ok(typeof path === 'string' && isAbsolute(path), 'SERVICE_TARGET_ABSOLUTE_PATH_REQUIRED');
  }
  const pairBytes = await readArtifactFile(evidencePath), pair = decode(pairBytes);
  assert.equal(hash(pairBytes), artifactObservation.service_evidence_sha256, 'SERVICE_TARGET_PAIR_CHANGED');
  const bytes = await readArtifactFile(targetEvidencePath), report = decode(bytes), directory = dirname(targetEvidencePath);
  if (report.schema_version === 'source-http-target-observation/v1') {
    return verifySourceTargetEvidence({ artifactObservation, pairBytes, bytes, report, directory,
      targetEvidencePath, targetInputPath, candidate, candidateBytes });
  }
  // Inspect the result root as well as every leaf; symlinked roots are not evidence directories.
  const resultFiles = await fileSet(directory);
  exact(report, ['schema_version', 'status', 'scope', 'input_sha256', 'release_ready', 'activation', 'supply_chain',
    'production_identity', 'journal_binding', 'observations', 'platform', 'artifacts', 'processes', 'cleanup', 'compatibility'], 'SERVICE_TARGET_RECEIPT_SHAPE');
  assert.equal(report.schema_version, 'shinemage-service-target-acceptance-observation/v1', 'SERVICE_TARGET_RECEIPT_SCHEMA');
  assert.equal(report.status, 'PASS', 'SERVICE_TARGET_RECEIPT_NOT_PASS');
  assert.equal(report.scope, 'actual-wsl2-isolated-synthetic-http', 'SERVICE_TARGET_RECEIPT_SCOPE');
  assert.equal(report.release_ready, false, 'SERVICE_TARGET_FALSE_RELEASE_CLAIM');
  assert.equal(report.activation, 'BLOCKED', 'SERVICE_TARGET_FALSE_RELEASE_CLAIM');
  for (const name of ['supply_chain', 'production_identity', 'journal_binding']) assert.equal(report[name], 'NOT_RUN', 'SERVICE_TARGET_UNVERIFIED_CLAIM');
  assert.equal(report.cleanup, 'OWNED_PROCESSES_AND_TEMPORARY_INSTALL_REMOVED', 'SERVICE_TARGET_CLEANUP');
  assert.deepEqual(report.compatibility, { profile_rollback: 'KEEP_CANDIDATE_SERVICE_AND_DURABLE_STATE',
    old_service_write: 'BLOCKED_PROVENANCE_NOT_PRESERVED', identity: 'EPHEMERAL_SYNTHETIC_ONLY',
    candidate_policy: 'SYNTHETIC_A64_ONLY' }, 'SERVICE_TARGET_COMPATIBILITY');
  exact(report.platform, ['system', 'machine', 'kernel', 'python', 'uid'], 'SERVICE_TARGET_PLATFORM');
  assert.equal(report.platform.system, 'Linux', 'SERVICE_TARGET_PLATFORM');
  assert.equal(report.platform.machine, 'x86_64', 'SERVICE_TARGET_PLATFORM');
  assert.equal(report.platform.uid, 65534, 'SERVICE_TARGET_PLATFORM');
  assert.match(report.platform.python ?? '', /^3\.14\.\d+$/, 'SERVICE_TARGET_PLATFORM');
  assert.match(report.platform.kernel ?? '', /^[A-Za-z0-9._+-]{1,128}$/, 'SERVICE_TARGET_PLATFORM');
  assert.ok(/microsoft/i.test(report.platform.kernel) && /wsl2/i.test(report.platform.kernel), 'SERVICE_TARGET_PLATFORM');
  exact(report.artifacts, ['baseline', 'candidate'], 'SERVICE_TARGET_ARTIFACTS');
  const inputBytes = await readArtifactFile(targetInputPath), input = decode(inputBytes), inputRoot = dirname(targetInputPath);
  assert.match(report.input_sha256 ?? '', HEX, 'SERVICE_TARGET_INPUT_DIGEST');
  assert.equal(hash(inputBytes), report.input_sha256, 'SERVICE_TARGET_INPUT_DIGEST');
  exact(input, ['schema_version', 'scope', 'release_ready', 'files'], 'SERVICE_TARGET_INPUT_SHAPE');
  assert.equal(input.schema_version, 'shinemage-target-test-input/v1', 'SERVICE_TARGET_INPUT_SCHEMA');
  assert.equal(input.scope, 'synthetic-service-target-acceptance-only', 'SERVICE_TARGET_INPUT_SCOPE');
  assert.equal(input.release_ready, false, 'SERVICE_TARGET_FALSE_RELEASE_CLAIM');
  const expectedFiles = ['run-acceptance.py', 'pair/receipt.json', 'wheel-preparation.json', 'synthetic-seed.tar', 'synthetic-seed.json',
    ...TARGET_HELPERS.map(path => 'helpers/' + path.split('/').at(-1))];
  const dependencies = pair.artifacts.candidate.installed.dependencies;
  exact(report.artifacts.candidate.wheels, Object.keys(dependencies), 'SERVICE_TARGET_WHEELS');
  for (const [name, version] of Object.entries(dependencies)) {
    const wheel = report.artifacts.candidate.wheels[name];
    exact(wheel, ['file', 'version', 'sha256'], 'SERVICE_TARGET_WHEEL');
    assert.equal(wheel.version, version, 'SERVICE_TARGET_WHEEL');
    assert.ok(typeof wheel.file === 'string' && /^[A-Za-z0-9_.+-]+\.whl$/.test(wheel.file)
      && wheel.file.split('-')[0].toLowerCase().replace(/[-_.]+/g, '-') === name
      && wheel.file.split('-')[1] === version, 'SERVICE_TARGET_WHEEL');
    assert.match(wheel.sha256 ?? '', HEX, 'SERVICE_TARGET_WHEEL');
    expectedFiles.push('wheels/' + wheel.file);
  }
  for (const label of ['baseline', 'candidate']) {
    expectedFiles.push(...['service-manifest.json', 'candidate-receipt.json', pair.artifacts[label].artifact].map(path => `pair/${label}/${path}`));
  }
  exact(input.files, expectedFiles, 'SERVICE_TARGET_INPUT_FILES');
  assert.deepEqual(await fileSet(inputRoot), [...expectedFiles, 'input-manifest.json'].sort(), 'SERVICE_TARGET_INPUT_FILES');
  const content = new Map(); let total = 0;
  for (const name of expectedFiles) {
    const row = input.files[name]; exact(row, ['bytes', 'sha256'], 'SERVICE_TARGET_FILE_RECORD');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 64 * 1024 * 1024, 'SERVICE_TARGET_FILE_SIZE');
    assert.match(row.sha256 ?? '', HEX, 'SERVICE_TARGET_FILE_DIGEST');
    total += row.bytes; assert.ok(total <= 256 * 1024 * 1024, 'SERVICE_TARGET_INPUT_LIMIT');
    const data = await insideArtifact(inputRoot, name, row.bytes);
    assert.ok(data.length === row.bytes && hash(data) === row.sha256, 'SERVICE_TARGET_FILE_DIGEST');
    if (!name.startsWith('wheels/') && !name.endsWith('.tar.zst') && !name.endsWith('.tar')) content.set(name, data);
  }
  assert.equal(input.files['run-acceptance.py'].sha256, TARGET_RUNNER_SHA256, 'SERVICE_TARGET_RUNNER_NOT_REVIEWED');
  for (const path of TARGET_HELPERS) assert.equal(input.files['helpers/' + path.split('/').at(-1)].sha256,
    hash(await insideArtifact(ROOT, path)), 'SERVICE_TARGET_HELPER_DRIFT');
  assert.equal(input.files['pair/receipt.json'].sha256, artifactObservation.service_evidence_sha256, 'SERVICE_TARGET_PAIR_MISMATCH');
  assert.deepEqual(content.get('pair/receipt.json'), pairBytes, 'SERVICE_TARGET_PAIR_MISMATCH');
  verifyPreparation(content, input, pair, report.artifacts.candidate.wheels);
  const supporting = {};
  async function readSupport(name, { empty = false, json = true } = {}) {
    const data = await insideArtifact(directory, name, 1024 * 1024, empty);
    supporting[name] = hash(data); return json ? decode(data) : data.toString('utf8');
  }
  for (const label of ['baseline', 'candidate']) {
    const artifact = pair.artifacts[label], actual = report.artifacts[label];
    exact(actual, ['archive_sha256', 'manifest_sha256', 'service_source', 'installed', 'wheels'], 'SERVICE_TARGET_ARTIFACT_SHAPE');
    assert.equal(actual.archive_sha256, artifact.sha256, 'SERVICE_TARGET_ARTIFACT_MISMATCH');
    assert.equal(actual.manifest_sha256, artifact.manifest_sha256, 'SERVICE_TARGET_ARTIFACT_MISMATCH');
    assert.equal(input.files[`pair/${label}/${artifact.artifact}`].sha256, artifact.sha256, 'SERVICE_TARGET_ARTIFACT_MISMATCH');
    assert.equal(input.files[`pair/${label}/service-manifest.json`].sha256, artifact.manifest_sha256, 'SERVICE_TARGET_ARTIFACT_MISMATCH');
    const { installed: _installed, ...packageReceipt } = artifact;
    assert.deepEqual(decode(content.get(`pair/${label}/candidate-receipt.json`)), packageReceipt, 'SERVICE_TARGET_PACKAGE_RECEIPT');
    assert.deepEqual(actual.service_source, artifact.service_source, 'SERVICE_TARGET_SOURCE_MISMATCH');
    assert.deepEqual(actual.installed, artifact.installed.dependencies, 'SERVICE_TARGET_DEPENDENCIES');
    assert.deepEqual(actual.wheels, report.artifacts.candidate.wheels, 'SERVICE_TARGET_WHEELS');
    assert.deepEqual(await readSupport(label + '-inventory.stdout'), actual.installed, 'SERVICE_TARGET_INSTALLED_INVENTORY');
    const installed = await readSupport(label + '-cold-install.stdout');
    exact(installed, ['python', 'mode', 'wheels'], 'SERVICE_TARGET_INSTALL_SHAPE');
    assert.ok(typeof installed.python === 'string' && /^\/tmp\/shinemage-service-acceptance-[A-Za-z0-9_-]+\/crm-packed-service-wsl-[A-Za-z0-9_-]+\/(baseline|candidate)-venv\/bin\/python$/.test(installed.python)
      && installed.python.endsWith(`/${label}-venv/bin/python`), 'SERVICE_TARGET_INSTALL_PATH');
    assert.equal(installed.mode, 'offline-hashed-wheel-install', 'SERVICE_TARGET_INSTALL_MODE');
    assert.deepEqual(installed.wheels, actual.wheels, 'SERVICE_TARGET_WHEELS');
    for (const wheel of Object.values(actual.wheels)) assert.equal(input.files['wheels/' + wheel.file].sha256, wheel.sha256, 'SERVICE_TARGET_WHEEL_DIGEST');
    const preflight = await readSupport(label + '-preflight.stdout');
    assert.deepEqual(preflight, { schema_version: 'shinemage-service-target-preflight/v1', scope: 'read-only-service-target-readiness',
      status: 'SERVICE_TARGET_PREFLIGHT_PASS', manifest_sha256: artifact.manifest_sha256,
      service: { name: artifact.name, version: artifact.version },
      platform: { system: 'Linux', machine: 'x86_64', python: report.platform.python, wsl2_detected: true },
      checks: [['python', 'PYTHON_MATCH'], ['wsl2', 'WSL2_DETECTED'], ['wheel-tags', 'WHEEL_TAGS_MATCH'], ['wheel-python', 'WHEEL_PYTHON_MATCH']]
        .map(([id, code]) => ({ id, status: 'PASS', code: 'SERVICE_TARGET_' + code })),
      wheels: Object.fromEntries(Object.entries(actual.wheels).map(([name, w]) => [name, {
        version: w.version, sha256: w.sha256, compatible: true, python_compatible: true }])),
      release_ready: false, activation: 'BLOCKED', acceptance: { cold_install: 'NOT_RUN', identity_and_state: 'NOT_RUN', http_recovery: 'NOT_RUN', supply_chain: 'NOT_RUN' },
    }, 'SERVICE_TARGET_PREFLIGHT_MISMATCH');
    for (const phase of ['check', 'final-check']) assert.deepEqual(await readSupport(`${label}-${phase}.stdout`), {
      status: 'SERVICE_PACKAGE_CHECK_PASS', name: artifact.name, version: artifact.version,
      manifest_sha256: artifact.manifest_sha256, scope: 'synthetic_only', release_ready: false,
    }, 'SERVICE_TARGET_PACKAGE_CHECK');
    for (const phase of ['preflight', 'inventory', 'cold-install', 'check', 'final-check']) {
      assert.equal(await readSupport(`${label}-${phase}.stderr`, { empty: true, json: false }), '', 'SERVICE_TARGET_UNEXPECTED_STDERR');
    }
  }
  assert.deepEqual(report.observations, TARGET_CASES.map(name => ({ case: name, status: 'PASS',
    ...(name.endsWith('cold-install') ? { dependencies: Object.keys(dependencies).length } : {}),
    ...(name === 'old-service-readonly-fallback' || name.endsWith('unknown-schema') ? { database_unchanged: true } : {}),
    ...(name.endsWith('unknown-schema') ? { rejected: true } : {}),
    ...(name === 'unsupported-old-write-detected' ? { downgrade: 'BLOCKED_PROVENANCE_NOT_PRESERVED' } : {}),
  })), 'SERVICE_TARGET_OBSERVATIONS');
  assert.ok(Array.isArray(report.processes) && report.processes.length === TARGET_PROCESSES.length, 'SERVICE_TARGET_PROCESSES');
  const pids = new Set();
  for (const [index, [name, operation, label]] of TARGET_PROCESSES.entries()) {
    const proc = report.processes[index], rejected = name.endsWith('unknown-schema');
    exact(proc, ['case', 'operation', 'pid', 'exit_code', 'stopped', ...(rejected ? [] : ['port'])], 'SERVICE_TARGET_PROCESS_SHAPE');
    assert.ok(proc.case === name && proc.operation === operation && proc.stopped === true
      && Number.isSafeInteger(proc.pid) && proc.pid > 0 && !pids.has(proc.pid), 'SERVICE_TARGET_PROCESSES');
    pids.add(proc.pid);
    assert.ok(rejected ? proc.exit_code === 1 : name === 'candidate-save' ? proc.exit_code === -9 : [0, -15].includes(proc.exit_code), 'SERVICE_TARGET_PROCESS_EXIT');
    const stdout = await readSupport(name + '.stdout', { empty: true, json: false });
    const stderr = await readSupport(name + '.stderr', { empty: true, json: false });
    if (rejected) assert.ok(stdout === '' && stderr.includes('schema differs'), 'SERVICE_TARGET_SCHEMA_REJECTION');
    else {
      assert.ok(Number.isSafeInteger(proc.port) && proc.port > 0 && proc.port < 65536, 'SERVICE_TARGET_PORT');
      assert.equal(stderr, '', 'SERVICE_TARGET_UNEXPECTED_STDERR');
      assert.deepEqual(JSON.parse(stdout), { status: 'SERVICE_SOCKET_BOUND', port: proc.port,
        manifest_sha256: pair.artifacts[label].manifest_sha256, openapi: 'MATCHED', scope: 'isolated-package-synthetic-http' }, 'SERVICE_TARGET_PROCESS_RECEIPT');
    }
  }
  const cleanup = await readSupport('cleanup-verification.json');
  assert.deepEqual(cleanup, { schema_version: 'shinemage-target-cleanup-observation/v1',
    production_listener_pid_snapshot_unchanged: true, owned_pids_alive: [], temporary_installs_remaining: [],
    receipt_sha256: hash(bytes), receipt_status: 'PASS', checks: TARGET_CASES.length }, 'SERVICE_TARGET_CLEANUP');
  const before = await readSupport('production-listeners-before.txt', { json: false });
  const after = await readSupport('production-listeners-after.txt', { json: false });
  assert.deepEqual(before.trim().split('\n').sort(), after.trim().split('\n').sort(), 'SERVICE_TARGET_PRODUCTION_CHANGED');
  for (const name of ['baseline', 'candidate', 'seed']) {
    const unpack = await readSupport(name + '-unpack.stdout');
    exact(unpack, ['ok', 'entries', 'bytes', 'destination'], 'SERVICE_TARGET_UNPACK');
    assert.ok(unpack.ok === true && Number.isSafeInteger(unpack.entries) && unpack.entries > 0 && unpack.entries <= 256
      && Number.isSafeInteger(unpack.bytes) && unpack.bytes > 0 && unpack.bytes <= 64 * 1024 * 1024
      && typeof unpack.destination === 'string'
      && /^\/tmp\/shinemage-service-acceptance-[A-Za-z0-9_-]+\/crm-packed-service-wsl-[A-Za-z0-9_-]+\/(baseline-app|candidate-app|analysis-state)$/.test(unpack.destination)
      && unpack.destination.endsWith('/' + (name === 'seed' ? 'analysis-state' : name + '-app')), 'SERVICE_TARGET_UNPACK');
    assert.equal(await readSupport(name + '-unpack.stderr', { empty: true, json: false }), '', 'SERVICE_TARGET_UNEXPECTED_STDERR');
  }
  assert.deepEqual(resultFiles, [...Object.keys(supporting), 'receipt.json'].sort(), 'SERVICE_TARGET_RESULT_FILES');
  return { status: 'LOCAL_WSL_SYNTHETIC_SERVICE_OBSERVATION_VERIFIED', scope: report.scope,
    target_evidence_sha256: hash(bytes), target_input_sha256: report.input_sha256,
    supporting_evidence_sha256: hash(JSON.stringify(supporting)), service_evidence_sha256: artifactObservation.service_evidence_sha256,
    runner_sha256: TARGET_RUNNER_SHA256, platform: report.platform, scenario_count: TARGET_CASES.length,
    release_ready: false, activation: 'BLOCKED', production_identity: 'NOT_RUN', supply_chain: 'NOT_RUN',
    evidence_authenticity: 'UNATTESTED_OPERATOR_OBSERVATION', candidate_policy: 'SYNTHETIC_A64_ONLY' };
}
