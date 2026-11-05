#!/usr/bin/env node
/** Re-prime the two pinned package managers on a verified preparation-cache hit.
 *
 * `pipeline.mjs --prepare` calls `preparePackageManager()` before the pinned
 * installs, which also materializes the exact pnpm distributions in Corepack's
 * cache (`$HOME/.cache/node/corepack`).  `--check` runs manager trials with
 * `COREPACK_ENABLE_NETWORK=0`, so a warm run that skips `--prepare` must still
 * provide those distributions.  This is the manager half of preparation only:
 * no fetch, install or build, and no prepared bytes change.
 *
 * Deliberately not part of the cache-key file list: editing this script cannot
 * change the prepared bytes, so it must not invalidate a verified cache entry.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerEnv } from './package-manager-env.mjs';
import { managerVersions } from '../../dsh-plugins/plugin-kit/package-manager.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const b0 = join(root, '.context/dsh-b0');
const pin = JSON.parse(await readFile(join(root, 'dsh-plugins/plugin-kit/toolchain.json'), 'utf8'));
const managers = managerVersions(pin);
assert.ok(!process.env.DSH_UPSTREAM_CHECKOUT, 'B0_MANAGER_UPSTREAM_OVERRIDE_UNSUPPORTED');
const upstream = join(b0, `upstream-${pin.sdk_version}`);
const buildTools = join(root, 'dsh-plugins/plugin-kit/build-tools');
const env = await packageManagerEnv(join(b0, 'tool-bin'),
  { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' }, upstream);

function managerVersion(cwd, expected) {
  const result = spawnSync('corepack', ['pnpm', '--version'], { cwd, env, encoding: 'utf8', timeout: 120000 });
  assert.ok(!result.error && result.status === 0,
    `B0 manager priming failed in ${cwd}: ${result.error?.message ?? result.stderr}`);
  assert.equal(result.stdout.trim(), expected, `B0 manager priming version mismatch in ${cwd}`);
}

managerVersion(upstream, managers.upstream);
assert.equal(JSON.parse(await readFile(join(buildTools, 'package.json'), 'utf8')).packageManager,
  `pnpm@${managers.plugins}`);
managerVersion(buildTools, managers.plugins);
console.log(`B0 pinned managers primed: upstream pnpm@${managers.upstream}, plugin pnpm@${managers.plugins}`);
