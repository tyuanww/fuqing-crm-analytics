/** Provide nested upstream scripts the same Corepack manager without global shims. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { delimiter } from 'node:path';

/** Explicit transport settings for public dependency fetch/audit commands only. */
export function packageNetworkEnv(source) {
  return Object.fromEntries(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']
    .filter(key => typeof source[key] === 'string' && source[key].length > 0)
    .map(key => [key, source[key]]));
}

export async function packageManagerEnv(bin, env, cwd) {
  await mkdir(bin, { recursive: true, mode: 0o700 });
  const result = spawnSync('corepack', ['enable', '--install-directory', bin, 'pnpm'], {
    cwd, env, encoding: 'utf8', timeout: 30000,
  });
  assert.ok(!result.error && result.status === 0,
    `Project-local Corepack shim failed: ${result.error?.message ?? result.stderr}`);
  return { ...env, PATH: `${bin}${delimiter}${env.PATH}` };
}
