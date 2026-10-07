/** Read archived source-HTTP observations; never install, import or activate a service. */
import assert from 'node:assert/strict';
import { lstat, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insideArtifact, readArtifactFile, verifyArtifactArchive } from './service-artifact-evidence.mjs';
import { readGitInput } from '../crm-calibration/package-service.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)), HEX = /^[a-f0-9]{64}$/;
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const CODE = 'SERVICE_SOURCE_TARGET_';
// The fixed controller asserts the HTTP behavior; its receipt remains an operator observation.
export const SOURCE_TARGET_RUNNER_SHA256 = '1532ffac76fb0e0f802dbb445669fed0da44edc5f857a23dfee4e7fa0d7fa365';
export const SOURCE_TARGET_HELPERS = Object.freeze(['scripts/dsh-b0/first-purchase-kernel.probe.py',
  'scripts/dsh-b0/first-purchase-service.probe.py', 'scripts/release/secure-unpack.py',
  'scripts/crm-calibration/service-target-preflight.py', 'scripts/crm-calibration/service-runtime.fixture.py']);
export const SOURCE_TARGET_CASES = Object.freeze(['query-platform-offline-cold-install', 'save-platform-offline-cold-install',
  'independent-http-owner-and-physical-query-worker', 'source-authentication-schema-and-permission',
  'http-save-no-age-policy-idempotency-and-conflict', 'query-offline-save-sigkill-and-durable-replay',
  'unknown-new-save-fail-closed-and-live-revocation', 'synthetic-backup-cold-restore-without-query',
  'query-restart-reuses-run-and-exited-worker', 'input-and-installed-artifact-integrity']);
export const SOURCE_TARGET_PROCESSES = Object.freeze(['query-initial', 'save-initial', 'save-after-crash',
  'save-cold-restore', 'query-restart']);
export const SOURCE_TARGET_FIXTURES = Object.freeze({
  'fixtures/snapshot.json': 'backend/tests/fixtures/analytics_first_purchase_v1.json',
  'fixtures/expected.json': 'backend/tests/fixtures/analytics_first_purchase_v1_expected.json',
});
function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), CODE + code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), CODE + code);
}
async function fileSet(root) {
  const info = await lstat(root);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), CODE + 'DIRECTORY');
  const files = []; let count = 0;
  async function walk(path, prefix = '', depth = 0) {
    assert.ok(depth < 5, CODE + 'DIRECTORY_LIMIT');
    for (const entry of await readdir(path, { withFileTypes: true })) {
      assert.ok(++count <= 100, CODE + 'DIRECTORY_LIMIT');
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), name + '/', depth + 1);
      else { assert.ok(entry.isFile(), CODE + 'ENTRY'); files.push(name); }
    }
  }
  await walk(root); return files.sort();
}
function wheelSet(wheels, dependencies) {
  exact(wheels, Object.keys(dependencies), 'WHEELS');
  for (const [name, version] of Object.entries(dependencies)) {
    const row = wheels[name]; exact(row, ['file', 'version', 'sha256'], 'WHEEL');
    assert.equal(row.version, version, CODE + 'WHEEL_VERSION');
    assert.ok(typeof row.file === 'string' && /^[A-Za-z0-9_.+-]+\.whl$/.test(row.file)
      && row.file.split('-')[0].toLowerCase().replace(/[-_.]+/g, '-') === name
      && row.file.split('-')[1] === version, CODE + 'WHEEL_NAME');
    assert.match(row.sha256 ?? '', HEX, CODE + 'WHEEL_DIGEST');
  }
}
async function verifyQuery(content, source, saveManifest) {
  const receipt = decode(content.get('query/receipt.json')), manifestBytes = content.get('query/kernel-manifest.json');
  const manifest = decode(manifestBytes), recipeBytes = await insideArtifact(ROOT, 'services/analytics-first-purchase-kernel/package.json');
  const recipe = decode(recipeBytes);
  exact(receipt, ['schema_version', 'artifact', 'sha256', 'bytes', 'manifest_sha256', 'source_sha',
    'inputs_sha256', 'wheels', 'release_ready'], 'QUERY_RECEIPT');
  assert.deepEqual({ ...receipt, sha256: hash(content.get('query/archive.tar.zst')),
    bytes: content.get('query/archive.tar.zst').length, manifest_sha256: hash(manifestBytes),
    schema_version: 'dsh-first-purchase-kernel-archive/v1', artifact: 'kernel.tar.zst',
    source_sha: source, inputs_sha256: hash(recipeBytes), release_ready: false }, receipt, CODE + 'QUERY_BINDING');
  assert.deepEqual({ ...manifest, files: Object.keys(manifest.files).sort() }, {
    schema_version: 'dsh-first-purchase-kernel-fixture/v1', scope: 'synthetic-composition-only',
    source_sha: source, inputs_sha256: hash(recipeBytes), python: '3.14', dependencies: recipe.dependencies,
    files: Object.keys(recipe.files).sort(), release_ready: false }, CODE + 'QUERY_MANIFEST');
  wheelSet(receipt.wheels, recipe.dependencies); // Original build wheels may be Mac; never rewrite this receipt.
  const lock = (await readGitInput(ROOT, source, 'requirements-lock.txt')).toString('utf8');
  const pins = Object.fromEntries(lock.split(/\r?\n/).filter(line => /^[A-Za-z0-9_-]+==/.test(line))
    .map(line => { const [name, pin] = line.split('=='); return [name.toLowerCase().replaceAll('_', '-'), pin]; }));
  for (const [name, pin] of Object.entries(recipe.dependencies)) assert.equal(pins[name], pin, CODE + 'QUERY_LOCK');
  await verifyArtifactArchive(content.get('query/archive.tar.zst'), manifestBytes, manifest, {
    manifestName: 'kernel-manifest.json', keys: ['sha256', 'bytes', 'source'],
    async verifyFile(name, row, bytes) {
      assert.equal(row.source, recipe.files[name], CODE + 'QUERY_RECIPE');
      assert.deepEqual(bytes, await readGitInput(ROOT, source, row.source), CODE + 'QUERY_SOURCE');
    },
  });
  const contract = 'backend/contracts/analytics_first_purchase_source.py';
  assert.equal(manifest.files[contract]?.sha256, saveManifest.files[contract]?.sha256, CODE + 'SOURCE_CONTRACT');
  for (const [name, path] of Object.entries(SOURCE_TARGET_FIXTURES))
    assert.deepEqual(content.get(name), await readGitInput(ROOT, source, path), CODE + 'FIXTURE');
  return manifest;
}

