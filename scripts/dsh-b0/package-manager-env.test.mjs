import { PNPM_VERSION, UPSTREAM_PNPM_VERSION } from '../release/toolchain.mjs';
import { managerVersions } from '../../dsh-plugins/plugin-kit/package-manager.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile, chmod, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerEnv, packageNetworkEnv, dependencyCommands, archiveToolEnv } from './package-manager-env.mjs';

test('archive tool resolves a caller symlink while preserving the sanitized environment', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'b0-archive-env-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const located = spawnSync('/bin/sh', ['-c', 'command -v zstd'], { encoding: 'utf8' });
  assert.equal(located.status, 0);
  const target = await realpath(located.stdout.trim());
  await symlink(target, join(scratch, 'zstd'));
  const input = Object.freeze({ PATH: '/usr/bin:/bin', CI: '1' });
  const env = await archiveToolEnv(input, scratch);
  assert.deepEqual(env, { PATH: `/usr/bin:/bin:${dirname(target)}`, CI: '1' });
  assert.deepEqual(input, { PATH: '/usr/bin:/bin', CI: '1' });
  assert.equal(spawnSync('zstd', ['--version'], { env, encoding: 'utf8' }).status, 0);
});

test('archive tool rejects a missing or broken executable before running tests', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'b0-archive-missing-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await assert.rejects(archiveToolEnv({ PATH: '/usr/bin:/bin' }, scratch), /B0_ZSTD_REQUIRED/);
  await writeFile(join(scratch, 'zstd'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  await assert.rejects(archiveToolEnv({ PATH: '/usr/bin:/bin' }, scratch), /B0_ZSTD_REQUIRED/);
});

test('dependency child receives explicit proxies without TLS bypass or application credentials', () => {
  const transport = { HTTP_PROXY: 'http://127.0.0.1:7897', HTTPS_PROXY: 'http://127.0.0.1:7897',
    ALL_PROXY: 'socks5://127.0.0.1:7897', NO_PROXY: '127.0.0.1,localhost',
    http_proxy: 'http://127.0.0.1:7897', https_proxy: 'http://127.0.0.1:7897',
    all_proxy: 'socks5://127.0.0.1:7897', no_proxy: '127.0.0.1,localhost' };
  const input = Object.freeze({ ...transport, DEEPSEEK_API_KEY: 'synthetic-do-not-forward',
    NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_OPTIONS: '--inspect',
    npm_config_strict_ssl: 'false', npm_config_audit: 'false', DUCKDB_PATH: '/synthetic/private.db' });
  const original = Object.freeze({ PATH: dirname(process.execPath) + ':/usr/bin:/bin' });
  const child = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(process.env))'], {
    env: { ...original, ...packageNetworkEnv(input) }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(child.status, 0, child.stderr);
  const inherited = JSON.parse(child.stdout);
  for (const [key, value] of Object.entries(transport)) assert.equal(inherited[key], value);
  for (const key of ['DEEPSEEK_API_KEY', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_OPTIONS',
    'npm_config_strict_ssl', 'npm_config_audit', 'DUCKDB_PATH']) assert.equal(inherited[key], undefined);
  assert.deepEqual(Object.keys(original), ['PATH']);
  assert.deepEqual(packageNetworkEnv({ HTTP_PROXY: '', HTTPS_PROXY: null, ALL_PROXY: 1 }), {});
});

