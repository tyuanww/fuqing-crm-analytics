#!/usr/bin/env node

/**
 * Read-only static evidence collector for the T2 DSH compatibility spike.
 *
 * It never clones, fetches, installs or runs an upstream host. A profile is
 * SUPPORTED here only when its exact local checkout SHA is supplied and the
 * expected source families are found. Runtime lifecycle/WAL evidence remains
 * owned by host-feasibility.mjs and a real pinned host smoke.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA } from '../release/toolchain.mjs';

const exec = promisify(execFile);
export const COMPATIBILITY_SCHEMA = 'dsh-compatibility-matrix/v1';
const PATTERNS = Object.freeze({
  capability_slot: 'capabilit|slot',
  lifecycle: 'restart|unload|dispose|load',
  shell_tool_timeout: 'ctx[.]shell|timeout|tool.result|tool result',
  session_wal: 'session|WAL|wal',
});
const SOURCE_PATHS = Object.freeze(['packages', 'vendor', 'apps/cli/src', 'apps/web/src', 'apps/desktop/src',
  ':(exclude)**/tests/**', ':(exclude)**/fixtures/**', ':(exclude)**/*.md', ':(exclude)**/*.json', ':(exclude)**/*.yml']);

function absolute(value) { return typeof value === 'string' && value.startsWith('/') && !value.includes('..'); }

async function git(checkout, args) {
  try {
    const result = await exec('git', ['-C', checkout, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 512 * 1024 });
    return result.stdout.trim();
  } catch (error) {
    return { error: error?.code ?? 'GIT_COMMAND_FAILED', detail: String(error?.stderr ?? error?.message ?? '').slice(-500) };
  }
}

async function scanPattern(checkout, pattern, sourceSha) {
  // File names are enough for the static evidence and avoid copying source
  // lines (which could contain fixture secrets) into a receipt.
  // Bind static evidence to the reviewed tree, never to mutable worktree bytes.
  const result = await git(checkout, ['grep', '-l', '-E', pattern, sourceSha, '--', ...SOURCE_PATHS]);
  if (typeof result !== 'string') return { matches: [], error: result.error };
  const matches = result.split('\n').filter(Boolean).slice(0, 20).map(file => ({ file: file.slice(sourceSha.length + 1, sourceSha.length + 301) }));
  return { matches };
}

export async function inspectCheckout({ id, version, checkout, expectedSha, role }) {
  const base = { id, version, role, checkout: checkout ?? null, expected_sha: expectedSha ?? null, source_scan: {}, status: 'NOT_RUN' };
  if (!checkout || !absolute(checkout)) return { ...base, status: role === 'advisory' ? 'DEFERRED' : 'NOT_RUN', reason: 'UPSTREAM_CHECKOUT_MISSING' };
  const actual = await git(checkout, ['rev-parse', 'HEAD']);
  if (typeof actual !== 'string') return { ...base, status: 'BLOCKED', reason: 'UPSTREAM_CHECKOUT_NOT_GIT', detail: actual.detail };
  base.actual_sha = actual;
  if (!expectedSha) return { ...base, status: 'DEFERRED', reason: 'EXPECTED_SHA_REQUIRED' };
  if (!/^[0-9a-f]{40}$/.test(expectedSha) || actual !== expectedSha) {
    return { ...base, status: 'BLOCKED', reason: 'UPSTREAM_SHA_MISMATCH' };
  }
  for (const [key, pattern] of Object.entries(PATTERNS)) base.source_scan[key] = await scanPattern(checkout, pattern, expectedSha);
  const missing = Object.entries(base.source_scan).filter(([, result]) => !result.matches?.length).map(([key]) => key);
  return { ...base, status: missing.length ? 'BLOCKED' : 'SUPPORTED', reason: missing.length ? 'SOURCE_FAMILY_NOT_FOUND' : null,
    source_scan_missing: missing };
}

export async function collectCompatibilityMatrix({ checkout017 = null, checkout020 = null, sha020 = null } = {}) {
  const rows = [
    await inspectCheckout({ id: 'dsh-0.1.7-rc.2', version: DSH_SDK_VERSION, checkout: checkout017,
      expectedSha: DSH_UPSTREAM_SHA, role: 'blocking' }),
    await inspectCheckout({ id: 'dsh-0.2.0-rc.2', version: '0.2.0-rc.2', checkout: checkout020,
      expectedSha: sha020, role: 'advisory' }),
  ];
  const overall = rows.some(row => row.status === 'BLOCKED') ? 'BLOCKED'
    : rows.some(row => ['NOT_RUN', 'DEFERRED'].includes(row.status)) ? 'PARTIAL' : 'SUPPORTED';
  return { schema_version: COMPATIBILITY_SCHEMA, generated_at: new Date().toISOString(), offline: true,
    rows, overall, runtime_evidence: 'scripts/dsh-b0/host-feasibility.mjs' };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = await collectCompatibilityMatrix({ checkout017: option('--checkout-017'), checkout020: option('--checkout-020'), sha020: option('--sha-020') });
    const output = option('--output');
    if (output) {
      assert.ok(absolute(output), 'COMPATIBILITY_OUTPUT_INVALID');
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    }
    console.log(JSON.stringify({ schema_version: result.schema_version, overall: result.overall,
      rows: result.rows.map(row => ({ id: row.id, status: row.status, reason: row.reason ?? null })) }, null, 2));
    process.exitCode = result.overall === 'SUPPORTED' ? 0 : 2;
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
