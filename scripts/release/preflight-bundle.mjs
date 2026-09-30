import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './artifact.mjs';
import { assertSchema } from './schema.mjs';
import { DSH_UPSTREAM_SHA } from './toolchain.mjs';

export const UPSTREAM_SHA = DSH_UPSTREAM_SHA;
export const RUNTIME_NAME = `shinemage-dsh-upstream-runtime-${UPSTREAM_SHA}.tar.zst`;
const LOCAL_STAGES = ['prepare', 'build', 'runtime', 'release', 'test', 'receive', 'evidence'];
const COVERAGE_KEYS = ['prepare', 'build', 'runtime', 'release', 'test', 'receive', 'wsl2', 'host_http'];
const COVERAGE_VALUES = new Set(['PASS', 'PARTIAL', 'NOT_RUN']);
export function releaseAssetNames(tag) {
  assert.match(tag, /^dsh-[A-Za-z0-9._-]+$/);
  return [`${tag}.tar.zst`, RUNTIME_NAME, 'pre-manifest.v1.json',
    'release-manifest.v1.json', 'SHA256SUMS', 'ci-evidence-index.v1.json'].sort();
}

export async function summarizePreflight(directory, { tag, sourceSha, stages = [], startedAt = null, retryCount = 0, evidenceCoverage = null }) {
  assert.match(sourceSha, /^[0-9a-f]{40}$/);
  assert.ok(Array.isArray(stages), 'PREFLIGHT_STAGES_INVALID');
  assert.ok(Number.isSafeInteger(retryCount) && retryCount >= 0, 'PREFLIGHT_RETRY_COUNT_INVALID');
  const assets = [];
  for (const name of releaseAssetNames(tag)) {
    const path = join(directory, name);
    const info = await lstat(path);
    assert.ok(info.isFile() && info.size > 0, `PREFLIGHT_FILE_INVALID ${name}`);
    assets.push({ name, bytes: info.size, sha256: await sha256(path) });
  }
  const stageTimings = stages.map(stage => ({
    name: stage.name,
    status: stage.status,
    started_at: stage.started_at,
    completed_at: stage.completed_at ?? null,
    elapsed_ms: stage.elapsed_ms ?? null,
    error_code: stage.error_code ?? null,
  }));
  const coverage = evidenceCoverage ?? { prepare: 'PASS', build: 'PASS', runtime: 'PASS', release: 'PASS', test: 'PASS', receive: 'PASS', wsl2: 'NOT_RUN', host_http: 'NOT_RUN' };
  return { schema_version: 'release-preflight/v2', status: 'PASS', source_sha: sourceSha,
    release_tag: tag, dsh_upstream_sha: UPSTREAM_SHA, assets, stage_timings: stageTimings,
    tthw_ms: startedAt === null ? null : Math.max(0, Date.now() - startedAt), retry_count: retryCount,
    evidence_coverage: coverage };
}

