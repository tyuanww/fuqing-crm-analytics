#!/usr/bin/env node

/**
 * G0/T17 synthetic host process-model feasibility harness.
 *
 * This is an isolated evidence runner, not a DSH supervisor and not a
 * production gateway. It owns a temporary DSH home/profile/WAL/port boundary,
 * starts a loopback-only child, and records the conservative fallback when
 * in-process unload is not proven. The result is intentionally explicit about
 * fixture evidence versus exact pinned DSH evidence.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { appendFile, mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA } from '../release/toolchain.mjs';

export const HOST_FEASIBILITY_SCHEMA = 'dsh-host-feasibility/v1';
const fixtureProcess = fileURLToPath(new URL('./host-fixture-process.mjs', import.meta.url));

function now() { return new Date().toISOString(); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function safePath(path) { return typeof path === 'string' && path.startsWith('/') && !path.includes('..'); }

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function appendJournal(state, event, fields = {}) {
  const entry = { at: now(), event, ...fields };
  state.journal.push(entry);
  await atomicJson(state.journal_path, state);
  return entry;
}

async function appendSyntheticWal(state, event, fields = {}) {
  await appendFile(state.wal_path, `${JSON.stringify({ schema_version: 'dsh-host-wal/v1', at: now(), event, ...fields })}\n`, { mode: 0o600 });
}

function row(id, status, summary, evidence, reason = null) {
  return { id, status, summary, evidence, ...(reason ? { reason } : {}) };
}

async function waitForExit(child, timeoutMs = 2000) {
  if (child.exitCode !== null || child.signalCode !== null) return { code: child.exitCode, signal: child.signalCode };
  return await Promise.race([
    new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal }))),
    delay(timeoutMs).then(() => null),
  ]);
}

async function stopChild(session, { force = false } = {}) {
  if (!session?.child || session.child.exitCode !== null || session.child.signalCode !== null) return;
  if (!force) {
    try { await fetch(`http://127.0.0.1:${session.port}/shutdown`, { signal: AbortSignal.timeout(500) }); } catch {}
  }
  const exited = await waitForExit(session.child, 1200);
  if (!exited) {
    session.child.kill('SIGTERM');
    if (!await waitForExit(session.child, 700)) session.child.kill('SIGKILL');
  }
  await waitForExit(session.child, 1200);
  session.lines?.close();
}

async function request(session, path, { method = 'GET', timeoutMs = 600 } = {}) {
  try {
    const response = await fetch(`http://127.0.0.1:${session.port}${path}`, { method, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { status: response.status, body };
  } catch (error) {
    return { error: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE' };
  }
}

async function startChild(root, state, { mode, generation, profileDigest }) {
  const profilePath = join(root, 'profile.json');
  const profile = { schema_version: 'dsh-profile/v1', dsh: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA,
    mode, generation, profile_id: profileDigest, bundles: mode === 'plugin' ? ['native', 'synthetic-plugin'] : ['native'] };
  await atomicJson(profilePath, profile);
  const child = spawn(process.execPath, [fixtureProcess, '--profile', profilePath, '--wal', state.wal_path, '--mode', mode, '--port', '0'], {
    cwd: root,
    env: { PATH: dirname(process.execPath), NODE_NO_WARNINGS: '1', TMPDIR: join(root, 'tmp') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-2000); });
  const lines = createInterface({ input: child.stdout });
  let ready;
  try {
    ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('HOST_FIXTURE_START_TIMEOUT')), 2000);
      lines.on('line', line => {
        const match = /^HOST_READY (\d+) ([0-9a-f]{64})$/.exec(line);
        if (!match) return;
        clearTimeout(timer);
        resolve({ port: Number(match[1]), nativeProfileDigest: match[2] });
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => {
        if (code !== null || signal) { clearTimeout(timer); reject(new Error(`HOST_FIXTURE_EXIT_${code ?? signal}:${stderr}`)); }
      });
    });
  } catch (error) {
    child.kill('SIGTERM');
    await waitForExit(child, 500);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    lines.close();
    throw error;
  }
  await appendJournal(state, 'HOST_STARTED', { generation, mode, pid: child.pid, native_profile_digest: ready.nativeProfileDigest });
  return { child, lines, port: ready.port, generation, mode, nativeProfileDigest: ready.nativeProfileDigest };
}

async function readWal(path) {
  const text = await readFile(path, 'utf8');
  const entries = text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : [];
  assert.ok(entries.every(entry => entry.schema_version === 'dsh-host-wal/v1'), 'HOST_WAL_SCHEMA_INVALID');
  return entries;
}

/**
 * Run one complete synthetic host failure/recovery drill.
 * `keepRoot` is intended for a caller that wants to inspect evidence; the
 * default always removes its temporary home in a finally block.
 */
