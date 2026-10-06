import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerEnv, packageNetworkEnv } from './package-manager-env.mjs';

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

test('nested upstream pnpm resolves through project-local Corepack with sanitized PATH', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const upstream = resolve(process.env.B0_BUILD_UPSTREAM ?? join(root, '.context/dsh-b0/upstream-0.1.7-rc.2'));
  const pin = JSON.parse(await readFile(join(root, 'dsh-plugins/plugin-kit/toolchain.json')));
  const scratch = await mkdtemp(join(tmpdir(), 'b0-pnpm-test-'));
  try {
    const original = { HOME: process.env.HOME, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
    const env = await packageManagerEnv(join(scratch, 'bin'), original, upstream);
    assert.equal(original.PATH.startsWith(scratch), false);
    // Real nested shell, as used by upstream build:web; cached fixed manager only.
    const child = spawnSync('/bin/sh', ['-c', 'pnpm --version'], { cwd: upstream, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim(), pin.pnpm);
    assert.ok(env.PATH.startsWith(join(scratch, 'bin') + ':'));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
