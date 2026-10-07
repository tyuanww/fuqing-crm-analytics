import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditTree, auditSdk, auditSdkClosure } from './sdk-content-audit.mjs';

async function fixture(t, values) {
  const root = await mkdtemp(join(tmpdir(), 'sdk-audit-')); t.after(() => rm(root, { recursive: true, force: true }));
  const entries = {};
  for (const [name, bytes] of Object.entries(values)) {
    const path = join(root, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes);
    entries[name] = { kind: 'file', bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  return { root, manifest: { entries } };
}

test('audit flags vendor/fixture assignments without disclosing matching contents', async t => {
  const value = 'synthetic-' + 'private-value-for-sdk-audit';
  const { root, manifest } = await fixture(t, { 'upstream/vendor/test.js': `const api_key = '${value}';` });
  const result = await auditTree(manifest, root);
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.findings.length, 1);
  assert.ok(!JSON.stringify(result).includes(value)); assert.equal(result.release_ready, false);
});

test('ordinary text can pass patterns but opaque and oversized files leave explicit gaps', async t => {
  const { root, manifest } = await fixture(t, { 'upstream/index.js': 'export const okay = 1;',
    'build-tools/module.wasm': Buffer.from([0, 97, 115, 109]), 'corepack/large.js': Buffer.alloc(16 * 1024 * 1024 + 1, 32) });
  const result = await auditTree(manifest, root);
  assert.equal(result.status, 'PARTIAL'); assert.equal(result.files_hashed, 3);
  assert.equal(result.files_pattern_checked, 2); assert.equal(result.findings.length, 0);
  assert.deepEqual(result.coverage_gaps.map(g => g.reason), ['native-or-wasm', 'file-size-limit']);
  delete manifest.entries['build-tools/module.wasm']; delete manifest.entries['corepack/large.js'];
  assert.equal((await auditTree(manifest, root)).status, 'PATTERN_SCAN_PASS');
});

test('changed bytes and external file/parent symlinks are refused', async t => {
  const { root, manifest } = await fixture(t, { 'upstream/file': 'original' });
  await writeFile(join(root, 'upstream/file'), 'modified');
  await assert.rejects(auditTree(manifest, root), /SDK_AUDIT_DIGEST/);
  await rm(join(root, 'upstream/file'));
  await symlink('/etc/passwd', join(root, 'upstream/file'));
  await assert.rejects(auditTree(manifest, root), /SDK_AUDIT_FILE/);
  await rm(join(root, 'upstream'), { recursive: true }); await symlink('/etc', join(root, 'upstream'));
  await assert.rejects(auditTree(manifest, root), /SDK_AUDIT_PARENT/);
});

test('manifest-only scope rejects unsafe names and checks declared links without following them', async t => {
  const { root, manifest } = await fixture(t, { 'upstream/file': 'original' });
  await symlink('file', join(root, 'upstream/link')); manifest.entries['upstream/link'] = { kind: 'link', target: 'file' };
  assert.equal((await auditTree(manifest, root)).links_checked, 1);
  manifest.entries['upstream/link'].target = 'different';
  await assert.rejects(auditTree(manifest, root), /SDK_AUDIT_LINK/);
  delete manifest.entries['upstream/link']; manifest.entries['../outside'] = {};
  await assert.rejects(auditTree(manifest, root), /SDK_AUDIT_PATH/);
  assert.equal(await readFile(join(root, 'upstream/file'), 'utf8'), 'original');
});

test('wrong receipt rejects before invoking an archive inspector', async t => {
  const { root } = await fixture(t, { 'upstream/file': 'original' });
  await writeFile(join(root, 'receipt.json'), JSON.stringify({ status: 'LOCAL_READY', archive_sha256: '0'.repeat(64) }));
  await assert.rejects(auditSdk({ root, archive: '/not-read.zip', sha256: '1'.repeat(64), python: '/not-executed' }), /SDK_AUDIT_RECEIPT/);
});

test('compact audit requires the separately pinned closure digest', async t => {
  const { root } = await fixture(t, { 'upstream/file': 'original' });
  await writeFile(join(root, 'sdk-closure.json'), '{}');
  await assert.rejects(auditSdkClosure({ root, sha256: 'f'.repeat(64) }), /KIT_CLOSURE_DIGEST/);
  assert.equal(await readFile(join(root, 'upstream/file'), 'utf8'), 'original');
});

test('invalid UTF-8 without NUL bytes remains an explicit coverage gap', async t => {
  const { root, manifest } = await fixture(t, { 'upstream/text-looking-file': Buffer.from([0xff, 0xfe, 0x61]) });
  const result = await auditTree(manifest, root);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.coverage_gaps[0].reason, 'binary-or-nontext');
});

test('CLI cannot write inside the SDK, including through a directory alias, or overwrite evidence', async t => {
  const { root } = await fixture(t, { 'upstream/file': 'original' });
  const out = await mkdtemp(join(tmpdir(), 'sdk-audit-reports-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  await symlink(join(root, 'upstream'), join(out, 'alias'));
  const run = output => spawnSync(process.execPath, [fileURLToPath(new URL('./sdk-content-audit.mjs', import.meta.url)),
    '--archive', '/not-read.zip', '--sha256', '1'.repeat(64), '--root', root,
    '--python', '/not-executed', '--output', output], { encoding: 'utf8' });
  for (const output of [join(root, 'report.json'), join(out, 'alias/report.json')]) {
    const child = run(output);
    assert.equal(child.status, 2); assert.equal(JSON.parse(child.stdout).code, 'SDK_AUDIT_OUTPUT_IN_SDK');
  }
  assert.deepEqual(await readdir(root), ['upstream']);
  assert.deepEqual(await readdir(join(root, 'upstream')), ['file']);
  const prior = join(out, 'prior.json'); await writeFile(prior, 'original evidence');
  assert.equal(run(prior).status, 2);
  assert.equal(await readFile(prior, 'utf8'), 'original evidence');
  const next = join(out, 'new.json'); assert.equal(run(next).status, 2);
  const blocked = JSON.parse(await readFile(next, 'utf8'));
  assert.equal(blocked.status, 'BLOCKED'); assert.equal(blocked.release_ready, false);
  assert.ok(!JSON.stringify(blocked).includes(root));
});
