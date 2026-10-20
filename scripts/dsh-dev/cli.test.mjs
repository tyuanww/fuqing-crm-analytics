import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile, readlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {
  B0_DEMO_DISABLE_IDS, COMPETITION_VITE_PORT, COMPETITION_WEB_PORT, DEV_WEB_PORT, FOREIGN_PORTS,
  PINNED_SHA, PLUGIN_UI_ID, PORT_RANGE, PORTS, SHINE_BRAND_UI_ID, SHINE_WATERFALL_UI_ID, SHINE_CROWD_ACTION_UI_ID, SHINE_QUERY_UI_ID, SHINE_BOARD_UI_ID, SHINE_FUNNEL_UI_ID,
} from './constants.mjs';
import { findReadyUrl, redactLaunchLog } from './launch-url.mjs';
import { assertNoB0Disables, buildPluginDisable, buildPluginOverlay, buildShineBrandDisable, buildShineWaterfallDisable, buildShineCrowdActionDisable, buildShineQueryDisable, buildShineBoardDisable, buildShineFunnelDisable, pluginEnabled, pluginRowState } from './overlay.mjs';
import { reloadStartArgs } from './cli.mjs';
import { applyOwnerProfileBridge } from './owner-profile-bridge.mjs';
import { assertOwnedHost, assertOwnedPort } from './ports.mjs';
import { installProfilePlugin, isolatedEnv, parseServeArgs, profileInstallPaths, profilePluginAddArgs, resolvePluginInputs, resolveShineBrandPath, resolveShineWaterfallPath, resolveShineCrowdActionPath, resolveShineQueryPath, resolveShineBoardPath, resolveShineFunnelPath } from './serve.mjs';

const execFileAsync = promisify(execFile);

