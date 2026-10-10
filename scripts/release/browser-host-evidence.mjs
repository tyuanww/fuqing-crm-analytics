/** Archived browser observations, never a browser launch or production authorization. */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { insideArtifact } from './service-artifact-evidence.mjs';
import { readPreparedServiceCandidate } from './plugin-service-evidence.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { recordEvent } from './state.mjs';
import { DSH_UPSTREAM_SHA } from './toolchain.mjs';
import { checkedSet, checkController, readRuntimeHostInputs, checkRuntimeHostComposition,
  checkProcesses, RUNTIME_HOST_SOURCE } from './runtime-host-evidence.mjs';

import { BROWSER_HOST_V2_SCHEMA, CURRENT_BROWSER_RESULT, readBrowserV2Inputs, expectedBrowserFontInputs, checkBrowserV2Completion } from './browser-host-v2.mjs';
export { BROWSER_HOST_V2_SCHEMA } from './browser-host-v2.mjs';

export const BROWSER_HOST_SCHEMA = 'dsh-browser-host-evidence/v1';
export const BROWSER_TEST_ROOT = 'browser-r3/tests/test_official_host_crm_query_s0';
export const BROWSER_PROBE_SHA = '25da43a68af26c7f9712b802334dd83c3009173dda1bb36a435d061f01b9c678';
export const BROWSER_ROWS = Object.freeze(['native-composer-denies-query-before-crm-login', 'native-slot-crm-login',
  'native-command-real-loop-worker-and-confirmed-save', 'reload-reconciles-same-save-intent',
  'ordinary-native-composer-without-crm-login-or-business-preset']);
