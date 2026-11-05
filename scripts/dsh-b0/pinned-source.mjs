/** Single source of truth for the pinned upstream identity checks.
 *
 * `pipeline.mjs --prepare` and the preparation cache guard must accept exactly
 * the same bytes.  Keeping the assertions here (instead of duplicating them in
 * the cache verifier) makes a cache hit indistinguishable from a fresh
 * preparation with respect to the pinned SHA, the clean tracked tree, the
 * lockfile digest and the manager declaration.
 *
 * `git(args)` is caller-scoped (the caller supplies `-C <upstream>` and the
 * hardened Git environment) and must return trimmed stdout.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Environment shared by every read-only Git probe into the pinned checkout. */
export const PINNED_GIT_ENV = Object.freeze({
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0',
  GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0',
});

/** Hardened read-only Git arguments for one probe of `upstream`. */
export function pinnedGitArgs(upstream, args) {
  return ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', upstream, ...args];
}

export async function verifyPinnedSource({ upstream, pin, git }) {
  assert.equal(git(['rev-parse', 'HEAD']), pin.upstream_sha, 'Pinned upstream SHA mismatch');
  assert.equal(git(['status', '--porcelain', '--untracked-files=no']), '', 'Refusing locally modified upstream');
  assert.equal(createHash('sha256').update(await readFile(join(upstream, 'pnpm-lock.yaml'))).digest('hex'),
    pin.upstream_lock_sha256, 'Pinned upstream lockfile mismatch');
  assert.equal(JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8')).packageManager,
    `pnpm@${pin.upstream_pnpm}`, 'Pinned upstream package manager mismatch');
}
