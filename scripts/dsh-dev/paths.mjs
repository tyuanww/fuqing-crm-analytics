/** Resolve repo, upstream, runtime, and plugin paths. Never copy node_modules. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function resolveUpstream(explicit) {
  const candidates = [
    explicit,
    process.env.DSH_DEV_UPSTREAM,
    join(repoRoot, '.context/dsh-b0/upstream-0.1.7-rc.2'),
  ].filter(value => typeof value === 'string' && value.length > 0);
  for (const candidate of candidates) {
    const upstream = resolve(candidate);
    assert.ok(isAbsolute(upstream), 'upstream path must be absolute');
    // Development uses the pinned checkout layout. Production release artifacts
    // use the self-contained pnpm deploy layout, whose CLI is at lib/bin.js.
    if (existsSync(join(upstream, 'apps/cli/lib/bin.js')) || existsSync(join(upstream, 'lib/bin.js'))) return upstream;
    if (explicit && upstream === resolve(explicit)) {
      throw new Error(`--upstream is not a built pinned DSH checkout: ${upstream}`);
    }
  }
  throw new Error('pass --upstream /absolute/pinned/dsh or set DSH_DEV_UPSTREAM; do not copy node_modules or the upstream tree');
}

export function defaultPluginPath() {
  return join(repoRoot, 'dsh-plugins/analytics-workbench');
}

export function defaultShineBrandPath() {
  return join(repoRoot, 'dsh-plugins/shine-brand');
}

export function defaultShineWaterfallPath() {
  return join(repoRoot, 'dsh-plugins/shine-waterfall');
}

export function defaultShineCrowdActionPath() {
  return join(repoRoot, 'dsh-plugins/shine-crowd-action');
}

export function defaultShineQueryPath() {
  return join(repoRoot, 'dsh-plugins/shine-query');
}

export function defaultShineBoardPath() {
  return join(repoRoot, 'dsh-plugins/shine-board');
}

export function defaultShineFunnelPath() {
  return join(repoRoot, 'dsh-plugins/shine-funnel');
}

export function contextRoot() {
  return join(repoRoot, '.context/dsh-dev');
}

export function currentPath() {
  return join(contextRoot(), 'current.json');
}

export function defaultRuntimeRoot() {
  return join(contextRoot(), 'runtime');
}

export async function ensureDir(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  return path;
}

export async function assertCli(upstream) {
  const cli = existsSync(join(upstream, 'apps/cli/lib/bin.js'))
    ? join(upstream, 'apps/cli/lib/bin.js')
    : join(upstream, 'lib/bin.js');
  await access(cli);
  return cli;
}

export { dirname, join, resolve };
