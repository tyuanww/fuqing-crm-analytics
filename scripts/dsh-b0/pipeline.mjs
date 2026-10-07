/** One local/CI pipeline. --check installs nothing and never opens a business DB.
 * --prepare explicitly fetches only the pinned public DSH and build dependency
 * closure; it never switches/resets an existing checkout or installs globally.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerEnv, packageNetworkEnv, dependencyCommands, archiveToolEnv } from './package-manager-env.mjs';
import { copyPluginKitSources, copyTreeBounded, createCleanRoot, reapStaleCleanRoots, removeCleanRoot } from './clean-build.mjs';
import { linkWorkspaceKit } from './plugin-kit-link.mjs';
import { prepareRuntimeInputs, recordRuntimePreparation } from '../release/runtime-inputs.mjs';
import { packPlugin } from '../release/plugin-pack.mjs';
import { managerVersions } from '../../dsh-plugins/plugin-kit/package-manager.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const plugin = join(root, 'dsh-plugins/analytics-workbench');
const shineBrand = join(root, 'dsh-plugins/shine-brand');
const shineWaterfall = join(root, 'dsh-plugins/shine-waterfall');
const shineCrowdAction = join(root, 'dsh-plugins/shine-crowd-action');
const shineQuery = join(root, 'dsh-plugins/shine-query');
const shineBoard = join(root, 'dsh-plugins/shine-board');
const shineFunnel = join(root, 'dsh-plugins/shine-funnel');
const b0 = join(root, '.context/dsh-b0');
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
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['HOME', 'CI', 'SYSTEMROOT'].includes(key))),
  PATH: `${dirname(process.execPath)}:${dirname(python)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  PYTHONPATH: root, PYTHONNOUSERSITE: '1', PYTHON_DOTENV_DISABLED: '1',
  PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1',
  B0_BUILD_UPSTREAM: upstream,
  DSH_PACKAGE_INPUTS: join(b0, 'package-inputs'),
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', LEFTHOOK: '0', CI: '1',
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
const git = args => output('git', ['-C', upstream, ...args]);
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
if (mode === '--check') env = await archiveToolEnv(env);
await mkdir(b0, { recursive: true, mode: 0o700 });
if (mode === '--prepare') {
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
  for (const name of ['board-components', 'analytics-workbench', 'crm-knowledge', 'knowledge', 'shine-brand', 'shine-waterfall', 'shine-crowd-action', 'shine-query', 'shine-board', 'shine-funnel']) {
    await linkWorkspaceKit(join(root, 'dsh-plugins', name), kit);
  }
  run(process.execPath, ['dsh-plugins/board-components/build.mjs', env.DSH_PACKAGE_INPUTS]);
  // Bind packed libraries before source-level consumer tests.
  run(process.execPath, ['scripts/dsh-b0/package-inputs.mjs', env.DSH_PACKAGE_INPUTS]);
  run(process.execPath, ['scripts/dsh-b0/content-theme-contract.mjs', '--check']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/content-theme-contract.test.mjs']);
  run(process.execPath, ['scripts/dsh-b0/cockpit-slot-contract.mjs', '--check']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/cockpit-slot-contract.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/package-inputs.test.mjs', 'dsh-plugins/board-components/test/geometry.test.mjs', 'scripts/dsh-b0/geometry-composition.test.mjs']);
  run(process.execPath, ['scripts/dsh-b0/plugin-boundaries.mjs', '--check']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/plugin-boundaries.test.mjs']);
  // Guard tests fail before process startup. The real-host drill remains opt-in.
  run(process.execPath, ['--test', 'scripts/dsh-b0/pinned-host-acceptance.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/first-purchase-kernel-artifacts.test.mjs']);
  run(process.execPath, ['--test', 'scripts/dsh-b0/first-purchase-runtime-artifacts.test.mjs']);
  for (const file of ['asset-ui-smoke.mjs', 'theme-ui-smoke.mjs', 'native-ui-smoke.mjs', 'native-card-smoke.mjs', 'native-state-smoke.mjs', 'native-query-smoke.mjs', 'native-query-fault-smoke.mjs', 'native-query-fault-scenario.mjs', 'query-scenario.mjs', 'tool-card-dom-smoke.mjs', 'gateway-smoke.mjs', 'control-permission-probe.mjs', 'native-query-assets-smoke.mjs', 'asset-routes.mjs']) {
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
  run(process.execPath, ['scripts/dsh-b0/run-kernel-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/query-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/query-run-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/analysis-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/cockpit-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/first-purchase-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/first-purchase-analysis-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/first-purchase-cockpit-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/competition-c0-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/competition-chart-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/competition-computed-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/board-spec-contract.mjs', '--check', '--python', python]);
  run(process.execPath, ['scripts/dsh-b0/page-contract.mjs', '--check', '--python', python]);
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
  const builtTests = ['built.test.mjs', 'loader.test.mjs', 'skills-loader.test.mjs', 'tool-card-dom.test.mjs', 'query-skills-loader.test.mjs', 'sessionless-view-dom.test.mjs', 'query-card-fault.test.mjs', 'query-card-cancel.test.mjs', 'query-card-save.test.mjs', 'asset-overlay.test.mjs', 'first-purchase-query-card.test.mjs', 'first-purchase-save-dom.test.mjs', 'plugin-ui-lifecycle.test.mjs', 'native-prompt-inject.test.mjs', 'native-board-auth.test.mjs', 'lane-g-delivery.test.mjs'];
  const sourceTests = (await readdir(join(plugin, 'test'))).filter(name => name.endsWith('.test.mjs') && !builtTests.includes(name));
  run(process.execPath, ['--test', ...sourceTests.map(name => join(plugin, 'test', name)),
    'scripts/dsh-b0/gateway-policy.test.mjs', 'scripts/dsh-b0/transport-safety.test.mjs', 'scripts/dsh-b0/mock-provider.test.mjs',
    'scripts/dsh-b0/recovery-model-gate.test.mjs', 'scripts/dsh-b0/session-recovery.test.mjs',
    'scripts/dsh-b0/lifecycle-observer.test.mjs', 'scripts/dsh-b0/host-feasibility.test.mjs', 'scripts/dsh-b0/compatibility-matrix.test.mjs', 'scripts/dsh-b0/permission-fence.test.mjs', 'scripts/dsh-b0/ui-seams.test.mjs',
    'scripts/dsh-b0/package-manager-env.test.mjs', 'scripts/dsh-b0/diagnostic-sink.test.mjs',
    'scripts/release/plugin-pack.test.mjs', 'scripts/release/plugin-candidate.test.mjs', 'scripts/release/plugin-host-evidence.test.mjs', 'scripts/release/profile.test.mjs', 'scripts/release/plugin-boundary.test.mjs', 'scripts/release/supply-chain.test.mjs',
    'scripts/release/runtime-host-evidence.test.mjs',
    'scripts/release/terminal-host-evidence.test.mjs',
    'scripts/release/browser-host-evidence.test.mjs', 'scripts/release/browser-host-v2.test.mjs',
    'scripts/release/sdk-content-audit.test.mjs',
    'scripts/release/sdk-supply-chain.test.mjs',
    'scripts/release/sdk-closure.test.mjs',
    'scripts/dsh-b0/clean-build.test.mjs',
    'scripts/dsh-b0/plugin-kit.test.mjs', 'scripts/dsh-b0/plugin-kit-prepare.test.mjs',
    'scripts/dsh-b0/native-state-smoke.test.mjs', 'scripts/dsh-b0/native-query-smoke.test.mjs',
    'scripts/dsh-b0/native-query-fault-smoke.test.mjs', 'scripts/dsh-b0/native-query-assets-smoke.test.mjs',
    'scripts/dsh-b0/asset-routes.test.mjs']);
  run(process.execPath, [join(plugin, 'build.mjs'), upstream]);
  run(process.execPath, ['dsh-plugins/crm-knowledge/build.mjs', upstream]);
  run(process.execPath, ['dsh-plugins/knowledge/build.mjs', upstream]);
  run(process.execPath, ['--test', 'dsh-plugins/knowledge/test/package.test.mjs', 'dsh-plugins/knowledge/test/service-client.test.mjs', 'dsh-plugins/knowledge/test/graph.test.mjs']);
  run(process.execPath, ['--test', 'dsh-plugins/crm-knowledge/test/package.test.mjs', 'dsh-plugins/crm-knowledge/test/first-purchase-relay.test.mjs', 'dsh-plugins/crm-knowledge/test/page-composition.integration.mjs', 'dsh-plugins/crm-knowledge/test/knowledge-composition.integration.mjs', 'dsh-plugins/crm-knowledge/test/profile.test.mjs', 'dsh-plugins/crm-knowledge/test/service-client.test.mjs']);
  run(process.execPath, [join(shineBrand, 'build.mjs'), upstream]);
  run(process.execPath, [join(shineWaterfall, 'build.mjs'), upstream]);
  run(process.execPath, [join(shineCrowdAction, 'build.mjs'), upstream]);
  run(process.execPath, [join(shineQuery, 'build.mjs'), upstream]);
  run(process.execPath, [join(shineBoard, 'build.mjs'), upstream]);
  run(process.execPath, [join(shineFunnel, 'build.mjs'), upstream]);
  run(process.execPath, ['--test',
    join(shineBrand, 'src/brand-surface.test.mjs'),
    join(shineBrand, 'src/client-lifecycle.test.mjs')], root, { B0_BUILD_UPSTREAM: upstream });
  run(process.execPath, ['--test',
    join(shineWaterfall, 'src/waterfall.test.mjs'),
    join(shineWaterfall, 'src/client-lifecycle.test.mjs')], root, { B0_BUILD_UPSTREAM: upstream });
  run(process.execPath, ['--test',
    join(shineCrowdAction, 'src/client-lifecycle.test.mjs')], root, { B0_BUILD_UPSTREAM: upstream });
  run(process.execPath, ['--test',
    join(shineQuery, 'src/client-lifecycle.test.mjs')], root, { B0_BUILD_UPSTREAM: upstream });
  run(process.execPath, ['--test',
    join(shineBoard, 'src/client-lifecycle.test.mjs')], root, { B0_BUILD_UPSTREAM: upstream });
  run(process.execPath, ['--test',
    join(shineFunnel, 'src/funnel.test.mjs'),
    join(shineFunnel, 'src/client-lifecycle.test.mjs')], root, { B0_BUILD_UPSTREAM: upstream });
  run(process.execPath, ['--test', 'scripts/dsh-b0/legacy-geometry-exports.test.mjs'], root);
  run(process.execPath, ['--test', 'scripts/dsh-b0/plugin-isolation.test.mjs'], root, { B0_BUILD_UPSTREAM: upstream });
  run(process.execPath, ['--test', ...builtTests.map(file => join(plugin, 'test', file))], root, { B0_BUILD_UPSTREAM: upstream });

  const competitionTests = [];
  for (const directory of ['src/board-spec', 'src/client', 'src/competition-agent', 'src/free-page', 'tests']) {
    const base = join(plugin, directory);
    for (const entry of await readdir(base, { recursive: true })) {
      if (entry.endsWith('.test.mjs')) competitionTests.push(join(base, entry));
    }
  }
  run(process.execPath, ['--test', ...competitionTests], root, { B0_BUILD_UPSTREAM: upstream });

  const cleanOwner = b0;
  await reapStaleCleanRoots(cleanOwner);
  const { cleanRoot } = await createCleanRoot(cleanOwner);
  const clean = join(cleanRoot, 'analytics-workbench');
  let cleanRemoved = false;
  let report;
  try {
    // No source symlinks or existing output/node_modules in the clean copy.
    // Domain inputs are locked tarballs only; no sibling plugin/library sources.
    const budget = { bytes: 0, files: 0 };
    for (const item of ['package.json', 'bundled-dependencies.json', 'cordis.patch.yml', 'toolchain.mjs', 'build.mjs', 'pack-skills.mjs', 'skill-package.lock.json', 'query-skill-package.lock.json', 'first-purchase-query-skill-package.lock.json', 'skills', 'src', 'test']) {
      await copyTreeBounded(join(plugin, item), join(clean, item), { destinationRoot: cleanRoot, budget });
    }
    await copyPluginKitSources(kit, join(cleanRoot, 'plugin-kit'), { destinationRoot: cleanRoot, budget });
    assert.deepEqual((await readdir(cleanRoot)).sort(), ['.dsh-b0-clean-build', 'analytics-workbench', 'plugin-kit']);
    // Provenance for this isolated pack is deliberately a synthetic Git
    // fixture, never the reviewed product commit required by a release.
    await writeFile(join(cleanRoot, '.gitignore'), 'node_modules/\nlib/\npacked/\n');
    run('git', ['init', '-q'], cleanRoot);
    run('git', ['add', '.'], cleanRoot);
    run('git', ['-c', 'user.name=isolated-fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'synthetic workbench package fixture'], cleanRoot);
    await linkWorkspaceKit(clean, join(cleanRoot, 'plugin-kit'));
    run(process.execPath, [join(clean, 'build.mjs'), upstream, buildTools]);
    run(process.execPath, ['--test', ...builtTests.map(file => join(clean, 'test', file))], clean, { B0_BUILD_UPSTREAM: upstream });
    const hashes = {};
    for (const item of ['index.js', 'tool.js', 'skills.js', 'page-tools.js', 'client.js', 'views/saved-analysis-view.js', 'views/cockpit-view.js']) {
      const original = await readFile(join(plugin, 'lib', item));
      const rebuilt = await readFile(join(clean, 'lib', item));
      assert.deepEqual(original, rebuilt, `Clean build output mismatch: ${item}`);
      assert.ok(!/file:\/\/\/|\/Users\/|\/home\/runner\//.test(rebuilt.toString()), `Machine path in artifact: ${item}`);
      hashes[item] = createHash('sha256').update(rebuilt).digest('hex');
    }
    const packed = await packPlugin({ plugin: clean, outputDir: join(cleanRoot, 'packed') });
    assert.equal(packed.activation, 'NOT_RUN');
    assert.ok(packed.entries.includes('bundled-dependencies.json'));
    report = { schema_version: 'dsh-b0-build-evidence/v1', at: new Date().toISOString(),
      upstream_sha: pin.upstream_sha, upstream_lock_sha256: pin.upstream_lock_sha256,
      node: process.version, python: output(python, ['--version']), clean_plugin: clean,
      // The evidence is written only after the clean build and its output
      // comparisons have completed. The owning finally block removes the
      // directory before the pipeline returns, so this is an asserted result.
      clean_removed: false, bundled_inputs: JSON.parse(await readFile(join(clean, 'bundled-dependencies.json'), 'utf8')).packages, sibling_sources_present: false, clean_source_files: budget.files, clean_source_bytes: budget.bytes,
      stages: ['contract', 'python-unit', 'ruff', 'node-unit', 'host-types', 'client-types', 'build', 'real-cordis-loader-synthetic-services', 'clean-rebuild'],
      artifact_sha256: hashes, isolated_pack: { ...packed, fixture_only: true },
      remote_ci_executed: false, native_dsh_profile_e2e: 'separate evidence required' };
    console.log(`B0 clean rebuild passed; source files=${budget.files}, source bytes=${budget.bytes}`);
  } finally {
    await removeCleanRoot(cleanOwner, cleanRoot);
    cleanRemoved = true;
  }
  assert.equal(cleanRemoved, true, 'Clean build directory was not removed');
  report.clean_removed = true;
  await writeFile(join(b0, 'build-evidence.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