test('nested upstream and plugin commands select their own pinned manager from one local shim', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const upstream = resolve(process.env.B0_BUILD_UPSTREAM ?? join(root, '.context/dsh-b0/upstream-0.1.7-rc.2'));
  const scratch = await mkdtemp(join(tmpdir(), 'b0-pnpm-test-'));
  try {
    const original = { HOME: process.env.HOME, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      ...(process.env.COREPACK_HOME ? { COREPACK_HOME: process.env.COREPACK_HOME } : {}),
      COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
    const env = await packageManagerEnv(join(scratch, 'bin'), original, upstream);
    assert.equal(original.PATH.startsWith(scratch), false);
    // Real nested shell, as used by upstream build:web; cached fixed manager only.
    const child = spawnSync('/bin/sh', ['-c', 'pnpm --version'], { cwd: upstream, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim(), UPSTREAM_PNPM_VERSION);
    assert.ok(env.PATH.startsWith(join(scratch, 'bin') + ':'));
    const plugin = join(scratch, 'plugin'); await mkdir(plugin);
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ private: true, packageManager: `pnpm@${PNPM_VERSION}` }));
    const own = spawnSync('/bin/sh', ['-c', 'pnpm --version'], { cwd: plugin, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(own.status, 0, own.stderr);
    assert.equal(own.stdout.trim(), PNPM_VERSION);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('toolchain requires two explicit exact manager pins instead of inferring the upstream version', () => {
  const pin = { schema_version: 'dsh-b0-toolchain/v2', upstream_pnpm: '11.7.0', pnpm: '11.28.2' };
  assert.deepEqual(managerVersions(pin), { upstream: '11.7.0', plugins: '11.28.2' });
  for (const update of [{ schema_version: 'dsh-b0-toolchain/v1' }, { upstream_pnpm: undefined },
    { upstream_pnpm: '^11.7.0' }, { pnpm: undefined }, { pnpm: 'latest' }]) {
    assert.throws(() => managerVersions({ ...pin, ...update }), /TOOLCHAIN_/);
  }
});

test('all owned package declarations follow the plugin manager independently of the official pin', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  for (const part of ['', 'dsh-plugins/plugin-kit', 'dsh-plugins/plugin-kit/build-tools',
    ...['board-components', 'shine-brand', 'shine-query', 'shine-board', 'shine-crowd-action',
      'shine-funnel', 'shine-waterfall', 'crm-knowledge', 'knowledge', 'analytics-workbench'].map(n => `dsh-plugins/${n}`)]) {
    const manifest = JSON.parse(await readFile(join(root, part, 'package.json')));
    assert.equal(manifest.packageManager, `pnpm@${PNPM_VERSION}`, part);
  }
});

test('repeated frozen fetch/install restores executable package links without running lifecycle scripts', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'b0-repeat-install-'));
  const env = { HOME: process.env.HOME, PATH: dirname(process.execPath) + ':/usr/bin:/bin',
    ...(process.env.COREPACK_HOME ? { COREPACK_HOME: process.env.COREPACK_HOME } : {}),
    COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: '1' };
  const run = (args, cwd) => {
    const child = spawnSync('corepack', args, { cwd, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, child.stderr + child.stdout);
    return child.stdout.trim();
  };
  try {
    const dependency = join(scratch, 'dependency'), consumer = join(scratch, 'consumer');
    await mkdir(dependency); await mkdir(consumer);
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'owned-pinned-command', version: '1.0.0',
      packageManager: `pnpm@${PNPM_VERSION}`, bin: { 'owned-pinned-command': 'bin.cjs' }, files: ['bin.cjs'],
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'lifecycle-ran\', \'unexpected\')"' } }));
    await writeFile(join(dependency, 'bin.cjs'), '#!/usr/bin/env node\nconsole.log("OWNED_COMMAND_OK");\n');
    await chmod(join(dependency, 'bin.cjs'), 0o755);
    run(['pnpm', 'pack', '--pack-destination', scratch], dependency);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, packageManager: `pnpm@${PNPM_VERSION}`,
      dependencies: { 'owned-pinned-command': 'file:../owned-pinned-command-1.0.0.tgz' } }));
    await writeFile(join(consumer, 'pnpm-workspace.yaml'),
      'packages: []\nallowBuilds:\n  "owned-pinned-command@file:../owned-pinned-command-1.0.0.tgz": true\n');
    run(['pnpm', 'install', '--offline', '--ignore-scripts', '--lockfile-only'], consumer);
    const lock = await readFile(join(consumer, 'pnpm-lock.yaml'));
    for (let pass = 0; pass < 2; pass++) {
      run([...dependencyCommands.fetch, '--offline'], consumer);
      run([...dependencyCommands.install, '--offline'], consumer);
      assert.equal(run(['pnpm', 'exec', 'owned-pinned-command'], consumer), 'OWNED_COMMAND_OK');
      await assert.rejects(readFile(join(consumer, 'node_modules/owned-pinned-command/lifecycle-ran')), { code: 'ENOENT' });
      assert.deepEqual(await readFile(join(consumer, 'pnpm-lock.yaml')), lock);
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