test('CLI invoked through an active-release directory symlink runs its command', async () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const temp = await mkdtemp(join(tmpdir(), 'dsh-cli-release-link-'));
  try {
    await symlink(repo, join(temp, 'current'), 'dir');
    const { stdout } = await execFileAsync(process.execPath, [join(temp, 'current/scripts/dsh-dev/cli.mjs'), '--help']);
    assert.match(stdout, /^Usage: node scripts\/dsh-dev\/cli\.mjs /);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('isolated launch accepts an explicit public CA bundle without forwarding keys or TLS bypass', () => {
  const additions = {
    NODE_EXTRA_CA_CERTS: '/tmp/public-ca.pem',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    DEEPSEEK_API_KEY: 'synthetic-key-not-real',
    COMPETITION_HTTP_BASE: 'http://127.0.0.1:18083',
    COMPETITION_HTTP_TOKEN: 'synthetic-competition-token',
  };
  const prior = Object.fromEntries(Object.keys(additions).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, additions);
    const env = isolatedEnv('/tmp/runtime', '/tmp/runtime/harness');
    assert.equal(env.NODE_EXTRA_CA_CERTS, '/tmp/public-ca.pem');
    assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
    assert.equal(env.DEEPSEEK_API_KEY, undefined);
    assert.equal(env.COMPETITION_HTTP_BASE, 'http://127.0.0.1:18083');
    delete process.env.NODE_EXTRA_CA_CERTS;
    const fallback = isolatedEnv('/tmp/runtime', '/tmp/runtime/harness');
    if (existsSync('/etc/ssl/cert.pem')) assert.equal(fallback.NODE_EXTRA_CA_CERTS, '/etc/ssl/cert.pem');
    assert.equal(fallback.DEEPSEEK_API_KEY, undefined);
    process.env.NODE_EXTRA_CA_CERTS = 'relative.pem';
    assert.throws(() => isolatedEnv('/tmp/runtime', '/tmp/runtime/harness'), /absolute public CA/);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('plugin overlay carries only the brand-assets and page-globals rows and never copies B0 demo disables', () => {
  const patch = buildPluginOverlay('/tmp/analytics-workbench');
  assert.equal(patch.length, 1);
  assert.deepEqual(patch[0].insert.map(row => row.id),
    ['analytics-dev-brand-assets', 'analytics-dev-page-globals']);
  assert.equal(patch[0].insert[0].name.endsWith('/brand.mjs'), true);
  assert.equal(patch[0].insert[1].name.endsWith('/page-globals.mjs'), true);
  // The business plugin installs as a profile bundle; a second
  // analytics-workbench-ui row here would shadow it with a stale copy.
  assert.equal(JSON.stringify(patch).includes(PLUGIN_UI_ID), false);
  assertNoB0Disables(patch);
  for (const id of B0_DEMO_DISABLE_IDS) {
    assert.equal(JSON.stringify(patch).includes(`"${id}"`), false);
  }
});

test('plugin-on install is dsh plugin add of the absolute workbench path', () => {
  const cli = '/abs/upstream/apps/cli/lib/bin.js';
  const plugin = '/abs/dsh-plugins/analytics-workbench';
  assert.deepEqual(profilePluginAddArgs(cli, plugin), [cli, 'plugin', '--profile', 'web', 'add', plugin]);
  assert.throws(() => profilePluginAddArgs(cli, 'dsh-plugin'), /absolute/);
});

test('official install uses the prepared PATH manager and rejects a wrong version before DSH runs', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-fixed-manager-'));
  const priorPath = process.env.PATH;
  try {
    const bin = join(temp, 'bin'), workspace = join(temp, 'workspace'), runtime = join(temp, 'runtime');
    await mkdir(bin); await mkdir(workspace); await mkdir(join(runtime, 'tmp'), { recursive: true });
    const manager = join(bin, 'pnpm'), cli = join(temp, 'cli.mjs'), marker = join(runtime, 'tmp/cli.json');
    await writeFile(cli, "import {writeFileSync} from 'node:fs';import {join} from 'node:path';writeFileSync(join(process.env.TMPDIR,'cli.json'),JSON.stringify({argv:process.argv.slice(2),network:process.env.COREPACK_ENABLE_NETWORK,node:process.execPath}));\n");
    process.env.PATH = `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`;
    const prepared = { enabled: true, runtime, home: join(runtime, 'harness'), workspace, cli,
      pluginPath: join(temp, 'package'), pin: { pnpm: '11.28.2' } };
    await writeFile(manager, '#!/bin/sh\nprintf "11.28.1\\n"\n', { mode: 0o700 });
    assert.throws(() => installProfilePlugin(prepared), /DSH_DEV_PNPM_VERSION/);
    await assert.rejects(() => readFile(marker), { code: 'ENOENT' });
    await writeFile(manager, '#!/bin/sh\nprintf "11.28.2\\n"\n', { mode: 0o700 });
    installProfilePlugin(prepared);
    const actual = JSON.parse(await readFile(marker, 'utf8'));
    assert.deepEqual(actual.argv, ['plugin', '--profile', 'web', 'add', prepared.pluginPath]);
    assert.equal(actual.network, '0');
    assert.equal(actual.node, process.execPath);
  } finally {
    if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath;
    await rm(temp, { recursive: true, force: true });
  }
});

// Generated by /ship coverage audit
// Value: protects=owner profile bridge resolves verified pnpm peer aliases;
//   fails_when=only the canonical .pnpm peer root exists and links are omitted;
//   why_new=install tests cover the manager but not peer-root fallback; seam=none;
//   no_claim=the stub manager does not prove a live DSH boot
test('owner profile bridge links peer aliases from the canonical pnpm root', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-owner-profile-bridge-'));
  const previousManager = process.env.OWNER_PNPM_BIN;
  try {
    const runtime = join(temp, 'runtime');
    const upstream = join(temp, 'upstream');
    const plugin = join(temp, 'plugin');
    const profile = join(runtime, 'harness/profiles/web');
    const alias = join(upstream, 'node_modules/.pnpm/node_modules/@deepseek-ai/dsh-tools');
    const staleAlias = join(upstream, 'node_modules/@deepseek-ai/dsh-tools');
    const topLevel = join(upstream, 'node_modules/@deepseek-ai/cordis');
    const sessionController = join(upstream, 'node_modules/@deepseek-ai/dsh-api-session-controller');
    const workspaceFiles = join(upstream, 'node_modules/@deepseek-ai/dsh-api-workspace-files');
    const manager = join(temp, 'pnpm');
    await mkdir(profile, { recursive: true });
    await mkdir(alias, { recursive: true });
    await mkdir(staleAlias, { recursive: true });
    await mkdir(topLevel, { recursive: true });
    await mkdir(sessionController, { recursive: true });
    await mkdir(workspaceFiles, { recursive: true });
    await mkdir(plugin, { recursive: true });
    await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'web-profile', dependencies: {} }) + '\n');
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'fixture-plugin' }) + '\n');
    await writeFile(join(alias, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.2.1-rc.1' }) + '\n');
    await writeFile(join(staleAlias, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.1.7-rc.2' }) + '\n');
    await writeFile(join(topLevel, 'package.json'), JSON.stringify({ name: '@deepseek-ai/cordis', version: '0.2.1-rc.1' }) + '\n');
    await writeFile(join(sessionController, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-api-session-controller', version: '0.2.1-rc.1' }) + '\n');
    await writeFile(join(workspaceFiles, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-api-workspace-files', version: '0.2.1-rc.1' }) + '\n');
    await writeFile(manager, '#!/bin/sh\nif [ "$1" = "--version" ]; then printf "11.28.2\\n"; else exit 0; fi\n', { mode: 0o700 });
    process.env.OWNER_PNPM_BIN = manager;
    const result = await applyOwnerProfileBridge({
      runtime,
      upstream,
      pin: { sdk_version: '0.2.1-rc.1', pnpm: '11.28.2' },
      packInstall: { plugins: [{ root: plugin }] },
    });
    const canonicalAlias = await realpath(alias);
    const canonicalTopLevel = await realpath(topLevel);
    assert.deepEqual(result.linked, ['@deepseek-ai/cordis', '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-api-workspace-files', '@deepseek-ai/dsh-tools']);
    const packageJson = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
    assert.equal(packageJson.dependencies['@deepseek-ai/dsh-tools'], `link:${canonicalAlias}`);
    assert.equal(packageJson.dependencies['@deepseek-ai/cordis'], `link:${canonicalTopLevel}`);
    for (const [id, target] of [['@deepseek-ai/dsh-tools', canonicalAlias], ['@deepseek-ai/cordis', canonicalTopLevel]]) {
      const link = join(plugin, 'node_modules', ...id.split('/'));
      assert.equal(await readlink(link), target);
    }
  } finally {
    if (previousManager === undefined) delete process.env.OWNER_PNPM_BIN;
    else process.env.OWNER_PNPM_BIN = previousManager;
    await rm(temp, { recursive: true, force: true });
  }
});

test('owner profile bridge rejects peer metadata that escapes node_modules', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-owner-profile-bridge-invalid-'));
  const previousManager = process.env.OWNER_PNPM_BIN;
  try {
    const runtime = join(temp, 'runtime');
    const upstream = join(temp, 'upstream');
    const plugin = join(temp, 'plugin');
    const profile = join(runtime, 'harness/profiles/web');
    const manager = join(temp, 'pnpm');
    await mkdir(profile, { recursive: true });
    await mkdir(plugin, { recursive: true });
    await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'web-profile', dependencies: {} }) + '\n');
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'fixture-plugin', dsh: { client: { inject: ['@deepseek-ai/../../outside'] } } }) + '\n');
    await writeFile(manager, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    process.env.OWNER_PNPM_BIN = manager;
    await assert.rejects(
      () => applyOwnerProfileBridge({ runtime, upstream, packInstall: { plugins: [{ root: plugin }] } }),
      /DSH_DEV_INVALID_PEER_PACKAGE/,
    );
  } finally {
    if (previousManager === undefined) delete process.env.OWNER_PNPM_BIN;
    else process.env.OWNER_PNPM_BIN = previousManager;
    await rm(temp, { recursive: true, force: true });
  }
});

