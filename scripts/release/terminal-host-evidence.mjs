/** Verify sealed terminal recovery through the existing candidate journal. No Host execution. */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { insideArtifact } from './service-artifact-evidence.mjs';
import { readPreparedServiceCandidate } from './plugin-service-evidence.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { readGitInput } from '../crm-calibration/package-service.mjs';
import { recordEvent } from './state.mjs';
import { checkedSet, readRuntimeHostInputs, checkRuntimeHostComposition, checkProcesses, RUNTIME_HOST_REQUIRED_CODE } from './runtime-host-evidence.mjs';
import { checkTerminalRecords, exact, TERMINAL_TEST_ROOT as T } from './terminal-recovery-records.mjs';

export const TERMINAL_HOST_SCHEMA = 'dsh-terminal-host-evidence/v1';
export const TERMINAL_CONTROLLER_BASE = '3ffbd2a2e5a6c3179aecec09c63522ff1bb2d268';
export const TERMINAL_CONTROLLER_REVIEWED = '25d9c53c6efedd91df0e1b7c04cb5b275a84271f';
export const TERMINAL_RUNNER_SHA256 = 'bc1b021a1b7a689e717f4fa77ae016283ff46fe0a934c60c9878aecdfb70b75f';
export const TERMINAL_REQUIRED_CODE = Object.freeze([...RUNTIME_HOST_REQUIRED_CODE,
  'scripts/dsh-b0/recovery-model-gate.mjs','scripts/dsh-b0/session-recovery.mjs',
  'scripts/dsh-b0/session-recovery.probe.mjs','scripts/dsh-b0/mock-provider.mjs',
  'scripts/crm-calibration/service-runtime.fixture.py']);
const CODE = 'PLUGIN_HOST_TERMINAL_', HEX = /^[a-f0-9]{64}$/, ROOT = join(import.meta.dirname, '../..');
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const namespaces = ['backend','backend/contracts','backend/semantic','backend/services','backend/services/analytics',
  'backend/services/analytics/first_purchase','backend/tests'].map(p => p + '/__init__.py');
