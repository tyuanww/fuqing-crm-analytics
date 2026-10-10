#!/usr/bin/env node
/** One-plugin update drill. Reuses the pinned host, packer and save store.

 * It does not write the release journal, rebuild DSH, prepare the SDK, or
 * start a packaged CRM/knowledge service. Evidence stays in the caller output.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, rename, symlink, rm, lstat, readdir } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA, NODE_MAJOR, PNPM_VERSION } from '../release/toolchain.mjs';
import { prepareProfile } from '../crm-calibration/prepare-profile.mjs';
import { startHost } from './pinned-host-acceptance.mjs';
import { stopOwnedChild } from './html-host-browser-cleanup.mjs';
import { reapOwnedPosixGroup } from './shell-tool-contract.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const observer = fileURLToPath(new URL('./pinned-host-observer.mjs', import.meta.url));
const unpacker = fileURLToPath(new URL('../release/secure-unpack.py', import.meta.url));
const exec = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const PRIVATE = { mode: 0o600 };
export const PROTECTED_PORTS = Object.freeze([6677, 8000, 15173, 17687, 18090, 18091, 18092, 18093]);
export const FIXED = Object.freeze({
  oldCrm: { sha256: '4be76b81f374b4cf354d783bb11c49bbe09df468b8c398186184f7066a11c968', bytes: 233968, sourceSha: '1737adc3cffeb9db5fbbcee222fb044526324d40' },
  knowledge: { sha256: 'fb1b4d9e1e626d8ba858bb0ea849d022eed29a3e5385da5a884a0397be96d7a0', bytes: 14461, sourceSha: '1737adc3cffeb9db5fbbcee222fb044526324d40' },
  metricsService: { sha256: '8d56709bfa6846d18fab594f19242c07d7f69ae2fc457af34caa97150ad9d323', bytes: 48761 },
  knowledgeService: { sha256: '2bc2ec7a28ebee4a73755b11b554700b091fa7bf21e55cdca9fc3e38f3221579', bytes: 49484 },
  cli: { sha256: '935e95d05f4dc70a8a013eea59da80028946b5c139e45c6351dcaf2810ca00a1', bytes: 11237 },
});
export const SCENARIOS = Object.freeze([
  '01-controlled-update',
  '02-same-digest-replay',
  '03-interrupt-before-ready',
  '04-digest-mismatch-restore',
  '05-host-restart-required',
  '06-inflight-kill-wal',
  '07-save-unknown-replay',
  '08-prepare-reject-restore-old',
  '09-native-fallback-then-new',
  '10-profile-rollback-keeps-data',
]);
/** Exact outcome required for each scenario. Any other status, including a non-FAIL label, fails the drill. */
export const EXPECTED_OUTCOMES = Object.freeze({
  '01-controlled-update': 'PASS',
  '02-same-digest-replay': 'PASS',
  '03-interrupt-before-ready': 'UNKNOWN_RECOVERED',
  '04-digest-mismatch-restore': 'REJECTED_OLD_RETAINED',
  '05-host-restart-required': 'HOST_RESTART_REQUIRED_THEN_PASS',
  '06-inflight-kill-wal': 'WAL_PREFIX_RECOVERED',
  '07-save-unknown-replay': 'UNKNOWN_REPLAYED',
  '08-prepare-reject-restore-old': 'FAILED_OLD_RESTORED',
  '09-native-fallback-then-new': 'PASS',
  '10-profile-rollback-keeps-data': 'PASS',
});
export const SCENARIO_COVERAGE = Object.freeze({
  '08-prepare-reject-restore-old': Object.freeze({
    historical_scenario_id: '08-load-failure-restore-old',
    proves: 'PREPARE_STAGE_REJECTION_AND_OLD_COMPOSITION_RESTORE',
    does_not_prove: Object.freeze([
      'RUNTIME_PLUGIN_LOAD_FAILURE_AFTER_HOST_START',
      'CRASH_ISOLATION_AFTER_HOST_LOAD',
    ]),
  }),
});
const TOOL_ENV = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  GIT_NO_REPLACE_OBJECTS: '1',
});

const SAVE_PROGRAM = String.raw`
import json, os, signal, sys
from pathlib import Path
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
from backend.services.analytics.first_purchase import saved
from backend.services.analytics.first_purchase.source import resolve_trusted_first_purchase_source
from backend.services.analytics.jobs import RunStore
from backend.tests.analytics_run_support import profile
from backend.tests.test_analytics_first_purchase_analysis import analysis_counts, private_dir, succeed_first_purchase

directory, operation, key, title, run_id = sys.argv[1:]
root = Path(directory)
if operation == "seed-run":
    _store, _runtime, run = succeed_first_purchase(root)
    private_dir(root, "analyses")
    print(json.dumps({"run_id": run.run_id}), flush=True)
    raise SystemExit(0)
actor = AnalyticsPrincipal("synthetic-demo", frozenset({"analysis:save", "analysis:read", "run:read"}), frozenset({"first-purchase-fixture"}))
runs = RunStore(root / "state", profile(), family="first_purchase")
analyses = saved.FirstPurchaseSavedAnalysisStore(root / "analyses")
if operation == "counts":
    print(json.dumps({"counts": analysis_counts(analyses), "db": str(analyses.path)}), flush=True)
    raise SystemExit(0)
try:
    source = resolve_trusted_first_purchase_source(runs, actor, run_id)
    if operation == "crash-before-commit":
        original = saved.remember
        def remember_and_crash(*args, **kwargs):
            original(*args, **kwargs)
            os.kill(os.getpid(), signal.SIGKILL)
        saved.remember = remember_and_crash
    result = analyses.save_from_trusted_source(actor, key, title=title, visual_spec=None, trusted=source)
    if operation == "crash-after-commit":
        os.kill(os.getpid(), signal.SIGKILL)
    body = result.as_dict()
    print(json.dumps({"status": "SAVED", "analysis_id": body["analysis_id"], "body": body, "counts": analysis_counts(analyses)}), flush=True)
except AnalyticsError as error:
    print(json.dumps({"status": error.status, "code": error.code, "counts": analysis_counts(analyses)}), flush=True)
`;

