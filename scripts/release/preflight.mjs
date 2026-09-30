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
import { collectReleaseReadiness, printReadiness, RELEASE_PLUGINS } from './readiness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const upstream = join(root, '.context/dsh-b0/upstream-0.1.7-rc.2');
const pin = UPSTREAM_SHA;
const plugins = RELEASE_PLUGINS;

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith('--'), `${name.slice(2).toUpperCase()}_REQUIRED`);
  return value;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/release/preflight.mjs [--check] --python /absolute/python3.14 --tag TAG [--source-sha SHA] [--output-dir PATH]');
  console.log('--check is read-only: it validates toolchain, clean tree, pinned upstream, runtime bundle, plugins, zstd and output paths without network/build/artifact side effects.');
  process.exit(0);
}

const checkOnly = process.argv.includes('--check');
const pythonValue = option('--python');
const tag = option('--tag');
assert.ok(pythonValue && isAbsolute(pythonValue), 'ABSOLUTE_PYTHON_REQUIRED');
assert.ok(tag, 'TAG_REQUIRED');
const python = resolve(pythonValue);
const sourceSha = option('--source-sha', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
const outputDir = resolve(option('--output-dir', join(root, '.context/release-preflight', tag)));
const preflightStartedAt = Date.now();
const retryCount = Number(process.env.DSH_PREFLIGHT_RETRY_COUNT ?? 0);
assert.ok(Number.isSafeInteger(retryCount) && retryCount >= 0, 'PREFLIGHT_RETRY_COUNT_INVALID');
assert.match(sourceSha, /^[0-9a-f]{40}$/);
assert.match(tag, /^dsh-[A-Za-z0-9._-]+$/);

const readiness = await collectReleaseReadiness({ root, pythonPath: python, outputDir, requireClean: true, requireRuntime: checkOnly, requireOutput: true });
if (!printReadiness(readiness, checkOnly ? 'DSH_PREFLIGHT_CHECK' : 'DSH_PREFLIGHT_READINESS')) {
  const firstFailure = readiness.checks.find(check => !check.ok);
  console.error(`DSH_PREFLIGHT_${checkOnly ? 'CHECK' : 'READINESS'}_STATUS BLOCKED code=${firstFailure?.code ?? 'PREFLIGHT_READINESS_BLOCKED'}`);
  process.exit(2);
}
if (checkOnly) {
  console.log(`DSH_PREFLIGHT_CHECK_STATUS PASS tag=${tag} output=${outputDir}`);
  process.exit(0);
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceSha, 'PREFLIGHT_SOURCE_SHA_MISMATCH');

const stageTimings = [];
async function stage(name, fn) {
  const started = Date.now();
  const timing = { name, status: 'IN_PROGRESS', started_at: new Date(started).toISOString(), completed_at: null, elapsed_ms: null, error_code: null };
  stageTimings.push(timing);
  console.log(`DSH_PREFLIGHT_STAGE ${name}`);
  try {
    const result = await fn();
    timing.status = 'PASS'; timing.completed_at = new Date().toISOString(); timing.elapsed_ms = Date.now() - started;
    console.log(`DSH_PREFLIGHT_STAGE_DONE ${name} elapsed_ms=${timing.elapsed_ms}`);
    return result;
  } catch (error) {
    const code = String(error?.message ?? '').match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'PREFLIGHT_STAGE_FAILED';
    timing.status = 'FAILED'; timing.completed_at = new Date().toISOString(); timing.elapsed_ms = Date.now() - started; timing.error_code = code;
    console.error(`DSH_PREFLIGHT_FAIL stage=${name} code=${code}`);
    throw error;
  }
}

const run = (command, args, env = {}) => execFileSync(command, args, {
  cwd: root,
  env: { ...process.env, ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: '1' },
  stdio: 'inherit',
});

await stage('prepare', () => run(process.execPath, ['scripts/dsh-b0/pipeline.mjs', '--prepare', '--python', python]));
assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin, 'PREFLIGHT_UPSTREAM_SHA_MISMATCH');
await stage('build', () => { for (const plugin of plugins) run(process.execPath, [`${plugin}/build.mjs`, upstream]); });
// Fresh directory prevents stale receipts or overwriting a prior preflight.
await mkdir(dirname(outputDir), { recursive: true });
await mkdir(outputDir);
const runtimeOutput = join(root, '.context/release-runtime', `${tag}-runtime.tar.zst`);
await mkdir(dirname(runtimeOutput), { recursive: true });
await stage('runtime', () => run(process.execPath, ['scripts/release/runtime-bundle.mjs', '--upstream', upstream, '--output', runtimeOutput, '--online']));
await stage('release', () => run(process.execPath, ['scripts/dsh.mjs', 'release', '--offline', '--tag', tag], { DSH_UPSTREAM_RUNTIME_BUNDLE: runtimeOutput }));
await stage('test', () => run(process.execPath, ['scripts/dsh.mjs', 'test']));
const evidenceDir = join(root, '.context/release-evidence', tag);
const scratch = await mkdtemp(join(tmpdir(), 'release-preflight-receive-'));
try {
  await stage('receive', () => receiveArtifact({ artifact: join(evidenceDir, `${tag}.tar.zst`),
    manifestPath: join(evidenceDir, 'release-manifest.v1.json'), destination: join(scratch, 'received') }));
} finally { await rm(scratch, { recursive: true, force: true }); }
await stage('evidence', async () => {
  for (const name of releaseAssetNames(tag)) await copyFile(join(evidenceDir, name), join(outputDir, name));
});
const summary = await summarizePreflight(outputDir, { tag, sourceSha, stages: stageTimings, startedAt: preflightStartedAt, retryCount });
await writeFile(join(outputDir, 'release-preflight.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
await verifyPreflight(outputDir, { tag, sourceSha });
console.log(`DSH_RELEASE_PREFLIGHT_PASS source=${sourceSha} tag=${tag} bundle=${outputDir}`);
