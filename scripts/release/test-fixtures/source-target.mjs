/** Validator-only fixture. No service, dependency install or remote host is run here. */
import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readGitInput } from '../../crm-calibration/package-service.mjs';
import { SOURCE_TARGET_CASES, SOURCE_TARGET_HELPERS, SOURCE_TARGET_FIXTURES, SOURCE_TARGET_PROCESSES } from '../source-target-evidence.mjs';
import { serviceDigest as hash } from '../service-compatibility.mjs';
import { json, parse } from './service-artifacts.mjs';
import { recordEvent } from '../state.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url)), exec = promisify(execFile);
// These are fabricated verifier inputs, never a real candidate or Git provenance claim.
export async function bindSourceFixtureCandidate(directory, revision) {
  const candidate = await parse(join(directory, 'candidate/candidate.json'));
  candidate.source_sha = revision;
  const { candidate_digest: _digest, activation: _activation, state_scope: _scope, ...base } = candidate;
  candidate.candidate_digest = hash(JSON.stringify(base));
  await json(join(directory, 'candidate/candidate.json'), candidate);
  const pack = await parse(join(directory, 'candidate/plugin-pack.json'));
  pack.source_sha = revision; await json(join(directory, 'candidate/plugin-pack.json'), pack);
  const prior = await parse(join(directory, 'state.json'));
  await rename(join(directory, 'state.json'), join(directory, 'prior-state-' + revision + '.json'));
  const profile = await parse(join(directory, 'candidate/profile.json'));
  await recordEvent(join(directory, 'state.json'), { release_tag: prior.release_tag, status: 'CANDIDATE_PREPARED',
    candidate_digest: candidate.candidate_digest, profile_digest: candidate.profile_digest,
    pack_sha256: candidate.pack.sha256, service_binding: profile.service_binding },
  { idempotencyKey: 'candidate:' + hash(JSON.stringify([candidate.plugin.id, candidate.plugin.version])) });
  return candidate;
}
export async function refreshSourceInput(directory) {
  const inputRoot = join(directory, 'target-input'), input = await parse(join(inputRoot, 'input.json'));
  input.files = {};
  async function walk(path, prefix = '') {
    for (const row of await readdir(path, { withFileTypes: true })) {
      if (row.isDirectory()) await walk(join(path, row.name), prefix + row.name + '/');
      else if (prefix + row.name !== 'input.json') {
        const bytes = await readFile(join(path, row.name));
        input.files[prefix + row.name] = { bytes: bytes.length, sha256: hash(bytes) };
      }
    }
  }
  await walk(inputRoot); await json(join(inputRoot, 'input.json'), input);
  const receiptPath = join(directory, 'target-result/receipt.json'), receipt = await parse(receiptPath);
  receipt.input_sha256 = hash(await readFile(join(inputRoot, 'input.json')));
  await json(receiptPath, receipt);
}
export async function createSourceTargetFixture(directory, revision) {
  await bindSourceFixtureCandidate(directory, revision);
  const inputRoot = join(directory, 'target-input'), output = join(directory, 'target-result');
  await mkdir(inputRoot); await mkdir(output);
  const put = async (name, bytes) => { await mkdir(dirname(join(inputRoot, name)), { recursive: true }); await writeFile(join(inputRoot, name), bytes); };
  const candidateBytes = await readFile(join(directory, 'candidate/candidate.json')), candidate = JSON.parse(candidateBytes);
  const pairBytes = await readFile(join(directory, 'pair/receipt.json')), pair = JSON.parse(pairBytes);
  const recipeBytes = await readFile(join(ROOT, 'services/analytics-first-purchase-kernel/package.json')), recipe = JSON.parse(recipeBytes);
  const stage = join(directory, 'query-stage'); await mkdir(stage);
  const files = {};
  for (const [name, source] of Object.entries(recipe.files)) {
    const bytes = await readGitInput(ROOT, revision, source);
    await mkdir(dirname(join(stage, name)), { recursive: true }); await writeFile(join(stage, name), bytes);
    files[name] = { sha256: hash(bytes), bytes: bytes.length, source };
  }
  const queryManifest = { schema_version: 'dsh-first-purchase-kernel-fixture/v1', scope: recipe.scope,
    source_sha: revision, inputs_sha256: hash(recipeBytes), python: '3.14', dependencies: recipe.dependencies, files, release_ready: false };
  await json(join(stage, 'kernel-manifest.json'), queryManifest);
  await json(join(directory, 'query-allow.json'), [...Object.keys(files), 'kernel-manifest.json']);
  await mkdir(join(inputRoot, 'query'));
  await exec('python3', [join(ROOT, 'scripts/release/pack.py'), stage, join(directory, 'query-allow.json'),
    join(inputRoot, 'query/archive.tar.zst')], { cwd: directory, timeout: 30000 });
  await cp(join(stage, 'kernel-manifest.json'), join(inputRoot, 'query/kernel-manifest.json'));
  await put('save/pair.json', pairBytes); await put('candidate.json', candidateBytes);
  await put('save/service-manifest.json', await readFile(join(directory, 'pair/candidate/service-manifest.json')));
  await put('save/archive.tar.zst', await readFile(join(directory, 'pair/candidate', pair.artifacts.candidate.artifact)));
  await put('helpers/first-purchase-source-target.probe.py', await readFile(join(ROOT, 'scripts/dsh-b0/first-purchase-source-target.probe.py')));
  for (const path of SOURCE_TARGET_HELPERS) await put('helpers/' + basename(path), await readFile(join(ROOT, path)));
  for (const [name, path] of Object.entries(SOURCE_TARGET_FIXTURES)) await put(name, await readGitInput(ROOT, revision, path));
  const manifests = { query: queryManifest, save: await parse(join(inputRoot, 'save/service-manifest.json')) };
  const artifacts = {};
  const installRoot = '/tmp/shinemage-source-acceptance-verifier/source-http-owned-fixture';
  for (const label of ['query', 'save']) {
    const manifestName = (label === 'query' ? 'kernel' : 'service') + '-manifest.json';
    const manifestBytes = await readFile(join(inputRoot, label, manifestName)), manifest = manifests[label], wheels = {};
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      const file = name.replaceAll('-', '_') + '-' + version + '-py3-none-any.whl';
      const data = Buffer.from('opaque validator wheel ' + file); // Not installed or represented as actual wheel evidence.
      await put(label + '-wheels/' + file, data);
      wheels[name] = { file, version, sha256: hash(data) };
    }
    artifacts[label] = { archive_sha256: hash(await readFile(join(inputRoot, label, 'archive.tar.zst'))),
      manifest_sha256: hash(manifestBytes), installed: manifest.dependencies, wheels };
    await json(join(output, label + '-dependencies.stdout'), manifest.dependencies);
    await json(join(output, label + '-install.stdout'), { python: installRoot + '/' + label + '-venv/bin/python',
      mode: 'offline-hashed-wheel-install', wheels });
    await json(join(output, label + '-unpack.stdout'), { ok: true, entries: Object.keys(manifest.files).length + 1,
      bytes: Object.values(manifest.files).reduce((sum, row) => sum + row.bytes, manifestBytes.length),
      destination: installRoot + '/' + label + '-app' });
    for (const phase of ['dependencies', 'install', 'unpack']) await writeFile(join(output, label + '-' + phase + '.stderr'), '');
  }
  const archive = await readFile(join(inputRoot, 'query/archive.tar.zst'));
  await json(join(inputRoot, 'query/receipt.json'), { schema_version: 'dsh-first-purchase-kernel-archive/v1',
    artifact: 'kernel.tar.zst', sha256: hash(archive), bytes: archive.length, manifest_sha256: artifacts.query.manifest_sha256,
    source_sha: revision, inputs_sha256: hash(recipeBytes), wheels: artifacts.query.wheels, release_ready: false });
  await json(join(output, 'save-final-integrity.stdout'), { status: 'SERVICE_PACKAGE_CHECK_PASS',
    name: pair.artifacts.candidate.name, version: pair.artifacts.candidate.version,
    manifest_sha256: artifacts.save.manifest_sha256, scope: 'synthetic_only', release_ready: false });
  await writeFile(join(output, 'save-final-integrity.stderr'), '');
  const processes = [];
  for (const [index, name] of SOURCE_TARGET_PROCESSES.entries()) {
    const query = name.startsWith('query'), pid = 1100 + index, port = query ? 4335 : 4400 + index;
    processes.push({ name, pid, port, stopped: true, exit_code: name === 'save-initial' ? -9 : 0, intentional_crash: name === 'save-initial' });
    const bound = query ? { status: 'QUERY_SOURCE_BOUND', pid, port, manifest_sha256: artifacts.query.manifest_sha256,
      source_sha: revision, run_id: 'run_' + 'a'.repeat(32), evidence_digest: 'b'.repeat(64), worker_pid: 2200,
      worker_count: 1, worker_exit_code: 0, imports: { 'backend.analytics_first_purchase_source_app': 'backend/analytics_first_purchase_source_app.py',
        'backend.services.analytics.first_purchase.runtime': 'backend/services/analytics/first_purchase/runtime.py' } }
      : { status: 'SERVICE_SOCKET_BOUND', pid, port, manifest_sha256: artifacts.save.manifest_sha256,
        candidate_digest: candidate.candidate_digest, openapi: 'MATCHED',
        imports: { 'backend.services.analytics.first_purchase.source_http': 'backend/services/analytics/first_purchase/source_http.py' },
        scope: 'saved-analysis-artifact-only', source_contract: 'first-purchase-frozen-source/v1', sqlite_scope: 'saved-analysis-only',
        sqlite_files: ['analyses/first_purchase_analyses.sqlite3'], query_runtime: 'independent-offline-query-artifact', release_ready: false };
    await json(join(output, name + '.json'), bound);
    for (const suffix of ['.stdout', '.stderr']) await writeFile(join(output, name + suffix), '');
  }
  await json(join(output, 'receipt.json'), { schema_version: 'source-http-target-observation/v1', status: 'PASS',
    scope: 'actual-wsl2-synthetic-package-http', input_sha256: '0'.repeat(64), source_sha: revision,
    candidate_digest: candidate.candidate_digest, release_ready: false, dsh_host: 'NOT_RUN', activation: 'BLOCKED', supply_chain: 'NOT_RUN',
    platform: { system: 'Linux', machine: 'x86_64', kernel: '6.18.0-microsoft-standard-WSL2', python: '3.14.4', uid: 65534 },
    observations: SOURCE_TARGET_CASES.map((name, i) => ({ case: name, status: 'PASS',
      ...(i < 2 ? { dependencies: Object.keys(manifests[i === 0 ? 'query' : 'save'].dependencies).length } : {}),
      ...(i === 2 ? { worker_pid: 2200 } : {}) })), artifacts, processes, cleanup: 'OWNED_PROCESSES_AND_INSTALLS_REMOVED' });
  await json(join(inputRoot, 'input.json'), { schema_version: 'synthetic-source-http-target-input/v1',
    release_ready: false, source_sha: revision, candidate_digest: candidate.candidate_digest, files: {} });
  await refreshSourceInput(directory);
}
