import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { validateShellToolPaths, runShellToolContract, reapOwnedPosixGroup, readOnlyShellGit } from './shell-tool-contract.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'owned-shell-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repository'), upstream = join(root, 'upstream'), outputs = join(root, 'outputs');
  for (const path of [repo, upstream, outputs]) await mkdir(path, { mode: 0o700 });
  return { root, repo, upstream, outputs };
}
test('read-only shell Git proof cannot execute repository fsmonitor configuration', async t => {
  const f = await fixture(t);
  const marker = join(f.root, 'forbidden-marker'), hook = join(f.root, 'fsmonitor');
  const git = args => execFileSync('/usr/bin/git', ['-C', f.upstream, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  });
  git(['init', '--quiet']);
  await writeFile(hook, '#!/bin/sh\nprintf ran > ' + marker + '\nprintf "\\0"\n', { mode: 0o700 });
  git(['config', 'core.fsmonitor', hook]);
  assert.equal((await readOnlyShellGit(f.upstream, ['status', '--porcelain', '--untracked-files=no'])).stdout, '');
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});
test('shell observer rejects relative paths before creating anything', async t => {
  const f = await fixture(t);
  await assert.rejects(validateShellToolPaths('relative-upstream', join(f.outputs, 'new'), f.repo), /SHELL_TOOL_ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(validateShellToolPaths(f.upstream, 'relative-output', f.repo), /SHELL_TOOL_ABSOLUTE_PATH_REQUIRED/);
});
test('shell observer rejects output below its immutable upstream', async t => {
  const f = await fixture(t);
  await assert.rejects(validateShellToolPaths(f.upstream, join(f.upstream, 'out'), f.repo), /SHELL_TOOL_INPUT_OUTPUT_OVERLAP/);
});
test('shell observer rejects an ancestor that would contain its input', async t => {
  const f = await fixture(t);
  await assert.rejects(validateShellToolPaths(f.upstream, f.root, f.repo), /SHELL_TOOL_INPUT_OUTPUT_OVERLAP/);
});
test('shell observer resolves an output parent alias before testing overlap', async t => {
  const f = await fixture(t);
  const alias = join(f.outputs, 'alias'); await symlink(f.upstream, alias, 'dir');
  await assert.rejects(validateShellToolPaths(f.upstream, join(alias, 'new'), f.repo), /SHELL_TOOL_INPUT_OUTPUT_OVERLAP/);
});
test('shell observer refuses source outputs and parent aliases into repository code', async t => {
  const f = await fixture(t);
  const src = join(f.repo, 'scripts'); await mkdir(src);
  await assert.rejects(validateShellToolPaths(f.upstream, join(src, 'new'), f.repo), /SHELL_TOOL_OUTPUT_WRITES_SOURCE/);
  const alias = join(f.outputs, 'source-alias'); await symlink(src, alias, 'dir');
  await assert.rejects(validateShellToolPaths(f.upstream, join(alias, 'new'), f.repo), /SHELL_TOOL_OUTPUT_WRITES_SOURCE/);
});
test('shell observer preserves pre-existing evidence and permits a fresh ignored evidence child', async t => {
  const f = await fixture(t);
  const output = join(f.outputs, 'existing'); await mkdir(output); await writeFile(join(output, 'old'), 'retained');
  await assert.rejects(validateShellToolPaths(f.upstream, output, f.repo), /SHELL_TOOL_OUTPUT_EXISTS/);
  assert.equal(await readFile(join(output, 'old'), 'utf8'), 'retained');
  const checks = join(f.repo, '.context', 'checks'); await mkdir(checks, { recursive: true });
  const result = await validateShellToolPaths(f.upstream, join(checks, 'new'), f.repo);
  assert.equal(result.output, join(await realpath(checks), 'new'));
});
test('shell observer rejects unbounded run budgets before reading runtime inputs', async () => {
  for (const timeoutMs of [0, -1, 120001, Infinity, NaN]) {
    await assert.rejects(runShellToolContract({ upstream: '/never-read', output: '/never-created', timeoutMs }), /SHELL_TOOL_BOUND_REQUIRED/);
  }
});
test('owned group cleanup escalates after its leader exited, reaping a stubborn descendant', {
  skip: process.platform === 'win32' ? 'POSIX owned PGID test' : false, timeout: 8000,
}, async t => {
  const f = await fixture(t);
  const workerPath = join(f.root, 'group-worker.mjs');
  await writeFile(workerPath, `import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},50);process.stdout.write('READY');"],{stdio:['ignore','pipe','ignore']});
child.stdout.once('data',()=>{process.send({pid:child.pid});});
process.on('message',()=>process.exit(0));
`, { flag: 'wx', mode: 0o600 });
  const worker = spawn(process.execPath, [workerPath], { cwd: f.root, detached: true,
    env: { PATH: '/usr/bin:/bin', HOME: f.root }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(async () => { await reapOwnedPosixGroup(worker.pid); });
  const [message] = await once(worker, 'message');
  const closed = once(worker, 'close'); worker.send({ exit: true }); await closed;
  // This is the actual danger state: the leader is gone while its owned PGID still exists.
  assert.equal(worker.exitCode, 0); assert.doesNotThrow(() => process.kill(-worker.pid, 0));
  assert.doesNotThrow(() => process.kill(message.pid, 0));
  const cleanup = await reapOwnedPosixGroup(worker.pid, { graceMs: 80, waitMs: 2000 });
  assert.equal(cleanup.kill_sent, true); assert.equal(cleanup.remaining, false);
  await delay(20);
  assert.throws(() => process.kill(message.pid, 0), error => error.code === 'ESRCH');
});
const upstream = process.env.B0_BUILD_UPSTREAM;
const evidence = process.env.DSH_TOOL_CONTRACT_EVIDENCE;
const runtimeSkip = !upstream || !evidence ? 'NOT_RUN: explicit pinned upstream and exclusive evidence path required' : false;
test('outer timeout reclaims owned official command groups and retains a failed receipt', { skip: runtimeSkip, timeout: 15000 }, async () => {
  const output = evidence + '-timeout';
  const result = await runShellToolContract({ upstream, output, timeoutMs: 500 });
  assert.equal(result.status, 'FAIL'); assert.equal(result.timed_out, true);
  assert.ok(result.group_cleanup.length > 1); assert.ok(result.group_cleanup.every(item => item.remaining === false));
  assert.equal(result.upstream_inputs_unchanged, true);
});
test('parent SIGTERM interrupts the owned probe while still draining every observed group', { skip: runtimeSkip, timeout: 15000 }, async t => {
  const output = evidence + '-interrupt';
  const runner = fileURLToPath(new URL('./shell-tool-contract.mjs', import.meta.url));
  const child = spawn(process.execPath, [runner, upstream, output], { cwd: dirname(output), detached: true,
    env: { PATH: dirname(process.execPath) + ':/usr/bin:/bin', HOME: dirname(output) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => reapOwnedPosixGroup(child.pid));
  let out = '', err = '', interrupted = false;
  child.stdout.on('data', chunk => {
    out += chunk;
    if (!interrupted && out.includes('PASS shell-success-and-memoized-result')) {
      interrupted = true; child.kill('SIGTERM');
    }
  });
  child.stderr.on('data', chunk => { err += chunk; });
  const [code] = await once(child, 'close');
  assert.equal(interrupted, true); assert.equal(code, 1, err);
  const result = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'));
  assert.equal(result.status, 'FAIL'); assert.equal(result.interrupted, true);
  assert.ok(result.group_cleanup.every(item => item.remaining === false));
  await writeFile(join(output, 'parent.stdout.log'), out, { flag: 'wx', mode: 0o600 });
  await writeFile(join(output, 'parent.stderr.log'), err, { flag: 'wx', mode: 0o600 });
});
test('fixed official modules execute all synthetic shell and tool union cases and join owned commands', {
  skip: runtimeSkip,
  timeout: 120000,
}, async () => {
  assert.equal(resolve(upstream), upstream, 'TEST_PINNED_UPSTREAM_ABSOLUTE');
  assert.equal(resolve(evidence), evidence, 'TEST_EVIDENCE_ABSOLUTE');
  const result = await runShellToolContract({ upstream, output: evidence });
  assert.equal(result.status, 'PASS');
  assert.equal(result.passed, 25); assert.equal(result.failed, 0); assert.equal(result.scenarios, 25);
  assert.equal(result.upstream_inputs_unchanged, true); assert.equal(result.source_git_clean_after, true);
  assert.equal(result.release_ready, false);
  const observed = JSON.parse(await readFile(join(evidence, 'observation.json'), 'utf8'));
  assert.equal(observed.cleanup.remaining_processes, 0);
  assert.ok(observed.cleanup.owned_pids.length >= 13);
  const promotion = observed.scenarios.find(item => item.name === 'tool-default-jobs-timeout-promotes-live-owned-command');
  assert.equal(promotion.detail.kind, 'promoted'); assert.equal(promotion.detail.timed_out_command_killed, false);
  assert.ok(observed.not_run.includes('official-web-cli') && observed.not_run.includes('wsl-target'));
});
