#!/usr/bin/env node

/**
 * Build and verify the exact release runtime before an immutable tag exists.
 * This is deliberately the same closure used by release evidence; it never
 * publishes, touches a production host, or reads business data.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { receiveArtifact, sha256 } from './artifact.mjs';
import { releaseAssetNames, summarizePreflight, verifyPreflight, UPSTREAM_SHA } from './preflight-bundle.mjs';
import { collectReleaseReadiness, printReadiness } from './readiness.mjs';
import { DSH_SDK_VERSION } from './toolchain.mjs';
import { prepareServiceCompatibility } from './service-compatibility.mjs';
import { loadReleasePacks } from './release-profile-packs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const upstream = resolve(process.env.DSH_UPSTREAM_CHECKOUT || join(root, `.context/dsh-b0/upstream-${DSH_SDK_VERSION}`));
const pin = UPSTREAM_SHA;

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith('--'), `${name.slice(2).toUpperCase()}_REQUIRED`);
  return value;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/release/preflight.mjs [--check] --python /absolute/python3.14 --tag TAG [--source-sha SHA] [--output-dir PATH] [--service-evidence /absolute/receipt.json]');
  console.log('--check is read-only: it validates toolchain, clean tree, pinned upstream, runtime bundle, DSH_PROFILE_PACK_INPUTS, zstd and output paths without network/build/artifact side effects.');
  process.exit(0);
}

const checkOnly = process.argv.includes('--check');
if (process.argv.filter(value => value === '--service-evidence').length > 1) {
  console.error('SERVICE_EVIDENCE_AMBIGUOUS'); process.exit(2);
}
const serviceEvidenceIndex = process.argv.indexOf('--service-evidence');
const serviceEvidenceValue = serviceEvidenceIndex < 0 ? null : process.argv[serviceEvidenceIndex + 1];
if (serviceEvidenceIndex >= 0 && (!serviceEvidenceValue || serviceEvidenceValue.startsWith('--'))) {
  console.error('SERVICE_EVIDENCE_REQUIRED'); process.exit(2);
}
const serviceEvidencePath = serviceEvidenceValue ? resolve(serviceEvidenceValue) : null;
const pythonValue = option('--python');
const tag = option('--tag');
assert.ok(pythonValue && isAbsolute(pythonValue), 'ABSOLUTE_PYTHON_REQUIRED');
assert.ok(tag, 'TAG_REQUIRED');
const python = resolve(pythonValue);
const sourceSha = option('--source-sha', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
const outputDir = resolve(option('--output-dir', join(root, '.context/release-preflight', tag)));
const evidenceDir = join(root, '.context/release-evidence', tag);
const preflightStartedAt = Date.now();
const retryCount = Number(process.env.DSH_PREFLIGHT_RETRY_COUNT ?? 0);
assert.ok(Number.isSafeInteger(retryCount) && retryCount >= 0, 'PREFLIGHT_RETRY_COUNT_INVALID');
assert.match(sourceSha, /^[0-9a-f]{40}$/);
assert.match(tag, /^dsh-[A-Za-z0-9._-]+$/);

const currentSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (currentSourceSha !== sourceSha) {
  console.error(`DSH_PREFLIGHT_${checkOnly ? 'CHECK' : 'READINESS'}_STATUS BLOCKED code=PREFLIGHT_SOURCE_SHA_MISMATCH expected=${sourceSha} actual=${currentSourceSha}`);
  process.exit(2);
}

// A formal preflight owns creation of the pinned upstream checkout in its
// prepare stage.  The read-only check must still require that checkout, while
// the build path may start on a clean runner where it does not exist yet.
const readiness = await collectReleaseReadiness({ root, pythonPath: python, upstreamPath: upstream, outputDir, requireClean: true, requireRuntime: checkOnly, requireOutput: true, requireUpstream: checkOnly });
// Validate before prepare/build/network work; release validates the same bytes
// again. A local service PASS never overrides runtime or production gates.
if (readiness.profile) {
  try {
    const gate = await prepareServiceCompatibility(readiness.profile.profile.service_binding, serviceEvidencePath);
    readiness.checks.push({ name: 'service-compatibility', ok: true, value: gate?.status ?? 'NOT_REQUIRED' });
  } catch (error) {
    const code = String(error?.message ?? '').match(/SERVICE_[A-Z0-9_]+/)?.[0] ?? 'SERVICE_EVIDENCE_INVALID';
    readiness.checks.push({ name: 'service-compatibility', ok: false, value: 'unverified', code,
      remedy: 'supply --service-evidence with the receipt bound to the selected profile',
      ref: 'docs/architecture/first-purchase-service-compatibility.md' });
  }
}
const evidenceExists = await lstat(evidenceDir).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
if (evidenceExists) readiness.checks.push({ name: 'tag-evidence', ok: false, value: evidenceDir, code: 'PREFLIGHT_EVIDENCE_EXISTS', remedy: 'inspect prior evidence and use a fresh tag for a new run' });
readiness.ok = readiness.checks.every(check => check.ok);
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

const run = (command, args, env = {}) => {
  const childEnv = {
    ...process.env,
    ...env,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    CI: '1',
  };
  // `pipeline.mjs --prepare` owns creation and verification of the pinned
  // checkout.  B0_BUILD_UPSTREAM is intentionally a read-only --check
  // override there, so do not leak it into the prepare child process.  All
  // later stages use the exact prepared checkout explicitly.
  if (env.B0_BUILD_UPSTREAM === null) delete childEnv.B0_BUILD_UPSTREAM;
  else if (!Object.hasOwn(env, 'B0_BUILD_UPSTREAM')) childEnv.B0_BUILD_UPSTREAM = upstream;
  return execFileSync(command, args, { cwd: root, env: childEnv, stdio: 'inherit' });
};

// Every attempt owns a unique directory. Failed evidence is retained there;
// an interrupted attempt cannot overwrite a candidate or a prior runtime.
const runsRoot = join(root, '.context/release-preflight-runs');
await mkdir(runsRoot, { recursive: true, mode: 0o700 });
const runDir = await mkdtemp(join(runsRoot, `${tag}-`));
const runtimeOutput = join(runDir, releaseAssetNames(tag).find(name => name.startsWith('shinemage-dsh-upstream-runtime-')));
const runtimeProvenance = `${runtimeOutput}.provenance.json`;
const bundleDir = join(runDir, 'bundle');
try {
  await stage('prepare', () => run(process.execPath, ['scripts/dsh-b0/pipeline.mjs', '--prepare', '--python', python], { B0_BUILD_UPSTREAM: null, DSH_UPSTREAM_CHECKOUT: upstream }));
  // Advisory lookup is network-dependent and intentionally separate from
  // preparation. If the registry is unavailable, the prepared checkout is
  // retained and the next attempt can retry only this fail-closed stage.
  await stage('audit', () => run(process.execPath, ['scripts/dsh-b0/pipeline.mjs', '--audit', '--python', python], { B0_BUILD_UPSTREAM: null, DSH_UPSTREAM_CHECKOUT: upstream }));
  assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin, 'PREFLIGHT_UPSTREAM_SHA_MISMATCH');
  await stage('build', async () => {
    // The historical stage name stays in the preflight contract. Runtime bytes
    // are built by the independent author CI; this stage revalidates fixed packs.
    const packs = await loadReleasePacks({ root, inputsPath: process.env.DSH_PROFILE_PACK_INPUTS,
      manifestPath: process.env.DSH_PROFILE_MANIFEST, requireGeneratedProvenance: true });
    assert.equal(packs.inputsSha256, readiness.pluginPacks.inputsSha256, 'PREFLIGHT_PACK_INPUTS_CHANGED');
    console.log(`DSH_PREFLIGHT_PLUGIN_INPUTS mode=fixed-pack count=${packs.plugins.length} digest=${packs.inputsSha256}`);
  });
  // Prepare is the only stage that may hydrate the pinned checkout. Once it
  // succeeds, package that exact pnpm store offline so a transient registry
  // or CDN outage cannot invalidate an otherwise ready candidate.
  await stage('runtime', async () => {
    run(process.execPath, ['scripts/release/runtime-bundle.mjs', '--upstream', upstream, '--output', runtimeOutput, '--provenance', runtimeProvenance]);
    const proofInfo = await lstat(runtimeProvenance);
    assert.ok(proofInfo.isFile() && !proofInfo.isSymbolicLink(), 'PREFLIGHT_RUNTIME_PROVENANCE_FILE');
    const proof = JSON.parse(await readFile(runtimeProvenance, 'utf8'));
    assert.equal(proof.schema_version, 'dsh-generated-bytes/v1', 'PREFLIGHT_RUNTIME_PROVENANCE_SCHEMA');
    assert.equal(proof.status, 'PASS', 'PREFLIGHT_RUNTIME_PROVENANCE_STATUS');
    assert.equal(proof.upstream_sha, pin, 'PREFLIGHT_RUNTIME_PROVENANCE_UPSTREAM');
    assert.equal(proof.archive.bytes, (await lstat(runtimeOutput)).size, 'PREFLIGHT_RUNTIME_PROVENANCE_BYTES');
    assert.equal(proof.archive.sha256, await sha256(runtimeOutput), 'PREFLIGHT_RUNTIME_PROVENANCE_DIGEST');
  });
  await stage('release', () => run(process.execPath, ['scripts/dsh.mjs', 'release', '--offline', '--tag', tag,
    ...(serviceEvidencePath ? ['--service-evidence', serviceEvidencePath] : [])],
  { DSH_UPSTREAM_RUNTIME_BUNDLE: runtimeOutput, RELEASE_STATE_PATH: join(runDir, 'release-state.json'),
    DSH_RELEASE_PACK_INPUTS_SHA256: readiness.pluginPacks.inputsSha256, DSH_PYTHON: python }));
  await stage('test', () => run(process.execPath, ['scripts/dsh.mjs', 'test']));
  const scratch = await mkdtemp(join(tmpdir(), 'release-preflight-receive-'));
  try {
    await stage('receive', () => receiveArtifact({ artifact: join(evidenceDir, `${tag}.tar.zst`),
      manifestPath: join(evidenceDir, 'release-manifest.v1.json'), destination: join(scratch, 'received') }));
  } finally { await rm(scratch, { recursive: true, force: true }); }
  await stage('evidence', async () => {
    await mkdir(bundleDir, { mode: 0o700 });
    for (const name of releaseAssetNames(tag)) await copyFile(join(evidenceDir, name), join(bundleDir, name));
  });
  const summary = await summarizePreflight(bundleDir, { tag, sourceSha, stages: stageTimings, startedAt: preflightStartedAt, retryCount });
  await writeFile(join(bundleDir, 'release-preflight.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await verifyPreflight(bundleDir, { tag, sourceSha });
  await mkdir(dirname(outputDir), { recursive: true });
  // Reserve the candidate name without replacing an existing empty directory.
  await mkdir(outputDir, { mode: 0o700 });
  try {
    for (const name of [...releaseAssetNames(tag), 'release-preflight.json']) await copyFile(join(bundleDir, name), join(outputDir, name));
  } catch (error) {
    await rename(outputDir, join(runDir, 'incomplete-output'));
    throw error;
  }
  console.log(`DSH_RELEASE_PREFLIGHT_PASS source=${sourceSha} tag=${tag} bundle=${outputDir}`);
} catch (error) {
  const code = String(error?.message ?? '').match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'PREFLIGHT_FAILED';
  await writeFile(join(runDir, 'failure.json'), `${JSON.stringify({ status: 'FAILED', release_tag: tag, source_sha: sourceSha, error_code: code, stage_timings: stageTimings, evidence_dir: evidenceDir }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.error(`DSH_PREFLIGHT_RECOVERY code=${code} evidence=${runDir} remedy=inspect retained evidence and retry with a fresh tag`);
  throw error;
}
