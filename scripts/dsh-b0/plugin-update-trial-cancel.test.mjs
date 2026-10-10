import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  createTrialSignals, handleTrialSignal, reapTrialChildren, runCancellableSequence, runOwnedCommand, startOwnedHost,
  persistTrialRecord, SCENARIOS, stopHost, runOwnedProcessGroup,
} from './plugin-update-trial.mjs';

import { startHost } from './pinned-host-acceptance.mjs';

const node = process.execPath;
const python = process.env.FQ_B0_PYTHON;
if (python) assert.ok(isAbsolute(python), 'FQ_B0_PYTHON must be absolute');
const fixture = fileURLToPath(new URL('./plugin-update-trial-cancel-fixture.mjs', import.meta.url));
const executor = fileURLToPath(new URL('./plugin-update-trial.mjs', import.meta.url));

function killIfAlive(pid, signal = 'SIGKILL') {
  if (!pid) return;
  try { process.kill(pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

function collect(child) {
  const lines = [];
  let buf = '';
  let stderr = '';
  const waiters = new Set();
  child.stdout.on('data', chunk => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      lines.push(line);
      for (const waiter of waiters) waiter(line);
    }
  });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  return {
    lines,
    stderr: () => stderr,
    wait(prefix, ms = 8000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`timeout ${prefix}; lines=${lines.join(' || ')}; stderr=${stderr}`)), ms);
        const check = line => {
          if (!line.startsWith(prefix)) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolve(line);
        };
        for (const line of lines) if (line.startsWith(prefix)) { clearTimeout(timer); resolve(line); return; }
        waiters.add(check);
      });
    },
  };
}

