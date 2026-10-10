#!/usr/bin/env node
/** Opt-in bounded official-module probe. Does not install, build, serve HTTP, or load an existing profile. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { join, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));
const worker = fileURLToPath(new URL('./shell-tool-contract.probe.mjs', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const upstreamSha = '477b4f420553e8a52c2fbccc464d7561b239c443';
const lockSha = '5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa';
const modulePaths = ['vendor/cordis', 'packages/core/system-prompt', 'packages/core/tools',
  'packages/subprocess/subprocess-local', 'packages/subprocess/subprocess', 'packages/shell/shell',
  'packages/shell/shell-env', 'packages/shell/bash-local', 'packages/shell/tool-bash',
  'packages/jobs/jobs', 'packages/jobs/jobs-local', 'packages/jobs/tool-jobs', 'packages/util/timeout',
  'packages/guard/timeout-policy'];
const privateWrite = { mode: 0o600, flag: 'wx' };
const json = value => JSON.stringify(value, null, 2) + '\n';
export function readOnlyShellGit(cwd, args) {
  return exec('/usr/bin/git', ['--no-optional-locks', '-C', cwd,
    '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    timeout: 5000, maxBuffer: 128 * 1024,
    env: { PATH: '/usr/bin:/bin', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' },
  });
}
function includes(root, other) {
  const rel = relative(root, other);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'));
}
export async function validateShellToolPaths(upstream, output, protectedRoot = repository) {
  assert.ok(isAbsolute(upstream) && isAbsolute(output), 'SHELL_TOOL_ABSOLUTE_PATH_REQUIRED');
  const source = await realpath(upstream), canonicalRepository = await realpath(protectedRoot);
  const parent = await realpath(dirname(output));
  const target = join(parent, relative(dirname(output), output));
  assert.ok(!includes(source, target) && !includes(target, source), 'SHELL_TOOL_INPUT_OUTPUT_OVERLAP');
  assert.ok(!includes(target, canonicalRepository), 'SHELL_TOOL_OUTPUT_CONTAINS_REPOSITORY');
  // An evidence descendant is allowed only under the ignored checks root. Aliases into source fail closed.
  if (includes(canonicalRepository, target)) {
    assert.ok(includes(join(canonicalRepository, '.context', 'checks'), target), 'SHELL_TOOL_OUTPUT_WRITES_SOURCE');
  }
  await assert.rejects(lstat(target), error => error.code === 'ENOENT', 'SHELL_TOOL_OUTPUT_EXISTS');
  return { upstream: source, output: target };
}
/** The caller must have just created this PGID. A leader exit is not range quiescence. */
export async function reapOwnedPosixGroup(pgid, { graceMs = 250, waitMs = 2000 } = {}) {
  assert.ok(process.platform !== 'win32' && Number.isSafeInteger(pgid) && pgid > 1 && pgid !== process.pid,
    'SHELL_TOOL_OWNED_GROUP_REQUIRED');
  const alive = () => {
    try { process.kill(-pgid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  const signal = value => {
    try { process.kill(-pgid, value); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  const awaitEmpty = async ms => {
    const until = performance.now() + ms;
    while (alive() && performance.now() < until) await delay(10);
    return !alive();
  };
  const termSent = alive() && signal('SIGTERM');
  const termEmpty = await awaitEmpty(graceMs);
  const killSent = !termEmpty && signal('SIGKILL');
  const empty = await awaitEmpty(waitMs);
  assert.ok(empty, 'SHELL_TOOL_OWNED_GROUP_NOT_QUIESCENT');
  return { pgid, term_sent: termSent, kill_sent: killSent, remaining: false };
}
async function sourceInventory(upstream) {
  const entries = {};
  for (const module of modulePaths) {
    for (const suffix of ['package.json', 'src/index.ts', 'lib/index.js']) {
      const path = join(module, suffix);
      const bytes = await readFile(join(upstream, path));
      entries[path] = { bytes: bytes.length, sha256: sha(bytes) };
    }
  }
  for (const path of ['pnpm-lock.yaml', 'packages/shell/shell/src/types.ts', 'packages/core/tools/src/types.ts']) {
    const bytes = await readFile(join(upstream, path)); entries[path] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  return entries;
}
export async function runShellToolContract({ upstream, output, timeoutMs = 90000 }) {
  assert.equal(Number(process.versions.node.split('.')[0]), 24, 'SHELL_TOOL_NODE_24_REQUIRED');
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120000, 'SHELL_TOOL_BOUND_REQUIRED');
  const paths = await validateShellToolPaths(upstream, output);
  const git = args => readOnlyShellGit(paths.upstream, args);
  assert.equal((await git(['rev-parse', 'HEAD'])).stdout.trim(), upstreamSha, 'SHELL_TOOL_UPSTREAM_SHA');
  assert.equal((await git(['status', '--porcelain', '--untracked-files=no'])).stdout.trim(), '', 'SHELL_TOOL_UPSTREAM_DIRTY');
  assert.equal(sha(await readFile(join(paths.upstream, 'pnpm-lock.yaml'))), lockSha, 'SHELL_TOOL_LOCK_SHA');
  const before = await sourceInventory(paths.upstream);
  await mkdir(paths.output, { mode: 0o700 });
  for (const name of ['home', 'tmp', 'dsh-home']) await mkdir(join(paths.output, name), { mode: 0o700 });
  const input = { schema_version: 'dsh-shell-tool-contract-input/v1', upstream_sha: upstreamSha,
    lock_sha256: lockSha, source_git_clean: true, inventory: before,
    probe_sha256: sha(await readFile(worker)), runner_sha256: sha(await readFile(fileURLToPath(import.meta.url))),
    compiled_origin: 'existing-pinned-checkout', compiled_artifact_attestation: 'NOT_VERIFIED', release_ready: false };
  await writeFile(join(paths.output, 'inputs.json'), json(input), privateWrite);
  await writeFile(join(paths.output, 'runner-source.mjs'), await readFile(fileURLToPath(import.meta.url)), privateWrite);
  const workerSnapshot = join(paths.output, 'probe-source.mjs');
  await writeFile(workerSnapshot, await readFile(worker), privateWrite);
  const child = spawn(process.execPath, [workerSnapshot, paths.upstream, paths.output], { cwd: paths.output,
    env: { PATH: dirname(process.execPath) + ':/usr/bin:/bin', HOME: join(paths.output, 'home'),
      TMPDIR: join(paths.output, 'tmp'), DSH_HOME: join(paths.output, 'dsh-home'), DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: process.platform !== 'win32' });
  const observations = [];
  const ownedGroups = new Set();
  if (process.platform !== 'win32' && child.pid) ownedGroups.add(child.pid);
  let receipt, out = '', err = '', timedOut = false, terminated = false;
  let escalation;
  child.stdout.on('data', chunk => { out = (out + chunk).slice(-256 * 1024); });
  child.stderr.on('data', chunk => { err = (err + chunk).slice(-256 * 1024); });
  child.on('message', message => {
    if (message.owned_group) {
      assert.ok(Number.isSafeInteger(message.owned_group) && message.owned_group > 1
        && message.owned_group !== process.pid, 'SHELL_TOOL_BAD_OWNED_GROUP');
      ownedGroups.add(message.owned_group);
    }
    if (message.observation) { observations.push(message.observation); process.stdout.write(`${message.observation.status} ${message.observation.name}\n`); }
    if (message.receipt) receipt = message.receipt;
  });
  const kill = signal => {
    if (process.platform === 'win32') { child.kill(signal); return; }
    for (const pgid of ownedGroups) {
      try { process.kill(-pgid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  const terminate = () => { kill('SIGTERM'); escalation ??= setTimeout(() => kill('SIGKILL'), 3000); };
  const abort = () => { terminated = true; terminate(); };
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
  let exit, groupCleanup = [], cleanupError;
  try {
    exit = await new Promise((resolveExit, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => resolveExit({ code, signal }));
    });
  } finally {
    clearTimeout(timer); clearTimeout(escalation); process.off('SIGINT', abort); process.off('SIGTERM', abort);
    // Drain every range observed at its real spawn, including ranges whose leader already exited.
    if (process.platform !== 'win32') {
      for (const pgid of ownedGroups) {
        try { groupCleanup.push(await reapOwnedPosixGroup(pgid)); }
        catch (error) { cleanupError ??= error; }
      }
    }
    // Evidence I/O cannot prevent range reclamation (e.g. disk full or output directory moved).
    await writeFile(join(paths.output, 'probe.stdout.log'), out, privateWrite);
    await writeFile(join(paths.output, 'probe.stderr.log'), err, privateWrite);
  }
  const after = await sourceInventory(paths.upstream);
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const valid = receipt?.status === 'PASS' && exit.code === 0 && !timedOut && !terminated && !cleanupError && unchanged
    && receipt.cleanup.remaining_processes === 0 && receipt.scenarios.length === observations.length;
  const result = { schema_version: 'dsh-shell-tool-contract-run/v1', status: valid ? 'PASS' : 'FAIL',
    scope: 'official-modules-synthetic-only', exit, timed_out: timedOut, interrupted: terminated,
    upstream_inputs_unchanged: unchanged, source_git_clean_after: (await git(['status', '--porcelain', '--untracked-files=no'])).stdout.trim() === '',
    input_sha256: sha(await readFile(join(paths.output, 'inputs.json'))),
    observation_sha256: receipt ? sha(await readFile(join(paths.output, 'observation.json'))) : null,
    scenarios: observations.length, passed: observations.filter(item => item.status === 'PASS').length,
    failed: observations.filter(item => item.status === 'FAIL').length, receipt_received: Boolean(receipt),
    group_cleanup: groupCleanup, ...(cleanupError ? { cleanup_error: String(cleanupError.message) } : {}), release_ready: false };
  if (!result.source_git_clean_after) result.status = 'FAIL';
  await writeFile(join(paths.output, 'result.json'), json(result), privateWrite);
  return result;
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [upstream, output, ...extra] = process.argv.slice(2);
  try {
    assert.equal(extra.length, 0, 'SHELL_TOOL_UNKNOWN_ARGUMENT');
    const result = await runShellToolContract({ upstream, output });
    process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; }
}
