import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MAX_SCAN_FILE_BYTES, scanTree } from './secret-scan.mjs';

const MIB = 1024 * 1024;
// Built at runtime: the repository secret scan reads this file as plain text,
// so the fixture must not itself contain an assignment-shaped live literal.
const SECRET = ['const', 'api_key', '=', '"live-token-0123456789abcdef";'].join(' ');

/** Deterministic byte content of exactly `size` bytes: `prefix` then 'A'. */
function padded(prefix, size) {
  const head = Buffer.from(prefix, 'utf8');
  const body = Buffer.alloc(Math.max(0, size - head.length), 0x41);
  return Buffer.concat([head, body]).subarray(0, size);
}

async function withTree(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-secret-scan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(root, name), bytes);
  return root;
}

test('files just over the previous 2 MiB cap are still text-scanned', async t => {
  const root = await withTree(t, { 'big.js': padded(SECRET, 2 * MIB + 1) });
  const findings = await scanTree(root);
  assert.ok(findings.includes('SECRET_PATTERN big.js'), findings.join(','));
});

test('a legitimate binary just over 2 MiB does not trip the per-file cap', async t => {
  const root = await withTree(t, { 'rive.wasm': padded('\0asm', 2 * MIB + 1) });
  const skipped = [];
  const findings = await scanTree(root, { onSkip: (summary, files) => skipped.push([summary, files]) });
  assert.deepEqual(findings, []);
  assert.deepEqual(skipped, []);
});

test('files over the new cap are skipped, reported and never silently dropped', async t => {
  const root = await withTree(t, { 'huge.bin': padded(SECRET, MAX_SCAN_FILE_BYTES + 1) });
  const reports = [];
  const findings = await scanTree(root, { onSkip: (summary, files) => reports.push([summary, files]) });
  // Opaque payload: not read as text, but the skip is named with the existing
  // SCAN_FILE_LIMIT code and the exact file/size, so it cannot hide.
  assert.deepEqual(findings, []);
  assert.equal(reports.length, 1);
  const [summary, files] = reports[0];
  const entry = `huge.bin:${MAX_SCAN_FILE_BYTES + 1}`;
  assert.match(summary, new RegExp(`SCAN_FILE_LIMIT 1 file\\(s\\) over ${MAX_SCAN_FILE_BYTES} bytes`));
  assert.ok(summary.includes(entry), summary);
  assert.deepEqual(files, [entry]);
});

test('the default skip reporter writes the named limit summary to stderr', async t => {
  const root = await withTree(t, { 'huge.bin': padded('x', MAX_SCAN_FILE_BYTES + 1) });
  const writes = [];
  const original = process.stderr.write;
  process.stderr.write = chunk => { writes.push(String(chunk)); return true; };
  try {
    assert.deepEqual(await scanTree(root), []);
  } finally {
    process.stderr.write = original;
  }
  assert.match(writes.join(''), /SCAN_FILE_LIMIT 1 file\(s\) over 4194304 bytes/);
});
