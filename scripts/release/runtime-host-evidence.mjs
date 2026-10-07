/** Verify archived WSL first-purchase observations; never start or activate a Host. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, realpath, mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPreparedServiceCandidate } from './plugin-service-evidence.mjs';
import { insideArtifact } from './service-artifact-evidence.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { readGitInput } from '../crm-calibration/package-service.mjs';
import { readFirstPurchaseRuntime, platformWheels } from '../dsh-b0/first-purchase-runtime-artifacts.mjs';
import { recordEvent } from './state.mjs';
import { DSH_UPSTREAM_SHA, DSH_SDK_VERSION, NODE_MAJOR } from './toolchain.mjs';

export const RUNTIME_HOST_SCHEMA = 'dsh-runtime-host-evidence/v1';
export const RUNTIME_HOST_SOURCE = '4d792eebc577686e452757d1986051aaf03d47ba';
export const RUNTIME_HOST_TEST_ROOT = 'host-r2/tests/test_official_host_crm_query_scurrent';
export const RUNTIME_HOST_REQUIRED_CODE = Object.freeze([
  'backend/tests/test_analytics_first_purchase_official_host.py',
  'backend/tests/first_purchase_packed_kernel_support.py', 'backend/tests/first_purchase_packed_service_support.py',
  'scripts/dsh-b0/first-purchase-crm-host.probe.mjs', 'scripts/dsh-b0/first-purchase-artifacts.mjs',
  'scripts/dsh-b0/first-purchase-kernel-artifacts.mjs', 'scripts/dsh-b0/first-purchase-service-artifacts.mjs',
  'scripts/dsh-b0/first-purchase-runtime-artifacts.mjs', 'scripts/dsh-b0/pinned-host-acceptance.mjs',
  'scripts/dsh-b0/pinned-host-observer.mjs', 'scripts/release/secure-runtime-unpack.py',
]);
const ROOT = fileURLToPath(new URL('../..', import.meta.url)), CODE = 'PLUGIN_HOST_RUNTIME_', HEX = /^[a-f0-9]{64}$/;
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const exact = (v, keys, code) => assert.deepEqual(Object.keys(v ?? {}).sort(), [...keys].sort(), CODE + code);
const namespacePaths = ['backend', 'backend/contracts', 'backend/semantic', 'backend/services',
  'backend/services/analytics', 'backend/services/analytics/first_purchase', 'backend/tests'].map(p => `repo/${p}/__init__.py`);
const sourceHashes = new Map();
const exec = promisify(execFile);
async function sourceHash(path) {
  if (!sourceHashes.has(path)) sourceHashes.set(path, readGitInput(ROOT, RUNTIME_HOST_SOURCE, path).then(hash));
  return sourceHashes.get(path);
}
export async function checkedSet(directory, files, maxTotal, maxFiles = 400) {
  assert.ok(files && !Array.isArray(files) && Object.keys(files).length > 0 && Object.keys(files).length <= maxFiles, CODE + 'FILE_SET');
  const content = new Map(); let total = 0;
  for (const [name, row] of Object.entries(files)) {
    exact(row, ['bytes', 'sha256'], 'FILE_RECORD'); assert.match(row.sha256 ?? '', HEX, CODE + 'FILE_DIGEST');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 64 * 1024 * 1024, CODE + 'FILE_SIZE');
    total += row.bytes; assert.ok(total <= maxTotal, CODE + 'FILE_LIMIT');
    const bytes = await insideArtifact(directory, name, Math.max(1, row.bytes), true);
    assert.ok(bytes.length === row.bytes && hash(bytes) === row.sha256, CODE + 'FILE_DIGEST');
    content.set(name, bytes);
  }
  return content;
}
async function archiveDigest(directory, ref, artifact) {
  exact(ref, ['name', 'sha256'], 'REFERENCE'); assert.equal(ref.sha256, artifact.sha256, CODE + 'ARCHIVE_DIGEST');
  assert.ok(typeof ref.name === 'string' && !isAbsolute(ref.name) && !/[\\\0]/.test(ref.name)
    && ref.name.split('/').every(p => p && p !== '.' && p !== '..'), CODE + 'ARCHIVE_PATH');
  const path = join(directory, ref.name), rel = relative(await realpath(directory), await realpath(path));
  assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('../') && rel !== '..', CODE + 'ARCHIVE_PATH');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat(); assert.ok(stat.isFile() && stat.size === artifact.bytes, CODE + 'ARCHIVE_SIZE');
    let bytes = 0; const sum = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      bytes += chunk.length; assert.ok(bytes <= artifact.bytes, CODE + 'ARCHIVE_SIZE'); sum.update(chunk);
    }
    assert.ok(bytes === artifact.bytes && sum.digest('hex') === artifact.sha256, CODE + 'ARCHIVE_DIGEST');
  } finally { await file.close(); }
}
export async function checkController(content, overrides = {}) {
  const mapping = decode(content.get('namespace-inputs.json'));
  assert.ok(Array.isArray(mapping), CODE + 'NAMESPACE');
  assert.deepEqual(mapping.map(r => r.path).sort(), [...namespacePaths].sort(), CODE + 'NAMESPACE');
  for (const row of mapping) {
    exact(row, ['path', 'original_sha256', 'source', 'sha256'], 'NAMESPACE');
    assert.equal(row.source, 'scripts/crm-calibration/service-namespace.py', CODE + 'NAMESPACE');
    assert.equal(row.original_sha256, await sourceHash(row.path.slice(5)), CODE + 'CONTROLLER_SOURCE');
    assert.equal(row.sha256, await sourceHash(row.source), CODE + 'CONTROLLER_SOURCE');
  }
  for (const path of [...RUNTIME_HOST_REQUIRED_CODE, ...namespacePaths.map(p => p.slice(5))])
    assert.ok(content.has('repo/' + path), CODE + 'CONTROLLER_REQUIRED');
  for (const [name, bytes] of content) {
    if (name === 'namespace-inputs.json') continue;
    assert.ok(name.startsWith('repo/'), CODE + 'CONTROLLER_PATH');
    const mapped = mapping.find(r => r.path === name);
    // This unexecuted negative-test file was extended after the target drill.
    // Preserve its archived bytes; every executable controller input uses the fixed Git source.
    const expected = overrides[name] ?? (name === 'repo/scripts/dsh-b0/first-purchase-runtime-artifacts.test.mjs'
      ? 'fb618a877eb460d06480815f9ad346ff3b6b814cb2eb25476b11d3ee1d4e57eb'
      : await sourceHash(mapped?.source ?? name.slice(5)));
    assert.equal(hash(bytes), expected, CODE + 'CONTROLLER_SOURCE');
  }
}
async function checkPluginSnapshot(bytes, pack, installed) {
  const temp = await mkdtemp(join(tmpdir(), 'runtime-host-pack-check-'));
  try {
    const archive = join(temp, 'plugin.tgz'), output = join(temp, 'unpacked');
    await writeFile(archive, bytes, { mode: 0o600, flag: 'wx' });
    await exec('python3', [join(ROOT, 'scripts/release/secure-unpack.py'), archive, output,
      '--max-entries', '100', '--max-bytes', '8388608'], { cwd: temp, timeout: 30000, maxBuffer: 256 * 1024 });
    assert.deepEqual(await readdir(output), ['package'], CODE + 'PLUGIN_ROOT');
    const files = {};
    async function walk(path, prefix = '') {
      for (const row of await readdir(path, { withFileTypes: true })) {
        const name = prefix + row.name;
        if (row.isDirectory()) await walk(join(path, row.name), name + '/');
        else files[name] = hash(await readFile(join(path, row.name)));
      }
    }
    await walk(join(output, 'package'));
    assert.deepEqual(files, installed, CODE + 'INSTALLED_FILES');
    const pkg = decode(await readFile(join(output, 'package/package.json')));
    assert.equal(pkg.name, pack.package_name, CODE + 'PLUGIN_ID');
    assert.equal(pkg.version, pack.package_version, CODE + 'PLUGIN_VERSION');
  } finally { await rm(temp, { recursive: true, force: true }); }
}
export async function verifyRuntimeHostEvidence({ candidatePath, evidencePath, statePath, envelopeBytes }) {
  const envelope = decode(envelopeBytes), directory = dirname(evidencePath);
  exact(envelope, ['schema_version', 'inputs', 'controller', 'inventory', 'runtime_archive', 'service_target_event'], 'ENVELOPE');
  assert.equal(envelope.schema_version, RUNTIME_HOST_SCHEMA, CODE + 'SCHEMA');
  const { candidate, candidateBytes, candidateFields, journal, prepared } = await readPreparedServiceCandidate({ candidatePath, statePath });
  const link = envelope.service_target_event; exact(link, ['seq', 'digest'], 'PARENT');
  assert.ok(Number.isSafeInteger(link.seq) && link.seq > 0, CODE + 'PARENT');
  const parent = journal.journal[link.seq - 1];
  assert.ok(parent?.status === 'CANDIDATE_SERVICE_TARGET_OBSERVED' && parent.digest === link.digest
    && parent.release_tag === prepared.release_tag, CODE + 'PARENT');
  for (const [key, value] of Object.entries(candidateFields)) assert.deepEqual(parent[key], value, CODE + 'PARENT_CANDIDATE');
  const prior = parent.observation;
  assert.equal(prior.scope, 'actual-wsl2-synthetic-package-http', CODE + 'PARENT_SCOPE');
  assert.equal(prior.status, 'LOCAL_WSL_SYNTHETIC_SOURCE_HTTP_OBSERVATION_VERIFIED', CODE + 'PARENT_SCOPE');
  assert.equal(prior.release_ready, false, CODE + 'PARENT_SCOPE');
  async function reference(ref) {
    exact(ref, ['name', 'sha256'], 'REFERENCE'); assert.match(ref.sha256 ?? '', HEX, CODE + 'REFERENCE');
    const bytes = await insideArtifact(directory, ref.name, 2 * 1024 * 1024);
    assert.equal(hash(bytes), ref.sha256, CODE + 'REFERENCE_DIGEST'); return decode(bytes);
  }
  const input = await reference(envelope.inputs), controller = await reference(envelope.controller);
  exact(input, ['schema_version', 'scope', 'release_ready', 'files'], 'INPUT');
  assert.equal(input.schema_version, 'owned-first-purchase-host-transfer/v1', CODE + 'INPUT');
  assert.equal(input.scope, 'synthetic-only', CODE + 'INPUT'); assert.equal(input.release_ready, false, CODE + 'INPUT');
  exact(controller, ['schema_version', 'scope', 'base_seal_sha256', 'files'], 'CONTROLLER');
  assert.equal(controller.schema_version, 'owned-first-purchase-host-controller/v1', CODE + 'CONTROLLER');
  assert.equal(controller.scope, 'synthetic-test-controller-only', CODE + 'CONTROLLER');
  assert.equal(controller.base_seal_sha256, envelope.inputs.sha256, CODE + 'CONTROLLER');
  const payloadRoot = join(directory, dirname(envelope.inputs.name));
  const payload = await checkedSet(payloadRoot, input.files, 160 * 1024 * 1024);
  await checkController(await checkedSet(join(directory, dirname(envelope.controller.name)), controller.files, 16 * 1024 * 1024));
  const { runtime, manifest } = await readRuntimeHostInputs({ payload, payloadRoot, candidateBytes, prior, directory, envelope });
  const inventory = await reference(envelope.inventory);
  const records = await checkedSet(join(directory, dirname(envelope.inventory.name)), inventory, 16 * 1024 * 1024);
  const data = name => decode(records.get(name));
  const receipt = data('host-r2/receipt.json'), packages = data(RUNTIME_HOST_TEST_ROOT + '/plugin-artifacts/packages.json');
  exact(receipt, ['schema_version','scope','status','exit_code','seconds','platform','runtime_sha256','input_seal_sha256',
    'controller_seal_sha256','browser','cross_version_recovery','supply_chain','activation','release_ready'], 'RECEIPT');
  assert.equal(receipt.schema_version, 'dsh-first-purchase-runtime-host-observation/v1', CODE + 'RECEIPT');
  assert.equal(receipt.scope, 'actual-wsl2-synthetic-runtime-and-service-artifacts', CODE + 'SCOPE');
  assert.equal(receipt.status, 'PASS', CODE + 'NOT_PASS'); assert.equal(receipt.exit_code, 0, CODE + 'NOT_PASS');
  assert.ok(Number.isFinite(receipt.seconds) && receipt.seconds > 0 && receipt.seconds <= 600, CODE + 'TIME');
  for (const key of ['browser','cross_version_recovery','activation']) assert.equal(receipt[key], 'NOT_RUN', CODE + 'UNPROVEN');
  assert.equal(receipt.supply_chain, 'NOT_VERIFIED', CODE + 'UNPROVEN'); assert.equal(receipt.release_ready, false, CODE + 'UNPROVEN');
  const platform = receipt.platform;
  exact(platform, ['system','machine','kernel','python','uid'], 'PLATFORM');
  assert.ok(platform.system === 'Linux' && platform.machine === 'x86_64' && platform.uid === 65534
    && /^3\.14\.\d+$/.test(platform.python) && /^[A-Za-z0-9._+-]{1,128}$/.test(platform.kernel)
    && /microsoft/i.test(platform.kernel) && /wsl2/i.test(platform.kernel), CODE + 'PLATFORM');
  assert.equal(receipt.input_seal_sha256, envelope.inputs.sha256, CODE + 'INPUT_BINDING');
  assert.equal(receipt.controller_seal_sha256, envelope.controller.sha256, CODE + 'CONTROLLER');
  assert.equal(receipt.runtime_sha256, runtime.artifact.sha256, CODE + 'RUNTIME');
  const { tree, source_contract, queryManifest, saveManifest, service, query } = await checkRuntimeHostComposition({ packages, payload, candidate, manifest, runtime, prior });
  const http = data(RUNTIME_HOST_TEST_ROOT + '/official-host/http-observations.json');
  assert.deepEqual(http.artifacts, packages, CODE + 'HTTP_PACKAGES');
  assert.equal(http.upstream_sha, DSH_UPSTREAM_SHA, CODE + 'DSH'); assert.equal(http.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
  assert.equal(http.cleanup_ok, true, CODE + 'CLEANUP'); assert.equal(http.package_integrity, 'PASS', CODE + 'INTEGRITY');
  assert.equal(http.browser, 'NOT_RUN', CODE + 'UNPROVEN');
  checkObservations(http.observations);
  assert.deepEqual(data(RUNTIME_HOST_TEST_ROOT + '/source-boundary.json'), { scope: 'artifact-official-host-query-source-http',
    source_contract, save_run_store_argument: null, query_worker_count: 1, analysis_count: 1,
    source_mode: 'explicit-loopback-http', release_ready: false }, CODE + 'SOURCE_BOUNDARY');
  const cleanup = data('cleanup-verified.json');
  assert.equal(cleanup.stage, 'OWNED_PROCESSES_EXITED', CODE + 'CLEANUP');
  for (const key of ['runtime_unchanged','production_listeners_unchanged']) assert.equal(cleanup[key], true, CODE + 'CLEANUP');
  assert.equal(cleanup.base_input_files_unchanged, payload.size, CODE + 'CLEANUP');
  assert.equal(cleanup.controller_files_unchanged, Object.keys(controller.files).length, CODE + 'CLEANUP');
  const before = data('protected-before.json'), after = data('protected-after-r2.json');
  assert.equal(after.unchanged, true, CODE + 'LISTENERS'); assert.equal(after.ports, before.ports, CODE + 'LISTENERS');
  for (const port of [6677,18090,18092,18093,18094]) assert.ok(before.ports.includes(':' + port + ' '), CODE + 'LISTENERS');
  checkProcesses(data(RUNTIME_HOST_TEST_ROOT + '/kernel-processes/processes.json'),
    data(RUNTIME_HOST_TEST_ROOT + '/save-owner/service-processes/processes.json'), cleanup, http, queryManifest, saveManifest, candidate, query.manifest_sha256, service.manifest_sha256);
  const stdout = records.get('host-r2/pytest.stdout')?.toString('utf8');
  assert.ok(stdout && /\b1 passed\b/.test(stdout)
    && !/\b[1-9]\d* (?:failed|errors?|skipped)\b/.test(stdout), CODE + 'PYTEST');
  assert.equal(records.get('host-r2/pytest.stderr').length, 0, CODE + 'PYTEST');
  const observation = { status: 'WSL_SYNTHETIC_RUNTIME_HOST_OBSERVED', scope: receipt.scope,
    host_evidence_sha256: hash(envelopeBytes), receipt_sha256: hash(records.get('host-r2/receipt.json')),
    input_sha256: envelope.inputs.sha256, controller_sha256: envelope.controller.sha256, controller_source: RUNTIME_HOST_SOURCE,
    inventory_sha256: envelope.inventory.sha256, runtime_sha256: runtime.artifact.sha256,
    runtime_tree_observed: tree, platform: { ...platform, node: packages.runtime.platform.node }, scenario_count: http.observations.length,
    candidate_digest: candidate.candidate_digest, plugin_digests: Object.fromEntries(Object.entries(packages.packages).map(([k,v])=>[k,v.tarball.sha256])),
    service_archive_sha256: service.archive_sha256, query_archive_sha256: query.sha256,
    browser: 'NOT_RUN', cross_version_recovery: 'NOT_RUN', production_identity: 'NOT_RUN', supply_chain: 'NOT_VERIFIED',
    activation: 'NOT_RUN', release_ready: false, evidence_authenticity: 'UNATTESTED_OPERATOR_OBSERVATION',
    limitations: ['Only archived synthetic HTTP observations; no live probe, browser or production UAT.',
      'Runtime archive digest rechecked; historical installed tree and listener/process state remain operator observations.',
      'No signed provenance, in-flight/cross-version Host recovery, profile activation or production permission.'] };
  const event = await recordEvent(statePath, { release_tag: prepared.release_tag, status: 'CANDIDATE_RUNTIME_HOST_OBSERVED',
    ...candidateFields, service_target_event: link, observation },
  { idempotencyKey: `candidate-runtime-host:${candidate.candidate_digest}:${hash(envelopeBytes)}`,
    requiredEvent: link });
  return { ...observation, journal_seq: event.seq, journal_digest: event.digest };
}

export function checkObservations(rows) {
  assert.ok(Array.isArray(rows) && rows.length === 20, CODE + 'SCENARIOS');
  const pass = stage => ({stage,status:'PASS'}), command = (name,kind) => ({stage:'official-native-command',command:name,kind});
  const host = (row,stage,generation) => {
    exact(row,['stage','pid','generation'],'HOST_PROCESS'); assert.equal(row.stage,stage,CODE+'HOST_PROCESS');
    assert.equal(row.generation,generation,CODE+'HOST_PROCESS'); assert.ok(Number.isSafeInteger(row.pid)&&row.pid>1,CODE+'HOST_PROCESS');
  };
  host(rows[0],'official-host-loaded',1);host(rows[15],'official-host-restarted',2);assert.notEqual(rows[0].pid,rows[15].pid,CODE+'HOST_PROCESS');
  assert.deepEqual(rows.slice(1,15), [pass('missing-cookie-rejected'),pass('foreign-origin-rejected'),
    {stage:'missing-csrf-header-rejected',outcome:'CONNECTION_CLOSED'},pass('cookie-origin-csrf-and-login-bootstrap'),
    command('/first-purchase','error'),command('/first-purchase','success'),pass('official-query-summary-settled'),
    pass('official-fetch-save-ack-loss-reconcile-replay'),pass('same-save-intent-after-independent-service-restart'),
    pass('same-save-intent-after-independent-service-restart'),command('/first-purchase-status','success'),command('/first-purchase','success'),
    command('/first-purchase-cancel','error'),command('/first-purchase-cancel','success')],CODE+'SCENARIOS');
  assert.deepEqual(rows.slice(16),[pass('durable-session-and-cookie-reused-crm-relogin-required'),
    command('/first-purchase-status','error'),command('/first-purchase-status','success'),pass('native-session-without-business-tools')],CODE+'SCENARIOS');
}
export function checkProcesses(query,save,cleanup,http,queryManifest,saveManifest,candidate,queryHash,saveHash, { browser = false, terminal = false, independentSources = terminal } = {}) {
  assert.ok(!(browser && terminal), CODE + 'PROCESS_MODE');
  assert.ok(Array.isArray(query)&&query.length===3&&Array.isArray(save)&&save.length===2,CODE+'PROCESSES');
  const pids=new Set(),workerEvents=[];
  const add=pid=>{assert.ok(Number.isSafeInteger(pid)&&pid>1&&!pids.has(pid),CODE+'PROCESS_PID');pids.add(pid);};
  const imports=(map,manifest)=>{assert.ok(map&&Object.keys(map).length>0,CODE+'IMPORTS');for(const path of Object.values(map))assert.ok(Object.hasOwn(manifest.files,path),CODE+'IMPORTS');};
  for(const row of query){
    add(row.pid);assert.equal(row.source_contract,'first-purchase-frozen-source/v1',CODE+'PROCESS_SOURCE_CONTRACT');assert.equal(row.status,'KERNEL_SOCKET_BOUND',CODE+'PROCESS');assert.equal(row.port,4335,CODE+'PORT');
    assert.equal(row.manifest_sha256,queryHash,CODE+'PROCESS_MANIFEST');
    assert.equal(row.source_sha,independentSources ? candidate.service_compatibility?.binding?.source_sha : candidate.source_sha,CODE+'PROCESS_SOURCE');assert.equal(row.release_ready,false,CODE+'UNPROVEN');
    assert.equal(row.exit_code,0,CODE+'PROCESS_EXIT');assert.equal(row.forced_kill,false,CODE+'PROCESS_EXIT');assert.equal(row.cleanup_ok,true,CODE+'CLEANUP');
    assert.equal(row.stopped?.pid,row.pid,CODE+'PROCESS');assert.equal(row.stopped?.status,'KERNEL_STOPPED',CODE+'PROCESS');
    assert.equal(row.stopped?.active_workers,0,CODE+'CLEANUP');assert.equal(row.stopped?.integrity,'PASS',CODE+'INTEGRITY');
    imports(row.imports,queryManifest);imports(row.stopped.imports,queryManifest);workerEvents.push(...row.stopped.workers);
  }
  assert.equal(workerEvents.length,2,CODE+'WORKER');add(workerEvents[0].pid);
  assert.deepEqual(workerEvents,[{event:'worker:spawned',pid:workerEvents[0].pid},{event:'worker:exited',pid:workerEvents[0].pid,exit_code:0}],CODE+'WORKER');
  for(const row of save){
    add(row.pid);assert.equal(row.source_contract,'first-purchase-frozen-source/v1',CODE+'PROCESS_SOURCE_CONTRACT');assert.equal(row.query_runtime,'independent-offline-query-artifact',CODE+'PROCESS_QUERY_RUNTIME');assert.equal(row.status,'SERVICE_SOCKET_BOUND',CODE+'PROCESS');assert.equal(row.candidate_digest,candidate.candidate_digest,CODE+'PROCESS_CANDIDATE');
    assert.equal(row.manifest_sha256,saveHash,CODE+'PROCESS_MANIFEST');imports(row.imports,saveManifest);
    assert.equal(row.scope,'saved-analysis-artifact-only',CODE+'STORAGE');assert.equal(row.sqlite_scope,'saved-analysis-only',CODE+'STORAGE');
    assert.deepEqual(row.sqlite_files,['analyses/first_purchase_analyses.sqlite3'],CODE+'STORAGE');
    assert.equal(row.release_ready,false,CODE+'UNPROVEN');assert.equal(row.process_exited,true,CODE+'CLEANUP');
    assert.equal(row.forced_kill,false,CODE+'PROCESS_EXIT');assert.equal(row.cleanup_ok,true,CODE+'CLEANUP');
    assert.ok([0,-15].includes(row.exit_code),CODE+'PROCESS_EXIT');assert.equal(row.openapi,'MATCHED',CODE+'OPENAPI');
  }
  assert.equal(save[1].query_offline_replay,browser ? 'NOT_RUN' : 'PASS',CODE+'REPLAY');assert.equal(save[1].restart_same_analysis,true,CODE+'REPLAY');
  assert.equal(save[1].same_intent_replay,browser ? 'NOT_RUN_BROWSER_MODE' : 'PASS',CODE+'REPLAY');assert.equal(save[0].port,save[1].port,CODE+'PORT');
  assert.ok(Number.isSafeInteger(save[0].port)&&save[0].port>1024&&save[0].port<65536&&!([4335,4336,4337].includes(save[0].port)),CODE+'PORT');
  add(http.observations[0].pid);
  if (browser) return { pids: [...pids], service_port: save[0].port };
  add(http.observations[15].pid);
  if (terminal) { add(http.observations[21].pid); return { pids: [...pids], service_port: save[0].port }; }
  assert.deepEqual([...cleanup.pids].sort((a,b)=>a-b),[...pids].sort((a,b)=>a-b),CODE+'CLEANUP_PIDS');
  assert.deepEqual([...cleanup.ports_closed].sort((a,b)=>a-b),[4335,4336,4337,save[0].port].sort((a,b)=>a-b),CODE+'CLEANUP_PORTS');
}

/** Common immutable runtime/package checks shared by HTTP and browser observations. */
export async function readRuntimeHostInputs({ payload, payloadRoot, candidateBytes, prior, directory, envelope, browser = false, terminal = false }) {
  assert.ok(!(browser && terminal), CODE + 'INPUT_MODE');
  assert.deepEqual(payload.get('candidate/candidate.json'), candidateBytes, CODE + 'CANDIDATE');
  const manifest = decode(payload.get('input-v5.json'));
  assert.equal(manifest.schema_version, 'dsh-first-purchase-host-artifacts/v5', CODE + 'INPUT_MODE');
  const prefix = manifest.candidate_path?.match(browser
    ? /^(\/tmp\/owned-fp-browser-[A-Za-z0-9_-]+)\/payload\/candidate\/candidate.json$/
    : terminal ? /^(\/tmp\/owned-fp-terminal-[A-Za-z0-9_-]+)\/payload\/candidate\/candidate.json$/
      : /^(\/tmp\/owned-fp-runtime-[A-Za-z0-9_-]+)\/payload\/candidate\/candidate.json$/)?.[1];
  assert.ok(prefix, CODE + 'INPUT_PATH');
  for (const [key, path] of Object.entries({ candidate: 'candidate/candidate.json', crm_pack: 'crm/plugin-pack.json',
    service_evidence: 'pair/receipt.json', kernel_receipt: 'query/receipt.json', runtime_manifest: 'runtime-manifest.json', platform_receipt: 'platform-receipt.json' })) {
    assert.equal(manifest[key + '_path'], prefix + '/payload/' + path, CODE + 'INPUT_PATH');
    assert.equal(manifest[key + '_sha256'], hash(payload.get(path)), CODE + 'INPUT_BINDING');
  }
  exact(manifest, ['schema_version', 'candidate_path', 'candidate_sha256', 'crm_pack_path', 'crm_pack_sha256',
    'service_evidence_path', 'service_evidence_sha256', 'kernel_receipt_path', 'kernel_receipt_sha256',
    'runtime_manifest_path', 'runtime_manifest_sha256', 'runtime_archive_path', 'platform_receipt_path', 'platform_receipt_sha256'], 'INPUT_MODE');
  assert.equal(manifest.runtime_archive_path, prefix + '/runtime.tar.zst', CODE + 'INPUT_PATH');
  assert.equal(manifest.platform_receipt_sha256, prior.target_evidence_sha256, CODE + 'PLATFORM_BINDING');
  assert.equal(manifest.service_evidence_sha256, prior.service_evidence_sha256, CODE + 'SERVICE_BINDING');
  const runtime = await readFirstPurchaseRuntime({ manifestPath: join(payloadRoot, 'runtime-manifest.json'),
    manifestSha256: manifest.runtime_manifest_sha256, archivePath: join(directory, envelope.runtime_archive.name) });
  await archiveDigest(directory, envelope.runtime_archive, runtime.artifact);
  return { runtime, manifest, prefix };
}