test('owner profile bridge rejects escaped aliases and missing declared peers', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-owner-profile-bridge-boundary-'));
  const previousManager = process.env.OWNER_PNPM_BIN;
  try {
    const runtime = join(temp, 'runtime');
    const upstream = join(temp, 'upstream');
    const plugin = join(temp, 'plugin');
    const profile = join(runtime, 'harness/profiles/web');
    const outside = join(temp, 'outside');
    const alias = join(upstream, 'node_modules/.pnpm/node_modules/@deepseek-ai/dsh-tools');
    const coreAliases = [
      ['@deepseek-ai/cordis', join(upstream, 'node_modules/@deepseek-ai/cordis')],
      ['@deepseek-ai/dsh-api-session-controller', join(upstream, 'node_modules/@deepseek-ai/dsh-api-session-controller')],
      ['@deepseek-ai/dsh-api-workspace-files', join(upstream, 'node_modules/@deepseek-ai/dsh-api-workspace-files')],
    ];
    const manager = join(temp, 'pnpm');
    await mkdir(profile, { recursive: true });
    await mkdir(dirname(alias), { recursive: true });
    await mkdir(plugin, { recursive: true });
    await mkdir(outside, { recursive: true });
    for (const [name, root] of coreAliases) {
      await mkdir(root, { recursive: true });
      await writeFile(join(root, 'package.json'), JSON.stringify({ name, version: '0.2.1-rc.1' }) + '\n');
    }
    await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'web-profile', dependencies: {} }) + '\n');
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'fixture-plugin', dsh: { client: { inject: ['@deepseek-ai/dsh-tools'] } } }) + '\n');
    await writeFile(join(outside, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.2.1-rc.1' }) + '\n');
    await symlink(outside, alias, 'junction');
    await writeFile(manager, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    process.env.OWNER_PNPM_BIN = manager;
    await assert.rejects(
      () => applyOwnerProfileBridge({ runtime, upstream, packInstall: { plugins: [{ root: plugin }] } }),
      /DSH_DEV_PEER_PACKAGE_OUTSIDE_UPSTREAM/,
    );

    await rm(alias, { recursive: true, force: true });
    const fallbackTools = join(upstream, 'node_modules/@deepseek-ai/dsh-tools');
    await mkdir(fallbackTools, { recursive: true });
    await writeFile(join(fallbackTools, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.2.1-rc.1' }) + '\n');
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'fixture-plugin', dsh: { client: { inject: ['@deepseek-ai/missing'] } } }) + '\n');
    await assert.rejects(
      () => applyOwnerProfileBridge({ runtime, upstream, packInstall: { plugins: [{ root: plugin }] } }),
      /DSH_DEV_REQUIRED_PEER_MISSING @deepseek-ai\/missing/,
    );
  } finally {
    if (previousManager === undefined) delete process.env.OWNER_PNPM_BIN;
    else process.env.OWNER_PNPM_BIN = previousManager;
    await rm(temp, { recursive: true, force: true });
  }
});