const sources = new Map();
async function sourceHash(path) {
  if (!sources.has(path)) sources.set(path, readGitInput(ROOT, TERMINAL_CONTROLLER_REVIEWED, path).then(hash));
  return sources.get(path);
}
export async function checkReviewedControllerSources(controller, content) {
  exact(controller, ['base_commit','scope','files'], 'CONTROLLER');
  assert.equal(controller.base_commit, TERMINAL_CONTROLLER_BASE, CODE + 'CONTROLLER_BASE');
  assert.equal(controller.scope, 'explicit-test-controller-with-local-v2-verifier-repair', CODE + 'CONTROLLER_SCOPE');
  exact(controller.files, [...content.keys()].filter(p => p.startsWith('controller/repo/')).map(p => p.slice(16)), 'CONTROLLER_FILES');
  for (const name of [...TERMINAL_REQUIRED_CODE, ...namespaces]) assert.ok(Object.hasOwn(controller.files, name), CODE + 'CONTROLLER_REQUIRED');
  for (const [name, row] of Object.entries(controller.files)) {
    exact(row, ['source','sha256'], 'CONTROLLER_FILE');
    assert.equal(row.source, namespaces.includes(name) ? 'scripts/crm-calibration/service-namespace.py' : name, CODE + 'CONTROLLER_SOURCE');
    const actual = hash(content.get('controller/repo/' + name));
    assert.equal(actual, row.sha256, CODE + 'CONTROLLER_SOURCE');
    // Archived, unexecuted source-HTTP verifier predates the composed-path fix.
    // All other controller bytes match the reviewed commit; never accept a caller-supplied override.
    if (name === 'scripts/release/source-target-evidence.mjs'
      && actual === '97f840253cc26331d2d11b14a9b9ef8eba61ca4cd2ed2188dc5131864da011af') continue;
    assert.equal(actual, await sourceHash(row.source), CODE + 'CONTROLLER_SOURCE');
  }
}
export async function verifyTerminalHostEvidence({ candidatePath, evidencePath, statePath, envelopeBytes }) {
  const envelope = decode(envelopeBytes), directory = dirname(evidencePath);
  exact(envelope, ['schema_version','inputs','controller','inventory','runtime_archive','service_target_event'], 'ENVELOPE');
  assert.equal(envelope.schema_version, TERMINAL_HOST_SCHEMA, CODE + 'SCHEMA');
  const { candidate, candidateBytes, candidateFields, journal, prepared } = await readPreparedServiceCandidate({ candidatePath, statePath });
  const link = envelope.service_target_event;
  exact(link, ['seq','digest'], 'PARENT');
  assert.ok(Number.isSafeInteger(link.seq) && link.seq > 0 && HEX.test(link.digest), CODE + 'PARENT');
  const parent = journal.journal[link.seq - 1];
  assert.ok(parent?.status === 'CANDIDATE_SERVICE_TARGET_OBSERVED' && parent.digest === link.digest
    && parent.release_tag === prepared.release_tag, CODE + 'PARENT');
  for (const [key,value] of Object.entries(candidateFields)) assert.deepEqual(parent[key], value, CODE + 'PARENT_CANDIDATE');
  const prior = parent.observation;
  assert.equal(prior?.status, 'LOCAL_WSL_SYNTHETIC_SOURCE_HTTP_OBSERVATION_VERIFIED', CODE + 'PARENT_SCOPE');
  assert.equal(prior.scope, 'actual-wsl2-synthetic-package-http', CODE + 'PARENT_SCOPE');
  assert.equal(prior.release_ready, false, CODE + 'UNPROVEN');
  async function reference(ref) {
    exact(ref, ['name','sha256'], 'REFERENCE'); assert.match(ref.sha256 ?? '', HEX, CODE + 'REFERENCE');
    const bytes = await insideArtifact(directory, ref.name, 2 * 1024 * 1024);
    assert.equal(hash(bytes), ref.sha256, CODE + 'REFERENCE_DIGEST'); return decode(bytes);
  }
  const input = await reference(envelope.inputs), controller = await reference(envelope.controller);
  exact(input, ['scope','release_ready','files'], 'INPUT');
  assert.equal(input.scope, 'synthetic-terminal-only', CODE + 'INPUT'); assert.equal(input.release_ready, false, CODE + 'UNPROVEN');
  const inputRoot = join(directory, dirname(envelope.inputs.name));
  const content = await checkedSet(inputRoot, input.files, 160 * 1024 * 1024);
  assert.equal(hash(content.get('controller/sources.json')), envelope.controller.sha256, CODE + 'CONTROLLER_BINDING');
  await checkReviewedControllerSources(controller, content);
  const inventory = await reference(envelope.inventory);
  const records = await checkedSet(join(directory, dirname(envelope.inventory.name)), inventory, 16 * 1024 * 1024);
  const required = name => { assert.ok(records.has(name), CODE + 'REQUIRED'); return records.get(name); };
  const data = name => decode(required(name));
  assert.equal(hash(required('input-seal.json')), envelope.inputs.sha256, CODE + 'INPUT_BINDING');
  assert.equal(hash(required('controller/sources.json')), envelope.controller.sha256, CODE + 'CONTROLLER_BINDING');
  assert.equal(hash(required('run.py')), TERMINAL_RUNNER_SHA256, CODE + 'RUNNER');
  for (const [name,bytes] of records) if (content.has(name)) assert.deepEqual(bytes, content.get(name), CODE + 'ARCHIVED_INPUT');
  const payload = new Map([...content].filter(([p]) => p.startsWith('payload/')).map(([p,b]) => [p.slice(8),b]));
  for (const name of ['input-v5.json','platform-receipt.json']) {
    assert.ok(!payload.has(name), CODE + 'DERIVED_INPUT');
    payload.set(name, required('payload/' + name));
  }
  const platformReceipt = decode(payload.get('platform-receipt.json'));
  assert.equal(platformReceipt.schema_version, 'source-http-target-observation/v2', CODE + 'SERVICE_SCHEMA');
  assert.equal(platformReceipt.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
  assert.equal(platformReceipt.source_sha, candidate.service_compatibility.binding.source_sha, CODE + 'SERVICE_SOURCE');
  const { runtime, manifest, prefix } = await readRuntimeHostInputs({ payload, payloadRoot:join(inputRoot,'payload'),
    candidateBytes, prior, directory, envelope, terminal:true });
  const receipt = data('host-result/receipt.json');
  exact(receipt, ['schema_version','status','exit_code','seconds','candidate_digest','plugin_source','service_source',
    'platform','runtime_sha256','production_identity','supply_chain','activation','release_ready'], 'RECEIPT');
  assert.equal(receipt.schema_version, 'first-purchase-terminal-target/v1', CODE + 'RECEIPT');
  assert.equal(receipt.status, 'PASS', CODE + 'NOT_PASS'); assert.equal(receipt.exit_code, 0, CODE + 'NOT_PASS');
  assert.ok(Number.isFinite(receipt.seconds) && receipt.seconds > 0 && receipt.seconds <= 600, CODE + 'TIME');
  assert.equal(receipt.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
  assert.equal(receipt.plugin_source, candidate.source_sha, CODE + 'PLUGIN_SOURCE');
  assert.equal(receipt.service_source, candidate.service_compatibility.binding.source_sha, CODE + 'SERVICE_SOURCE');
  assert.equal(receipt.runtime_sha256, runtime.artifact.sha256, CODE + 'RUNTIME');
  for (const key of ['production_identity','activation']) assert.equal(receipt[key], 'NOT_RUN', CODE + 'UNPROVEN');
  assert.equal(receipt.supply_chain, 'NOT_VERIFIED', CODE + 'UNPROVEN'); assert.equal(receipt.release_ready, false, CODE + 'UNPROVEN');
  exact(receipt.platform, ['system','machine','kernel','python','uid'], 'PLATFORM');
  assert.deepEqual(receipt.platform, prior.platform, CODE + 'PLATFORM');
  assert.ok(receipt.platform.system === 'Linux' && receipt.platform.machine === 'x86_64' && receipt.platform.uid === 65534
    && /^3\.14\.\d+$/.test(receipt.platform.python) && /microsoft/i.test(receipt.platform.kernel) && /wsl2/i.test(receipt.platform.kernel), CODE + 'PLATFORM');
  const packages = data(T + '/plugin-artifacts/packages.json');
  const composition = await checkRuntimeHostComposition({ packages, payload, candidate, manifest, runtime, prior, independentSources:true });
  const http = data(T + '/official-host/http-observations.json');
  const terminal = checkTerminalRecords({ recovery:data(T + '/official-host/recovery-observations.json'),
    http, run:data(T + '/interrupted-run.json'), packages, candidate });
  const { source_contract, queryManifest, saveManifest, service, query } = composition;
  assert.deepEqual(data(T + '/source-boundary.json'), {scope:'artifact-official-host-query-source-http',source_contract,
    save_run_store_argument:null,query_worker_count:1,analysis_count:1,source_mode:'explicit-loopback-http',release_ready:false}, CODE + 'SOURCE_BOUNDARY');
  const processes = checkProcesses(data(T + '/kernel-processes/processes.json'), data(T + '/save-owner/service-processes/processes.json'),
    null, http, queryManifest, saveManifest, candidate, query.manifest_sha256, service.manifest_sha256, {terminal:true});
  const cleanup = data('cleanup-check.json');
  exact(cleanup, ['production_listener_pid_snapshot_unchanged','current_unchanged','test_ports_closed','owned_processes_alive',
    'runtime_sha256','sealed_files_unchanged','source_input_files_unchanged'], 'CLEANUP');
  for (const key of ['production_listener_pid_snapshot_unchanged','current_unchanged','test_ports_closed']) assert.equal(cleanup[key], true, CODE + 'CLEANUP');
  assert.deepEqual(cleanup.owned_processes_alive, [], CODE + 'CLEANUP');
  assert.equal(cleanup.runtime_sha256, runtime.artifact.sha256, CODE + 'CLEANUP');
  assert.equal(cleanup.sealed_files_unchanged, content.size, CODE + 'CLEANUP');
  assert.equal(hash(required('source/input/input.json')), prior.target_input_sha256, CODE + 'SOURCE_INPUT');
  assert.equal(cleanup.source_input_files_unchanged, Object.keys(data('source/input/input.json').files).length, CODE + 'CLEANUP');
  checkArchivedControllerInstall({ data, payload, prefix, resultDir:'host-result' });
  const stdout = required('host-result/pytest.stdout').toString('utf8');
  assert.ok(/\b1 passed\b/.test(stdout) && !/\b[1-9]\d* (?:failed|errors?|skipped)\b/.test(stdout), CODE + 'PYTEST');
  for (const name of ['pytest.stderr','controller-install.stderr']) assert.equal(required('host-result/' + name).length, 0, CODE + 'PYTEST');
  const observation = {status:'WSL_SYNTHETIC_TERMINAL_HOST_OBSERVED',scope:'actual-wsl2-synthetic-inflight-terminal-recovery',
    candidate_digest:candidate.candidate_digest,host_evidence_sha256:hash(envelopeBytes),receipt_sha256:hash(required('host-result/receipt.json')),
    recovery_sha256:hash(required(T + '/official-host/recovery-observations.json')),interrupted_run_sha256:hash(required(T + '/interrupted-run.json')),
    input_sha256:envelope.inputs.sha256,controller_sha256:envelope.controller.sha256,inventory_sha256:envelope.inventory.sha256,
    controller_reviewed_commit:TERMINAL_CONTROLLER_REVIEWED,runner_sha256:TERMINAL_RUNNER_SHA256,
    runtime_sha256:runtime.artifact.sha256,plugin_digests:Object.fromEntries(Object.entries(packages.packages).map(([k,v])=>[k,v.tarball.sha256])),
    query_archive_sha256:query.sha256,service_archive_sha256:service.archive_sha256,platform:receipt.platform,
    process_count:processes.pids.length,http_scenario_count:23,recovery_scenario_count:2,...terminal,
    browser:'NOT_RUN',cross_version_recovery:'NOT_RUN',production_identity:'NOT_RUN',supply_chain:'NOT_VERIFIED',
    activation:'NOT_RUN',release_ready:false,evidence_authenticity:'UNATTESTED_OPERATOR_OBSERVATION',
    limitations:['Checks archived evidence only; does not run a Host or contact WSL.',
      'Session prefix hashes and same-intent assertions are fixed-controller observations, not replayed WAL or signed attestation.',
      'No browser, cross-version corpus, real model/identity/UAT or production activation/rollback.']};
  const event = await recordEvent(statePath, {release_tag:prepared.release_tag,status:'CANDIDATE_TERMINAL_HOST_OBSERVED',
    ...candidateFields,service_target_event:link,observation},
  {idempotencyKey:'candidate-terminal-host:' + candidate.candidate_digest + ':' + hash(envelopeBytes),requiredEvent:link});
  return {...observation,journal_seq:event.seq,journal_digest:event.digest};
}

/** Fixed-controller offline dependency observation shared by terminal and browser gates. */
export function checkArchivedControllerInstall({ data, payload, prefix, resultDir }) {
  const install = data(resultDir + '/controller-install.stdout'), dependencies = decode(payload.get('controller.json')).dependencies;
  exact(install, ['python','mode','wheels'], 'INSTALL');
  assert.equal(install.python, prefix + '/' + resultDir + '/venv/bin/python', CODE + 'INSTALL');
  assert.equal(install.mode, 'offline-hashed-wheel-install', CODE + 'INSTALL');
  exact(install.wheels, Object.keys(dependencies), 'INSTALL');
  for (const [name,row] of Object.entries(install.wheels)) {
    exact(row, ['file','version','sha256'], 'WHEEL');
    assert.equal(row.version, dependencies[name], CODE + 'WHEEL');
    assert.ok(typeof row.file === 'string' && /^[A-Za-z0-9_.+-]+\.whl$/.test(row.file), CODE + 'WHEEL');
    const bytes = payload.get('query-wheels/' + row.file) ?? payload.get('controller-wheels/' + row.file);
    assert.ok(bytes && hash(bytes) === row.sha256, CODE + 'WHEEL');
  }
}