export async function verifySourceTargetEvidence({ artifactObservation, pairBytes, bytes, report, directory,
  targetEvidencePath, targetInputPath, candidate, candidateBytes }) {
  const resultFiles = await fileSet(directory);
  exact(report, ['schema_version', 'status', 'scope', 'input_sha256', 'source_sha', 'candidate_digest',
    'release_ready', 'dsh_host', 'activation', 'supply_chain', 'platform', 'observations', 'artifacts', 'processes', 'cleanup'], 'RECEIPT');
  assert.equal(report.status, 'PASS', CODE + 'NOT_PASS');
  assert.equal(report.schema_version, 'source-http-target-observation/v1', CODE + 'SCHEMA');
  assert.equal(report.scope, 'actual-wsl2-synthetic-package-http', CODE + 'SCOPE');
  assert.equal(report.release_ready, false, CODE + 'FALSE_RELEASE_CLAIM');
  assert.equal(report.activation, 'BLOCKED', CODE + 'FALSE_RELEASE_CLAIM');
  for (const key of ['dsh_host', 'supply_chain']) assert.equal(report[key], 'NOT_RUN', CODE + 'UNVERIFIED_CLAIM');
  assert.equal(report.cleanup, 'OWNED_PROCESSES_AND_INSTALLS_REMOVED', CODE + 'CLEANUP');
  exact(report.platform, ['system', 'machine', 'kernel', 'python', 'uid'], 'PLATFORM');
  assert.ok(report.platform.system === 'Linux' && report.platform.machine === 'x86_64' && report.platform.uid === 65534,
    CODE + 'PLATFORM');
  assert.match(report.platform.python ?? '', /^3\.14\.\d+$/, CODE + 'PLATFORM');
  assert.match(report.platform.kernel ?? '', /^[A-Za-z0-9._+-]{1,128}$/, CODE + 'PLATFORM');
  assert.ok(/microsoft/i.test(report.platform.kernel) && /wsl2/i.test(report.platform.kernel), CODE + 'PLATFORM');
  const pair = decode(pairBytes);
  assert.equal(report.source_sha, pair.candidate, CODE + 'SOURCE_BINDING');
  // This finite runner requires a shared source revision. A future multi-repo
  // runner needs its own explicit evidence schema, not relaxed historical checks.
  assert.equal(report.source_sha, candidate.source_sha, CODE + 'CANDIDATE_SOURCE');
  assert.equal(report.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE_BINDING');
  const inputBytes = await readArtifactFile(targetInputPath), input = decode(inputBytes), inputRoot = dirname(targetInputPath);
  assert.equal(basename(targetInputPath), 'input.json', CODE + 'INPUT_PATH');
  assert.equal(basename(targetEvidencePath), 'receipt.json', CODE + 'RECEIPT_PATH');
  assert.equal(hash(inputBytes), report.input_sha256, CODE + 'INPUT_DIGEST');
  exact(input, ['schema_version', 'release_ready', 'source_sha', 'candidate_digest', 'files'], 'INPUT');
  assert.equal(input.schema_version, 'synthetic-source-http-target-input/v1', CODE + 'INPUT_SCHEMA');
  assert.equal(input.release_ready, false, CODE + 'FALSE_RELEASE_CLAIM');
  assert.equal(input.source_sha, report.source_sha, CODE + 'SOURCE_BINDING');
  assert.equal(input.candidate_digest, report.candidate_digest, CODE + 'CANDIDATE_BINDING');
  exact(report.artifacts, ['query', 'save'], 'ARTIFACTS');
  const recipe = decode(await insideArtifact(ROOT, 'services/analytics-first-purchase-kernel/package.json'));
  const expected = ['candidate.json', ...Object.keys(SOURCE_TARGET_FIXTURES), 'helpers/first-purchase-source-target.probe.py',
    ...SOURCE_TARGET_HELPERS.map(path => 'helpers/' + basename(path)), 'query/archive.tar.zst', 'query/kernel-manifest.json',
    'query/receipt.json', 'save/archive.tar.zst', 'save/service-manifest.json', 'save/pair.json'];
  for (const label of ['query', 'save']) {
    const actual = report.artifacts[label];
    exact(actual, ['archive_sha256', 'manifest_sha256', 'installed', 'wheels'], 'ARTIFACT');
    const dependencies = label === 'query' ? recipe.dependencies : pair.artifacts.candidate.installed.dependencies;
    assert.deepEqual(actual.installed, dependencies, CODE + 'DEPENDENCIES');
    wheelSet(actual.wheels, dependencies);
    for (const row of Object.values(actual.wheels)) assert.match(row.file.split('-').at(-1),
      /^(?:any|manylinux[0-9_]+_x86_64)(?:\.manylinux[0-9_]+_x86_64)*\.whl$/, CODE + 'WHEEL_PLATFORM');
    expected.push(...Object.values(actual.wheels).map(row => label + '-wheels/' + row.file));
  }
  for (const [name, row] of Object.entries(report.artifacts.save.wheels))
    assert.deepEqual(row, report.artifacts.query.wheels[name], CODE + 'SHARED_WHEEL');
  exact(input.files, expected, 'INPUT_FILES');
  assert.deepEqual(await fileSet(inputRoot), [...expected, 'input.json'].sort(), CODE + 'INPUT_FILES');
  const content = new Map(); let total = 0;
  for (const name of expected) {
    const row = input.files[name]; exact(row, ['bytes', 'sha256'], 'FILE_RECORD');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 64 * 1024 * 1024, CODE + 'FILE_SIZE');
    total += row.bytes; assert.ok(total <= 96 * 1024 * 1024, CODE + 'INPUT_LIMIT');
    const data = await insideArtifact(inputRoot, name, row.bytes);
    assert.ok(data.length === row.bytes && hash(data) === row.sha256, CODE + 'FILE_DIGEST');
    if (!name.startsWith('query-wheels/') && !name.startsWith('save-wheels/')) content.set(name, data);
  }
  assert.deepEqual(content.get('candidate.json'), candidateBytes, CODE + 'CANDIDATE_BINDING');
  assert.deepEqual(content.get('save/pair.json'), pairBytes, CODE + 'PAIR_BINDING');
  assert.equal(input.files['helpers/first-purchase-source-target.probe.py'].sha256, SOURCE_TARGET_RUNNER_SHA256, CODE + 'RUNNER');
  for (const path of SOURCE_TARGET_HELPERS)
    assert.equal(input.files['helpers/' + basename(path)].sha256, hash(await insideArtifact(ROOT, path)), CODE + 'HELPER');
  const manifests = { save: decode(content.get('save/service-manifest.json')) };
  assert.equal(hash(content.get('save/archive.tar.zst')), pair.artifacts.candidate.sha256, CODE + 'SAVE_ARCHIVE');
  assert.equal(hash(content.get('save/service-manifest.json')), pair.artifacts.candidate.manifest_sha256, CODE + 'SAVE_MANIFEST');
  manifests.query = await verifyQuery(content, report.source_sha, manifests.save);
  const supporting = {}, supportFiles = ['receipt.json'];
  async function support(name, empty = false) {
    const data = await insideArtifact(directory, name, 1024 * 1024, empty);
    supportFiles.push(name); supporting[name] = hash(data);
    if (empty) { assert.equal(data.length, 0, CODE + 'UNEXPECTED_OUTPUT'); return; }
    return decode(data);
  }
  let installRoot;
  for (const label of ['query', 'save']) {
    const actual = report.artifacts[label], manifest = manifests[label];
    assert.equal(actual.archive_sha256, input.files[label + '/archive.tar.zst'].sha256, CODE + 'ARCHIVE');
    assert.equal(actual.manifest_sha256, input.files[label + '/' + (label === 'query' ? 'kernel' : 'service') + '-manifest.json'].sha256, CODE + 'MANIFEST');
    for (const wheel of Object.values(actual.wheels))
      assert.equal(input.files[label + '-wheels/' + wheel.file].sha256, wheel.sha256, CODE + 'WHEEL_DIGEST');
    assert.deepEqual(await support(label + '-dependencies.stdout'), actual.installed, CODE + 'INSTALLED_INVENTORY');
    const installed = await support(label + '-install.stdout');
    exact(installed, ['python', 'mode', 'wheels'], 'INSTALL');
    assert.equal(installed.mode, 'offline-hashed-wheel-install', CODE + 'INSTALL_MODE');
    assert.deepEqual(installed.wheels, actual.wheels, CODE + 'INSTALL_WHEELS');
    const match = typeof installed.python === 'string' && installed.python.match(
      /^(\/tmp\/shinemage-source-acceptance-[A-Za-z0-9_-]+\/source-http-owned-[A-Za-z0-9_-]+)\/(query|save)-venv\/bin\/python$/);
    assert.ok(match && match[2] === label, CODE + 'INSTALL_PATH');
    installRoot ??= match[1]; assert.equal(match[1], installRoot, CODE + 'INSTALL_PATH');
    const manifestFile = content.get(label + '/' + (label === 'query' ? 'kernel' : 'service') + '-manifest.json');
    assert.deepEqual(await support(label + '-unpack.stdout'), { ok: true, entries: Object.keys(manifest.files).length + 1,
      bytes: Object.values(manifest.files).reduce((sum, row) => sum + row.bytes, manifestFile.length),
      destination: installRoot + '/' + label + '-app' }, CODE + 'UNPACK');
    for (const phase of ['dependencies', 'install', 'unpack']) await support(label + '-' + phase + '.stderr', true);
  }
  assert.deepEqual(await support('save-final-integrity.stdout'), { status: 'SERVICE_PACKAGE_CHECK_PASS',
    name: pair.artifacts.candidate.name, version: pair.artifacts.candidate.version,
    manifest_sha256: pair.artifacts.candidate.manifest_sha256, scope: 'synthetic_only', release_ready: false }, CODE + 'FINAL_CHECK');
  await support('save-final-integrity.stderr', true);
  assert.ok(Array.isArray(report.processes) && report.processes.length === SOURCE_TARGET_PROCESSES.length, CODE + 'PROCESSES');
  const pids = new Set(), handshakes = {};
  for (const [index, name] of SOURCE_TARGET_PROCESSES.entries()) {
    const row = report.processes[index], label = name.startsWith('query') ? 'query' : 'save';
    exact(row, ['name', 'pid', 'stopped', 'port', 'exit_code', 'intentional_crash'], 'PROCESS');
    assert.ok(row.name === name && row.stopped === true && Number.isSafeInteger(row.pid) && row.pid > 0
      && !pids.has(row.pid), CODE + 'PROCESS');
    pids.add(row.pid);
    const crash = name === 'save-initial';
    assert.ok(row.intentional_crash === crash && (crash ? row.exit_code === -9 : [0, -15].includes(row.exit_code)), CODE + 'PROCESS_EXIT');
    assert.ok(Number.isSafeInteger(row.port) && row.port > 0 && row.port < 65536, CODE + 'PORT');
    const bound = await support(name + '.json');
    assert.equal(bound.pid, row.pid, CODE + 'HANDSHAKE');
    assert.equal(bound.port, row.port, CODE + 'HANDSHAKE');
    assert.equal(bound.manifest_sha256, report.artifacts[label].manifest_sha256, CODE + 'HANDSHAKE');
    assert.ok(bound.imports && typeof bound.imports === 'object' && !Array.isArray(bound.imports)
      && Object.keys(bound.imports).length > 0 && Object.keys(bound.imports).length <= 100, CODE + 'IMPORTS');
    for (const [module, path] of Object.entries(bound.imports)) {
      assert.match(module, /^backend(?:\.[a-z0-9_]+)*$/, CODE + 'IMPORTS');
      assert.ok(Object.hasOwn(manifests[label].files, path)
        && [module.replaceAll('.', '/') + '.py', module.replaceAll('.', '/') + '/__init__.py'].includes(path), CODE + 'IMPORTS');
    }
    if (label === 'query') {
      exact(bound, ['status', 'pid', 'port', 'manifest_sha256', 'source_sha', 'run_id', 'evidence_digest',
        'worker_pid', 'worker_count', 'worker_exit_code', 'imports'], 'QUERY_HANDSHAKE');
      assert.ok(bound.status === 'QUERY_SOURCE_BOUND' && bound.port === 4335 && bound.source_sha === report.source_sha
        && bound.worker_count === 1 && bound.worker_exit_code === 0
        && Number.isSafeInteger(bound.worker_pid) && bound.worker_pid > 0, CODE + 'WORKER');
      assert.match(bound.run_id ?? '', /^run_[a-f0-9]{32}$/, CODE + 'RUN');
      assert.match(bound.evidence_digest ?? '', HEX, CODE + 'RUN');
      for (const name of ['backend.analytics_first_purchase_source_app', 'backend.services.analytics.first_purchase.runtime'])
        assert.ok(Object.hasOwn(bound.imports, name), CODE + 'IMPORTS');
    } else {
      assert.deepEqual(bound, { status: 'SERVICE_SOCKET_BOUND', port: row.port, pid: row.pid,
        manifest_sha256: report.artifacts.save.manifest_sha256, candidate_digest: candidate.candidate_digest,
        openapi: 'MATCHED', imports: bound.imports, scope: 'saved-analysis-artifact-only',
        source_contract: 'first-purchase-frozen-source/v1', sqlite_scope: 'saved-analysis-only',
        sqlite_files: ['analyses/first_purchase_analyses.sqlite3'], query_runtime: 'independent-offline-query-artifact',
        release_ready: false }, CODE + 'SAVE_HANDSHAKE');
      assert.ok(Object.hasOwn(bound.imports, 'backend.services.analytics.first_purchase.source_http'), CODE + 'IMPORTS');
    }
    handshakes[name] = bound;
    await support(name + '.stdout', true); await support(name + '.stderr', true);
  }
  const initial = handshakes['query-initial'], replay = handshakes['query-restart'];
  assert.ok(!pids.has(initial.worker_pid), CODE + 'WORKER');
  assert.deepEqual({ ...replay, pid: initial.pid }, initial, CODE + 'QUERY_REPLAY');
  assert.deepEqual(report.observations, SOURCE_TARGET_CASES.map((name, i) => ({ case: name, status: 'PASS',
    ...(i < 2 ? { dependencies: Object.keys(report.artifacts[i === 0 ? 'query' : 'save'].installed).length } : {}),
    ...(i === 2 ? { worker_pid: initial.worker_pid } : {}) })), CODE + 'OBSERVATIONS');
  assert.deepEqual(resultFiles, supportFiles.sort(), CODE + 'RESULT_FILES');
  return { status: 'LOCAL_WSL_SYNTHETIC_SOURCE_HTTP_OBSERVATION_VERIFIED', scope: report.scope,
    target_evidence_sha256: hash(bytes), target_input_sha256: hash(inputBytes),
    supporting_evidence_sha256: hash(JSON.stringify(supporting)), service_evidence_sha256: artifactObservation.service_evidence_sha256,
    runner_sha256: SOURCE_TARGET_RUNNER_SHA256, query_archive_sha256: report.artifacts.query.archive_sha256,
    query_manifest_sha256: report.artifacts.query.manifest_sha256, platform: report.platform, scenario_count: SOURCE_TARGET_CASES.length,
    release_ready: false, activation: 'BLOCKED', dsh_host: 'NOT_RUN', cross_version_service_recovery: 'NOT_RUN',
    production_identity: 'NOT_RUN', supply_chain: 'NOT_RUN', production_listener_preservation: 'NOT_VERIFIED_BY_THIS_RECEIPT',
    evidence_authenticity: 'UNATTESTED_OPERATOR_OBSERVATION', candidate_policy: 'SYNTHETIC_NO_AGE_POLICY' };
}