test('shine-brand requires its own explicit path; no repository or sibling fallback', () => {
  const isolatedWorkbench = '/tmp/clean-build-workbench';
  assert.throws(() => resolveShineBrandPath({ plugin: 'on', shineBrand: 'on', pluginPath: isolatedWorkbench }), /DSH_DEV_PLUGIN_INPUT_REQUIRED/);
  assert.equal(resolveShineBrandPath({ plugin: 'on', shineBrand: 'off', pluginPath: isolatedWorkbench }), null);
  assert.equal(resolveShineBrandPath({ plugin: 'off', shineBrand: 'on' }), null);
  const explicit = '/abs/dsh-plugins/shine-brand';
  assert.equal(
    resolveShineBrandPath({ plugin: 'on', shineBrand: 'on', shineBrandPath: explicit }),
    explicit,
  );
});

test('plugin-on install order is brand, waterfall, crowd-action, query, board, then workbench', () => {
  const workbench = '/abs/dsh-plugins/analytics-workbench';
  const brand = '/abs/brand', waterfall = '/abs/waterfall', crowd = '/abs/crowd';
  const query = '/abs/query', board = '/abs/board', funnel = '/abs/funnel';
  assert.deepEqual(profileInstallPaths({
    pluginPath: workbench, shineBrandPath: brand, shineWaterfallPath: waterfall,
    shineCrowdActionPath: crowd, shineQueryPath: query, shineBoardPath: board, shineFunnelPath: funnel,
  }), [brand, waterfall, crowd, query, board, funnel, workbench]);
  assert.deepEqual(profileInstallPaths({
    pluginPath: workbench, shineBrandPath: null, shineWaterfallPath: null, shineCrowdActionPath: null,
    shineQueryPath: null, shineBoardPath: null, shineFunnelPath: null,
  }), [workbench]);
});

test('waterfall requires an explicit path or can be disabled', () => {
  const isolatedWorkbench = '/tmp/clean-build-workbench';
  assert.throws(() => resolveShineWaterfallPath({ plugin: 'on', shineWaterfall: 'on', pluginPath: isolatedWorkbench }), /DSH_DEV_PLUGIN_INPUT_REQUIRED/);
  assert.equal(resolveShineWaterfallPath({ plugin: 'on', shineWaterfallPath: '/abs/waterfall' }), '/abs/waterfall');
  assert.equal(resolveShineWaterfallPath({ plugin: 'on', shineWaterfall: 'off', pluginPath: isolatedWorkbench }), null);
  assert.equal(resolveShineWaterfallPath({ plugin: 'off', shineWaterfall: 'on' }), null);
});