// Called by evidence on the downloaded bundle before attesting any bytes.
export async function verifyPreflight(directory, { tag, sourceSha }) {
  const summary = JSON.parse(await readFile(join(directory, 'release-preflight.json'), 'utf8'));
  assert.deepEqual(Object.keys(summary).sort(), ['schema_version', 'status', 'source_sha', 'release_tag', 'dsh_upstream_sha', 'assets', 'stage_timings', 'tthw_ms', 'retry_count', 'evidence_coverage'].sort(), 'PREFLIGHT_SCHEMA_INVALID');
  assert.equal(summary.schema_version, 'release-preflight/v2');
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.source_sha, sourceSha, 'PREFLIGHT_SOURCE_MISMATCH');
  assert.equal(summary.release_tag, tag, 'PREFLIGHT_TAG_MISMATCH');
  assert.equal(summary.dsh_upstream_sha, UPSTREAM_SHA);
  assert.ok(Array.isArray(summary.stage_timings), 'PREFLIGHT_STAGES_INVALID');
  assert.deepEqual(summary.stage_timings.map(stage => stage.name), LOCAL_STAGES, 'PREFLIGHT_STAGES_INCOMPLETE');
  for (const stage of summary.stage_timings) {
    assert.match(stage.name, /^[a-z-]+$/);
    assert.equal(stage.status, 'PASS', `PREFLIGHT_STAGE_NOT_PASS ${stage.name}`);
    assert.ok(typeof stage.started_at === 'string' && stage.started_at.length > 0, 'PREFLIGHT_STAGE_TIME_INVALID');
    assert.ok(Number.isSafeInteger(stage.elapsed_ms) && stage.elapsed_ms >= 0, 'PREFLIGHT_STAGE_ELAPSED_INVALID');
    assert.equal(stage.error_code, null, `PREFLIGHT_STAGE_ERROR ${stage.name}`);
  }
  assert.ok(Number.isSafeInteger(summary.tthw_ms) && summary.tthw_ms >= 0, 'PREFLIGHT_TTHW_INVALID');
  assert.ok(Number.isSafeInteger(summary.retry_count) && summary.retry_count >= 0, 'PREFLIGHT_RETRY_COUNT_INVALID');
  assert.ok(summary.evidence_coverage && typeof summary.evidence_coverage === 'object' && !Array.isArray(summary.evidence_coverage), 'PREFLIGHT_COVERAGE_INVALID');
  assert.deepEqual(Object.keys(summary.evidence_coverage).sort(), [...COVERAGE_KEYS].sort(), 'PREFLIGHT_COVERAGE_KEYS_INVALID');
  for (const key of COVERAGE_KEYS) {
    const value = summary.evidence_coverage[key];
    assert.ok(COVERAGE_VALUES.has(value), `PREFLIGHT_COVERAGE_VALUE_INVALID ${key}`);
    if (COVERAGE_KEYS.slice(0, 6).includes(key)) assert.equal(value, 'PASS', `PREFLIGHT_COVERAGE_LOCAL_NOT_PASS ${key}`);
  }
  assert.deepEqual((await readdir(directory)).sort(), [...releaseAssetNames(tag), 'release-preflight.json'].sort(), 'PREFLIGHT_FILES_MISMATCH');
  const actual = await summarizePreflight(directory, { tag, sourceSha });
  assert.deepEqual(summary.assets, actual.assets, 'PREFLIGHT_DIGEST_MISMATCH');
  const manifest = JSON.parse(await readFile(join(directory, 'release-manifest.v1.json'), 'utf8'));
  await assertSchema(manifest, fileURLToPath(new URL('./schemas/release-manifest.v1.schema.json', import.meta.url)));
  assert.equal(manifest.release_tag, tag);
  assert.equal(manifest.source_sha, sourceSha);
  assert.equal(manifest.dsh_upstream_sha, UPSTREAM_SHA);
  const byName = Object.fromEntries(actual.assets.map(asset => [asset.name, asset]));
  assert.equal(manifest.pre_manifest_sha256, byName['pre-manifest.v1.json'].sha256);
  assert.equal(manifest.artifact_sha256, byName[`${tag}.tar.zst`].sha256);
  assert.equal(manifest.artifact_bytes, byName[`${tag}.tar.zst`].bytes);
  assert.equal(manifest.upstream_runtime.name, RUNTIME_NAME);
  assert.equal(manifest.upstream_runtime.upstream_sha, UPSTREAM_SHA);
  assert.equal(manifest.upstream_runtime.sha256, byName[RUNTIME_NAME].sha256);
  assert.equal(manifest.upstream_runtime.bytes, byName[RUNTIME_NAME].bytes);
  const index = JSON.parse(await readFile(join(directory, 'ci-evidence-index.v1.json'), 'utf8'));
  assert.equal(index.release_tag, tag);
  const sums = (await readFile(join(directory, 'SHA256SUMS'), 'utf8')).trim().split('\n').sort();
  const expectedSums = [`${tag}.tar.zst`, RUNTIME_NAME, 'release-manifest.v1.json'].map(name => `${byName[name].sha256}  ${name}`).sort();
  assert.deepEqual(sums, expectedSums, 'PREFLIGHT_CHECKSUMS_MISMATCH');
  return summary;
}