async function runFixture(mode, signalName, readyPrefix) {
  const child = spawn(node, [fixture, mode], { stdio: ['ignore', 'pipe', 'pipe'] });
  const output = collect(child);
  let sleeper = 0;
  try {
    const ready = await output.wait(readyPrefix);
    if (readyPrefix === 'HOLD ') {
      sleeper = Number(ready.slice(5));
      process.kill(sleeper, 0);
    }
    process.kill(child.pid, signalName);
    const [code] = await once(child, 'exit');
    const resultLine = output.lines.find(line => line.startsWith('RESULT '));
    assert.ok(resultLine, output.stderr() || output.lines.join('\n'));
    const result = JSON.parse(resultLine.slice(7));
    if (sleeper) assert.throws(() => process.kill(sleeper, 0), { code: 'ESRCH' });
    return { code, result, sleeper, lines: output.lines };
  } finally {
    killIfAlive(sleeper);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

test('importing the executor does not register signal handlers or start a run', { timeout: 10000 }, async () => {
  const child = spawn(node, ['--input-type=module', '-e', `
    const beforeInt = process.listenerCount('SIGINT');
    const beforeTerm = process.listenerCount('SIGTERM');
    await import(${JSON.stringify(pathToFileURL(executor).href)});
    if (process.listenerCount('SIGINT') !== beforeInt) process.exit(3);
    if (process.listenerCount('SIGTERM') !== beforeTerm) process.exit(4);
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr);
});

test('an already cancelled run does not start the host', async () => {
  const signals = createTrialSignals();
  handleTrialSignal(signals, 'SIGINT');
  const ctx = { cancellation: signals, hostStarts: 0, owned: new Set(), children: new Set() };
  let called = false;
  await assert.rejects(() => startOwnedHost(ctx, () => { called = true; return { pid: 1 }; }), /PLUGIN_UPDATE_INTERRUPTED/);
  assert.equal(called, false);
  assert.equal(ctx.hostStarts, 0);
});

test('cancellation while host start is waiting kills that owned child', { timeout: 10000 }, async () => {
  const signals = createTrialSignals();
  const ctx = { cancellation: signals, hostStarts: 0, owned: new Set(), children: new Set(), currentAbort: null };
  const sleeper = spawn(node, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},200);'], { stdio: 'ignore' });
  await once(sleeper, 'spawn');
  try {
    process.kill(sleeper.pid, 0);
    signals.ctx = ctx;
    ctx.children.add(sleeper);
    ctx.owned.add(sleeper.pid);
    const pending = startOwnedHost(ctx, ({ signal }) => new Promise((resolve, reject) => {
      const stop = () => {
        reject(Object.assign(Error('PLUGIN_UPDATE_INTERRUPTED'), { code: 'PLUGIN_UPDATE_INTERRUPTED' }));
      };
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
    }));
    handleTrialSignal(signals, 'SIGTERM');
    await assert.rejects(pending, /PLUGIN_UPDATE_INTERRUPTED/);
    const receipt = await reapTrialChildren(ctx);
    assert.deepEqual(receipt.errors, []);
    assert.ok(sleeper.signalCode);
    assert.throws(() => process.kill(sleeper.pid, 0), { code: 'ESRCH' });
  } finally {
    killIfAlive(sleeper.pid);
  }
});

test('runOwnedCommand cancels a live Python child from the run signal', { timeout: 10000, skip: !python && 'FQ_B0_PYTHON is not configured' }, async () => {
  const signals = createTrialSignals();
  const ctx = { cancellation: signals, children: new Set(), owned: new Set() };
  const pending = runOwnedCommand(ctx, python, ['-c', 'import time; time.sleep(30)'], { timeout: 10000 });
  const child = pending.child;
  await once(child, 'spawn');
  process.kill(child.pid, 0);
  try {
    handleTrialSignal(signals, 'SIGINT');
    await pending.then(() => assert.fail('python completed'), () => {});
    await once(child, 'exit');
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  } finally {
    killIfAlive(child.pid);
  }
});

test('SIGINT during a scenario does not start the next scenario and reaps the child', { timeout: 15000 }, async () => {
  const observed = await runFixture('during-int', 'SIGINT', 'HOLD ');
  assert.notEqual(observed.code, 0);
  assert.equal(observed.result.overall, 'INTERRUPTED');
  assert.equal(observed.result.interrupt, 'SIGINT');
  assert.deepEqual(observed.result.started, ['one']);
  assert.equal(observed.result.runs[0].status, 'INTERRUPTED');
  assert.equal(observed.result.not_started.length, 1);
  assert.equal(observed.result.not_started[0].status, 'NOT_RUN');
  assert.equal(observed.result.runs.some(run => run.status === 'PASS'), false);
  assert.equal(observed.result.not_started.some(run => run.status === 'PASS'), false);
  assert.equal(observed.result.cleanup_failed, false);
  assert.equal(observed.result.runs[0].reaped?.[0]?.kill_sent, true);
});

test('SIGTERM during a scenario reaps an owned child that ignores SIGTERM', { timeout: 15000 }, async () => {
  const observed = await runFixture('during-term', 'SIGTERM', 'HOLD ');
  assert.notEqual(observed.code, 0);
  assert.equal(observed.result.overall, 'INTERRUPTED');
  assert.equal(observed.result.interrupt, 'SIGTERM');
  assert.deepEqual(observed.result.started, ['one']);
  assert.equal(observed.result.not_started[0].scenario, 'two');
  assert.equal(observed.result.not_started[0].status, 'NOT_RUN');
  assert.equal(observed.result.cleanup_failed, false);
  assert.equal(observed.result.runs[0].reaped?.[0]?.kill_sent, true);
  assert.equal(observed.result.runs[0].reaped?.[0]?.remaining, false);
});

test('SIGINT between scenarios does not start the next scenario', { timeout: 15000 }, async () => {
  const observed = await runFixture('gap-int', 'SIGINT', 'GAP');
  assert.notEqual(observed.code, 0);
  assert.equal(observed.result.overall, 'INTERRUPTED');
  assert.deepEqual(observed.result.started, ['one']);
  assert.equal(observed.result.runs[0].status, 'PASS');
  assert.deepEqual(observed.result.not_started, [{ scenario: 'two', status: 'NOT_RUN' }]);
  assert.equal(observed.lines.some(line => line === 'START two'), false);
});

test('SIGTERM after the last scenario still prevents an overall PASS', { timeout: 15000 }, async () => {
  const observed = await runFixture('after-term', 'SIGTERM', 'AFTER');
  assert.notEqual(observed.code, 0);
  assert.equal(observed.result.overall, 'INTERRUPTED');
  assert.deepEqual(observed.result.started, ['one', 'two']);
  assert.deepEqual(observed.result.runs.map(run => run.status), ['PASS', 'PASS']);
  assert.deepEqual(observed.result.not_started, []);
});

test('cleanup failure stays a failure after owned resources are addressed', { timeout: 10000 }, async () => {
  const signals = createTrialSignals();
  const real = spawn(node, ['-e', 'setInterval(()=>{},200);'], { stdio: 'ignore' });
  await once(real, 'spawn');
  try {
    process.kill(real.pid, 0);
    const result = await runCancellableSequence({
      scenarios: ['only'],
      signals,
      async runOne(_scenario, ctx) {
        ctx.children.add({
          pid: real.pid,
          exitCode: null,
          signalCode: null,
          kill() { throw Error('PLUGIN_UPDATE_CLEANUP_FAILED'); },
        });
        return { scenario: 'only', status: 'PASS', error: null };
      },
      cleanup: ctx => reapTrialChildren(ctx),
    });
    assert.equal(result.cleanup_failed, true);
    assert.equal(result.overall, 'FAIL');
    assert.equal(result.runs[0].status, 'FAIL');
    assert.match(result.runs[0].cleanup_errors.join('\n'), /PLUGIN_UPDATE_CLEANUP_FAILED/);
  } finally {
    killIfAlive(real.pid);
  }
});

for (const [mode, signal, marker] of [
  ['final-check-int', 'SIGINT', 'FINAL_CHECK'],
  ['final-write-term', 'SIGTERM', 'FINAL_WRITE'],
]) test(`cancellation during ${mode} reaches both the disk receipt and exit status`, { timeout: 15000 }, async () => {
  const observed = await runFixture(mode, signal, marker);
  assert.equal(observed.code, 2);
  assert.equal(observed.result.overall, 'INTERRUPTED');
  assert.equal(observed.result.interrupt, signal);
  assert.equal(observed.result.disk.overall, 'INTERRUPTED');
  assert.equal(observed.result.disk.interrupt, signal);
  if (mode === 'final-write-term') assert.equal(observed.result.writes, 2);
});

for (const initializationFails of [false, true]) test(`final scene record includes cleanup even when initialization fails=${initializationFails}`, async t => {
  const output = await mkdtemp(join(tmpdir(), 'plugin-final-record-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const result = await runCancellableSequence({
    scenarios: [SCENARIOS[0]], signals: createTrialSignals(),
    runOne: async scenario => {
      if (initializationFails) throw Error('FIXTURE_INITIALIZATION_FAILURE');
      return { scenario, status: 'PASS' };
    },
    cleanup: async () => ({ errors: ['FIXTURE_CLEANUP_FAILURE'], reaped: { results: [{ remaining: false }] } }),
    persistRecord: record => persistTrialRecord(output, record),
  });
  const disk = JSON.parse(await readFile(join(output, 'runs', SCENARIOS[0], 'record.json'), 'utf8'));
  assert.deepEqual(disk, result.runs[0]);
  assert.equal(disk.status, 'FAIL');
  assert.deepEqual(disk.cleanup_errors, ['FIXTURE_CLEANUP_FAILURE']);
  assert.deepEqual(disk.reaped, [{ remaining: false }]);
  assert.equal(result.overall, 'FAIL');
});

test('a stop failure keeps ownership so the production reaper can remove the child', { timeout: 10000 }, async () => {
  const child = spawn(node, ['-e', 'setInterval(()=>{},200)'], { stdio: 'ignore' });
  await once(child, 'spawn');
  const ctx = { owned: new Set([child.pid]), children: new Set([child]) };
  try {
    await assert.rejects(stopHost(ctx, { pid: child.pid, port: 4328, unbind() {}, host: { stop: async () => ({}) } }), /PLUGIN_UPDATE_PID_STILL_ALIVE/);
    assert.ok(ctx.owned.has(child.pid));
    assert.deepEqual((await reapTrialChildren(ctx)).errors, []);
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  } finally { killIfAlive(child.pid); }
});

for (const cancel of [true, false]) test(`owned process group cleans a spawned grandchild on ${cancel ? 'abort' : 'timeout'}`, { timeout: 10000, skip: process.platform === 'win32' }, async () => {
  const abort = new AbortController();
  const code = `const {spawn}=require('node:child_process');
    process.on('SIGTERM',()=>{});
    const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{}); setInterval(()=>{},200)'],{stdio:'ignore'});
    child.on('spawn',()=>console.log('GRANDCHILD '+child.pid));
    setInterval(()=>{},200);`;
  const pending = runOwnedProcessGroup(node, ['-e', code], { signal: abort.signal, timeout: cancel ? 6000 : 500 });
  // Attach the rejection handler before signalling the command.
  const outcome = pending.then(() => null, error => error);
  const output = collect(pending.child);
  let grandchild;
  try {
    grandchild = Number((await output.wait('GRANDCHILD ')).slice(11));
    if (cancel) abort.abort();
    assert.ok(await outcome);
    assert.throws(() => process.kill(grandchild, 0), { code: 'ESRCH' });
    assert.throws(() => process.kill(pending.child.pid, 0), { code: 'ESRCH' });
  } finally { killIfAlive(grandchild); killIfAlive(pending.child.pid); }
});

test('importing the cancellation fixture is inert', { timeout: 10000 }, async () => {
  const pending = runOwnedProcessGroup(node, ['--input-type=module', '-e', `
    const before = process.listenerCount('SIGINT');
    await import(${JSON.stringify(pathToFileURL(fixture).href)});
    if (process.listenerCount('SIGINT') !== before) process.exit(3);
  `], { timeout: 5000 });
  const result = await pending;
  assert.equal(result.stdout, '');
});


test('real startHost spawn guard aborts its synthetic executable before readiness', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-spawn-guard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'workspace'));
  await mkdir(join(root, 'apps/cli/lib'), { recursive: true });
  await writeFile(join(root, 'apps/cli/lib/bin.js'), 'setInterval(()=>{},200)');
  const controller = new AbortController();
  let pid;
  try {
    await assert.rejects(startHost({ root, upstream: root, patches: [], modelOrigin: 'http://127.0.0.1:1',
      generation: 1, signal: controller.signal, onSpawn(child) { pid = child.pid; controller.abort(); } }), /OWNED_HOST_EXIT/);
    assert.ok(pid);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal(await readFile(join(root, 'host-1.stdout.log'), 'utf8'), '');
  } finally { killIfAlive(pid); }
});

test('a swallowed stop error in context still makes cancellation cleanup fail', async () => {
  const signals = createTrialSignals();
  const result = await runCancellableSequence({ scenarios: ['only'], signals,
    runOne: async (scenario, ctx) => { ctx.cleanupErrors.push('STOP_FAILED'); handleTrialSignal(signals, 'SIGINT'); return { scenario, status: 'FAIL' }; },
    cleanup: async () => ({ errors: [] }),
  });
  assert.equal(result.overall, 'FAIL');
  assert.equal(result.cleanup_failed, true);
  assert.deepEqual(result.runs[0].cleanup_errors, ['STOP_FAILED']);
});