test('crowd-action requires an explicit path or can be disabled', () => {
  const isolatedWorkbench = '/tmp/clean-build-workbench';
  assert.throws(() => resolveShineCrowdActionPath({ plugin: 'on', shineCrowdAction: 'on', pluginPath: isolatedWorkbench }), /DSH_DEV_PLUGIN_INPUT_REQUIRED/);
  assert.equal(resolveShineCrowdActionPath({ plugin: 'on', shineCrowdActionPath: '/abs/crowd' }), '/abs/crowd');
  assert.equal(resolveShineCrowdActionPath({ plugin: 'on', shineCrowdAction: 'off', pluginPath: isolatedWorkbench }), null);
  assert.equal(resolveShineCrowdActionPath({ plugin: 'off', shineCrowdAction: 'on' }), null);
});

test('plugin-off layer disables the installed bundle and never touches native rows', () => {
  const patch = buildPluginDisable();
  assert.deepEqual(patch, [
    { id: PLUGIN_UI_ID, disabled: true },
    { id: SHINE_BRAND_UI_ID, disabled: true },
    { id: SHINE_WATERFALL_UI_ID, disabled: true },
    { id: SHINE_CROWD_ACTION_UI_ID, disabled: true },
    { id: SHINE_QUERY_UI_ID, disabled: true },
    { id: SHINE_BOARD_UI_ID, disabled: true },
    { id: SHINE_FUNNEL_UI_ID, disabled: true },
  ]);
  assertNoB0Disables(patch);
});

test('shine-brand-off overlay disables leftover brand without touching workbench', () => {
  const patch = buildShineBrandDisable();
  assert.deepEqual(patch, [{ id: SHINE_BRAND_UI_ID, disabled: true }]);
  assert.equal(JSON.stringify(patch).includes(PLUGIN_UI_ID), false);
  assertNoB0Disables(patch);
});

test('waterfall-off overlay disables leftover waterfall without touching workbench', () => {
  const patch = buildShineWaterfallDisable();
  assert.deepEqual(patch, [{ id: SHINE_WATERFALL_UI_ID, disabled: true }]);
  assert.equal(JSON.stringify(patch).includes(PLUGIN_UI_ID), false);
  assertNoB0Disables(patch);
});

test('crowd-action-off overlay disables leftover crowd-action without touching workbench', () => {
  const patch = buildShineCrowdActionDisable();
  assert.deepEqual(patch, [{ id: SHINE_CROWD_ACTION_UI_ID, disabled: true }]);
  assert.equal(JSON.stringify(patch).includes(PLUGIN_UI_ID), false);
  assertNoB0Disables(patch);
});

test('query, board and funnel require explicit paths; off omits them', () => {
  assert.throws(() => resolveShineQueryPath({ plugin: 'on', shineQuery: 'on' }), /DSH_DEV_PLUGIN_INPUT_REQUIRED/);
  assert.equal(resolveShineQueryPath({ plugin: 'on', shineQueryPath: '/abs/query' }), '/abs/query');
  assert.equal(resolveShineQueryPath({ plugin: 'on', shineQuery: 'off' }), null);
  assert.throws(() => resolveShineBoardPath({ plugin: 'on', shineBoard: 'on' }), /DSH_DEV_PLUGIN_INPUT_REQUIRED/);
  assert.equal(resolveShineBoardPath({ plugin: 'on', shineBoardPath: '/abs/board' }), '/abs/board');
  assert.equal(resolveShineBoardPath({ plugin: 'on', shineBoard: 'off' }), null);
  assert.deepEqual(buildShineQueryDisable(), [{ id: SHINE_QUERY_UI_ID, disabled: true }]);
  assert.deepEqual(buildShineBoardDisable(), [{ id: SHINE_BOARD_UI_ID, disabled: true }]);
  assert.throws(() => resolveShineFunnelPath({ plugin: 'on', shineFunnel: 'on' }), /DSH_DEV_PLUGIN_INPUT_REQUIRED/);
  assert.equal(resolveShineFunnelPath({ plugin: 'on', shineFunnelPath: '/abs/funnel' }), '/abs/funnel');
  assert.equal(resolveShineFunnelPath({ plugin: 'on', shineFunnel: 'off' }), null);
  assert.deepEqual(buildShineFunnelDisable(), [{ id: SHINE_FUNNEL_UI_ID, disabled: true }]);
});

