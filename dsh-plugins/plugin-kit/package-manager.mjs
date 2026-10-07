/** Provide nested upstream scripts the same Corepack manager without global shims. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute } from 'node:path';

/** Official source recipes and our plugin tools evolve independently. */
export function managerVersions(pin) {
  assert.equal(pin.schema_version, 'dsh-b0-toolchain/v2', 'TOOLCHAIN_SCHEMA_INVALID');
  assert.match(pin.upstream_pnpm, /^\d+\.\d+\.\d+$/, 'TOOLCHAIN_UPSTREAM_PNPM_INVALID');
  assert.match(pin.pnpm, /^\d+\.\d+\.\d+$/, 'TOOLCHAIN_PNPM_VERSION_INVALID');
  return { upstream: pin.upstream_pnpm, plugins: pin.pnpm };
}

/** Locate the installed archive tool without forwarding the caller's environment. */
export async function archiveToolEnv(env, sourcePath = process.env.PATH) {
  const located = spawnSync('/bin/sh', ['-c', 'command -v zstd'], {
    env: { PATH: sourcePath ?? env.PATH }, encoding: 'utf8', timeout: 5000,
  });
  const path = located.stdout?.trim();
  assert.ok(!located.error && located.status === 0 && isAbsolute(path ?? ''), 'B0_ZSTD_REQUIRED');
  const target = await realpath(path);
  assert.ok((await stat(target)).isFile(), 'B0_ZSTD_REQUIRED');
  const version = spawnSync(target, ['--version'], { env, encoding: 'utf8', timeout: 5000 });
  assert.ok(!version.error && version.status === 0 && /zstandard|zstd/i.test(version.stdout), 'B0_ZSTD_REQUIRED');
  // Existing Node/Python/system paths retain precedence. Resolve Homebrew's
  // symlink to the specific tool directory instead of forwarding all of PATH.
  return { ...env, PATH: `${env.PATH}${delimiter}${dirname(target)}` };
}

/** Explicit transport settings for public dependency fetch/audit commands only. */
export function packageNetworkEnv(source) {
  return Object.fromEntries(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']
    .filter(key => typeof source[key] === 'string' && source[key].length > 0)
    .map(key => [key, source[key]]));
}

// pnpm fetch leaves a virtual-store-only tree. An optimistic repeated install
// can return before restoring root links/bins; always materialize the frozen
// closure, while leaving lifecycle scripts to the explicit rebuild allowlist.
export const dependencyCommands = Object.freeze({
  fetch: Object.freeze(['pnpm', 'fetch', '--frozen-lockfile', '--ignore-scripts', '--registry=https://registry.npmjs.org']),
  install: Object.freeze(['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts',
    '--config.optimistic-repeat-install=false', '--registry=https://registry.npmjs.org']),
});

export async function packageManagerEnv(bin, env, cwd) {
  await mkdir(bin, { recursive: true, mode: 0o700 });
  const result = spawnSync('corepack', ['enable', '--install-directory', bin, 'pnpm'], {
    cwd, env, encoding: 'utf8', timeout: 30000,
  });
  assert.ok(!result.error && result.status === 0,
    `Project-local Corepack shim failed: ${result.error?.message ?? result.stderr}`);
  return { ...env, PATH: `${bin}${delimiter}${env.PATH}` };
}
