/** Parser/journal fixtures only: fake wheel/seed bytes, never a service or WSL run. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceDigest as hash } from '../service-compatibility.mjs';
import { json, parse } from './service-artifacts.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
export async function refreshTargetReceipt(directory) {
  const receipt = join(directory, 'target-result/receipt.json');
  const cleanup = join(directory, 'target-result/cleanup-verification.json');
  await json(cleanup, { schema_version: 'shinemage-target-cleanup-observation/v1',
    production_listener_pid_snapshot_unchanged: true, owned_pids_alive: [], temporary_installs_remaining: [],
    receipt_sha256: hash(await readFile(receipt)), receipt_status: 'PASS', checks: 14 });
}
export async function refreshTargetInput(directory) {
  const inputPath = join(directory, 'target-input/input-manifest.json'), input = await parse(inputPath);
  for (const name of Object.keys(input.files)) {
    const bytes = await readFile(join(dirname(inputPath), name));
    input.files[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  await json(inputPath, input);
  const receipt = join(directory, 'target-result/receipt.json'), report = await parse(receipt);
  report.input_sha256 = hash(await readFile(inputPath));
  await json(receipt, report); await refreshTargetReceipt(directory);
}

export async function createTargetFixture(directory) {
  const input = join(directory, 'target-input'), result = join(directory, 'target-result');
  await mkdir(input); await mkdir(result);
  const files = {};
  async function add(name, bytes) {
    await mkdir(dirname(join(input, name)), { recursive: true });
    await writeFile(join(input, name), bytes);
    files[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  await add('run-acceptance.py', await readFile(join(root, 'scripts/release/test-fixtures/target-acceptance-20261006.py')));
  for (const path of ['scripts/crm-calibration/service-target-preflight.py', 'scripts/crm-calibration/service-runtime.fixture.py',
    'scripts/crm-calibration/first-purchase-package.fixture.py', 'scripts/release/secure-unpack.py'])
    await add('helpers/' + path.split('/').at(-1), await readFile(join(root, path)));
  const pair = await parse(join(directory, 'pair/receipt.json'));
  await add('pair/receipt.json', await readFile(join(directory, 'pair/receipt.json')));
  const wheels = {}, prepWheels = {};
  for (const [name, version] of Object.entries(pair.artifacts.candidate.installed.dependencies)) {
    const file = name.replaceAll('-', '_') + '-' + version + '-py3-none-any.whl';
    const bytes = Buffer.from('validator-only opaque wheel ' + name);
    await add('wheels/' + file, bytes);
    wheels[name] = { file, version, sha256: hash(bytes) };
    prepWheels[name] = { ...wheels[name], bytes: bytes.length,
      url: 'https://files.pythonhosted.org/packages/validator/' + file,
      metadata_url: 'https://pypi.org/pypi/' + name + '/' + version + '/json',
      metadata_sha256: 'f'.repeat(64), matched_target_tags: ['py3-none-any'] };
  }
  await add('wheel-preparation.json', Buffer.from(JSON.stringify({
    schema_version: 'shinemage-target-wheel-preparation/v1', status: 'PINNED_TARGET_WHEELS_PREPARED',
    scope: 'local-download-for-observed-target', platform_observation_sha256: 'a'.repeat(64),
    service_manifest_sha256: pair.artifacts.candidate.manifest_sha256, wheelhouse: 'validator-only',
    wheels: prepWheels, release_ready: false, target_preflight: 'NOT_RUN', cold_install: 'NOT_RUN',
    http_recovery: 'NOT_RUN', supply_chain_attestation: 'NOT_RUN', activation: 'NOT_RUN' })));
  await add('synthetic-seed.tar', Buffer.from('validator-only opaque seed'));
  await add('synthetic-seed.json', Buffer.from(JSON.stringify({
    scope: 'locally-generated-synthetic-worker-only', source: pair.baseline, release_ready: false,
    files: ['.synthetic-package-test', 'context.json', 'runs/runs.sqlite3'].map(path => ({ path, bytes: 1, sha256: hash('x') })) })));
  const artifacts = {}, platform = { system: 'Linux', machine: 'x86_64', python: '3.14.4',
    kernel: '6.18.33.2-microsoft-standard-WSL2', uid: 65534 };
  const remoteRoot = '/tmp/shinemage-service-acceptance-validator/crm-packed-service-wsl-validator';
  for (const label of ['baseline', 'candidate']) {
    const artifact = pair.artifacts[label];
    for (const name of ['service-manifest.json', 'candidate-receipt.json', artifact.artifact])
      await add('pair/' + label + '/' + name, await readFile(join(directory, 'pair', label, name)));
    artifacts[label] = { archive_sha256: artifact.sha256, manifest_sha256: artifact.manifest_sha256,
      service_source: artifact.service_source, installed: artifact.installed.dependencies, wheels };
    await json(join(result, label + '-inventory.stdout'), artifact.installed.dependencies);
    await json(join(result, label + '-cold-install.stdout'), { python: remoteRoot + '/' + label + '-venv/bin/python',
      mode: 'offline-hashed-wheel-install', wheels });
    await json(join(result, label + '-preflight.stdout'), {
      schema_version: 'shinemage-service-target-preflight/v1', scope: 'read-only-service-target-readiness',
      status: 'SERVICE_TARGET_PREFLIGHT_PASS', manifest_sha256: artifact.manifest_sha256,
      service: { name: artifact.name, version: artifact.version },
      platform: { system: 'Linux', machine: 'x86_64', python: '3.14.4', wsl2_detected: true },
      checks: [['python', 'PYTHON_MATCH'], ['wsl2', 'WSL2_DETECTED'], ['wheel-tags', 'WHEEL_TAGS_MATCH'], ['wheel-python', 'WHEEL_PYTHON_MATCH']]
        .map(([id, code]) => ({ id, status: 'PASS', code: 'SERVICE_TARGET_' + code })),
      wheels: Object.fromEntries(Object.entries(wheels).map(([name, w]) => [name, {
        version: w.version, sha256: w.sha256, compatible: true, python_compatible: true }])),
      release_ready: false, activation: 'BLOCKED', acceptance: { cold_install: 'NOT_RUN',
        identity_and_state: 'NOT_RUN', http_recovery: 'NOT_RUN', supply_chain: 'NOT_RUN' } });
    for (const name of ['check', 'final-check']) await json(join(result, label + '-' + name + '.stdout'),
      { status: 'SERVICE_PACKAGE_CHECK_PASS', name: artifact.name, version: artifact.version,
        manifest_sha256: artifact.manifest_sha256, scope: 'synthetic_only', release_ready: false });
    for (const name of ['inventory', 'cold-install', 'preflight', 'check', 'final-check'])
      await writeFile(join(result, label + '-' + name + '.stderr'), '');
  }
  for (const name of ['baseline', 'candidate', 'seed']) {
    await json(join(result, name + '-unpack.stdout'), { ok: true, entries: 12, bytes: 1000,
      destination: remoteRoot + '/' + (name === 'seed' ? 'analysis-state' : name + '-app') });
    await writeFile(join(result, name + '-unpack.stderr'), '');
  }
  const processes = [];
  for (const [name, operation, label] of [['legacy-seed', 'legacy-write', 'baseline'], ['candidate-save', 'serve', 'candidate'],
    ['crash-replay', 'recover', 'candidate'], ['old-readonly', 'legacy-readonly', 'baseline'],
    ['forward-fix', 'recover', 'candidate'], ['cold-restore', 'recover', 'candidate'],
    ['unsupported-old-write', 'legacy-write', 'baseline'], ['detect-old-write', 'recover', 'candidate'],
    ['baseline-unknown-schema', 'legacy-readonly', 'baseline'], ['candidate-unknown-schema', 'recover', 'candidate']]) {
    const rejected = name.endsWith('unknown-schema'), port = 40000 + processes.length;
    processes.push({ case: name, operation, pid: 1000 + processes.length,
      exit_code: rejected ? 1 : name === 'candidate-save' ? -9 : -15, stopped: true, ...(rejected ? {} : { port }) });
    await writeFile(join(result, name + '.stdout'), rejected ? '' : JSON.stringify({ status: 'SERVICE_SOCKET_BOUND',
      port, manifest_sha256: artifacts[label].manifest_sha256, openapi: 'MATCHED', scope: 'isolated-package-synthetic-http' }));
    await writeFile(join(result, name + '.stderr'), rejected ? 'fixture: schema differs' : '');
  }
  await json(join(input, 'input-manifest.json'), { schema_version: 'shinemage-target-test-input/v1',
    scope: 'synthetic-service-target-acceptance-only', release_ready: false, files });
  const cases = ['baseline-preflight-cold-install', 'candidate-preflight-cold-install', 'legacy-save',
    'legacy-state-upgrade', 'freshness-admission-and-permission', 'save-conflict-and-owned-process-crash',
    'crash-reconcile-idempotency-and-unknown', 'old-service-readonly-fallback', 'candidate-forward-fix',
    'synthetic-backup-cold-restore', 'unsupported-old-write-detected', 'baseline-unknown-schema',
    'candidate-unknown-schema', 'input-and-installed-artifact-integrity'];
  await json(join(result, 'receipt.json'), { schema_version: 'shinemage-service-target-acceptance-observation/v1',
    status: 'PASS', scope: 'actual-wsl2-isolated-synthetic-http', input_sha256: hash(await readFile(join(input, 'input-manifest.json'))),
    release_ready: false, activation: 'BLOCKED', supply_chain: 'NOT_RUN', production_identity: 'NOT_RUN', journal_binding: 'NOT_RUN',
    observations: cases.map(name => ({ case: name, status: 'PASS', ...(name.endsWith('cold-install') ? { dependencies: 13 } : {}),
      ...(name === 'old-service-readonly-fallback' || name.endsWith('unknown-schema') ? { database_unchanged: true } : {}),
      ...(name.endsWith('unknown-schema') ? { rejected: true } : {}),
      ...(name === 'unsupported-old-write-detected' ? { downgrade: 'BLOCKED_PROVENANCE_NOT_PRESERVED' } : {}) })),
    platform, artifacts, processes, cleanup: 'OWNED_PROCESSES_AND_TEMPORARY_INSTALL_REMOVED',
    compatibility: { profile_rollback: 'KEEP_CANDIDATE_SERVICE_AND_DURABLE_STATE', old_service_write: 'BLOCKED_PROVENANCE_NOT_PRESERVED',
      identity: 'EPHEMERAL_SYNTHETIC_ONLY', candidate_policy: 'SYNTHETIC_A64_ONLY' } });
  for (const phase of ['before', 'after']) await writeFile(join(result, 'production-listeners-' + phase + '.txt'),
    'LISTEN 0 100 127.0.0.1:6677 0.0.0.0:* users:(fixture pid=42)\n');
  await refreshTargetReceipt(directory);
}
