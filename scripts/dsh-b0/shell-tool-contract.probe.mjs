/** Test-only probe: official Cordis, shell executor, jobs and ToolRuntime; no model or Web server. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';

const [upstream, root] = process.argv.slice(2);
if (!upstream || !root || !process.send) throw Error('SHELL_TOOL_PROBE_OWNED_IPC_REQUIRED');
const owned = resolve(root);
const imp = relative => import(pathToFileURL(join(upstream, relative)));
const { Context } = await imp('vendor/cordis/lib/index.js');
const Tools = await imp('packages/core/tools/lib/index.js');
const modules = {
  prompt: await imp('packages/core/system-prompt/lib/index.js'),
  subprocess: await imp('packages/subprocess/subprocess-local/lib/index.js'),
  shellEnv: await imp('packages/shell/shell-env/lib/index.js'),
  shell: await imp('packages/shell/bash-local/lib/index.js'),
  bashTool: await imp('packages/shell/tool-bash/lib/index.js'),
  jobs: await imp('packages/jobs/jobs-local/lib/index.js'),
  jobTools: await imp('packages/jobs/tool-jobs/lib/index.js'),
  timeoutPolicy: await imp('packages/guard/timeout-policy/lib/index.js'),
};
const contexts = [];
const handles = [];
const observedPids = new Set();
const observations = [];
let seq = 0;
const interruption = new AbortController();
const interrupt = () => {
  interruption.abort(Error('SHELL_TOOL_PROBE_INTERRUPTED'));
  for (const handle of handles) handle.kill();
};
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
const json = value => JSON.stringify(value, null, 2) + '\n';

async function bounded(promise, ms = 8000, code = 'SHELL_TOOL_PROBE_TIMEOUT') {
  let timer;
  const interrupted = Promise.withResolvers();
  const onAbort = () => interrupted.reject(interruption.signal.reason);
  interruption.signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (interruption.signal.aborted) onAbort();
    return await Promise.race([promise, interrupted.promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error(code)), ms); })]);
  } finally { clearTimeout(timer); interruption.signal.removeEventListener('abort', onAbort); }
}
async function until(predicate, ms = 2000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (await predicate()) return;
    await delay(10);
  }
  throw Error('SHELL_TOOL_READY_TIMEOUT');
}
async function setup(label, { jobs = false, promoteOnTimeout = true } = {}) {
  const ctx = new Context(); contexts.push(ctx);
  const spill = join(owned, label, 'spill'); await mkdir(spill, { recursive: true, mode: 0o700 });
  await ctx.plugin(modules.prompt.default);
  await ctx.plugin(Tools.default);
  if (jobs) {
    await ctx.plugin(modules.jobs.default);
    await ctx.plugin(modules.jobTools);
  }
  await ctx.plugin(modules.subprocess.default);
  ctx.subprocess.internals = { spillDir: spill, spawn: (...args) => {
    const child = spawn(...args);
    // Observes the real Node spawn; does not replace shell execution or provider outcome.
    if (child.pid && args[2]?.detached && process.platform !== 'win32') process.send({ owned_group: child.pid });
    return child;
  } };
  await ctx.plugin(modules.shellEnv, { dshHome: join(owned, 'dsh-home') });
  await ctx.plugin(modules.shell.default, { cwd: owned, timeoutMs: 2000, maxTimeoutMs: 2500,
    maxOutputBytes: 128, maxSpillBytes: 8192, graceMs: 100 });
  await ctx.plugin(modules.bashTool, { promoteOnTimeout });
  assert.ok(ctx.tools.schemas().some(tool => tool.name === 'bash'), 'SHELL_TOOL_BASH_NOT_MOUNTED');
  return ctx;
}
function success(result) {
  assert.equal(result.isError, false);
  assert.ok(Object.hasOwn(result, 'value'));
  assert.equal(Object.hasOwn(result, 'error'), false);
  assert.ok(Array.isArray(result.content));
  return result.value;
}
function failure(result, expected) {
  assert.equal(result.isError, true);
  assert.equal(Object.hasOwn(result, 'value'), false);
  assert.equal(typeof result.error?.message, 'string');
  if (result.error.info !== undefined) assert.equal(typeof result.error.info.code, 'string');
  if (expected) assert.equal(result.error.info.code, expected);
  return result.error;
}
function call(ctx, name, args, signal = new AbortController().signal) {
  return ctx.tools.execute({ name, arguments: args, signal: AbortSignal.any([signal, interruption.signal]), callId: 'owned-tool-' + ++seq });
}
function bash(ctx, command, extra = {}, signal) {
  return call(ctx, 'bash', { command, description: 'Exercise synthetic owned command contract', ...extra }, signal);
}
async function fixture(mode, label) {
  const pidFile = join(owned, `${label}.pid`);
  const fence = join(owned, `${label}.fence`);
  return { command: `exec ${quote(process.execPath)} ${quote(join(owned, 'command-fixture.mjs'))} ${quote(mode)} ${quote(pidFile)} ${quote(fence)}`,
    pidFile, fence,
    async ready() {
      let raw = '';
      await until(async () => {
        try { raw = await readFile(pidFile, 'utf8'); return /^\d+\n$/.test(raw); } catch { return false; }
      });
      const pid = Number(raw.trim());
      assert.ok(Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid, 'SHELL_TOOL_BAD_OWNED_PID');
      observedPids.add(pid);
      return pid;
    } };
}
async function check(name, run) {
  const started = performance.now();
  try {
    interruption.signal.throwIfAborted();
    const detail = await bounded(run());
    const item = { name, status: 'PASS', duration_ms: Math.round(performance.now() - started), detail: detail ?? null };
    observations.push(item); process.send({ observation: item });
  } catch (error) {
    const item = { name, status: 'FAIL', duration_ms: Math.round(performance.now() - started), error: String(error.message) };
    observations.push(item); process.send({ observation: item });
    throw error;
  }
}
await writeFile(join(owned, 'command-fixture.mjs'), `import { writeFile, access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const [mode,pid,fence]=process.argv.slice(2);
await writeFile(pid, String(process.pid)+'\\n', {mode:0o600,flag:'wx'});
if(mode==='normal'){process.stdout.write('OWNED_STDOUT\\n');process.stderr.write('OWNED_STDERR\\n');}
else if(mode==='nonzero'){process.stderr.write('OWNED_NONZERO\\n');process.exitCode=9;}
else if(mode==='bulk'){process.stdout.write('x'.repeat(1024));}
else if(mode==='fence'){process.stdout.write('OWNED_READY\\n');for(;;){try{await access(fence);break;}catch{await delay(10);}}process.stdout.write('OWNED_RELEASED\\n');}
else if(mode==='stubborn'){process.on('SIGTERM',()=>{});setInterval(()=>{},50);}
else if(mode==='wait'){setInterval(()=>{},50);}
else throw Error('BAD_SYNTHETIC_MODE');
`, { mode: 0o600, flag: 'wx' });

let executionError;
try {
  const foreground = await setup('foreground');
  await check('shell-success-and-memoized-result', async () => {
    const f = await fixture('normal', 'shell-success');
    const handle = await foreground.shell.execute(foreground.shell.resolve({ command: f.command })); handles.push(handle);
    await f.ready();
    const result = handle.result(); assert.equal(handle.result(), result);
    const value = await result;
    assert.deepEqual([value.exitCode, value.signal, value.timedOut, value.aborted, value.timeoutMs], [0, null, false, false, 2000]);
    assert.equal(value.stdout.text, 'OWNED_STDOUT\n'); assert.equal(value.stderr.text, 'OWNED_STDERR\n');
    assert.equal(handle.status, 'completed'); assert.equal(handle.kill(), false);
    return { exitCode: value.exitCode, timeoutMs: value.timeoutMs, memoized: true };
  });
  await check('shell-nonzero-resolves', async () => {
    const f = await fixture('nonzero', 'shell-nonzero');
    const h = await foreground.shell.execute(foreground.shell.resolve({ command: f.command })); handles.push(h); await f.ready();
    const r = await h.result(); assert.equal(r.exitCode, 9); assert.equal(r.timedOut, false); assert.equal(r.aborted, false);
    return { exitCode: r.exitCode, rejection: false };
  });
  await check('shell-timeout-kills-stubborn-owned-process', async () => {
    const f = await fixture('stubborn', 'shell-timeout');
    const h = await foreground.shell.execute(foreground.shell.resolve({ command: f.command, timeoutMs: 350 })); handles.push(h); await f.ready();
    const r = await h.result(); assert.equal(r.timedOut, true); assert.equal(r.aborted, false); assert.equal(r.timeoutMs, 350);
    assert.equal(h.status, 'killed'); assert.equal(r.signal, 'SIGKILL');
    return { timedOut: r.timedOut, aborted: r.aborted, signal: r.signal };
  });
  await check('shell-caller-abort-first-cause', async () => {
    const f = await fixture('wait', 'shell-abort'); const controller = new AbortController();
    const h = await foreground.shell.execute(foreground.shell.resolve({ command: f.command, signal: controller.signal })); handles.push(h); await f.ready();
    controller.abort(Error('OWNED_CANCEL')); const r = await h.result();
    assert.equal(r.aborted, true); assert.equal(r.timedOut, false); assert.equal(h.status, 'killed');
    return { timedOut: r.timedOut, aborted: r.aborted };
  });
  await check('shell-none-expiry-keeps-handle-and-incremental-output', async () => {
    const f = await fixture('fence', 'shell-no-expiry');
    const h = await foreground.shell.execute(foreground.shell.resolve({ command: f.command, timeoutMs: 100, onExpiry: 'none' })); handles.push(h); await f.ready();
    let first = ''; await until(async () => { first += h.readOutput().delta; return first.includes('OWNED_READY'); });
    assert.equal(h.readOutput().delta, ''); await delay(180); assert.equal(h.status, 'running');
    await writeFile(f.fence, 'release', { flag: 'wx', mode: 0o600 }); await h.done;
    const last = h.readOutput().delta; assert.equal(last, 'OWNED_RELEASED\n'); assert.equal(h.readOutput().delta, '');
    const r = await h.result(); assert.equal(r.timedOut, false); assert.equal(r.aborted, false); assert.equal(r.timeoutMs, 100);
    return { onExpiry: 'none', remained_running_past_ms: 100, no_repeated_output: true };
  });
  await check('shell-spawn-failure-done-resolves-result-rejects', async () => {
    const h = await foreground.shell.execute(foreground.shell.resolve({ command: 'true', workdir: join(owned, 'missing-workdir') })); handles.push(h);
    await h.done; assert.equal(h.status, 'killed'); await assert.rejects(h.result());
    assert.match(h.readOutput().delta, /subprocess failed before reporting an outcome/);
    assert.equal(h.readOutput().delta, '');
    return { done_rejects: false, result_rejects: true };
  });
  await check('shell-invalid-timeout-rejected-before-spawn', async () => {
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => foreground.shell.resolve({ command: 'true', timeoutMs }));
    }
    assert.equal(foreground.shell.resolve({ command: 'true', timeoutMs: 99999 }).timeoutMs, 2500);
    return { invalid_requests: 4, cap_ms: 2500 };
  });
  await check('tool-success-foreground-union', async () => {
    const f = await fixture('normal', 'tool-success'); const result = await bash(foreground, f.command); await f.ready();
    const r = success(result); assert.equal(r.kind, 'foreground'); assert.equal(r.exitCode, 0); assert.equal(r.timedOut, false);
    return { isError: result.isError, kind: r.kind, has_value: true, has_error: false };
  });
  await check('tool-nonzero-remains-success-with-exit-marker', async () => {
    const f = await fixture('nonzero', 'tool-nonzero'); const result = await bash(foreground, f.command); await f.ready();
    const r = success(result); assert.equal(r.exitCode, 9); assert.match(result.content[0].text, /\[exit code: 9\]/);
    return { isError: result.isError, exitCode: r.exitCode };
  });
  await check('tool-no-jobs-timeout-is-foreground-kill', async () => {
    const f = await fixture('wait', 'tool-timeout'); const pending = bash(foreground, f.command, { timeoutMs: 350 }); await f.ready();
    const result = await pending; const r = success(result); assert.equal(r.kind, 'foreground'); assert.equal(r.timedOut, true); assert.equal(r.aborted, false);
    return { isError: result.isError, kind: r.kind, timedOut: r.timedOut };
  });
  await check('tool-abort-after-dispatch-is-failure-without-value', async () => {
    const f = await fixture('wait', 'tool-abort'); const controller = new AbortController();
    const pending = bash(foreground, f.command, {}, controller.signal); await f.ready(); controller.abort();
    const result = await pending; const error = failure(result, Tools.TOOL_ABORTED);
    return { isError: result.isError, code: error.info.code, has_value: false };
  });
  await check('tool-pre-abort-never-dispatches', async () => {
    const marker = join(owned, 'must-not-write'); const controller = new AbortController(); controller.abort();
    const result = await bash(foreground, `printf forbidden > ${quote(marker)}`, {}, controller.signal);
    const error = failure(result, Tools.TOOL_ABORTED_BEFORE_DISPATCH); await assert.rejects(access(marker));
    return { code: error.info.code, side_effect: false };
  });
  await check('tool-invalid-arguments-fail-before-side-effect', async () => {
    const marker = join(owned, 'bad-args-must-not-write');
    const result = await call(foreground, 'bash', { command: `printf forbidden > ${quote(marker)}`, description: 123 });
    const error = failure(result); await assert.rejects(access(marker));
    return { code: error.info.code, side_effect: false };
  });
  await check('tool-unknown-fails-without-success-value', async () => {
    const result = await call(foreground, 'owned_unknown', {}); const error = failure(result, 'UNKNOWN_TOOL');
    return { code: error.info?.code ?? null, has_value: false };
  });
  await check('tool-spawn-failure-normalized-to-error', async () => {
    const result = await bash(foreground, 'true', { workdir: join(owned, 'missing-workdir') }); const error = failure(result);
    return { code: error.info?.code ?? null, has_value: false };
  });
  await check('tool-output-truncation-bounded-spill', async () => {
    const f = await fixture('bulk', 'tool-spill'); const result = await bash(foreground, f.command); await f.ready();
    const r = success(result); assert.equal(r.stdout.truncated, true); assert.equal(r.stdout.text.length, 128);
    assert.ok(r.stdout.spillPath.startsWith(join(owned, 'foreground', 'spill') + '/'));
    assert.equal((await readFile(r.stdout.spillPath, 'utf8')).length, 1024);
    return { retained_bytes: r.stdout.text.length, spill_bytes: 1024, truncated: true };
  });
  await check('tool-schema-invalid-output-fails-closed', async () => {
    foreground.tools.register(Tools.defineTool({ name: 'owned_bad_output', description: 'Synthetic output contract violation', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return { not: 'a string' }; } }));
    const result = await call(foreground, 'owned_bad_output', {}); const error = failure(result);
    assert.equal(error.info.code, 'INVALID_TOOL_OUTPUT');
    return { code: error.info.code, has_value: false };
  });
  await foreground.plugin(modules.timeoutPolicy);
  let policyStarted = 0, policyDrained = 0;
  foreground.tools.register(Tools.defineTool({ name: 'owned_cooperative_timeout', description: 'Synthetic cooperative timeout and drain',
    parameters: {}, timeoutMs: 80, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      policyStarted++;
      try { await delay(2000, undefined, { signal: exec.signal }); return 'owned-complete'; }
      finally { await delay(30); policyDrained++; }
    } }));
  await check('tool-timeout-policy-waits-for-cooperative-drain', async () => {
    const started = performance.now(); const result = await call(foreground, 'owned_cooperative_timeout', {});
    const error = failure(result, modules.timeoutPolicy.TOOL_TIMEOUT);
    assert.equal(policyStarted, 1); assert.equal(policyDrained, 1); assert.ok(performance.now() - started >= 95);
    return { code: error.info.code, timeout_ms: 80, owned_cleanup_ms: 30, drained_before_return: true };
  });
  await check('tool-timeout-policy-preserves-caller-cancel-first-cause', async () => {
    const controller = new AbortController(); const pending = call(foreground, 'owned_cooperative_timeout', {}, controller.signal);
    await until(async () => policyStarted === 2); controller.abort();
    const result = await pending; const error = failure(result);
    assert.notEqual(error.info?.code, modules.timeoutPolicy.TOOL_TIMEOUT); assert.match(error.message, /aborted/i);
    assert.equal(policyDrained, 2);
    return { code: error.info?.code ?? null, thrown_abort_error_info_optional: true,
      timeout_not_misclassified: true, drained_before_return: true };
  });
  foreground.tools.register(Tools.defineTool({ name: 'owned_no_timeout', description: 'Synthetic undeclared timeout delegation', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { await delay(120); return 'owned-no-deadline'; } }));
  await check('tool-timeout-policy-does-not-invent-undeclared-budget', async () => {
    const result = await call(foreground, 'owned_no_timeout', {}); assert.equal(success(result), 'owned-no-deadline');
    return { declared_timeout: false, isError: result.isError };
  });
  let lateSettled = false;
  foreground.tools.register(Tools.defineTool({ name: 'owned_finite_noncooperative', description: 'Synthetic finite late settlement observation',
    parameters: {}, timeoutMs: 50, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { await delay(150); lateSettled = true; return 'owned-late'; } }));
  await check('tool-timeout-policy-does-not-abandon-finite-uncooperative-promise', async () => {
    const started = performance.now(); const result = await call(foreground, 'owned_finite_noncooperative', {});
    const error = failure(result, modules.timeoutPolicy.TOOL_TIMEOUT);
    assert.equal(lateSettled, true); assert.ok(performance.now() - started >= 140);
    return { code: error.info.code, timeout_ms: 50, body_ms: 150, hard_deadline: false, settled_before_return: true };
  });
  const jobs = await setup('jobs', { jobs: true });
  await check('tool-default-jobs-timeout-promotes-live-owned-command', async () => {
    const f = await fixture('fence', 'tool-promoted'); const pending = bash(jobs, f.command, { timeoutMs: 250 }); await f.ready();
    const result = await pending; const r = success(result); assert.equal(r.kind, 'promoted'); assert.ok(r.jobId); assert.equal(r.timeoutMs, 250);
    assert.ok(['running', 'stopping'].includes(jobs.jobs.get(r.jobId).status));
    await writeFile(f.fence, 'release', { flag: 'wx', mode: 0o600 }); const settled = await jobs.jobs.wait(r.jobId, 2000);
    assert.equal(settled.status, 'completed'); const output = await call(jobs, 'job_output', { job_id: r.jobId }); success(output);
    assert.match(output.content[0].text, /OWNED_RELEASED/);
    return { kind: r.kind, timed_out_command_killed: false, job_status: settled.status, output_collected: true };
  });
  await check('tool-background-union-and-job-kill', async () => {
    const f = await fixture('wait', 'tool-background'); const result = await bash(jobs, f.command, { run_in_background: true });
    const r = success(result); assert.equal(r.kind, 'background'); assert.deepEqual(Object.keys(r).sort(), ['jobId', 'kind']); await f.ready();
    const killResult = await call(jobs, 'job_kill', { job_id: r.jobId }); success(killResult);
    const settled = await jobs.jobs.wait(r.jobId, 2000); assert.equal(settled.status, 'killed');
    return { kind: r.kind, job_status: settled.status };
  });
  const killOnly = await setup('jobs-no-promotion', { jobs: true, promoteOnTimeout: false });
  await check('tool-explicit-no-promotion-keeps-jobs-but-timeout-kills', async () => {
    const f = await fixture('wait', 'tool-explicit-kill'); const pending = bash(killOnly, f.command, { timeoutMs: 350 }); await f.ready();
    const result = await pending; const r = success(result); assert.equal(r.kind, 'foreground'); assert.equal(r.timedOut, true);
    return { kind: r.kind, timedOut: r.timedOut, jobs_mounted: true, promoteOnTimeout: false };
  });
  await check('composition-disposal-reaps-live-owned-range', async () => {
    const ctx = await setup('teardown'); const f = await fixture('wait', 'shell-dispose');
    const h = await ctx.shell.execute(ctx.shell.resolve({ command: f.command, onExpiry: 'none' })); handles.push(h); await f.ready();
    await ctx.fiber.dispose(); await h.done; assert.equal(h.status, 'killed');
    return { status: h.status, done_settled: true };
  });
} catch (error) { executionError = error; }
finally {
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  const drain = async (promise, ms, code) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(code)), ms); })]); }
    finally { clearTimeout(timer); }
  };
  const settled = await drain(Promise.allSettled(contexts.map(ctx => ctx.fiber.dispose())), 10000, 'SHELL_TOOL_DISPOSAL_TIMEOUT');
  for (const outcome of settled) if (outcome.status === 'rejected') executionError ??= outcome.reason;
  await drain(Promise.all(handles.map(handle => handle.done)), 5000, 'SHELL_TOOL_HANDLE_DRAIN_TIMEOUT');
  for (const name of (await readdir(owned)).filter(name => name.endsWith('.pid'))) {
    const raw = await readFile(join(owned, name), 'utf8');
    assert.match(raw, /^\d+\n$/); observedPids.add(Number(raw.trim()));
  }
  const pids = [...observedPids].map(pid => {
    try { process.kill(pid, 0); return { pid, alive: true }; }
    catch (error) { if (error.code !== 'ESRCH') throw error; return { pid, alive: false }; }
  });
  if (pids.some(item => item.alive)) executionError ??= Error('SHELL_TOOL_OWNED_PROCESS_REMAINS');
  const receipt = { schema_version: 'dsh-shell-tool-contract-observation/v1', status: executionError ? 'FAIL' : 'PASS',
    scope: 'official-modules-synthetic-only', platform: process.platform, arch: process.arch, node: process.version,
    scenarios: observations, cleanup: { contexts: contexts.length, handles: handles.length, owned_pids: pids,
      remaining_processes: pids.filter(item => item.alive).length }, release_ready: false,
    not_run: ['official-web-cli', 'model-dispatch', 'session-wal', 'wsl-target', 'production', 'sandbox-enforcement'],
    ...(executionError ? { error: String(executionError.message) } : {}) };
  await writeFile(join(owned, 'observation.json'), json(receipt), { flag: 'wx', mode: 0o600 });
  process.send({ receipt });
}
process.exitCode = executionError ? 1 : 0;
process.disconnect();