test('plugin row state tells a disabled plugin-off row from an active plugin-on row', () => {
  const header = `# == @shine-mage/dsh-analytics-workbench-b0\n- id: ${PLUGIN_UI_ID}\n  name: '@shine-mage/dsh-analytics-workbench-b0'\n`;
  assert.deepEqual(pluginRowState(`${header}  disabled: true\n`), { present: true, disabled: true });
  assert.deepEqual(pluginRowState(`${header}- id: next-row\n`), { present: true, disabled: false });
  assert.deepEqual(pluginRowState('- id: other-row\n  disabled: true\n'), { present: false, disabled: false });
  const brand = `# == @shine-mage/dsh-shine-brand\n- id: ${SHINE_BRAND_UI_ID}\n  name: '@shine-mage/dsh-shine-brand'\n`;
  assert.deepEqual(pluginRowState(`${brand}  disabled: true\n`, SHINE_BRAND_UI_ID), { present: true, disabled: true });
  assert.deepEqual(pluginRowState(header, SHINE_BRAND_UI_ID), { present: false, disabled: false });
});

test('plugin flag only accepts on or off', () => {
  assert.equal(pluginEnabled('off'), false);
  assert.equal(pluginEnabled('on'), true);
  assert.throws(() => pluginEnabled('yes'));
});

test('owned ports reject B0 and Mission listeners', () => {
  assert.equal(assertOwnedPort(4327), PORTS.web);
  assert.equal(assertOwnedPort(COMPETITION_WEB_PORT), COMPETITION_WEB_PORT);
  assert.equal(assertOwnedPort(DEV_WEB_PORT), DEV_WEB_PORT);
  for (const port of [6666, 6665, 6000, 10080]) {
    assert.throws(() => assertOwnedPort(port), /ERR_UNSAFE_PORT/);
  }
  assert.deepEqual([...PORT_RANGE], [4325, 4326, 4327, 4328, 4329]);
  for (const port of FOREIGN_PORTS) {
    assert.throws(() => assertOwnedPort(port));
  }
  assert.throws(() => assertOwnedPort(80));
  assert.throws(() => assertOwnedPort(COMPETITION_VITE_PORT));
  assert.equal(assertOwnedHost('127.0.0.1'), '127.0.0.1');
  assert.throws(() => assertOwnedHost('0.0.0.0'));
});

test('serve args pin loopback and refuse foreign ports', () => {
  const options = parseServeArgs(['--plugin', 'off', '--web-port', '4327']);
  assert.equal(options.plugin, 'off');
  assert.equal(options.webPort, 4327);
  assert.equal(options.host, '127.0.0.1');
  assert.equal(parseServeArgs(['--plugin', 'off', '--web-port', '14327']).webPort, COMPETITION_WEB_PORT);
  assert.equal(parseServeArgs(['--plugin', 'on', '--web-port', '6677']).webPort, DEV_WEB_PORT);
  assert.equal(parseServeArgs(['--plugin', 'on', '--web-port', '6677']).shineBrand, 'off');
  assert.equal(parseServeArgs(['--plugin', 'on', '--shine-brand', 'off', '--web-port', '6677']).shineBrand, 'off');
  assert.equal(
    parseServeArgs(['--plugin', 'on', '--shine-brand', 'on', '--shine-brand-path', '/abs/shine-brand', '--web-port', '6677']).shineBrandPath,
    '/abs/shine-brand',
  );
  assert.throws(() => parseServeArgs(['--plugin', 'on', '--shine-brand', 'off', '--shine-brand-path', '/abs/shine-brand']));
  assert.equal(parseServeArgs(['--plugin', 'on', '--web-port', '6677']).shineWaterfall, 'on');
  assert.equal(parseServeArgs(['--plugin', 'on', '--waterfall', 'off', '--web-port', '6677']).shineWaterfall, 'off');
  assert.throws(() => parseServeArgs(['--plugin', 'on', '--waterfall', 'off', '--waterfall-path', '/abs/shine-waterfall']));
  assert.equal(parseServeArgs(['--plugin', 'on', '--web-port', '6677']).shineCrowdAction, 'on');
  assert.equal(parseServeArgs(['--plugin', 'on', '--crowd-action', 'off', '--web-port', '6677']).shineCrowdAction, 'off');
  assert.throws(() => parseServeArgs(['--plugin', 'on', '--crowd-action', 'off', '--crowd-action-path', '/abs/shine-crowd-action']));
  assert.equal(parseServeArgs(['--plugin', 'on', '--web-port', '6677']).shineQuery, 'on');
  assert.equal(parseServeArgs(['--plugin', 'on', '--query', 'off', '--web-port', '6677']).shineQuery, 'off');
  assert.equal(parseServeArgs(['--plugin', 'on', '--web-port', '6677']).shineBoard, 'on');
  assert.equal(parseServeArgs(['--plugin', 'on', '--board', 'off', '--web-port', '6677']).shineBoard, 'off');
  assert.throws(() => parseServeArgs(['--plugin', 'on', '--query', 'off', '--query-path', '/abs/shine-query']));
  assert.throws(() => parseServeArgs(['--plugin', 'on', '--board', 'off', '--board-path', '/abs/shine-board']));
  assert.throws(() => parseServeArgs(['--web-port', '4317']));
  assert.throws(() => parseServeArgs(['--web-port', '15173']));
  assert.throws(() => parseServeArgs(['--host', '0.0.0.0']));
  assert.throws(() => parseServeArgs(['--plugin', 'maybe']));
});

