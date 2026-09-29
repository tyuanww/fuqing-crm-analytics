import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './artifact.mjs';
import { assertSchema } from './schema.mjs';

export const UPSTREAM_SHA = '477b4f420553e8a52c2fbccc464d7561b239c443';
export const RUNTIME_NAME = `shinemage-dsh-upstream-runtime-${UPSTREAM_SHA}.tar.zst`;
export function releaseAssetNames(tag) {
  assert.match(tag, /^dsh-[A-Za-z0-9._-]+$/);
  return [`${tag}.tar.zst`, RUNTIME_NAME, 'pre-manifest.v1.json',
    'release-manifest.v1.json', 'SHA256SUMS', 'ci-evidence-index.v1.json'].sort();
}

export async function summarizePreflight(directory, { tag, sourceSha }) {
  assert.match(sourceSha, /^[0-9a-f]{40}$/);
  const assets = [];
  for (const name of releaseAssetNames(tag)) {
    const path = join(directory, name);
    const info = await lstat(path);
    assert.ok(info.isFile() && info.size > 0, `PREFLIGHT_FILE_INVALID ${name}`);
    assets.push({ name, bytes: info.size, sha256: await sha256(path) });
  }
  return { schema_version: 'release-preflight/v2', status: 'PASS', source_sha: sourceSha,
    release_tag: tag, dsh_upstream_sha: UPSTREAM_SHA, assets };
}

// Called by evidence on the downloaded bundle before attesting any bytes.
export async function verifyPreflight(directory, { tag, sourceSha }) {
  const summary = JSON.parse(await readFile(join(directory, 'release-preflight.json'), 'utf8'));
  assert.deepEqual(Object.keys(summary).sort(), ['schema_version', 'status', 'source_sha', 'release_tag', 'dsh_upstream_sha', 'assets'].sort(), 'PREFLIGHT_SCHEMA_INVALID');
  assert.equal(summary.schema_version, 'release-preflight/v2');
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.source_sha, sourceSha, 'PREFLIGHT_SOURCE_MISMATCH');
  assert.equal(summary.release_tag, tag, 'PREFLIGHT_TAG_MISMATCH');
  assert.equal(summary.dsh_upstream_sha, UPSTREAM_SHA);
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
