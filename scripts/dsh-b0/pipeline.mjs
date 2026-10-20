/** One local/CI pipeline. --check installs nothing and never opens a business DB.
 * --prepare explicitly fetches only the pinned public DSH and build dependency
 * closure; it never switches/resets an existing checkout or installs globally.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerEnv, packageNetworkEnv, dependencyCommands, archiveToolEnv } from './package-manager-env.mjs';
import { linkWorkspaceKit } from './plugin-kit-link.mjs';
import { prepareRuntimeInputs, recordRuntimePreparation } from '../release/runtime-inputs.mjs';
import { CRM_COMPOSITION_SCOPES, readCompositionInputs } from '../crm-calibration/composition-inputs.mjs';
import { readLeafPackInputs } from './leaf-pack-inputs.mjs';
import { WORKBENCH_CLIENT_SCOPES, readWorkbenchClientInputs } from './workbench-client-pack-inputs.mjs';
import { bindWorkbenchAuthorEvidence, readWorkbenchAuthorEvidence } from '../ci/workbench-author-evidence.mjs';
import { bindDomainPackageInput, readDomainAuthorEvidence } from '../ci/domain-author-evidence.mjs';
import { runWorkbenchMainContracts } from './workbench-main-contracts.mjs';
import { readPublicContractInputs } from '../ci/public-contract-inputs.mjs';
import { runFixedContractChecks } from './fixed-contract-checks.mjs';
import { managerVersions } from '../../dsh-plugins/plugin-kit/package-manager.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const b0 = join(root, '.context/dsh-b0');
const packageInputs = join(b0, 'package-inputs');
const fixedBoardInput = join(root, 'vendor/dsh-package-inputs/shine-mage-board-components-0.1.0.tgz');
const fixedBoardInputSha256 = '22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182';
const kit = join(root, 'dsh-plugins/plugin-kit');
const buildTools = join(kit, 'build-tools');
const USAGE = 'Usage: node scripts/dsh-b0/pipeline.mjs --prepare|--audit|--check --python /absolute/python3.14';
const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
  console.log(USAGE);
  process.exit(0);
}
const [mode, pythonFlag, python, ...extra] = argv;
assert.ok(['--prepare', '--audit', '--check'].includes(mode) && pythonFlag === '--python' && isAbsolute(python ?? '') && !extra.length,
  USAGE);
assert.ok(!process.env.B0_BUILD_UPSTREAM || mode === '--check',
  'B0_BUILD_UPSTREAM is a read-only --check override; --prepare/--audit must use the local pinned checkout');
// DSH_UPSTREAM_CHECKOUT is the explicit checkout selector used by release
// orchestration, including --prepare.  B0_BUILD_UPSTREAM remains a read-only
// --check override for standalone callers and is rejected for --prepare.
const upstream = resolve(process.env.DSH_UPSTREAM_CHECKOUT ?? process.env.B0_BUILD_UPSTREAM ?? join(b0, 'upstream-0.1.7-rc.2'));
const pin = JSON.parse(await readFile(join(kit, 'toolchain.json'), 'utf8'));
const managers = managerVersions(pin);
assert.equal(Number(process.versions.node.split('.')[0]), pin.node_major);
let env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['HOME', 'CI', 'SYSTEMROOT',
    ...(mode === '--check' ? ['CRM_COMPOSITION_PACK_INPUTS', 'CRM_COMPOSITION_PAGE_INPUTS', 'CRM_COMPOSITION_OUTPUT',
      'DSH_COMPOSITION_TOOLCHAIN', 'CRM_COMPOSITION_CORDIS_PEER', 'CRM_COMPOSITION_CORDIS_RUNTIME',
      'WORKBENCH_AUTHOR_CI_ARCHIVE', 'DOMAIN_AUTHOR_CI_ARCHIVE', 'PUBLIC_CONTRACT_INPUTS'] : [])].includes(key))),
  PATH: `${dirname(process.execPath)}:${dirname(python)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  PYTHONPATH: root, PYTHONNOUSERSITE: '1', PYTHON_DOTENV_DISABLED: '1',
  PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1',
  B0_BUILD_UPSTREAM: upstream,
  B0_BUILD_TOOLS: buildTools,
  FQ_B0_PYTHON: python, PUBLIC_CONTRACT_SOURCE_ROOT: root,
  DSH_PACKAGE_INPUTS: packageInputs,
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', LEFTHOOK: '0', CI: '1',
  // Every nested build/version probe must remain offline in check mode,
  // including fixed input checks before preparePackageManager runs.
  ...(mode === '--check' ? { COREPACK_ENABLE_NETWORK: '0' } : {}),
};
// Do not put proxy settings in the shared build/test environment. Only the
// explicit network operations below inherit them; TLS/audit bypass flags,
// provider credentials and arbitrary package-manager settings stay excluded.
const networkEnv = packageNetworkEnv(process.env);
function run(command, args, cwd = root, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, stdio: 'inherit', timeout: 900000 });
  assert.ok(!result.error && result.status === 0, `B0 stage failed: ${command} ${args.join(' ')} (${result.error?.message ?? result.status})`);
}
function output(command, args, cwd = root, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.ok(!result.error && result.status === 0, `B0 verification failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
// Reused fixed checkouts are read-only inputs, including their Git index.
const git = args => output('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', upstream, ...args], root, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0',
  GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0',
});
async function verifySource() {
  assert.equal(git(['rev-parse', 'HEAD']), pin.upstream_sha, 'Pinned upstream SHA mismatch');
  assert.equal(git(['status', '--porcelain', '--untracked-files=no']), '', 'Refusing locally modified upstream');
  assert.equal(createHash('sha256').update(await readFile(join(upstream, 'pnpm-lock.yaml'))).digest('hex'), pin.upstream_lock_sha256);
  assert.equal(JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8')).packageManager, `pnpm@${managers.upstream}`);
}
async function preparePackageManager() {
  env = await packageManagerEnv(join(b0, 'tool-bin'), env, upstream);
  const transport = mode === '--check' ? { COREPACK_ENABLE_NETWORK: '0' } : networkEnv;
  assert.equal(output('corepack', ['pnpm', '--version'], upstream, transport), managers.upstream);
  assert.equal(JSON.parse(await readFile(join(buildTools, 'package.json'))).packageManager, `pnpm@${managers.plugins}`);
  assert.equal(output('corepack', ['pnpm', '--version'], buildTools, transport), managers.plugins);
}
let workbenchAuthorEvidence, domainAuthorEvidence, publicContractEvidence;
if (mode === '--check') {
  // Independent-pack input errors must fail before any source build or service.
  assert.ok(isAbsolute(env.CRM_COMPOSITION_OUTPUT ?? ''), 'CRM_COMPOSITION_OUTPUT_REQUIRED');
  const compositionOutput = await lstat(env.CRM_COMPOSITION_OUTPUT);
  assert.ok(compositionOutput.isDirectory() && !compositionOutput.isSymbolicLink(), 'CRM_COMPOSITION_OUTPUT_REQUIRED');
  await readCompositionInputs({ inputsPath: env.CRM_COMPOSITION_PACK_INPUTS, pageInputsPath: env.CRM_COMPOSITION_PAGE_INPUTS });
  assert.ok(isAbsolute(env.CRM_COMPOSITION_PAGE_INPUTS ?? ''), 'CRM_COMPOSITION_PAGE_INPUTS_REQUIRED');
  await readLeafPackInputs(env.CRM_COMPOSITION_PAGE_INPUTS);
  const pagePacks = await readWorkbenchClientInputs(env.CRM_COMPOSITION_PAGE_INPUTS);
  for (const scope of [...CRM_COMPOSITION_SCOPES, 'leaf', 'geometry', 'contracts', 'installed-kit-packs', 'package-isolation', ...WORKBENCH_CLIENT_SCOPES]) {
    const exists = await lstat(join(env.CRM_COMPOSITION_OUTPUT, scope)).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    assert.ok(!exists, 'CRM_COMPOSITION_OUTPUT_EXISTS');
  }
  workbenchAuthorEvidence = bindWorkbenchAuthorEvidence(await readWorkbenchAuthorEvidence({
    archivePath: env.WORKBENCH_AUTHOR_CI_ARCHIVE, python,
  }), pagePacks);
  domainAuthorEvidence = await bindDomainPackageInput(await readDomainAuthorEvidence({
    archivePath: env.DOMAIN_AUTHOR_CI_ARCHIVE, python,
  }), join(env.DSH_PACKAGE_INPUTS, 'shine-mage-board-components-0.1.0.tgz'));
  publicContractEvidence = await readPublicContractInputs({ inputsPath: env.PUBLIC_CONTRACT_INPUTS, python });
  env = await archiveToolEnv(env);
}
await mkdir(b0, { recursive: true, mode: 0o700 });
if (mode === '--prepare') {
  const fixedInput = await readFile(fixedBoardInput);
  assert.equal(createHash('sha256').update(fixedInput).digest('hex'), fixedBoardInputSha256, 'B0_FIXED_PACKAGE_INPUT_DRIFT');
  await mkdir(packageInputs, { recursive: true, mode: 0o700 });
  const targetInput = join(packageInputs, 'shine-mage-board-components-0.1.0.tgz');
  try {
    const targetInfo = await lstat(targetInput);
    assert.ok(targetInfo.isFile() && !targetInfo.isSymbolicLink(), 'B0_PACKAGE_INPUT_FILE_INVALID');
    assert.deepEqual(await readFile(targetInput), fixedInput, 'B0_PACKAGE_INPUT_DRIFT');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(fixedBoardInput, targetInput);
  }
  let exists = true;
  try { await lstat(upstream); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  if (!exists) {
    await mkdir(upstream, { mode: 0o700 });
    run('git', ['init', '--quiet', upstream]);
    run('git', ['-C', upstream, 'fetch', '--depth=1', pin.upstream_url, pin.upstream_sha], root, networkEnv);
    run('git', ['-C', upstream, 'checkout', '--detach', pin.upstream_sha]);
  }
  await verifySource();
  await preparePackageManager();
  // Offline deploy needs the original direct archive, not a repack of a
  // same-named installed package. Bind it to the pinned lockfile integrity.
  console.log('B0 runtime direct archives:', await prepareRuntimeInputs(upstream));
  // Hydrate every lockfile entry into the pnpm store before install. A
  // reused node_modules tree can otherwise make install report "up to date"
  // while an external tarball (for example SheetJS) is still absent from the
  // store needed by the later offline runtime deploy.
  run('corepack', dependencyCommands.fetch, upstream, networkEnv);
  run('corepack', dependencyCommands.install, upstream, networkEnv);
  // Only native dependencies needed by this fixed profile. No repository hook
  // installer, optional provider SDK lifecycle, global configuration or publish.
  run('corepack', ['pnpm', 'rebuild', 'esbuild', 'fs-ext', 'koffi', 'node-pty'], upstream);
  run('corepack', ['pnpm', 'run', 'build:official'], upstream);
  run('corepack', dependencyCommands.install, buildTools, networkEnv);
  await verifySource();
  await recordRuntimePreparation(upstream);
  console.log('B0 pinned preparation complete; run --audit then --check next. Python packages are never installed by this script.');
} else if (mode === '--audit') {
  // Keep the network-dependent advisory lookup separate from preparation. A
  // transient registry outage must leave the prepared checkout reusable and
  // produce a distinct, fail-closed audit stage in release evidence.
  await verifySource();
  await preparePackageManager();
  run('corepack', ['pnpm', 'audit', '--prod', '--audit-level=high', '--registry=https://registry.npmjs.org'], buildTools, networkEnv);
  console.log('B0 dependency audit complete; run --check next.');
} else {
  await verifySource();
  // Explicit plugin missing-input build guards still
  // need the kit binding. The fixed-package consumers do not use these source
  // trees; removing guard inputs now would turn real failures into skips.
  for (const name of ['analytics-workbench', 'crm-knowledge', 'knowledge', 'shine-brand', 'shine-waterfall', 'shine-crowd-action', 'shine-query', 'shine-board', 'shine-funnel']) {
    await linkWorkspaceKit(join(root, 'dsh-plugins', name), kit);
  }
  // Domain producer/private geometry belong to the fixed independent owner CI.
  // Keep the three published consumer locks and public install/type contracts here.
  run(process.execPath, ['scripts/dsh-b0/package-inputs.mjs', env.DSH_PACKAGE_INPUTS]);
  // Keep all original generators/schema and compiler assertions; consume sealed
  // independent materials in an owned stage instead of the legacy source tree.
  const publicContractChecks = await runFixedContractChecks({ inputsPath: env.PUBLIC_CONTRACT_INPUTS,
    output: join(env.CRM_COMPOSITION_OUTPUT, 'contracts'), python, buildTools });
  run(process.execPath, ['--test', '--test-concurrency=1', 'scripts/ci/public-contract-inputs.test.mjs', 'scripts/dsh-b0/fixed-contract-checks.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/package-inputs.test.mjs', 'scripts/dsh-b0/geometry-composition.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/explicit-build-inputs.test.mjs', 'scripts/dsh-b0/workbench-author-contracts.test.mjs']);
  run(process.execPath, ['--test', 'scripts/ci/domain-author-evidence.test.mjs']);
  run(process.execPath, ['--test', 'scripts/ci/composition-pack-inputs.test.mjs']);
  run(process.execPath, ['--test', 'scripts/ci/workbench-author-evidence.test.mjs']);
  run(process.execPath, ['--test', '--test-concurrency=1', 'scripts/ci/pregate-runner.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/leaf-pack-inputs.test.mjs', 'scripts/dsh-b0/workbench-client-pack-inputs.test.mjs']);
  run(process.execPath, ['scripts/dsh-b0/plugin-boundaries.mjs', '--check']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/plugin-boundaries.test.mjs']);
  // Guard tests fail before process startup. The real-host drill remains opt-in.
  run(process.execPath, ['--test', 'scripts/dsh-b0/pinned-host-acceptance.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/first-purchase-crm-host-protocol.test.mjs']);
  run(process.execPath, ['--test', '--test-concurrency=1',
    'scripts/dsh-b0/plugin-update-trial.test.mjs', 'scripts/dsh-b0/plugin-update-trial-cancel.test.mjs'], root, { FQ_B0_PYTHON: python });
  run(process.execPath, ['--test', 'scripts/dsh-b0/first-purchase-kernel-artifacts.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/first-purchase-runtime-artifacts.test.mjs']);
  for (const file of ['html-host-browser-ui.probe.mjs', 'plugin-update-trial.mjs', 'asset-ui-smoke.mjs', 'theme-ui-smoke.mjs', 'native-ui-smoke.mjs', 'native-card-smoke.mjs', 'native-state-smoke.mjs', 'native-query-smoke.mjs', 'native-query-fault-smoke.mjs', 'native-query-fault-scenario.mjs', 'query-scenario.mjs', 'tool-card-dom-smoke.mjs', 'gateway-smoke.mjs', 'control-permission-probe.mjs', 'native-query-assets-smoke.mjs', 'asset-routes.mjs']) {
    run(process.execPath, ['--check', join(root, 'scripts/dsh-b0', file)]);
  }
  run(python, ['-c', String.raw`
import importlib.metadata as metadata, pathlib, sys
assert sys.version_info >= (3, 14), 'Use explicit Python 3.14+'
for line in pathlib.Path('scripts/dsh-b0/requirements.lock').read_text().splitlines():
    if not line or line.startswith('#'): continue
    name, version = line.split('==')
    actual = metadata.version(name)
    if actual != version:
        print(f'B0 dependency drift: {name} expected={version} installed={actual}', file=sys.stderr)
        raise AssertionError(f'B0 dependency drift: {name}')
print('B0 exact Python closure verified')
`]);
  console.log('DSH dev supervisor unit checks (separate from native compatibility acceptance)');
  run(process.execPath, ['--test', ...(await readdir(join(root, 'scripts/dsh-dev'))).filter(n => n.endsWith('.test.mjs')).map(n => join(root, 'scripts/dsh-dev', n))], root, { DSH_DEV_UPSTREAM: upstream });
  const pyTests = ['jobs', 'access', 'run_contracts', 'run_resources', 'native_runtime', 'worker', 'context', 'native_probe', 'query_contracts', 'channel_followup', 'query_jobs', 'query_run_contracts', 'query_worker', 'query_runtime', 'query_native_fault', 'saved_analyses', 'analysis_http', 'cockpit', 'cockpit_http', 'query_assets_runtime', 'first_purchase', 'first_purchase_http', 'first_purchase_kernel', 'first_purchase_analysis', 'first_purchase_save_recovery', 'first_purchase_save_receipts', 'first_purchase_save_api', 'first_purchase_save_ui', 'first_purchase_crm_identity', 'first_purchase_source', 'first_purchase_native', 'customer_features_w4', 'feature_publication_w5', 'runtime_ports'].map(name => `backend/tests/test_analytics_${name}.py`);
  // HTTP/computation tests import the archived CRM dependency closure and run
  // under the shared bounded backend profile, not the minimal B0 interpreter.
  pyTests.push('scripts/dsh-b0/test_sdk_archive.py', 'backend/tests/test_analytics_first_purchase_native_identity.py',
    'backend/tests/test_analytics_first_purchase_source_http.py',
    'backend/tests/test_analytics_first_purchase_native_crm_http.py',
    'backend/tests/test_first_purchase_packed_service_support.py',
    'backend/tests/test_first_purchase_packed_kernel_support.py',
    'backend/tests/test_competition_assets.py',
    'backend/services/analytics/competition_diagnosis/tests/test_competition_diagnosis.py',
    'backend/tests/test_page_documents.py',
    'backend/tests/test_cockpit_files.py',
    'backend/tests/test_cockpit_ai.py',
    'backend/tests/test_cockpit_presentation.py',
    'backend/tests/test_page_result_access.py',
    'backend/tests/test_page_result_access_http.py',
    'backend/tests/test_p12_page_mount.py');
  run(python, ['-m', 'pytest', '--noconftest', '-W', 'error::ResourceWarning', '-q', ...pyTests]);
  run(python, ['-m', 'ruff', 'check', 'backend/analytics_app.py', 'backend/analytics_runtime.py', 'backend/analytics_query_app.py',
    'backend/analytics_analysis_app.py', 'backend/analytics_cockpit_app.py',
    'backend/analytics_competition_app.py', 'backend/board_spec_routes.py', 'backend/contracts/board_spec.py',
    'backend/contracts/competition_computed.py', 'scripts/competition-synth-http.py',
    'backend/analytics_first_purchase_app.py', 'backend/analytics_first_purchase_analysis_app.py', 'backend/analytics_first_purchase_cockpit_app.py', 'backend/analytics_first_purchase_native.py', 'backend/contracts/analytics_first_purchase_analysis.py', 'backend/contracts/analytics_first_purchase_cockpit.py', 'backend/analytics_first_purchase_fixture.py',
    'backend/services/analytics/first_purchase', 'backend/services/analytics/customer_features', 'backend/services/analytics/query_codecs.py',
    'backend/contracts/analytics_first_purchase_kernel.py', 'backend/contracts/analytics_first_purchase_run.py',
    'backend/contracts/analytics_first_purchase_source.py', 'backend/analytics_first_purchase_source_app.py',
    'backend/analytics_fixture.py', 'backend/analytics_query_fixture.py', 'backend/analytics_worker.py', 'backend/semantic/analytics_b0.py',
    'backend/semantic/analytics_channel_followup.py',
    'backend/contracts/analytics.py', 'backend/contracts/analytics_query.py', 'backend/contracts/analytics_query_run.py',
    'backend/contracts/analytics_analysis.py', 'backend/contracts/analytics_cockpit.py', 'backend/services/analytics', 'backend/tests/analytics_run_support.py',
    'backend/tests/analytics_run_fault_probe.py', 'backend/tests/analytics_worker_probe.py',
    'backend/tests/analytics_query_worker_probe.py',
    'backend/tests/analytics_native_probe.py', 'backend/tests/analytics_query_native_fault_probe.py', ...pyTests]);
  // Workbench core/build/private loader checks run in its pinned author CI.
  // Main keeps its orchestration units and the original backend/query checks.
  run(process.execPath, ['--test',
    'scripts/dsh-b0/gateway-policy.test.mjs', 'scripts/dsh-b0/transport-safety.test.mjs', 'scripts/dsh-b0/mock-provider.test.mjs',
    'scripts/dsh-b0/recovery-model-gate.test.mjs', 'scripts/dsh-b0/session-recovery.test.mjs',
    'scripts/dsh-b0/shell-tool-contract.test.mjs',
    'scripts/dsh-b0/html-host-browser-inputs.test.mjs',
    'scripts/dsh-b0/html-host-browser-ui-args.test.mjs',
    'scripts/dsh-b0/html-host-browser-cleanup.test.mjs',
    'scripts/dsh-b0/lifecycle-observer.test.mjs', 'scripts/dsh-b0/host-feasibility.test.mjs', 'scripts/dsh-b0/compatibility-matrix.test.mjs', 'scripts/dsh-b0/permission-fence.test.mjs', 'scripts/dsh-b0/ui-seams.test.mjs',
    'scripts/dsh-b0/package-manager-env.test.mjs', 'scripts/dsh-b0/diagnostic-sink.test.mjs',
    'scripts/release/plugin-pack.test.mjs', 'scripts/release/plugin-candidate.test.mjs', 'scripts/release/plugin-host-evidence.test.mjs', 'scripts/release/profile.test.mjs', 'scripts/release/plugin-boundary.test.mjs', 'scripts/release/supply-chain.test.mjs',
    'scripts/release/runtime-host-evidence.test.mjs', 'scripts/release/profile-packs.test.mjs', 'scripts/release/release-profile-packs.test.mjs',
    'scripts/crm-calibration/profile-packs.test.mjs',
    'scripts/crm-calibration/composition-inputs.test.mjs',
    'scripts/release/backpressure.test.mjs',
    'scripts/release/terminal-host-evidence.test.mjs',
    'scripts/release/browser-host-evidence.test.mjs', 'scripts/release/browser-host-v2.test.mjs',
    'scripts/release/im-plugin-inputs.test.mjs',
    'scripts/release/sdk-content-audit.test.mjs',
    'scripts/release/sdk-supply-chain.test.mjs',
    'scripts/release/sdk-closure.test.mjs',
    'scripts/dsh-b0/clean-build.test.mjs',
    'scripts/dsh-b0/plugin-kit.test.mjs', 'scripts/dsh-b0/plugin-kit-prepare.test.mjs',
    'scripts/dsh-b0/native-state-smoke.test.mjs', 'scripts/dsh-b0/native-query-smoke.test.mjs',
    'scripts/dsh-b0/native-query-fault-smoke.test.mjs', 'scripts/dsh-b0/native-query-assets-smoke.test.mjs',
    'scripts/dsh-b0/asset-routes.test.mjs']);
  // Current kit packaging/compiler checks and published author declarations;
  // the preserved ten-source fixture is explicit legacy evidence, not default.
  run(process.execPath, ['--test', 'scripts/dsh-b0/installed-kit-packs.integration.mjs']);
  // CRM/knowledge source builds and private transport/graph tests belong to
  // their independent author repositories. Keep the public package behavior
  // here, with verified formal inputs and separate non-reusable output scopes.
  run(process.execPath, ['--test', '--test-concurrency=1',
    'scripts/crm-calibration/crm-package.integration.mjs',
    'scripts/crm-calibration/knowledge-package.integration.mjs']);
  run(process.execPath, ['--test', 'scripts/crm-calibration/page-composition.integration.mjs',
    'scripts/crm-calibration/knowledge-composition.integration.mjs', 'scripts/crm-calibration/profile.test.mjs']);
  // Runtime consumers read the independent packages, never rebuild six sibling
  // plugins. Producer missing-input guards remain above in explicit-build-inputs;
  // the separate archive isolation below consumes the same fixed inputs.
  run(process.execPath, ['--test', 'scripts/dsh-b0/leaf-pack-composition.integration.mjs'], root);
  run(process.execPath, ['--test', 'scripts/dsh-b0/legacy-geometry-exports.test.mjs'], root);
  run(process.execPath, ['--test', '--test-concurrency=1', 'scripts/dsh-b0/workbench-client-pack.integration.mjs',
    ...['workbench-tool-cards', 'workbench-query-cancel', 'workbench-query-save', 'workbench-asset-overlay',
      'workbench-first-purchase-card', 'workbench-first-purchase-save', 'workbench-query-fault', 'workbench-native-prompt'].map(name => `scripts/dsh-b0/${name}.integration.mjs`)], root);
  run(process.execPath, ['--test', 'scripts/dsh-b0/plugin-isolation.test.mjs'], root);
  const mainContracts = await runWorkbenchMainContracts({ environment: env });
  const report = { schema_version: 'dsh-b0-build-evidence/v2', at: new Date().toISOString(),
    upstream_sha: pin.upstream_sha, upstream_lock_sha256: pin.upstream_lock_sha256,
    node: process.version, python: output(python, ['--version']),
    stages: ['contract', 'python-unit', 'ruff', 'main-node-unit', 'independent-pack-consumers', 'main-workbench-contracts'],
    workbench_author: workbenchAuthorEvidence, main_workbench_contracts: mainContracts,
    public_contract_inputs: publicContractEvidence, public_contract_checks: publicContractChecks,
    workbench_source_build_here: 'NOT_RUN_AUTHOR_OWNED',
    workbench_private_loader_here: 'NOT_RUN_AUTHOR_OWNED',
    workbench_clean_rebuild_here: 'NOT_RUN_AUTHOR_OWNED',
    installed_kit_business_sources: 'NOT_RUN_AUTHOR_OWNED',
    legacy_installed_kit_source_fixture: 'NOT_RUN_EXPLICIT_LEGACY_ONLY',
    legacy_plugin_source_isolation: 'NOT_RUN_EXPLICIT_LEGACY_ONLY',
    fixed_pack_isolation: 'four published archives, no source builds or peer installation',
    domain_author: domainAuthorEvidence,
    domain_source_build_here: 'NOT_RUN_AUTHOR_OWNED',
    domain_private_geometry_here: 'NOT_RUN_AUTHOR_OWNED',
    legacy_domain_source_fixture: 'NOT_RUN_EXPLICIT_LEGACY_ONLY',
    remaining_source_producers: [],
    remaining_source_contracts: ['explicit plugin build-input guards', 'Workbench/coordinator main contracts'],
    native_dsh_profile_e2e: 'separate evidence required', release_ready: false };
  await writeFile(join(b0, 'build-evidence.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log('B0 main checks passed; Workbench core remains attributed to its fixed author CI.');
}