test('launch URL helper requires a tokenized loopback URL and redacts it', () => {
  const origin = 'http://127.0.0.1:4327';
  const log = 'dsh web: listening\nopen http://127.0.0.1:4327/?token=abc_DEF-123\n';
  assert.equal(findReadyUrl(log, origin), 'http://127.0.0.1:4327/?token=abc_DEF-123');
  assert.equal(findReadyUrl('http://127.0.0.1:4317/?token=abc\n', origin), null);
  assert.equal(findReadyUrl('http://127.0.0.1:4327/\n', origin), null);
  assert.ok(redactLaunchLog(log).includes('token=[REDACTED]'));
  assert.equal(redactLaunchLog(log).includes('abc_DEF-123'), false);
});

test('pinned SHA matches toolchain contract constant', () => {
  assert.equal(PINNED_SHA, '477b4f420553e8a52c2fbccc464d7561b239c443');
});


test('value-taking flags cannot silently fall back after a missing argument', () => {
  for (const flag of ['--upstream', '--plugin-path', '--pack-inputs', '--shine-brand', '--shine-brand-path', '--waterfall', '--waterfall-path', '--crowd-action', '--crowd-action-path', '--query', '--query-path', '--board', '--board-path', '--funnel', '--funnel-path', '--runtime', '--extra-patch', '--web-port']) {
    assert.throws(() => parseServeArgs([flag]), /missing value/);
    assert.throws(() => parseServeArgs([flag, '--fresh']), /missing value/);
  }
});

test('reload forwards pinned inputs, feature switches and extra patches to its owned child', () => {
  const options = parseServeArgs(['--plugin', 'on', '--pack-inputs', '/abs/inputs.json', '--upstream', '/abs/dsh',
    '--shine-brand', 'on', '--waterfall', 'off', '--crowd-action', 'off', '--query', 'off', '--board', 'off', '--funnel', 'off',
    '--extra-patch', '/abs/first.json', '--extra-patch', '/abs/second.json', '--page-http', 'on', '--page-http-port', '54321', '--web-port', '4328']);
  const [, command, ...args] = reloadStartArgs(options, '/abs/runtime');
  assert.equal(command, 'start');
  assert.deepEqual(parseServeArgs(args), { ...options, runtime: '/abs/runtime' });
  assert.throws(() => parseServeArgs(['--pack-inputs', 'relative.json']), /absolute/);
});

test('native fallback does not read missing package inputs', async () => {
  const options = parseServeArgs(['--plugin', 'off', '--pack-inputs', '/not-present/inputs.json']);
  assert.equal((await resolvePluginInputs(options)).packs, null);
});

test('reload with missing plugin inputs fails before creating a runtime or stopping a host', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-reload-input-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const runtime = join(temp, 'must-not-exist');
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  await assert.rejects(() => execFileAsync(process.execPath, [cli, 'reload', '--plugin', 'on', '--runtime', runtime]),
    error => error.code === 1 && /DSH_DEV_PLUGIN_INPUT_REQUIRED/.test(error.stderr));
  assert.equal(existsSync(runtime), false);
});