function absolute(value, code) {
  assert.equal(typeof value, 'string', code);
  assert.ok(isAbsolute(value) && !value.includes('\0'), code);
  return resolve(value);
}
async function readExact(path, expected, code) {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink(), code);
  const bytes = await readFile(path);
  assert.equal(bytes.length, expected.bytes, code);
  assert.equal(sha(bytes), expected.sha256, code);
  return bytes;
}
export async function validateTrialInputs(options) {
  const upstream = absolute(options.upstream, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED');
  const output = absolute(options.output, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED');
  const python = absolute(options.python, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED');
  const paths = {
    oldCrm: absolute(options.oldCrm, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED'),
    knowledge: absolute(options.knowledge, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED'),
    metricsService: absolute(options.metricsService, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED'),
    knowledgeService: absolute(options.knowledgeService, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED'),
    sdkReceipt: absolute(options.sdkReceipt, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED'),
  };
  assert.equal(Number(process.versions.node.split('.')[0]), NODE_MAJOR, 'PLUGIN_UPDATE_NODE_VERSION');
  const git = async (cwd, args) => (await exec('git', args, { cwd, timeout: 15000, maxBuffer: 1024 * 1024, env: TOOL_ENV })).stdout.trim();
  assert.equal(await git(upstream, ['rev-parse', 'HEAD']), DSH_UPSTREAM_SHA, 'PLUGIN_UPDATE_UPSTREAM_SHA');
  assert.equal(await git(upstream, ['status', '--porcelain', '-uno']), '', 'PLUGIN_UPDATE_UPSTREAM_DIRTY');
  const cli = JSON.parse(await readFile(join(upstream, 'apps/cli/package.json'), 'utf8'));
  assert.equal(cli.version, DSH_SDK_VERSION, 'PLUGIN_UPDATE_DSH_VERSION');
  await readExact(join(upstream, 'apps/cli/lib/bin.js'), FIXED.cli, 'PLUGIN_UPDATE_CLI_DIGEST');
  await readExact(paths.oldCrm, FIXED.oldCrm, 'PLUGIN_UPDATE_OLD_CRM_DIGEST');
  await readExact(paths.knowledge, FIXED.knowledge, 'PLUGIN_UPDATE_KNOWLEDGE_DIGEST');
  await readExact(paths.metricsService, FIXED.metricsService, 'PLUGIN_UPDATE_METRICS_SERVICE_DIGEST');
  await readExact(paths.knowledgeService, FIXED.knowledgeService, 'PLUGIN_UPDATE_KNOWLEDGE_SERVICE_DIGEST');
  const receiptBytes = await readFile(paths.sdkReceipt);
  const sdk = JSON.parse(receiptBytes.toString('utf8'));
  assert.equal(sdk.upstream_sha, DSH_UPSTREAM_SHA, 'PLUGIN_UPDATE_SDK_PIN');
  assert.equal(sdk.status, 'LOCAL_READY', 'PLUGIN_UPDATE_SDK_RECEIPT');
  assert.equal(sdk.supply_chain, 'NOT_VERIFIED', 'PLUGIN_UPDATE_SDK_SUPPLY_CHAIN');
  assert.notEqual(sdk.release_ready, true, 'PLUGIN_UPDATE_SDK_RELEASE_READY');
  const sourceSha = await git(repository, ['rev-parse', 'HEAD']);
  return { upstream, output, python, paths, sdk, sdkReceiptSha256: sha(receiptBytes), sourceSha,
    dsh: { version: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA, cli_sha256: FIXED.cli.sha256 } };
}

async function listeners(port) {
  const result = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { timeout: 5000, env: TOOL_ENV }).catch(error => {
    if (error.code === 1) return { stdout: '' };
    throw error;
  });
  return result.stdout.split('\n').filter(line => line.startsWith('p')).map(line => Number(line.slice(1)));
}
async function protectedSnapshot() {
  const rows = {};
  for (const port of PROTECTED_PORTS) rows[port] = await listeners(port);
  return rows;
}
function samePids(before, after) {
  for (const port of PROTECTED_PORTS) assert.deepEqual(after[port], before[port], `PLUGIN_UPDATE_PROTECTED_PORT_${port}`);
}
async function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function modelFixture() {
  const requests = [];
  let interruptTurn = true;
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/messages') { res.writeHead(404); res.end(); return; }
    let bytes = 0, body = '';
    req.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) req.destroy(); else body += chunk; });
    req.on('end', () => {
      try {
        const input = JSON.parse(body);
        const interrupted = JSON.stringify(input.messages?.findLast(row => row.role === 'user')?.content ?? '').includes('HANG_OWNED');
        const hang = interruptTurn && interrupted;
        requests.push({ path: req.url, hang });
        if (hang) return;
        const events = [
          { type: 'message_start', message: { id: 'owned-fixture', model: 'deepseek-v4-flash', usage: { input_tokens: 3, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'SYNTHETIC_NATIVE_OK' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
          { type: 'message_stop' },
        ];
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
      } catch { res.writeHead(400); res.end(); }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  assert.ok(!PROTECTED_PORTS.includes(port), 'PLUGIN_UPDATE_MODEL_PORT');
  return { origin: `http://127.0.0.1:${port}`, port, requests, recover: () => { interruptTurn = false; },
    close: () => new Promise(done => { server.closeAllConnections(); server.close(done); }) };
}

export function redactText(value, roots = []) {
  let text = String(value ?? '');
  for (const root of roots) if (root) text = text.split(root).join('[owned]');
  return text
    .replace(/((?:^|[?&\s])(?:token|access_token|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, '[REDACTED]')
    .replace(/(authorization:\s*)[^\n]+/gi, '$1[REDACTED]');
}
export function aggregateTrial(runs) {
  if (!Array.isArray(runs) || runs.length !== SCENARIOS.length) return 'FAIL';
  for (let index = 0; index < SCENARIOS.length; index += 1) {
    const run = runs[index];
    if (run?.scenario !== SCENARIOS[index]) return 'FAIL';
    if (run.status !== EXPECTED_OUTCOMES[run.scenario]) return 'FAIL';
  }
  return 'PASS';
}
export function abortedError() {
  const error = Error('PLUGIN_UPDATE_INTERRUPTED');
  error.code = 'PLUGIN_UPDATE_INTERRUPTED';
  return error;
}
export function createTrialSignals() {
  return { aborted: false, signal: null, ctx: null, currentAbort: null, run: new AbortController(), signaled: [], cleanupErrors: [] };
}
export function trialCancelled(state) {
  return Boolean(state && (state.aborted || state.run?.signal.aborted));
}
export function assertTrialActive(state) {
  if (trialCancelled(state)) throw abortedError();
}
export function forwardAbort(parent, controller) {
  if (!parent) return () => {};
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(parent.reason ?? abortedError());
  };
  if (parent.aborted) abort();
  else parent.addEventListener('abort', abort, { once: true });
  return () => parent.removeEventListener('abort', abort);
}
function trackChild(ctx, child) {
  if (!child) return;
  ctx.children?.add(child);
  if (child.pid) ctx.owned?.add(child.pid);
  const forget = () => {
    ctx.children?.delete(child);
    if (child.pid) ctx.owned?.delete(child.pid);
  };
  if (child.exitCode !== null || child.signalCode !== null) forget();
  else child.once('exit', forget);
}
export function runOwnedProcessGroup(file, args, options = {}) {
  assert.notEqual(process.platform, 'win32', 'PLUGIN_UPDATE_POSIX_REQUIRED');
  options.signal?.throwIfAborted();
  const child = spawn(file, args, { cwd: options.cwd, env: options.env, detached: true,
    stdio: ['ignore', 'pipe', 'pipe'] });
  let failure, stdout = '', stderr = '', bytes = 0, cleanup;
  // execFile does not forward detached; spawn explicitly owns the process group.
  const reap = () => cleanup ??= (child.pid ? reapOwnedPosixGroup(child.pid) : Promise.resolve())
    .then(() => null, error => error);
  const stop = error => { failure ??= error; void reap(); };
  const abort = () => stop(options.signal.reason ?? abortedError());
  const timer = setTimeout(() => stop(Error('PLUGIN_UPDATE_COMMAND_TIMEOUT')), options.timeout ?? 30000);
  const capture = (chunk, stream) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > (options.maxBuffer ?? 1024 * 1024)) { stop(Error('PLUGIN_UPDATE_COMMAND_OUTPUT_LIMIT')); return; }
    if (stream === 'stdout') stdout += chunk; else stderr += chunk;
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => capture(chunk, 'stdout'));
  child.stderr.on('data', chunk => capture(chunk, 'stderr'));
  child.once('exit', () => { void reap(); });
  const pending = new Promise((resolve, reject) => {
    child.once('error', error => { failure ??= error; });
    child.once('close', async (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      const cleanupError = await reap();
      const error = cleanupError ?? failure ?? (code !== 0 ? Error(`PLUGIN_UPDATE_COMMAND_EXIT_${code ?? signal}`) : null);
      if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); }
      else resolve({ stdout, stderr });
    });
  });
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  pending.child = child;
  return pending;
}
export function runOwnedCommand(ctx, file, args, options = {}) {
  assertTrialActive(ctx?.cancellation);
  const signal = ctx?.cancellation?.run?.signal;
  const commandOptions = { ...options };
  if (signal && !signal.aborted) commandOptions.signal = signal;
  const pending = exec(file, args, commandOptions);
  trackChild(ctx, pending.child);
  return pending;
}
export async function startOwnedHost(ctx, start) {
  assertTrialActive(ctx.cancellation);
  const controller = new AbortController();
  const unbindRun = forwardAbort(ctx.cancellation?.run?.signal, controller);
  const unbindLocal = forwardAbort(ctx.runSignal?.signal, controller);
  const unbind = () => { unbindRun(); unbindLocal(); };
  if (controller.signal.aborted) { unbind(); throw abortedError(); }
  ctx.currentAbort = controller;
  ctx.hostStarts = (ctx.hostStarts ?? 0) + 1;
  try {
    const result = await start({ signal: controller.signal });
    return { result, unbind };
  } catch (error) {
    unbind();
    throw error;
  }
}
export async function reapTrialChildren(ctx, { termMs = 400, killMs = 1000 } = {}) {
  const errors = [];
  const results = [];
  for (const child of [...(ctx.children ?? [])]) {
    try {
      const exit = typeof child.once === 'function' && child.exitCode === null && child.signalCode === null
        ? once(child, 'exit').then(([code, signal]) => ({ code, signal }))
        : Promise.resolve({ code: child.exitCode ?? null, signal: child.signalCode ?? null });
      const receipt = await stopOwnedChild({ child, exit, termMs, killMs });
      results.push({ pid: receipt.pid, term_sent: receipt.term_sent, kill_sent: receipt.kill_sent, remaining: receipt.remaining, exit: receipt.exit ?? null });
      if (receipt.remaining || receipt.errors?.length) errors.push(...(receipt.errors?.length ? receipt.errors : ['PLUGIN_UPDATE_CLEANUP_FAILED']));
    } catch (error) {
      errors.push(redactText(error.message));
      if (child.pid) {
        try { process.kill(child.pid, 'SIGKILL'); } catch (killError) {
          if (killError.code !== 'ESRCH') errors.push(redactText(killError.message));
        }
      }
    }
  }
  for (const pid of [...(ctx.owned ?? [])]) {
    if (!(await alive(pid))) continue;
    try { process.kill(pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') errors.push(redactText(error.message));
    }
    const until = Date.now() + termMs;
    while (await alive(pid) && Date.now() < until) await delay(20);
    if (await alive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') errors.push(redactText(error.message));
      }
      const killUntil = Date.now() + killMs;
      while (await alive(pid) && Date.now() < killUntil) await delay(20);
    }
    if (await alive(pid)) errors.push(`PLUGIN_UPDATE_OWNED_PID_REMAINS ${pid}`);
  }
  return { results, errors };
}
export async function runCancellableSequence({ scenarios, signals, runOne, cleanup, persistRecord, between, afterAll }) {
  if (!signals.run) signals.run = new AbortController();
  const runs = [];
  const notStarted = [];
  let cleanupFailed = false;
  for (let index = 0; index < scenarios.length; index += 1) {
    const rest = () => scenarios.slice(index).map(scenario => ({ scenario, status: 'NOT_RUN' }));
    if (trialCancelled(signals)) { notStarted.push(...rest()); break; }
    if (between) await between(scenarios[index]);
    if (trialCancelled(signals)) { notStarted.push(...rest()); break; }
    const local = new AbortController();
    const unbind = forwardAbort(signals.run.signal, local);
    const ctx = {
      scenario: scenarios[index], owned: new Set(), children: new Set(), runSignal: local,
      currentAbort: null, cancellation: signals, hostStarts: 0, cleanupErrors: [],
    };
    signals.ctx = ctx;
    let record;
    try {
      record = await runOne(scenarios[index], ctx);
    } catch (error) {
      record = {
        scenario: scenarios[index],
        status: error.code === 'PLUGIN_UPDATE_CLEANUP_FAILED' ? 'FAIL' : (trialCancelled(signals) ? 'INTERRUPTED' : 'FAIL'),
        error: redactText(error.message),
      };
    }
    let cleaned = { errors: [] };
    try {
      cleaned = await cleanup(ctx, record) ?? { errors: [] };
    } catch (error) {
      cleaned = { errors: [redactText(error.message)] };
    } finally {
      unbind();
      signals.ctx = null;
    }
    if (!record) record = { scenario: scenarios[index], status: 'FAIL', error: 'PLUGIN_UPDATE_MISSING_RECORD' };
    cleaned.errors = [...(ctx.cleanupErrors ?? []), ...(cleaned.errors ?? [])];
    if (cleaned.reaped) record.reaped = cleaned.reaped.results;
    if (cleaned.errors?.length) {
      cleanupFailed = true;
      record.status = 'FAIL';
      record.cleanup_errors = cleaned.errors;
      record.error = record.error ?? 'PLUGIN_UPDATE_CLEANUP_FAILED';
    }
    // Persist only after cleanup has supplied the final outcome and receipts.
    // A write failure must fail the run, never leave a dangling summary link.
    if (persistRecord) await persistRecord(record, ctx);
    runs.push(record);
  }
  if (afterAll) await afterAll({ runs, notStarted });
  const interrupted = trialCancelled(signals);
  const overall = cleanupFailed ? 'FAIL' : (interrupted ? 'INTERRUPTED' : aggregateTrial(runs));
  return { runs, not_started: notStarted, overall, interrupt: signals.signal ?? null, cleanup_failed: cleanupFailed };
}
export async function persistTrialRecord(output, record) {
  assert.ok(SCENARIOS.includes(record.scenario), 'PLUGIN_UPDATE_SCENARIO');
  const directory = join(output, 'runs', record.scenario);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, 'record.tmp');
  await writeFile(temporary, json(record), PRIVATE);
  await rename(temporary, join(directory, 'record.json'));
}

export function applyTrialCancellation(summary, signals) {
  if (trialCancelled(signals)) {
    summary.interrupt = signals.signal ?? 'ABORTED';
    if (summary.overall !== 'FAIL') summary.overall = 'INTERRUPTED';
  }
  return summary;
}

export async function finalizeTrialReport({ output, summary, signals, inspectProtected = protectedSnapshot,
  writeReceipt = writeFile }) {
  summary.protected_ports = { before: summary.protected_ports.before, after: await inspectProtected() };
  samePids(summary.protected_ports.before, summary.protected_ports.after);
  summary.finished_at = new Date().toISOString();
  // Cancellation is monotonic. If it arrives during either write or rename,
  // replace the receipt with INTERRUPTED before returning to the CLI.
  for (;;) {
    applyTrialCancellation(summary, signals);
    const observedInterrupt = summary.interrupt;
    const temporary = join(output, 'summary.tmp');
    await writeReceipt(temporary, json(summary), PRIVATE);
    await rename(temporary, join(output, 'summary.json'));
    applyTrialCancellation(summary, signals);
    if (observedInterrupt === summary.interrupt) return summary;
  }
}
export function handleTrialSignal(state, signal) {
  assert.ok(signal === 'SIGINT' || signal === 'SIGTERM', 'PLUGIN_UPDATE_SIGNAL');
  if (state.signal) return state;
  state.signal = signal;
  state.aborted = true;
  const reason = abortedError();
  if (state.run && !state.run.signal.aborted) state.run.abort(reason);
  state.ctx?.runSignal?.abort(reason);
  state.ctx?.currentAbort?.abort(reason);
  state.currentAbort?.abort(reason);
  state.signaled = [];
  for (const child of state.ctx?.children ?? []) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM'); state.signaled.push(child.pid); }
      catch (error) { state.signaled.push({ pid: child.pid, error: error.code ?? 'UNAVAILABLE' }); }
    }
  }
  for (const pid of state.ctx?.owned ?? []) {
    if (state.signaled.includes(pid)) continue;
    try { process.kill(pid, 'SIGTERM'); state.signaled.push(pid); }
    catch (error) { state.signaled.push({ pid, error: error.code ?? 'UNAVAILABLE' }); }
  }
  return state;
}
export async function assertFreshOutput(output) {
  const target = absolute(output, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED');
  const info = await lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (info === null) return target;
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'PLUGIN_UPDATE_OUTPUT_EXISTS');
  assert.deepEqual(await readdir(target), [], 'PLUGIN_UPDATE_OUTPUT_EXISTS');
  return target;
}
function unpackEnv(ctx) {
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    HOME: join(ctx.root, 'home'),
    TMPDIR: join(ctx.root, 'tmp'),
  };
}
export async function installPackage(ctx, archive, destination, upstream, expected) {
  assertTrialActive(ctx.cancellation);
  await readExact(archive, expected, 'PLUGIN_UPDATE_ARCHIVE_DIGEST');
  assertTrialActive(ctx.cancellation);
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await runOwnedCommand(ctx, ctx.python, [unpacker, archive, destination, '--max-entries', '100', '--max-bytes', '8388608'], {
    cwd: dirname(destination), env: unpackEnv(ctx), timeout: 30000,
  });
  const packageDir = join(destination, 'package');
  const link = join(packageDir, 'node_modules');
  if (!(await lstat(link).catch(() => null))) await symlink(join(upstream, 'apps/cli/node_modules'), link, 'dir');
  return packageDir;
}

async function fileSha(path) {
  return sha(await readFile(path));
}

function pythonEnv(ctx) {
  return { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', PYTHONPATH: repository, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    HOME: join(ctx.root, 'home'), TMPDIR: join(ctx.root, 'tmp') };
}
function python(ctx, args) {
  return runOwnedCommand(ctx, ctx.python, ['-B', '-c', SAVE_PROGRAM, ...args], {
    cwd: repository, env: pythonEnv(ctx), timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  });
}
async function seedSave(ctx) {
  const seeded = JSON.parse((await python(ctx, [ctx.data, 'seed-run', 'plugin-update-stable', 'synthetic', ''])).stdout);
  const saved = JSON.parse((await python(ctx, [ctx.data, 'save', 'plugin-update-stable', 'synthetic baseline', seeded.run_id])).stdout);
  assert.equal(saved.status, 'SAVED', 'PLUGIN_UPDATE_SAVE_SEED');
  assert.equal(saved.counts.analyses, 1, 'PLUGIN_UPDATE_SAVE_SEED_COUNT');
  assert.ok(saved.counts.idempotency >= 1, 'PLUGIN_UPDATE_SAVE_SEED_RECEIPT');
  const replay = JSON.parse((await python(ctx, [ctx.data, 'save', 'plugin-update-stable', 'synthetic baseline', seeded.run_id])).stdout);
  assert.equal(replay.analysis_id, saved.analysis_id, 'PLUGIN_UPDATE_SAVE_SEED_REPLAY');
  assert.deepEqual(replay.counts, saved.counts, 'PLUGIN_UPDATE_SAVE_SEED_REPLAY_COUNT');
  const counts = JSON.parse((await python(ctx, [ctx.data, 'counts', 'x', 'x', seeded.run_id])).stdout);
  assert.deepEqual(counts.counts, saved.counts, 'PLUGIN_UPDATE_SAVE_SEED_COUNT_DRIFT');
  return { run_id: seeded.run_id, analysis_id: saved.analysis_id, counts: counts.counts,
    idempotency_per_save: saved.counts.idempotency, db_sha256: await fileSha(counts.db) };
}
async function saveState(ctx, runId) {
  const counts = JSON.parse((await python(ctx, [ctx.data, 'counts', 'x', 'x', runId])).stdout);
  return { counts: counts.counts, db_sha256: await fileSha(counts.db) };
}

async function writePointer(root, pointer) {
  const next = join(root, 'active-profile.json');
  const tmp = join(root, 'active-profile.tmp');
  await writeFile(tmp, json(pointer), PRIVATE);
  await rename(tmp, next);
  return sha(await readFile(next));
}
async function readPointer(root) {
  return JSON.parse(await readFile(join(root, 'active-profile.json'), 'utf8'));
}

async function makePatches(ctx, assets, mode) {
  const generation = ++ctx.generation;
  const syntheticHost = join(ctx.root, `host-synthetic-${generation}.patch.yml`);
  const hostPatch = JSON.parse(await readFile(join(assets, 'host.patch.yml'), 'utf8'));
  for (const row of hostPatch.flatMap(patch => patch.insert ?? [])) row.config = { baseUrl: ctx.model.origin, dataKind: 'synthetic' };
  await writeFile(syntheticHost, json(hostPatch), PRIVATE);
  const common = join(ctx.root, `observer-${generation}.patch.yml`);
  await writeFile(common, json([
    { id: 'session-log-deepseek', disabled: true }, { id: 'plugin-package-inventory-deepseek', disabled: true }, { id: 'hmr', disabled: true },
    { insert: [{ id: 'owned-host-observer', name: pathToFileURL(observer).href, config: { presetId: 'crm-knowledge', workspace: join(ctx.root, 'workspace'),
      llmModule: pathToFileURL(join(ctx.upstream, 'packages/llm/llm/lib/index.js')).href } }] },
  ]), PRIVATE);
  let preset = join(assets, 'preset.patch.yml');
  if (mode === 'native') {
    preset = join(ctx.root, `native-${generation}.patch.yml`);
    const declaration = JSON.parse(await readFile(join(assets, 'preset.patch.yml'), 'utf8'));
    const row = declaration.flatMap(patch => patch.insert ?? []).find(item => item.config?.id === 'crm-knowledge');
    assert.ok(row, 'PLUGIN_UPDATE_PRESET_REQUIRED');
    await writeFile(preset, json([{ insert: [{ ...row, config: { ...row.config, plugins: row.config.plugins.filter(plugin => plugin.name === '@deepseek-ai/dsh-persona') } }] }]), PRIVATE);
    // Native fallback drops the CRM host plugin as well as the business preset rows.
    return { patches: [preset, common], generation };
  }
  return { patches: [syntheticHost, preset, common], generation };
}

async function launch(ctx, assets, mode) {
  assertTrialActive(ctx.cancellation);
  const spec = await makePatches(ctx, assets, mode);
  const started = Date.now();
  let host = null;
  let unbind = () => {};
  try {
    const startedHost = await startOwnedHost(ctx, ({ signal }) => startHost({
      root: ctx.root, upstream: ctx.upstream, patches: spec.patches, modelOrigin: ctx.model.origin,
      generation: spec.generation, signal, onSpawn: child => trackChild(ctx, child),
    }));
    host = startedHost.result;
    unbind = startedHost.unbind;
    ctx.owned.add(host.pid);
    const access = await host.request('web-access');
    const port = Number(new URL(access.origin).port);
    assert.ok(!PROTECTED_PORTS.includes(port), 'PLUGIN_UPDATE_PROTECTED_PORT');
    const listenersNow = await listeners(port);
    assert.deepEqual(listenersNow, [host.pid], 'PLUGIN_UPDATE_PORT_OWNER');
    return { host, port, pid: host.pid, ready_ms: Date.now() - started, patches: spec.patches, unbind };
  } catch (error) {
    unbind();
    if (host) {
      try { await host.stop(true); assert.equal(await alive(host.pid), false, 'PLUGIN_UPDATE_PID_STILL_ALIVE'); ctx.owned.delete(host.pid); }
      catch (stopError) {
        ctx.cleanupErrors = [...(ctx.cleanupErrors ?? []), redactText(stopError.message, [ctx.root])];
        const failure = Error('PLUGIN_UPDATE_CLEANUP_FAILED');
        failure.code = 'PLUGIN_UPDATE_CLEANUP_FAILED';
        failure.cause = stopError;
        throw failure;
      }
    }
    throw error;
  }
}
export async function stopHost(ctx, launched, force = false) {
  if (!launched) return null;
  launched.unbind();
  const started = Date.now();
  const result = await launched.host.stop(force);
  assert.equal(await alive(launched.pid), false, 'PLUGIN_UPDATE_PID_STILL_ALIVE');
  assert.deepEqual(await listeners(launched.port), [], 'PLUGIN_UPDATE_PORT_STILL_BOUND');
  ctx.owned.delete(launched.pid);
  return { ...result, stop_ms: Date.now() - started };
}

async function prepare(ctx, crmDir, knowledgeDir) {
  const assets = join(ctx.root, `assets-${++ctx.assetSeq}`);
  await prepareProfile({ output: assets, plugin: crmDir, knowledgePlugin: knowledgeDir });
  return assets;
}

async function openSession(ctx, crmDir, knowledgeDir, text, mode = 'full') {
  const assets = await prepare(ctx, crmDir, knowledgeDir);
  const launched = await launch(ctx, assets, mode);
  try {
    const tools = await launched.host.request('tools', { sessionId: ctx.sessionId, resume: ctx.resume });
    const prompt = await launched.host.request('prompt', { sessionId: ctx.sessionId, text, prefix: ctx.prefixCount || undefined });
    if (ctx.prefixDigest) assert.equal(prompt.prefix_digest, ctx.prefixDigest, 'PLUGIN_UPDATE_WAL_PREFIX_CHANGED');
    else { ctx.prefixCount = prompt.count; ctx.prefixDigest = prompt.digest; }
    ctx.resume = true;
    const hostJs = await fileSha(join(crmDir, 'lib/host.js')).catch(() => null);
    const knowledgeJs = await fileSha(join(knowledgeDir, 'lib/index.js'));
    return { launched, tools, prompt, assets, host_js_sha256: hostJs, knowledge_js_sha256: knowledgeJs };
  } catch (error) {
    if (launched) {
      try { await stopHost(ctx, launched, true); }
      catch (stopError) {
        ctx.cleanupErrors = [...(ctx.cleanupErrors ?? []), redactText(stopError.message, [ctx.root])];
      }
    }
    if (ctx.cleanupErrors?.length) {
      const failure = Error('PLUGIN_UPDATE_CLEANUP_FAILED');
      failure.code = 'PLUGIN_UPDATE_CLEANUP_FAILED';
      failure.cause = error;
      throw failure;
    }
    throw error;
  }
}

async function componentStamp(ctx) {
  return {
    dsh: ctx.identity.dsh,
    sdk_receipt_sha256: ctx.identity.sdkReceiptSha256,
    sdk_status: ctx.identity.sdk.status,
    sdk_supply_chain: ctx.identity.sdk.supply_chain,
    old_crm_sha256: FIXED.oldCrm.sha256,
    knowledge_plugin_sha256: FIXED.knowledge.sha256,
    new_crm_sha256: ctx.newPack.tarball.sha256,
    new_crm_source_sha: ctx.newPack.source_sha,
    metrics_service_sha256: sha(await readFile(ctx.identity.paths.metricsService)),
    knowledge_service_sha256: sha(await readFile(ctx.identity.paths.knowledgeService)),
  };
}

function baseRecord(ctx, scenario) {
  return { schema: 'shinemage-plugin-update-run/v1', scenario, started_at: new Date().toISOString(),
    source_sha: ctx.identity.sourceSha, distribution: { local_drill: 'CONTROLLED_SYNTHETIC', sdk_distribution: 'BLOCKED', release_ready: false, production: 'NOT_PERFORMED' },
    timings_ms: {}, owned_pids: [], notes: [] };
}

async function finishRecord(ctx, record, launched) {
  if (launched) {
    const stopped = await stopHost(ctx, launched, true).catch(error => {
      const message = redactText(error.message, [ctx.root]);
      ctx.cleanupErrors.push(message);
      record.status = 'FAIL';
      record.cleanup_errors = [...ctx.cleanupErrors];
      return { error: message };
    });
    record.final_stop = stopped;
  }
  record.components_after = await componentStamp(ctx);
  if (record.components_before) {
    const fixedKeys = ['dsh', 'sdk_receipt_sha256', 'old_crm_sha256', 'knowledge_plugin_sha256', 'new_crm_sha256', 'metrics_service_sha256', 'knowledge_service_sha256'];
    record.fixed_components_unchanged = fixedKeys.every(key => JSON.stringify(record.components_before[key]) === JSON.stringify(record.components_after[key]));
    assert.equal(record.fixed_components_unchanged, true, 'PLUGIN_UPDATE_FIXED_COMPONENT_CHANGED');
  }
  record.protected_ports_after = await protectedSnapshot();
  const leaked = [];
  for (const pid of ctx.owned) if (await alive(pid)) leaked.push(pid);
  if (leaked.length) {
    record.reaped_owned_pids = leaked;
    for (const pid of leaked) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
    await delay(50);
    record.status = 'FAIL';
    record.error = record.error ?? 'PLUGIN_UPDATE_OWNED_PID_LEAK';
  }
  record.owned_pids_alive = [];
  for (const pid of ctx.owned) if (await alive(pid)) record.owned_pids_alive.push(pid);
  record.elapsed_ms = Date.now() - Date.parse(record.started_at);
  record.finished_at = new Date().toISOString();
  samePids(ctx.protected, record.protected_ports_after);
  assert.equal(record.owned_pids_alive.length, 0, 'PLUGIN_UPDATE_OWNED_PID_LEAK');
  return record;
}

async function runScenario(ctx, scenario) {
  const record = baseRecord(ctx, scenario);
  let launched = null;
  try {
    record.components_before = await componentStamp(ctx);
    ctx.save = record.save_before = await seedSave(ctx);
    const oldCrm = await installPackage(ctx, ctx.identity.paths.oldCrm, join(ctx.root, 'installed/old-crm'), ctx.upstream, FIXED.oldCrm);
    const knowledge = await installPackage(ctx, ctx.identity.paths.knowledge, join(ctx.root, 'installed/knowledge'), ctx.upstream, FIXED.knowledge);
    const freshCrm = await installPackage(ctx, ctx.newArchive, join(ctx.root, 'installed/new-crm'), ctx.upstream, { sha256: ctx.newPack.tarball.sha256, bytes: ctx.newPack.tarball.bytes });
    assert.notEqual(await fileSha(join(oldCrm, 'lib/host.js')), await fileSha(join(freshCrm, 'lib/host.js')), 'PLUGIN_UPDATE_PACKAGE_NOT_DIFFERENT');
    const opened = await openSession(ctx, oldCrm, knowledge, `baseline ${scenario}`);
    launched = opened.launched;
    record.owned_pids.push(launched.pid);
    record.baseline = { pid: launched.pid, port: launched.port, ready_ms: launched.ready_ms, tools: opened.tools, host_js_sha256: opened.host_js_sha256, knowledge_js_sha256: opened.knowledge_js_sha256, count: opened.prompt.count, digest: opened.prompt.digest };
    record.pointer_sha256 = await writePointer(ctx.root, { package_sha256: FIXED.oldCrm.sha256, role: 'old' });
    const stopStarted = Date.now();
    if (!['05-host-restart-required', '06-inflight-kill-wal'].includes(scenario)) {
      record.timings_ms.baseline_stop = (await stopHost(ctx, launched)).stop_ms;
      record.timings_ms.baseline_stop_wait = Date.now() - stopStarted;
      launched = null;
    }

    if (scenario === '01-controlled-update' || scenario === '10-profile-rollback-keeps-data') {
      const updateStarted = Date.now();
      const next = await openSession(ctx, freshCrm, knowledge, `updated ${scenario}`);
      record.timings_ms.update_and_restart = Date.now() - updateStarted;
      record.timings_ms.restart = next.launched.ready_ms;
      launched = next.launched;
      record.owned_pids.push(launched.pid);
      record.updated = { pid: launched.pid, port: launched.port, host_js_sha256: next.host_js_sha256, knowledge_js_sha256: next.knowledge_js_sha256, prefix_digest: next.prompt.prefix_digest, assistant_count: next.prompt.assistant.length };
      assert.equal(next.knowledge_js_sha256, record.baseline.knowledge_js_sha256, 'PLUGIN_UPDATE_KNOWLEDGE_CHANGED');
      assert.notEqual(next.host_js_sha256, record.baseline.host_js_sha256, 'PLUGIN_UPDATE_CRM_NOT_SWAPPED');
      record.pointer_sha256 = await writePointer(ctx.root, { package_sha256: ctx.newPack.tarball.sha256, role: 'new' });
      if (scenario === '10-profile-rollback-keeps-data') {
        await stopHost(ctx, launched);
        launched = null;
        const rollbackStarted = Date.now();
        const restored = await openSession(ctx, oldCrm, knowledge, `rolled back ${scenario}`);
        record.timings_ms.rollback = Date.now() - rollbackStarted;
        launched = restored.launched;
        record.owned_pids.push(launched.pid);
        record.restored = { host_js_sha256: restored.host_js_sha256, prefix_digest: restored.prompt.prefix_digest };
        assert.equal(restored.host_js_sha256, record.baseline.host_js_sha256, 'PLUGIN_UPDATE_ROLLBACK_PACKAGE');
        record.pointer_sha256 = await writePointer(ctx.root, { package_sha256: FIXED.oldCrm.sha256, role: 'old-restored' });
        record.profile_rollback_data_policy = 'PROFILE_POINTER_ONLY_DATA_RETAINED';
      }
      record.status = 'PASS';
    } else if (scenario === '02-same-digest-replay') {
      const first = await openSession(ctx, freshCrm, knowledge, `first new ${scenario}`);
      record.owned_pids.push(first.launched.pid);
      await stopHost(ctx, first.launched);
      const againDir = await installPackage(ctx, ctx.newArchive, join(ctx.root, 'installed/new-crm-again'), ctx.upstream, { sha256: ctx.newPack.tarball.sha256, bytes: ctx.newPack.tarball.bytes });
      assert.equal(await fileSha(join(againDir, 'lib/host.js')), await fileSha(join(freshCrm, 'lib/host.js')), 'PLUGIN_UPDATE_REPLAY_BYTES');
      const started = Date.now();
      const second = await openSession(ctx, againDir, knowledge, `same digest ${scenario}`);
      record.timings_ms.idempotent_restart = Date.now() - started;
      launched = second.launched;
      record.owned_pids.push(launched.pid);
      record.replay = { host_js_sha256: second.host_js_sha256, prefix_digest: second.prompt.prefix_digest };
      record.status = 'PASS';
    } else if (scenario === '03-interrupt-before-ready') {
      const assets = await prepare(ctx, freshCrm, knowledge);
      const spec = await makePatches(ctx, assets, 'full');
      const controller = new AbortController();
      ctx.currentAbort = controller;
      const started = Date.now();
      assertTrialActive(ctx.cancellation);
      const unbindRun = forwardAbort(ctx.cancellation?.run?.signal, controller);
      let failed = null;
      let interruptedHost = null;
      try {
        interruptedHost = await startHost({ root: ctx.root, upstream: ctx.upstream, patches: spec.patches, modelOrigin: ctx.model.origin, generation: spec.generation, signal: controller.signal,
          onSpawn: child => { trackChild(ctx, child); record.owned_pids.push(child.pid); controller.abort(abortedError()); } });
        failed = 'READY_BEFORE_INTERRUPT';
      } catch (error) { failed = error.message; }
      finally {
        unbindRun();
        if (interruptedHost) {
          ctx.owned.add(interruptedHost.pid);
          record.owned_pids.push(interruptedHost.pid);
          try {
            await interruptedHost.stop(true);
            assert.equal(await alive(interruptedHost.pid), false, 'PLUGIN_UPDATE_PID_STILL_ALIVE');
            ctx.owned.delete(interruptedHost.pid);
          } catch (error) { record.interrupt_stop_error = redactText(error.message, [ctx.root]); ctx.cleanupErrors.push(record.interrupt_stop_error); }
        }
      }
      record.timings_ms.interrupt = Date.now() - started;
      record.interrupt = { result: failed, spawned_ready: failed === 'READY_BEFORE_INTERRUPT', pointer: await readPointer(ctx.root) };
      assert.match(failed ?? '', /PLUGIN_UPDATE_INTERRUPTED|OWNED_HOST_EXIT|OWNED_HOST_START_TIMEOUT/, 'PLUGIN_UPDATE_INTERRUPT_MISSED');
      assert.equal(record.interrupt.pointer.package_sha256, FIXED.oldCrm.sha256, 'PLUGIN_UPDATE_POINTER_MOVED');
      const recoverStarted = Date.now();
      const restored = await openSession(ctx, oldCrm, knowledge, `recovered ${scenario}`);
      record.timings_ms.recovery = Date.now() - recoverStarted;
      launched = restored.launched;
      record.owned_pids.push(launched.pid);
      record.recovered = { prefix_digest: restored.prompt.prefix_digest, host_js_sha256: restored.host_js_sha256 };
      record.status = 'UNKNOWN_RECOVERED';
    } else if (scenario === '04-digest-mismatch-restore') {
      const tampered = join(ctx.root, 'tampered.tgz');
      const bytes = Buffer.from(await readFile(ctx.newArchive));
      bytes[bytes.length - 1] ^= 0xff;
      await writeFile(tampered, bytes, PRIVATE);
      const started = Date.now();
      await assert.rejects(readExact(tampered, { sha256: ctx.newPack.tarball.sha256, bytes: ctx.newPack.tarball.bytes }, 'PLUGIN_UPDATE_TAMPERED_DIGEST'), /PLUGIN_UPDATE_TAMPERED_DIGEST/);
      record.timings_ms.reject = Date.now() - started;
      record.rejected = { code: 'PLUGIN_UPDATE_TAMPERED_DIGEST', unpacked: false };
      const recoverStarted = Date.now();
      const restored = await openSession(ctx, oldCrm, knowledge, `after reject ${scenario}`);
      record.timings_ms.recovery = Date.now() - recoverStarted;
      launched = restored.launched;
      record.owned_pids.push(launched.pid);
      record.recovered = { prefix_digest: restored.prompt.prefix_digest, host_js_sha256: restored.host_js_sha256 };
      assert.equal((await readPointer(ctx.root)).package_sha256, FIXED.oldCrm.sha256, 'PLUGIN_UPDATE_POINTER_MOVED');
      record.status = 'REJECTED_OLD_RETAINED';
    } else if (scenario === '05-host-restart-required') {
      const retired = await launched.host.request('retire-preset', { sessionId: ctx.sessionId });
      record.in_process = { action: 'HOST_RESTART_REQUIRED', presets: retired.presets.map(row => row.id), live_tools_retained: retired.existing_tools.includes('crm_knowledge_explain') };
      assert.equal(record.in_process.live_tools_retained, true, 'PLUGIN_UPDATE_LIVE_TOOLS_DROPPED');
      assert.equal((await readPointer(ctx.root)).role, 'old', 'PLUGIN_UPDATE_IN_PROCESS_ACTIVATED');
      await stopHost(ctx, launched, true);
      launched = null;
      const started = Date.now();
      const next = await openSession(ctx, freshCrm, knowledge, `restarted after required ${scenario}`);
      record.timings_ms.restart = Date.now() - started;
      launched = next.launched;
      record.owned_pids.push(launched.pid);
      record.updated = { host_js_sha256: next.host_js_sha256, prefix_digest: next.prompt.prefix_digest };
      record.pointer_sha256 = await writePointer(ctx.root, { package_sha256: ctx.newPack.tarball.sha256, role: 'new' });
      record.status = 'HOST_RESTART_REQUIRED_THEN_PASS';
    } else if (scenario === '06-inflight-kill-wal') {
      await stopHost(ctx, launched);
      launched = null;
      const updated = await openSession(ctx, freshCrm, knowledge, `updated before kill ${scenario}`);
      launched = updated.launched;
      record.owned_pids.push(launched.pid);
      const hung = launched.host.request('prompt', { sessionId: ctx.sessionId, text: 'HANG_OWNED: hold this synthetic turn open.' }).then(() => ({ unexpected_success: true }), error => ({ code: error.message }));
      const deadline = Date.now() + 10000;
      while (!ctx.model.requests.some(row => row.hang)) {
        assert.ok(Date.now() < deadline, 'PLUGIN_UPDATE_HANG_NOT_STARTED');
        await delay(10);
      }
      const committed = await launched.host.request('inspect', { sessionId: ctx.sessionId });
      assert.ok(committed.count > updated.prompt.count, 'PLUGIN_UPDATE_OPEN_TURN_NOT_PERSISTED');
      const killStarted = Date.now();
      const killed = await stopHost(ctx, launched, true);
      record.timings_ms.interrupt = Date.now() - killStarted;
      record.interrupt = { signal: killed.signal, committed_count: committed.count, committed_digest: committed.digest };
      launched = null;
      assert.equal((await hung).unexpected_success, undefined, 'PLUGIN_UPDATE_HANG_SUCCEEDED');
      ctx.model.recover();
      const recoverStarted = Date.now();
      ctx.prefixCount = committed.count;
      ctx.prefixDigest = committed.digest;
      const restored = await openSession(ctx, freshCrm, knowledge, `recover wal ${scenario}`);
      record.timings_ms.recovery = Date.now() - recoverStarted;
      launched = restored.launched;
      record.owned_pids.push(launched.pid);
      record.recovered = { prefix_digest: restored.prompt.prefix_digest, assistant_tail: restored.prompt.assistant.at(-1) };
      assert.equal(record.recovered.assistant_tail, 'SYNTHETIC_NATIVE_OK', 'PLUGIN_UPDATE_WAL_RECOVERY_NO_RESPONSE');
      record.status = 'WAL_PREFIX_RECOVERED';
    } else if (scenario === '07-save-unknown-replay') {
      const updated = await openSession(ctx, freshCrm, knowledge, `updated before unknown ${scenario}`);
      launched = updated.launched;
      record.owned_pids.push(launched.pid);
      const crashStarted = Date.now();
      const crashed = await python(ctx, [ctx.data, 'crash-after-commit', 'plugin-update-unknown', 'unknown save', ctx.save.run_id]).catch(error => error);
      record.timings_ms.unknown_kill = Date.now() - crashStarted;
      record.unknown = { status: crashed.status ?? null, signal: crashed.signal ?? null, stdout: crashed.stdout ?? '' };
      assert.equal(record.unknown.stdout, '', 'PLUGIN_UPDATE_UNKNOWN_LEAKED_SUCCESS');
      assert.equal(record.unknown.signal, 'SIGKILL', 'PLUGIN_UPDATE_UNKNOWN_NOT_KILLED');
      const committed = await saveState(ctx, ctx.save.run_id);
      assert.equal(committed.counts.analyses, ctx.save.counts.analyses + 1, 'PLUGIN_UPDATE_UNKNOWN_NOT_COMMITTED');
      assert.equal(committed.counts.idempotency, ctx.save.counts.idempotency + ctx.save.idempotency_per_save, 'PLUGIN_UPDATE_UNKNOWN_RECEIPT_MISSING');
      const replayStarted = Date.now();
      const replay = JSON.parse((await python(ctx, [ctx.data, 'save', 'plugin-update-unknown', 'unknown save', ctx.save.run_id])).stdout);
      record.timings_ms.replay = Date.now() - replayStarted;
      const again = JSON.parse((await python(ctx, [ctx.data, 'save', 'plugin-update-unknown', 'unknown save', ctx.save.run_id])).stdout);
      const stable = JSON.parse((await python(ctx, [ctx.data, 'save', 'plugin-update-stable', 'synthetic baseline', ctx.save.run_id])).stdout);
      record.replay = { analysis_id: replay.analysis_id, same: replay.analysis_id === again.analysis_id, counts: again.counts, stable_analysis_id: stable.analysis_id };
      assert.equal(replay.analysis_id, again.analysis_id, 'PLUGIN_UPDATE_REPLAY_DIVERGED');
      assert.deepEqual(again.counts, committed.counts, 'PLUGIN_UPDATE_REPLAY_DUPLICATED');
      assert.equal(stable.analysis_id, ctx.save.analysis_id, 'PLUGIN_UPDATE_STABLE_RECEIPT_LOST');
      assert.deepEqual(stable.counts, committed.counts, 'PLUGIN_UPDATE_STABLE_REPLAY_DUPLICATED');
      record.status = 'UNKNOWN_REPLAYED';
    } else if (scenario === '08-prepare-reject-restore-old') {
      await rm(join(freshCrm, 'lib/host.js'));
      const started = Date.now();
      const startsBefore = ctx.hostStarts ?? 0;
      let failure = null;
      try {
        const broken = await openSession(ctx, freshCrm, knowledge, `should not prepare ${scenario}`);
        await stopHost(ctx, broken.launched, true);
        failure = 'PREPARED';
      } catch (error) { failure = error.message; }
      record.timings_ms.failed_start = Date.now() - started;
      const redacted = redactText(failure, [ctx.root]);
      record.failure = { stage: 'prepare', code: 'ENOENT', entry: 'lib/host.js', host_invoked: false, detail: redacted };
      record.coverage = SCENARIO_COVERAGE[scenario];
      assert.notEqual(failure, 'PREPARED', 'PLUGIN_UPDATE_BROKEN_PACKAGE_PREPARED');
      assert.equal(ctx.hostStarts ?? 0, startsBefore, 'PLUGIN_UPDATE_HOST_ENTERED');
      assert.match(failure ?? '', /ENOENT/, 'PLUGIN_UPDATE_PREPARE_NOT_ENOENT');
      assert.match(failure ?? '', /lib\/host\.js/, 'PLUGIN_UPDATE_PREPARE_ENTRY');
      assert.equal((await readPointer(ctx.root)).package_sha256, FIXED.oldCrm.sha256, 'PLUGIN_UPDATE_POINTER_MOVED');
      const recoverStarted = Date.now();
      const restored = await openSession(ctx, oldCrm, knowledge, `restored old ${scenario}`);
      record.timings_ms.recovery = Date.now() - recoverStarted;
      launched = restored.launched;
      record.owned_pids.push(launched.pid);
      record.recovered = { prefix_digest: restored.prompt.prefix_digest, tools: restored.tools, host_js_sha256: restored.host_js_sha256 };
      assert.ok(restored.tools.includes('query_crm_metrics_v1'), 'PLUGIN_UPDATE_OLD_TOOLS_MISSING');
      record.status = 'FAILED_OLD_RESTORED';
    } else if (scenario === '09-native-fallback-then-new') {
      const nativeStarted = Date.now();
      const native = await openSession(ctx, oldCrm, knowledge, `native fallback ${scenario}`, 'native');
      launched = native.launched;
      record.owned_pids.push(launched.pid);
      record.timings_ms.native_restart = Date.now() - nativeStarted;
      assert.ok(!native.tools.includes('crm_knowledge_explain') && !native.tools.includes('query_crm_metrics_v1'), 'PLUGIN_UPDATE_NATIVE_TOOLS_PRESENT');
      await stopHost(ctx, launched);
      launched = null;
      const started = Date.now();
      const next = await openSession(ctx, freshCrm, knowledge, `restored new ${scenario}`);
      record.timings_ms.restore_new = Date.now() - started;
      launched = next.launched;
      record.owned_pids.push(launched.pid);
      record.restored = { tools: next.tools, prefix_digest: next.prompt.prefix_digest, host_js_sha256: next.host_js_sha256 };
      assert.ok(next.tools.includes('query_crm_metrics_v1'), 'PLUGIN_UPDATE_NEW_TOOLS_MISSING');
      record.pointer_sha256 = await writePointer(ctx.root, { package_sha256: ctx.newPack.tarball.sha256, role: 'new' });
      record.status = 'PASS';
    } else throw new Error('PLUGIN_UPDATE_UNKNOWN_SCENARIO');

    record.save_after = await saveState(ctx, ctx.save.run_id);
    assert.ok(record.save_after.counts.analyses >= 1, 'PLUGIN_UPDATE_SAVE_LOST');
    if (scenario !== '07-save-unknown-replay') {
      assert.equal(record.save_after.db_sha256, record.save_before.db_sha256, 'PLUGIN_UPDATE_DATA_REWRITTEN');
      assert.deepEqual(record.save_after.counts, record.save_before.counts, 'PLUGIN_UPDATE_DATA_CHANGED');
    }
    record.wal_prefix_preserved = true;
  } catch (error) {
    record.status = ctx.cleanupErrors?.length ? 'FAIL' : (trialCancelled(ctx.cancellation) ? 'INTERRUPTED' : 'FAIL');
    record.error = redactText(error.message, [ctx.root]);
    if (ctx.cleanupErrors?.length) record.cleanup_errors = ctx.cleanupErrors;
  }
  try { return await finishRecord(ctx, record, launched); }
  catch (error) {
    record.status = 'FAIL';
    record.finish_error = redactText(error.message, [ctx.root]);
    return record;
  }
}

export async function assertPnpmBinary(pnpmBin, expected = PNPM_VERSION, nodeBin = process.execPath, signal) {
  const path = absolute(pnpmBin, 'PLUGIN_UPDATE_PNPM_PATH');
  const node = absolute(nodeBin, 'PLUGIN_UPDATE_NODE_PATH');
  const info = await lstat(path);
  assert.ok(info.isFile(), 'PLUGIN_UPDATE_PNPM_PATH');
  const version = (await runOwnedProcessGroup(path, ['-v'], {
    timeout: 15000, signal,
    env: { PATH: `${dirname(node)}:${dirname(path)}:/usr/bin:/bin`, HOME: '/var/empty' },
  })).stdout.trim();
  assert.equal(version, expected, 'PLUGIN_UPDATE_PNPM_VERSION');
  return { path, version };
}

const ARCHIVE_COMPARE = String.raw`
import hashlib, json, tarfile, sys
def members(path):
    found = {}
    with tarfile.open(path, "r:gz") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            payload = archive.extractfile(member).read()
            found[member.name] = {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
    return found
old, new = sys.argv[1:3]
before, after = members(old), members(new)
shared = sorted(set(before) & set(after))
print(json.dumps({
  "only_old": sorted(set(before) - set(after)),
  "only_new": sorted(set(after) - set(before)),
  "content_changed": [name for name in shared if before[name] != after[name]],
  "member_count": len(after),
  "runtime_same": set(before) == set(after) and all(before[name] == after[name] for name in shared),
}))
`;

export async function packWithDeclaredPnpm({ pnpmBin, plugin, outputDir, python, nodeBin, previousPack = null, signals = null }) {
  assertTrialActive(signals);
  const signal = signals?.run?.signal;
  const started = Date.now();
  const output = await assertFreshOutput(outputDir);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const node = absolute(nodeBin, 'PLUGIN_UPDATE_NODE_PATH');
  const pythonPath = absolute(python, 'PLUGIN_UPDATE_ABSOLUTE_PATH_REQUIRED');
  const nodeVersion = (await runOwnedProcessGroup(node, ['-p', 'process.versions.node'], { timeout: 15000, signal, env: { PATH: '/usr/bin:/bin' } })).stdout.trim();
  assert.equal(Number(nodeVersion.split('.')[0]), NODE_MAJOR, 'PLUGIN_UPDATE_NODE_VERSION');
  const pnpm = await assertPnpmBinary(pnpmBin, PNPM_VERSION, node, signal);
  const toolBin = join(output, '.tool-bin');
  const home = join(output, '.home');
  const temp = join(output, '.tmp');
  await mkdir(toolBin, { mode: 0o700 });
  await mkdir(home, { mode: 0o700 });
  await mkdir(temp, { mode: 0o700 });
  await symlink(pythonPath, join(toolBin, 'python3'));
  const runner = join(toolBin, 'pack-once.mjs');
  const packModule = pathToFileURL(join(repository, 'scripts/release/plugin-pack.mjs')).href;
  await writeFile(runner, `import { packPlugin } from ${JSON.stringify(packModule)};\nconst [plugin, outputDir, manifestPath] = process.argv.slice(2);\nconst pack = await packPlugin({ plugin, outputDir, manifestPath });\nprocess.stdout.write(JSON.stringify(pack));\n`, PRIVATE);
  const cleanEnv = {
    PATH: `${dirname(pnpm.path)}:${dirname(node)}:${toolBin}:/usr/bin:/bin`,
    HOME: home,
    TMPDIR: temp,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    NODE_NO_WARNINGS: '1',
  };
  const seenPnpm = (await runOwnedProcessGroup('pnpm', ['-v'], { timeout: 15000, signal, env: cleanEnv })).stdout.trim();
  const seenNode = (await runOwnedProcessGroup('node', ['-p', 'process.versions.node'], { timeout: 15000, signal, env: cleanEnv })).stdout.trim();
  const seenPython = (await runOwnedProcessGroup('python3', ['-c', 'import sys; print(sys.version.split()[0])'], { timeout: 15000, signal, env: cleanEnv })).stdout.trim();
  assert.equal(seenPnpm, PNPM_VERSION, 'PLUGIN_UPDATE_PNPM_LOOKUP');
  assert.equal(seenNode, nodeVersion, 'PLUGIN_UPDATE_NODE_LOOKUP');
  assert.equal(Number(seenPython.split('.')[0]), 3, 'PLUGIN_UPDATE_PYTHON_LOOKUP');
  assert.ok(seenPython.startsWith('3.14.'), 'PLUGIN_UPDATE_PYTHON_LOOKUP');
  assertTrialActive(signals);
  const abort = new AbortController();
  const unbindAbort = forwardAbort(signals?.run?.signal, abort);
  if (abort.signal.aborted) { unbindAbort(); throw abortedError(); }
  if (signals) signals.currentAbort = abort;
  const pluginRoot = absolute(plugin, 'PLUGIN_UPDATE_PLUGIN_PATH');
  let stdout = '';
  try {
    stdout = (await runOwnedProcessGroup(node, [runner, pluginRoot, output, join(output, 'plugin-pack.json')], {
      cwd: output, env: cleanEnv, timeout: 180000, maxBuffer: 8 * 1024 * 1024, signal: abort.signal,
    })).stdout;
  } finally {
    unbindAbort();
    if (signals?.currentAbort === abort) signals.currentAbort = null;
  }
  const pack = JSON.parse(stdout);
  assert.equal(pack.tarball?.sha256?.length, 64, 'PLUGIN_UPDATE_PACK_DIGEST');
  const toolchain = {
    node: { path: node, version: nodeVersion },
    pnpm: { path: pnpm.path, version: pnpm.version, lookup_version: seenPnpm, declared: PNPM_VERSION },
    python: { path: pythonPath, version: seenPython },
    pack_ms: Date.now() - started,
  };
  let comparison = null;
  if (previousPack) {
    const previous = absolute(previousPack, 'PLUGIN_UPDATE_PREVIOUS_PACK');
    const compared = JSON.parse((await runOwnedProcessGroup(pythonPath, ['-B', '-c', ARCHIVE_COMPARE, previous, join(output, pack.tarball.name)], {
      cwd: output, env: cleanEnv, signal, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    })).stdout);
    const previousBytes = await readFile(previous);
    const nextBytes = await readFile(join(output, pack.tarball.name));
    comparison = {
      previous: { path: previous, bytes: previousBytes.length, sha256: sha(previousBytes) },
      next: { path: join(output, pack.tarball.name), bytes: nextBytes.length, sha256: sha(nextBytes) },
      tarball_same: sha(previousBytes) === sha(nextBytes),
      ...compared,
    };
    await writeFile(join(output, 'comparison.json'), json(comparison), PRIVATE);
  }
  await writeFile(join(output, 'toolchain-pack.json'), json({ schema: 'shinemage-plugin-update-toolchain-pack/v1', ...toolchain, pack, comparison }), PRIVATE);
  return { pack, toolchain, comparison };
}

export async function runPluginUpdateTrial(options) {
  const signals = options.signals ?? createTrialSignals();
  if (!signals.run) signals.run = new AbortController();
  options.signals = signals;
  assertTrialActive(signals);
  const identity = await validateTrialInputs(options);
  await assertFreshOutput(identity.output);
  await mkdir(identity.output, { recursive: true, mode: 0o700 });
  const plugin = join(repository, 'dsh-plugins/crm-knowledge');
  const packDir = join(identity.output, 'new-crm-pack');
  await mkdir(packDir, { recursive: true, mode: 0o700 });
  assertTrialActive(signals);
  const packedAt = Date.now();
  const declaredPack = await packWithDeclaredPnpm({
    pnpmBin: options.pnpm, plugin, outputDir: packDir, python: identity.python, nodeBin: process.execPath, signals,
  });
  assertTrialActive(signals);
  const toolchain = { ...declaredPack.toolchain, pack_ms: Date.now() - packedAt };
  const newPack = declaredPack.pack;
  assert.equal(newPack.source_sha, identity.sourceSha, 'PLUGIN_UPDATE_NEW_SOURCE');
  assert.equal(newPack.source_dirty, false, 'PLUGIN_UPDATE_NEW_DIRTY');
  assert.equal(newPack.dsh_pin, DSH_SDK_VERSION, 'PLUGIN_UPDATE_NEW_PIN');
  assert.notEqual(newPack.tarball.sha256, FIXED.oldCrm.sha256, 'PLUGIN_UPDATE_NEW_EQUALS_OLD');
  const newArchive = join(packDir, newPack.tarball.name);
  const summary = { schema: 'shinemage-plugin-update-trial/v1', started_at: new Date().toISOString(), source_sha: identity.sourceSha,
    dsh: identity.dsh, sdk: { receipt_sha256: identity.sdkReceiptSha256, status: identity.sdk.status, supply_chain: identity.sdk.supply_chain, distribution: 'BLOCKED', prepare: 'NOT_RERUN' },
    old_crm: FIXED.oldCrm, knowledge_plugin: FIXED.knowledge, new_crm: newPack.tarball, new_crm_source_sha: newPack.source_sha,
    services: { metrics: { ...FIXED.metricsService, worktree_dirty: true, process: 'NOT_STARTED' }, knowledge: { ...FIXED.knowledgeService, worktree_dirty: true, process: 'NOT_STARTED' } },
    pack_ms: toolchain.pack_ms, toolchain, runs: [], production: 'NOT_PERFORMED', release_ready: false,
    overall_scope: 'TEN_SCENARIO_OUTCOME_CODES_ONLY' };
  const protectedBefore = await protectedSnapshot();
  const outcome = await runCancellableSequence({
    scenarios: SCENARIOS,
    signals,
    between: options.betweenScenarios,
    async runOne(scenario, ctx) {
      assertTrialActive(signals);
      const root = join(identity.output, 'runs', scenario);
      await mkdir(join(root, 'home'), { recursive: true, mode: 0o700 });
      for (const name of ['tmp', 'workspace', 'dsh-home', 'agents-home']) await mkdir(join(root, name), { mode: 0o700 });
      ctx.root = root;
      ctx.runDir = root;
      ctx.identity = identity;
      ctx.newPack = newPack;
      ctx.newArchive = newArchive;
      ctx.python = identity.python;
      ctx.upstream = identity.upstream;
      ctx.generation = 0;
      ctx.assetSeq = 0;
      ctx.resume = false;
      ctx.prefixCount = 0;
      ctx.prefixDigest = null;
      ctx.sessionId = `owned-${scenario}`;
      ctx.data = join(root, 'data');
      ctx.protected = protectedBefore;
      ctx.model = null;
      ctx.save = null;
      await mkdir(ctx.data, { mode: 0o700 });
      assertTrialActive(signals);
      ctx.model = await modelFixture();
      return runScenario(ctx, scenario);
    },
    async cleanup(ctx) {
      const errors = [];
      if (ctx.model) {
        try { await ctx.model.close(); }
        catch (error) { errors.push(redactText(error.message, [ctx.root])); }
      }
      const reaped = await reapTrialChildren(ctx);
      errors.push(...reaped.errors);
      return { errors, reaped };
    },
    persistRecord: record => persistTrialRecord(identity.output, record),
  });
  summary.runs = outcome.runs.map(record => ({ scenario: record.scenario, status: record.status, error: record.error ?? null, record: `runs/${record.scenario}/record.json` }));
  summary.not_started = outcome.not_started;
  summary.interrupt = outcome.interrupt;
  summary.cleanup_failed = outcome.cleanup_failed;
  summary.protected_ports = { before: protectedBefore };
  summary.overall = outcome.overall;
  return finalizeTrialReport({ output: identity.output, summary, signals });
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const signals = createTrialSignals();
  const onSignal = signal => handleTrialSignal(signals, signal);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const declared = option('--pack-declared-pnpm');
    if (declared) {
      const packed = await packWithDeclaredPnpm({
        pnpmBin: declared,
        plugin: option('--plugin') ?? join(repository, 'dsh-plugins/crm-knowledge'),
        outputDir: option('--output'),
        python: option('--python'),
        nodeBin: option('--node') ?? process.execPath,
        previousPack: option('--previous-pack'),
        signals,
      });
      console.log(`PLUGIN_UPDATE_PACK ${packed.pack.tarball.sha256}`);
      if (packed.comparison) console.log(`PLUGIN_UPDATE_PACK_COMPARE runtime_same=${packed.comparison.runtime_same}`);
    } else {
      const summary = await runPluginUpdateTrial({
        upstream: option('--upstream'), output: option('--output'), python: option('--python'),
        pnpm: option('--pnpm'),
        oldCrm: option('--old-crm'), knowledge: option('--knowledge'),
        metricsService: option('--metrics-service'), knowledgeService: option('--knowledge-service'),
        sdkReceipt: option('--sdk-receipt'),
        signals,
      });
      applyTrialCancellation(summary, signals);
      console.log(`PLUGIN_UPDATE_TRIAL ${summary.overall} ${summary.overall_scope}`);
      if (summary.overall !== 'PASS') process.exitCode = 2;
    }
  } catch (error) {
    console.error(`PLUGIN_UPDATE_BLOCKED ${redactText(error.message)}`);
    process.exitCode = 2;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}