const CODE = 'PLUGIN_HOST_BROWSER_', HEX = /^[a-f0-9]{64}$/, VERSION = '151.0.7922.34', PLAYWRIGHT = '1.62.1';
const decode = bytes => JSON.parse(bytes.toString('utf8'));
function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), CODE + code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), CODE + code);
}
function parentEvent(journal, link, status, prepared, fields) {
  exact(link, ['seq', 'digest'], 'PARENT');
  assert.ok(Number.isSafeInteger(link.seq) && link.seq > 0 && HEX.test(link.digest), CODE + 'PARENT');
  const parent = journal.journal[link.seq - 1];
  assert.ok(parent?.status === status && parent.digest === link.digest && parent.release_tag === prepared.release_tag, CODE + 'PARENT');
  for (const [key, value] of Object.entries(fields)) assert.deepEqual(parent[key], value, CODE + 'PARENT_CANDIDATE');
  assert.equal(parent.observation?.release_ready, false, CODE + 'PARENT');
  return parent;
}
export async function verifyBrowserHostEvidence({ candidatePath, evidencePath, statePath, envelopeBytes }) {
  const envelope = decode(envelopeBytes), directory = dirname(evidencePath);
  const v2 = envelope.schema_version === BROWSER_HOST_V2_SCHEMA;
  const parentKey = v2 ? 'terminal_host_event' : 'runtime_host_event';
  exact(envelope, ['schema_version','inputs','controller','inventory','completion','runtime_archive',parentKey,
    ...(v2 ? ['collection','result_archive','completion_script'] : [])], 'ENVELOPE');
  assert.ok([BROWSER_HOST_SCHEMA,BROWSER_HOST_V2_SCHEMA].includes(envelope.schema_version), CODE + 'SCHEMA');
  const { candidate, candidateBytes, candidateFields, prepared, journal } = await readPreparedServiceCandidate({ candidatePath, statePath });
  const parent = parentEvent(journal, envelope[parentKey], v2 ? 'CANDIDATE_TERMINAL_HOST_OBSERVED' : 'CANDIDATE_RUNTIME_HOST_OBSERVED', prepared, candidateFields);
  assert.equal(parent.observation.status, v2 ? 'WSL_SYNTHETIC_TERMINAL_HOST_OBSERVED' : 'WSL_SYNTHETIC_RUNTIME_HOST_OBSERVED', CODE + 'PARENT_SCOPE');
  assert.equal(parent.observation.scope, v2 ? 'actual-wsl2-synthetic-inflight-terminal-recovery' : 'actual-wsl2-synthetic-runtime-and-service-artifacts', CODE + 'PARENT_SCOPE');
  if (v2) {
    assert.equal(parent.observation.interrupted_status, 'FAILED', CODE + 'PARENT_TERMINAL');
    assert.equal(parent.observation.execution_active, false, CODE + 'PARENT_TERMINAL');
    assert.equal(parent.observation.dispatch_attempts, 1, CODE + 'PARENT_TERMINAL');
  }
  const serviceParent = parentEvent(journal, parent.service_target_event, 'CANDIDATE_SERVICE_TARGET_OBSERVED', prepared, candidateFields);
  assert.ok(serviceParent.seq < parent.seq, CODE + 'PARENT_ORDER');
  const prior = serviceParent.observation;
  assert.equal(prior.scope, 'actual-wsl2-synthetic-package-http', CODE + 'PARENT_SCOPE');
  assert.equal(prior.status, 'LOCAL_WSL_SYNTHETIC_SOURCE_HTTP_OBSERVATION_VERIFIED', CODE + 'PARENT_SCOPE');
  async function reference(ref) {
    exact(ref, ['name', 'sha256'], 'REFERENCE'); assert.match(ref.sha256 ?? '', HEX, CODE + 'REFERENCE');
    const bytes = await insideArtifact(directory, ref.name, 2 * 1024 * 1024);
    assert.equal(hash(bytes), ref.sha256, CODE + 'REFERENCE_DIGEST'); return decode(bytes);
  }
  let input, content, controllerContent, payload, payloadRoot, records;
  if (v2) {
    ({input,content,payload,payloadRoot,records} = await readBrowserV2Inputs({envelope,reference,directory,candidate}));
  } else {
    input = await reference(envelope.inputs); const controller = await reference(envelope.controller);
    exact(input, ['schema_version','scope','runtime_sha256','browser_version','playwright_version','controller_source','controller_override','files','release_ready'], 'INPUT');
    assert.equal(input.schema_version, 'owned-first-purchase-browser-inputs/v1', CODE + 'INPUT');
    assert.equal(input.scope, 'synthetic-only', CODE + 'INPUT'); assert.equal(input.release_ready, false, CODE + 'UNPROVEN');
    assert.equal(input.controller_source, RUNTIME_HOST_SOURCE, CODE + 'CONTROLLER');
    const probe = 'scripts/dsh-b0/first-purchase-browser.probe.mjs';
    assert.deepEqual(input.controller_override, [probe], CODE + 'CONTROLLER');
    assert.equal(input.browser_version, VERSION, CODE + 'BROWSER_VERSION'); assert.equal(input.playwright_version, PLAYWRIGHT, CODE + 'DRIVER_VERSION');
    exact(controller, ['schema_version','base_input_sha256','files'], 'CONTROLLER');
    assert.equal(controller.schema_version, 'owned-browser-controller/v1', CODE + 'CONTROLLER');
    assert.equal(controller.base_input_sha256, envelope.inputs.sha256, CODE + 'CONTROLLER');
    content = await checkedSet(join(directory, dirname(envelope.inputs.name)), input.files, 160 * 1024 * 1024, 600);
    controllerContent = await checkedSet(join(directory, dirname(envelope.controller.name)), controller.files, 16 * 1024 * 1024);
    assert.ok(controllerContent.has('repo/' + probe), CODE + 'PROBE_REQUIRED');
    await checkController(controllerContent, { ['repo/' + probe]: BROWSER_PROBE_SHA });
  }
  for (const packageName of ['playwright','playwright-core']) {
    const pkg = decode(content.get(`browser-driver/node_modules/${packageName}/package.json`));
    assert.equal(pkg.name, packageName, CODE + 'DRIVER'); assert.equal(pkg.version, PLAYWRIGHT, CODE + 'DRIVER_VERSION');
  }
  if (!v2) {
    payload = new Map([...content].filter(([name]) => name.startsWith('payload/')).map(([name, bytes]) => [name.slice(8), bytes]));
    payloadRoot = join(directory, dirname(envelope.inputs.name), 'payload');
    records = await checkedSet(join(directory, dirname(envelope.inventory.name)), await reference(envelope.inventory), 32 * 1024 * 1024);
  }
  const { manifest, runtime, prefix } = await readRuntimeHostInputs({ payload, payloadRoot, candidateBytes, prior, directory, envelope, browser: true });
  if (!v2) assert.equal(input.runtime_sha256, runtime.artifact.sha256, CODE + 'RUNTIME');
  assert.equal(parent.observation.runtime_sha256, runtime.artifact.sha256, CODE + 'PARENT_RUNTIME');
  const resultRoot = v2 ? CURRENT_BROWSER_RESULT : 'browser-r3';
  const testRoot = resultRoot + '/tests/test_official_host_crm_query_s0';
  const data = name => { assert.ok(records.has(name), CODE + 'REQUIRED'); return decode(records.get(name)); };
  const receipt = data(resultRoot + '/receipt.json');
  exact(receipt, ['schema_version','status','exit_code','seconds','scope','platform','controller_sha256','input_sha256','runtime_sha256',
    'browser','font_receipt_sha256','playwright_version','headless','mobile','accessibility','cross_version_recovery','production_identity','supply_chain','activation','release_ready',...(v2 ? ['candidate_digest','plugin_source','service_source'] : [])], 'RECEIPT');
  assert.equal(receipt.schema_version, v2 ? 'dsh-current-candidate-browser-observation/v1' : 'dsh-first-purchase-browser-observation/v1', CODE + 'RECEIPT');
  if (v2) {
    assert.equal(receipt.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
    assert.equal(receipt.plugin_source, candidate.source_sha, CODE + 'PLUGIN_SOURCE');
    assert.equal(receipt.service_source, candidate.service_compatibility.binding.source_sha, CODE + 'SERVICE_SOURCE');
    assert.deepEqual(receipt.platform, parent.observation.platform, CODE + 'PARENT_PLATFORM');
    assert.deepEqual(receipt.platform, prior.platform, CODE + 'PLATFORM');
  }
  assert.equal(receipt.scope, 'actual-wsl2-synthetic-runtime-artifacts-browser', CODE + 'SCOPE');
  assert.equal(receipt.status, 'PASS', CODE + 'NOT_PASS'); assert.equal(receipt.exit_code, 0, CODE + 'NOT_PASS');
  assert.ok(Number.isFinite(receipt.seconds) && receipt.seconds > 0 && receipt.seconds <= 600, CODE + 'TIME');
  for (const key of ['mobile','accessibility','cross_version_recovery','production_identity','activation']) assert.equal(receipt[key], 'NOT_RUN', CODE + 'UNPROVEN');
  assert.equal(receipt.supply_chain, 'NOT_VERIFIED', CODE + 'UNPROVEN'); assert.equal(receipt.release_ready, false, CODE + 'UNPROVEN');
  assert.equal(receipt.headless, true, CODE + 'HEADLESS'); assert.equal(receipt.playwright_version, PLAYWRIGHT, CODE + 'DRIVER_VERSION');
  const platform = receipt.platform;
  exact(platform, ['system','machine','kernel','python','uid'], 'PLATFORM');
  assert.ok(platform.system === 'Linux' && platform.machine === 'x86_64' && platform.uid === 65534
    && /^3\.14\.\d+$/.test(platform.python) && /^[A-Za-z0-9._+-]{1,128}$/.test(platform.kernel)
    && /microsoft/i.test(platform.kernel) && /wsl2/i.test(platform.kernel), CODE + 'PLATFORM');
  assert.equal(receipt.input_sha256, envelope.inputs.sha256, CODE + 'INPUT_BINDING');
  assert.equal(receipt.controller_sha256, envelope.controller.sha256, CODE + 'CONTROLLER');
  assert.equal(receipt.runtime_sha256, runtime.artifact.sha256, CODE + 'RUNTIME');
  assert.deepEqual(receipt.browser, {version:VERSION,platform:'linux',uid:65534,scope:'target-browser-readiness-only'}, CODE + 'BROWSER');
  const http = data(testRoot + '/official-host/http-observations.json');
  const packages = http.artifacts;
  if (v2) {
    exact(http, ['upstream_sha','observations','cleanup_ok','browser','candidate_digest','artifacts','package_integrity','admission'], 'HTTP');
    assert.deepEqual(packages, data(testRoot + '/plugin-artifacts/packages.json'), CODE + 'PACKAGES');
  }
  const composition = await checkRuntimeHostComposition({ packages, payload, candidate, manifest, runtime, prior, independentSources:v2 });
  const { source_contract, queryManifest, saveManifest, service, query } = composition;
  assert.deepEqual(Object.fromEntries(Object.entries(packages.packages).map(([k,v]) => [k,v.tarball.sha256])), parent.observation.plugin_digests, CODE + 'PARENT_PLUGINS');
  assert.equal(service.archive_sha256, parent.observation.service_archive_sha256, CODE + 'PARENT_SERVICE');
  assert.equal(query.sha256, parent.observation.query_archive_sha256, CODE + 'PARENT_QUERY');
  assert.equal(http.upstream_sha, DSH_UPSTREAM_SHA, CODE + 'DSH'); assert.equal(http.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
  assert.equal(http.cleanup_ok, true, CODE + 'CLEANUP'); assert.equal(http.package_integrity, 'PASS', CODE + 'INTEGRITY');
  assert.equal(http.admission, 'official native composer slash command in Chrome', CODE + 'ADMISSION');
  const observed = data(testRoot + '/official-host/browser-observations.json');
  assert.deepEqual(observed, { rows:BROWSER_ROWS,errors:[],driver:'Chrome headless',browser_version:VERSION,platform:'linux',locale:'zh-CN' }, CODE + 'SCENARIOS');
  assert.deepEqual(http.browser, {ok:true,browser:'Chrome headless',browser_version:VERSION,platform:'linux',locale:'zh-CN',rows:BROWSER_ROWS}, CODE + 'HTTP_BROWSER');
  const rows = http.observations;
  assert.ok(Array.isArray(rows) && rows.length === 5, CODE + 'AUTH_SCENARIOS');
  exact(rows[0], ['stage','pid','generation'], 'HOST');
  assert.equal(rows[0].stage, 'official-host-loaded', CODE + 'HOST'); assert.equal(rows[0].generation, 1, CODE + 'HOST');
  assert.deepEqual(rows.slice(1), [{stage:'missing-cookie-rejected',status:'PASS'},{stage:'foreign-origin-rejected',status:'PASS'},
    {stage:'missing-csrf-header-rejected',outcome:'CONNECTION_CLOSED'},{stage:'cookie-origin-csrf-and-login-bootstrap',status:'PASS'}], CODE + 'AUTH_SCENARIOS');
  assert.deepEqual(data(testRoot + '/source-boundary.json'), {scope:'artifact-official-host-query-source-http',source_contract,
    save_run_store_argument:null,query_worker_count:1,analysis_count:1,source_mode:'explicit-loopback-http',release_ready:false}, CODE + 'SOURCE_BOUNDARY');
  const processes = checkProcesses(data(testRoot + '/kernel-processes/processes.json'),
    data(testRoot + '/save-owner/service-processes/processes.json'), null, http, queryManifest, saveManifest,
    candidate, query.manifest_sha256, service.manifest_sha256, { browser: true, independentSources:v2 });
  const screenshots = {};
  for (const name of ['browser-saved.png','browser-native.png']) {
    const bytes = records.get(testRoot + '/official-host/' + name);
    assert.ok(bytes?.length > 24 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
      && bytes.toString('ascii',12,16) === 'IHDR' && bytes.readUInt32BE(16) === 1280
      && bytes.readUInt32BE(20) >= 900 && bytes.readUInt32BE(20) <= 10000, CODE + 'SCREENSHOT');
    screenshots[name] = hash(bytes);
  }
  const font = data('browser-font-receipt.json');
  assert.equal(hash(records.get('browser-font-receipt.json')), receipt.font_receipt_sha256, CODE + 'FONT_BINDING');
  assert.equal(font.status, 'PASS', CODE + 'FONT'); assert.equal(font.method, 'download-and-extract-only', CODE + 'FONT');
  assert.equal(font.system_install, 'NOT_RUN', CODE + 'FONT');
  assert.deepEqual(font.package, {package:'fonts-noto-cjk',version:'1:20230817+repack1-3',bytes:61229778,
    sha256:'7d64b985f6fe128c99eae5610d5c047338e572bdcfb2bb09736be01b824a7f6c'}, CODE + 'FONT');
  assert.equal(font.fc_match, 'Noto Sans CJK SC: ' + prefix + '/browser-fonts/root/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', CODE + 'FONT');
  const fontNames = ['browser-fonts/root/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    'browser-fonts/root/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
    'browser-fonts/root/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc',
    'browser-fonts/root/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    'browser-fonts/fonts.conf', 'browser-launch-r3.sh'];
  exact(font.files, fontNames, 'FONT_FILES');
  for (const name of fontNames) {
    const row = font.files[name]; exact(row, ['bytes','sha256'], 'FONT_FILE');
    assert.match(row.sha256 ?? '', HEX, CODE + 'FONT_FILE');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 32 * 1024 * 1024, CODE + 'FONT_FILE');
    if (!name.endsWith('.ttc')) {
      const bytes = v2 ? expectedBrowserFontInputs(prefix)[name] : records.get(name);
      assert.ok(bytes && bytes.length === row.bytes && hash(bytes) === row.sha256, CODE + 'FONT_FILE');
    }
  }
  const download = data('chrome.zip.download.json');
  assert.equal(download.exit_code, 0, CODE + 'BROWSER_DOWNLOAD'); assert.equal(download.stderr, '', CODE + 'BROWSER_DOWNLOAD');
  assert.equal(download.source, 'https://cdn.playwright.dev/builds/cft/' + VERSION + '/linux64/chrome-linux64.zip', CODE + 'BROWSER_DOWNLOAD');
  assert.equal(download.sha256, 'ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8', CODE + 'BROWSER_DOWNLOAD');
  assert.equal(download.bytes, 193282658, CODE + 'BROWSER_DOWNLOAD');
  const libraries = data('browser-library-receipt.json');
  assert.equal(libraries.status, 'PASS', CODE + 'BROWSER_LIBRARIES');
  assert.equal(libraries.system_install, 'NOT_RUN', CODE + 'BROWSER_LIBRARIES');
  assert.deepEqual(libraries.missing_libraries, [], CODE + 'BROWSER_LIBRARIES');
  if (v2) {
    await checkBrowserV2Completion({envelope,reference,directory,records,content,payload,prefix,runtime,receipt});
  } else {
    const cleanup = data('cleanup-check-r3.json'), completion = await reference(envelope.completion);
    assert.deepEqual(cleanup, {font_input_files_unchanged:Object.keys(font.files).length,status:'PASS',sealed_files_unchanged:content.size,
      controller_r2_files_unchanged:controllerContent.size,runtime_unchanged:true,protected_listeners_unchanged:true,
      test_ports_closed:true,processes_with_owned_cwd_or_executable:[],release_ready:false}, CODE + 'CLEANUP');
    exact(completion, ['status','owned_root','owned_root_removed','production_listeners_unchanged','test_ports_closed','evidence_sha256','system_install','production_activation'], 'COMPLETION');
    assert.equal(completion.owned_root, prefix, CODE + 'COMPLETION'); assert.equal(completion.status, 'PASS', CODE + 'COMPLETION');
    for (const key of ['owned_root_removed','production_listeners_unchanged','test_ports_closed']) assert.equal(completion[key], true, CODE + 'COMPLETION');
    assert.equal(completion.system_install, 'NOT_RUN', CODE + 'COMPLETION'); assert.equal(completion.production_activation, 'NOT_RUN', CODE + 'UNPROVEN');
    assert.match(completion.evidence_sha256 ?? '', HEX, CODE + 'COMPLETION');
  }
  const stdout = records.get(resultRoot + '/pytest.stdout'), stderr = records.get(resultRoot + '/pytest.stderr');
  assert.ok(stdout && /\b1 passed\b/.test(stdout.toString('utf8')) && !/\b[1-9]\d* (?:failed|errors?|skipped)\b/.test(stdout.toString('utf8')), CODE + 'PYTEST');
  assert.equal(stderr?.length, 0, CODE + 'PYTEST');
  const observation = {status:'WSL_SYNTHETIC_BROWSER_HOST_OBSERVED',scope:receipt.scope,
    candidate_digest:candidate.candidate_digest,browser_evidence_sha256:hash(envelopeBytes),receipt_sha256:hash(records.get(resultRoot + '/receipt.json')),
    input_sha256:envelope.inputs.sha256,controller_sha256:envelope.controller.sha256,inventory_sha256:envelope.inventory.sha256,
    completion_sha256:envelope.completion.sha256,runtime_sha256:runtime.artifact.sha256,plugin_digests:parent.observation.plugin_digests,
    query_archive_sha256:query.sha256,service_archive_sha256:service.archive_sha256,platform,
    browser_version:VERSION,playwright_version:PLAYWRIGHT,locale:'zh-CN',headless:true,scenario_count:BROWSER_ROWS.length,screenshots,
    process_count:processes.pids.length,production_identity:'NOT_RUN',mobile:'NOT_RUN',accessibility:'NOT_RUN',cross_version_recovery:'NOT_RUN',
    activation:'NOT_RUN',supply_chain:'NOT_VERIFIED',release_ready:false,evidence_authenticity:'UNATTESTED_OPERATOR_OBSERVATION',
    limitations:['Archived synthetic headless observations; this verifier does not execute a browser or contact WSL.',
      'Hashes bind supplied evidence, not remote attestation; browser/library/font binaries and rendered pixels are not re-executed or certified.',
      ...(v2 ? ['V2 checks normalized fixed runner and collected result archive; font configuration hashes remain operator observations.'] : []),
      'No headed/mobile/accessibility, real identity/model/UAT, cross-version recovery or production activation.']};
  const event = await recordEvent(statePath, {release_tag:prepared.release_tag,status:'CANDIDATE_BROWSER_HOST_OBSERVED',
    ...candidateFields,[parentKey]:envelope[parentKey],observation},
  {idempotencyKey:`candidate-browser-host:${candidate.candidate_digest}:${hash(envelopeBytes)}`,requiredEvent:envelope[parentKey]});
  return {...observation,journal_seq:event.seq,journal_digest:event.digest};
}