export async function runHostFeasibility({ keepRoot = false, root: suppliedRoot = null } = {}) {
  const root = suppliedRoot ?? await mkdtemp(join(tmpdir(), 'dsh-host-feasibility-'));
  assert.ok(safePath(root), 'HOST_FIXTURE_ROOT_INVALID');
  await mkdir(join(root, 'tmp'), { recursive: true, mode: 0o700 });
  const state = { schema_version: 'dsh-host-journal/v1', dsh: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA,
    journal_path: join(root, 'journal.json'), wal_path: join(root, 'session.wal'), active_profile_digest: null, journal: [] };
  await writeFile(state.wal_path, '', { mode: 0o600 });
  await atomicJson(state.journal_path, state);
  const candidateDigest = sha('synthetic-plugin-candidate/v1');
  const nativeDigest = sha('native-profile/v1');
  let session = null;
  let generation = 0;
  const evidence = { schema_version: HOST_FEASIBILITY_SCHEMA, generated_at: now(), source: 'synthetic-host-fixture',
    dsh: { sdk_version: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA, exact_host_checkout: 'NOT_RUN' },
    root, state_path: state.journal_path, wal_path: state.wal_path, rows: [], overall: 'PARTIAL' };
  try {
    generation += 1;
    state.active_profile_digest = candidateDigest;
    await appendJournal(state, 'PROFILE_SELECTED', { generation, profile_digest: candidateDigest, bundles: ['native', 'synthetic-plugin'] });
    session = await startChild(root, state, { mode: 'plugin', generation, profileDigest: candidateDigest });
    state.active_profile_digest = session.nativeProfileDigest;
    await appendJournal(state, 'PROFILE_MANIFEST_OBSERVED', { generation, profile_id: candidateDigest, native_profile_digest: session.nativeProfileDigest });
    const health = await request(session, '/health');
    evidence.rows.push(row('profile-load', health.status === 200 && health.body.plugin === true ? 'SUPPORTED' : 'BLOCKED',
      'Synthetic host loads the native loop and plugin bundle at process start.', { generation, pid: session.child.pid }));
    const native = await request(session, '/native-loop');
    evidence.rows.push(row('native-loop-before-failure', native.status === 200 ? 'SUPPORTED' : 'BLOCKED',
      'Native loop responds while the plugin profile is active.', { status: native.status }));
    const plugin = await request(session, '/plugin');
    evidence.rows.push(row('plugin-loop', plugin.status === 200 ? 'SUPPORTED' : 'BLOCKED',
      'Synthetic plugin endpoint responds inside the candidate profile.', { status: plugin.status }));
    const unload = await request(session, '/plugin/unload', { method: 'POST' });
    await appendJournal(state, 'UNLOAD_PROBE', { status: unload.body?.status ?? 'UNKNOWN', reason: unload.body?.reason ?? 'UNKNOWN' });
    evidence.rows.push(row('in-process-unload', unload.body?.status === 'HOST_RESTART_REQUIRED' ? 'BLOCKED' : 'NOT_RUN',
      'The fixture refuses to promise in-process unload and requires host restart.', { status: unload.status }, 'IN_PROCESS_UNLOAD_NOT_PROMISED'));
    await appendJournal(state, 'SESSION_CHECKPOINT', { session_id: 'synthetic-session-1', correlation_id: 'synthetic-correlation-1' });
    await appendSyntheticWal(state, 'session-checkpoint', { session_id: 'synthetic-session-1', correlation_id: 'synthetic-correlation-1' });
    await stopChild(session);
    session = null;

    generation += 1;
    session = await startChild(root, state, { mode: 'hang', generation, profileDigest: candidateDigest });
    const hung = await request(session, '/plugin', { timeoutMs: 120 });
    const timedOut = hung.error === 'TIMEOUT';
    await appendJournal(state, 'PLUGIN_TIMEOUT', { generation, timeout_ms: 120, action: 'HOST_RESTART_REQUIRED' });
    evidence.rows.push(row('hung-plugin-containment', timedOut ? 'SUPPORTED' : 'BLOCKED',
      'A hung plugin request is bounded and escalates to host restart.', { timeout_ms: 120, observed: hung.error ?? hung.status }));
    await stopChild(session, { force: true });
    session = null;

    generation += 1;
    session = await startChild(root, state, { mode: 'native-only', generation, profileDigest: nativeDigest });
    state.active_profile_digest = session.nativeProfileDigest;
    await appendJournal(state, 'HOST_RESTART', { generation, reason: 'PLUGIN_TIMEOUT', active_profile_digest: session.nativeProfileDigest });
    const nativeAfterTimeout = await request(session, '/native-loop');
    evidence.rows.push(row('native-loop-after-timeout', nativeAfterTimeout.status === 200 ? 'SUPPORTED' : 'BLOCKED',
      'Native loop remains available after replacing the hung host.', { status: nativeAfterTimeout.status, generation }));
    const unavailable = await request(session, '/plugin');
    evidence.rows.push(row('plugin-disabled-fallback', unavailable.status === 404 && unavailable.body?.status === 'NOT_AVAILABLE' ? 'SUPPORTED' : 'BLOCKED',
      'Failed plugin falls back to native profile with an explicit unavailable reason.', { status: unavailable.status, reason: unavailable.body?.reason ?? null }));
    await stopChild(session);
    session = null;

    generation += 1;
    state.active_profile_digest = candidateDigest;
    await appendJournal(state, 'PROFILE_SELECTED', { generation, profile_digest: candidateDigest, bundles: ['native', 'synthetic-plugin'] });
    session = await startChild(root, state, { mode: 'crash', generation, profileDigest: candidateDigest });
    const crashed = await request(session, '/plugin', { timeoutMs: 600 });
    const crashExit = await waitForExit(session.child, 1200);
    const crashedObserved = crashed.error === 'UNAVAILABLE' || crashExit?.signal === 'SIGKILL';
    await appendJournal(state, 'PLUGIN_CRASH', { generation, action: 'HOST_RESTART_REQUIRED', signal: crashExit?.signal ?? null });
    evidence.rows.push(row('crashed-plugin-containment', crashedObserved ? 'SUPPORTED' : 'BLOCKED',
      'A crashed plugin host is detected without treating the action as success.', { signal: crashExit?.signal ?? null, request: crashed.error ?? crashed.status }));
    await stopChild(session, { force: true });
    session = null;

    generation += 1;
    session = await startChild(root, state, { mode: 'native-only', generation, profileDigest: nativeDigest });
    state.active_profile_digest = session.nativeProfileDigest;
    await appendJournal(state, 'HOST_RESTART', { generation, reason: 'PLUGIN_CRASH', active_profile_digest: session.nativeProfileDigest });
    const nativeAfterCrash = await request(session, '/native-loop');
    evidence.rows.push(row('native-loop-after-crash', nativeAfterCrash.status === 200 ? 'SUPPORTED' : 'BLOCKED',
      'Native loop resumes after crash and controlled restart.', { status: nativeAfterCrash.status, generation }));
    const finalNativeProfileDigest = session.nativeProfileDigest;
    await stopChild(session);
    session = null;

    const walEntries = await readWal(state.wal_path);
    const checkpoint = walEntries.find(entry => entry.event === 'session-checkpoint' || entry.event === 'SESSION_CHECKPOINT');
    await appendJournal(state, 'WAL_REPLAY', { entries: walEntries.length, session_id: checkpoint?.session_id ?? null });
    evidence.rows.push(row('session-wal-replay', checkpoint ? 'SUPPORTED' : 'BLOCKED',
      'Synthetic session checkpoint is readable after host replacement; no database migration is attempted.', { entries: walEntries.length }));
    const finalProfile = JSON.parse(await readFile(join(root, 'profile.json'), 'utf8'));
    const finalManifestDigest = sha(JSON.stringify(finalProfile));
    const reconciled = finalManifestDigest === finalNativeProfileDigest && state.active_profile_digest === finalNativeProfileDigest;
    await appendJournal(state, 'PROFILE_RECONCILE', { expected: finalNativeProfileDigest, observed: finalManifestDigest, status: reconciled ? 'SUPPORTED' : 'BLOCKED' });
    evidence.rows.push(row('profile-digest-reconcile', reconciled ? 'SUPPORTED' : 'BLOCKED',
      'Journal-selected active profile digest matches the native host manifest after fallback.', { expected: finalNativeProfileDigest, observed: finalManifestDigest }));
    evidence.overall = evidence.rows.some(item => item.status === 'BLOCKED') ? 'BLOCKED' : 'PARTIAL';
    evidence.note = 'Exact DSH host checkout was not present; in-process unload remains blocked until the pinned host is executed.';
    await atomicJson(join(root, 'evidence.json'), evidence);
    return evidence;
  } finally {
    if (session) await stopChild(session, { force: true });
    if (!keepRoot && !suppliedRoot) await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const keep = process.argv.includes('--keep');
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  try {
    const result = await runHostFeasibility({ keepRoot: Boolean(keep) });
    if (output) {
      assert.ok(safePath(output), 'HOST_EVIDENCE_OUTPUT_INVALID');
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    }
    console.log(JSON.stringify({ schema_version: result.schema_version, overall: result.overall,
      blocked: result.rows.filter(item => item.status === 'BLOCKED').map(item => item.id),
      source_checkout: result.dsh.exact_host_checkout, evidence: output ?? 'temporary-root' }, null, 2));
    process.exitCode = result.overall === 'BLOCKED' ? 2 : 0;
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
