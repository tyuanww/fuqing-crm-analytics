#!/usr/bin/env node

/**
 * Build and verify the exact release runtime before an immutable tag exists.
 * This is deliberately the same closure used by release evidence; it never
 * publishes, touches a production host, or reads business data.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { receiveArtifact } from './artifact.mjs';
import { releaseAssetNames, summarizePreflight, verifyPreflight, UPSTREAM_SHA } from './preflight-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const upstream = join(root, '.context/dsh-b0/upstream-0.1.7-rc.2');
const pin = UPSTREAM_SHA;
const plugins = [
  'dsh-plugins/analytics-workbench',
  'dsh-plugins/shine-brand',
  'dsh-plugins/shine-waterfall',
  'dsh-plugins/shine-crowd-action',
  'dsh-plugins/shine-query',
  'dsh-plugins/shine-board',
  'dsh-plugins/shine-funnel',
];

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith('--'), `${name.slice(2).toUpperCase()}_REQUIRED`);
  return value;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/release/preflight.mjs --python /absolute/python3.14 --tag TAG [--source-sha SHA] [--output-dir PATH]');
  process.exit(0);
}

const pythonValue = option('--python');
const tag = option('--tag');
assert.ok(pythonValue && isAbsolute(pythonValue), 'ABSOLUTE_PYTHON_REQUIRED');
assert.ok(tag, 'TAG_REQUIRED');
const python = resolve(pythonValue);
const sourceSha = option('--source-sha', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
const outputDir = resolve(option('--output-dir', join(root, '.context/release-preflight', tag)));
assert.equal(Number(process.versions.node.split('.')[0]), 24, `NODE24_REQUIRED ${process.versions.node}`);
assert.match(sourceSha, /^[0-9a-f]{40}$/);
assert.match(tag, /^dsh-[A-Za-z0-9._-]+$/);
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceSha, 'PREFLIGHT_SOURCE_SHA_MISMATCH');
assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim(), '', 'PREFLIGHT_DIRTY_WORKTREE');

const run = (command, args, env = {}) => execFileSync(command, args, {
  cwd: root,
  env: { ...process.env, ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: '1' },
  stdio: 'inherit',
});

run(process.execPath, ['scripts/dsh-b0/pipeline.mjs', '--prepare', '--python', python]);
assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin, 'PREFLIGHT_UPSTREAM_SHA_MISMATCH');
for (const plugin of plugins) run(process.execPath, [`${plugin}/build.mjs`, upstream]);
// Fresh directory prevents stale receipts or overwriting a prior preflight.
await mkdir(dirname(outputDir), { recursive: true });
await mkdir(outputDir);
const runtimeOutput = join(root, '.context/release-runtime', `${tag}-runtime.tar.zst`);
await mkdir(dirname(runtimeOutput), { recursive: true });
run(process.execPath, ['scripts/release/runtime-bundle.mjs', '--upstream', upstream, '--output', runtimeOutput, '--online']);
run(process.execPath, ['scripts/dsh.mjs', 'release', '--offline', '--tag', tag], { DSH_UPSTREAM_RUNTIME_BUNDLE: runtimeOutput });
run(process.execPath, ['scripts/dsh.mjs', 'test']);
const evidenceDir = join(root, '.context/release-evidence', tag);
const scratch = await mkdtemp(join(tmpdir(), 'release-preflight-receive-'));
try {
  await receiveArtifact({ artifact: join(evidenceDir, `${tag}.tar.zst`),
    manifestPath: join(evidenceDir, 'release-manifest.v1.json'), destination: join(scratch, 'received') });
} finally { await rm(scratch, { recursive: true, force: true }); }
for (const name of releaseAssetNames(tag)) await copyFile(join(evidenceDir, name), join(outputDir, name));
const summary = await summarizePreflight(outputDir, { tag, sourceSha });
await writeFile(join(outputDir, 'release-preflight.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
await verifyPreflight(outputDir, { tag, sourceSha });
console.log(`DSH_RELEASE_PREFLIGHT_PASS source=${sourceSha} tag=${tag} bundle=${outputDir}`);