export async function checkRuntimeHostComposition({ packages, payload, candidate, manifest, runtime, prior, independentSources = false }) {
  const serviceSource = independentSources ? candidate.service_compatibility?.binding?.source_sha : candidate.source_sha;
  assert.match(serviceSource ?? '', /^[a-f0-9]{40}$/, CODE + 'SOURCE');
  assert.equal(packages.schema_version, 'dsh-first-purchase-host-artifacts-observed/v1', CODE + 'PACKAGES');
  assert.equal(packages.scope, 'target-runtime-artifacts-with-query-source-http', CODE + 'PACKAGES');
  assert.equal(packages.input_sha256, hash(payload.get('input-v5.json')), CODE + 'INPUT_BINDING');
  assert.equal(packages.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
  assert.equal(packages.upstream_sha, DSH_UPSTREAM_SHA, CODE + 'DSH');
  assert.equal(packages.activation, 'NOT_RUN', CODE + 'UNPROVEN'); assert.equal(packages.release_ready, false, CODE + 'UNPROVEN');
  assert.deepEqual(packages.runtime.artifact, runtime.artifact, CODE + 'RUNTIME');
  assert.equal(packages.runtime.release_manifest_sha256, manifest.runtime_manifest_sha256, CODE + 'RUNTIME');
  assert.deepEqual(packages.runtime.platform, { system: 'Linux', machine: 'x86_64', node: packages.runtime.platform.node }, CODE + 'PLATFORM');
  assert.equal(Number(packages.runtime.platform.node.split('.')[0]), NODE_MAJOR, CODE + 'NODE');
  assert.equal(packages.runtime.scope, 'isolated-runtime-artifact', CODE + 'RUNTIME');
  assert.equal(packages.runtime.supply_chain, 'NOT_VERIFIED', CODE + 'UNPROVEN');
  assert.equal(packages.runtime.release_ready, false, CODE + 'UNPROVEN');
  const tree = packages.runtime.installed_tree;
  assert.match(tree.sha256 ?? '', HEX, CODE + 'TREE');
  assert.ok(Number.isSafeInteger(tree.entries) && tree.entries > 0 && tree.entries <= 150000
    && Number.isSafeInteger(tree.bytes) && tree.bytes > 0 && tree.bytes <= 1024 ** 3, CODE + 'TREE');
  exact(packages.packages, ['workbench','crm'], 'PLUGIN_SET');
  for (const [key, dir] of Object.entries({ workbench: 'candidate', crm: 'crm' })) {
    const observed = packages.packages[key], pack = decode(payload.get(dir + '/plugin-pack.json'));
    const { installed_files, ...original } = observed;
    assert.deepEqual(original, pack, CODE + 'PLUGIN_PACK');
    assert.equal(pack.package_name, key === 'workbench' ? '@shine-mage/dsh-analytics-workbench-b0' : '@shine-mage/dsh-crm-knowledge', CODE + 'PLUGIN_ID');
    if (key === 'workbench') {
      assert.equal(pack.package_name, candidate.plugin.id, CODE + 'PLUGIN_CANDIDATE');
      assert.equal(pack.package_version, candidate.plugin.version, CODE + 'PLUGIN_CANDIDATE');
      assert.equal(pack.source_sha, candidate.source_sha, CODE + 'PLUGIN_CANDIDATE');
      assert.deepEqual(pack.tarball, candidate.pack, CODE + 'PLUGIN_CANDIDATE');
    }
    assert.equal(pack.dsh_pin, DSH_SDK_VERSION, CODE + 'DSH'); assert.equal(pack.source_dirty, false, CODE + 'PLUGIN_PACK');
    const archive = payload.get(dir + '/' + pack.tarball.name);
    assert.equal(hash(archive), pack.tarball.sha256, CODE + 'PLUGIN_ARCHIVE');
    assert.equal(archive.length, pack.tarball.bytes, CODE + 'PLUGIN_ARCHIVE');
    exact(installed_files, pack.entries, 'INSTALLED_FILES');
    for (const value of Object.values(installed_files)) assert.match(value, HEX, CODE + 'INSTALLED_FILES');
    await checkPluginSnapshot(archive, pack, installed_files);
  }
  const target = decode(payload.get('platform-receipt.json'));
  assert.equal(packages.platform_wheel_evidence_sha256, prior.target_evidence_sha256, CODE + 'PLATFORM_BINDING');
  const query = decode(payload.get('query/receipt.json')), pair = decode(payload.get('pair/receipt.json'));
  const service = packages.service, kernel = packages.kernel;
  assert.equal(query.source_sha, serviceSource, CODE + 'SOURCE');
  assert.equal(query.sha256, prior.query_archive_sha256, CODE + 'QUERY_BINDING');
  assert.equal(query.manifest_sha256, prior.query_manifest_sha256, CODE + 'QUERY_BINDING');
  assert.equal(hash(payload.get('query/kernel.tar.zst')), query.sha256, CODE + 'QUERY_BINDING');
  const saveManifest = decode(payload.get('pair/candidate/service-manifest.json')), queryManifest = decode(payload.get('query/kernel-manifest.json'));
  assert.equal(hash(payload.get('query/kernel-manifest.json')), query.manifest_sha256, CODE + 'QUERY_BINDING');
  assert.equal(service.archive_sha256, pair.artifacts.candidate.sha256, CODE + 'SERVICE_BINDING');
  assert.equal(hash(payload.get('pair/candidate/' + pair.artifacts.candidate.artifact)), service.archive_sha256, CODE + 'SERVICE_BINDING');
  assert.equal(service.manifest_sha256, hash(payload.get('pair/candidate/service-manifest.json')), CODE + 'SERVICE_BINDING');
  assert.equal(service.source_sha, serviceSource, CODE + 'SOURCE');
  assert.equal(service.evidence_sha256, manifest.service_evidence_sha256, CODE + 'SERVICE_BINDING');
  const { receipt_sha256, runtime_mode, source_contract, installed_wheels, ...originalKernel } = kernel;
  assert.deepEqual(originalKernel, query, CODE + 'QUERY_BINDING');
  assert.equal(receipt_sha256, manifest.kernel_receipt_sha256, CODE + 'QUERY_BINDING');
  assert.equal(runtime_mode, 'offline-hashed-wheel-install', CODE + 'INSTALL');
  assert.equal(source_contract, 'first-purchase-frozen-source/v1', CODE + 'SOURCE_CONTRACT');
  assert.equal(service.source_contract, source_contract, CODE + 'SOURCE_CONTRACT');
  assert.equal(service.runtime_mode, runtime_mode, CODE + 'INSTALL');
  assert.equal(service.release_ready, false, CODE + 'UNPROVEN');
  assert.equal(service.service_runtime, 'independent-offline-saved-analysis-artifact', CODE + 'SERVICE_MODE');
  assert.equal(packages.service_runtime, service.service_runtime, CODE + 'SERVICE_MODE');
  assert.equal(service.query_runtime, 'independent-offline-query-artifact', CODE + 'SERVICE_MODE');
  for (const [name, deps, wheels, archive, manifestHash] of [
    ['query',queryManifest.dependencies,installed_wheels,query.sha256,query.manifest_sha256],
    ['save',saveManifest.dependencies,service.wheels,service.archive_sha256,service.manifest_sha256]]) {
    assert.deepEqual(platformWheels(target.artifacts[name], archive, manifestHash, deps), wheels, CODE + 'WHEELS');
    for (const row of Object.values(wheels)) assert.equal(hash(payload.get('query-wheels/' + row.file)), row.sha256, CODE + 'WHEEL_BYTES');
  }
  return { tree, source_contract, queryManifest, saveManifest, service, query };
}
