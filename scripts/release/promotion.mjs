import { access, mkdir, open, readFile, rename, rm, symlink, lstat, readlink } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { receiveArtifact, sha256 } from './artifact.mjs';
import { recordEvent } from './state.mjs';
import { assertDeploymentTrust, verifyAttestationBundle, verifyPublicationRecord } from './trust.mjs';

const TAG = /^dsh-[A-Za-z0-9._-]+$/;
const OWNER = /^[A-Za-z0-9._:-]{3,128}$/;
function assertTag(tag) { if (!TAG.test(tag) || tag.includes('..')) throw new Error('RELEASE_TAG_INVALID'); }
function releasePath(root, tag) {
  assertTag(tag); const base = resolve(root, 'releases'); const target = resolve(base, tag);
  if (target !== base && !target.startsWith(`${base}/`)) throw new Error('RELEASE_PATH_INVALID');
  return target;
}
async function fsyncDir(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function replaceSymlink(link, target) { const temp = `${link}.next-${process.pid}`; await rm(temp, { force: true }); await symlink(target, temp); await rename(temp, link); await fsyncDir(dirname(link)); }
async function writeFileAtomic(path, value) { const temp = `${path}.tmp-${process.pid}`; const handle = await open(temp, 'wx', 0o600); try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); } await rename(temp, path); await fsyncDir(dirname(path)); }
async function writeMarker(dir, value) { const path = join(dir, 'release-marker.json'); const handle = await open(path, 'wx', 0o600); try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); } }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

export function assertPublicationAssets(publication, expectedAssets) {
  const byName = new Map((publication?.assets ?? []).map(asset => [asset.name, asset]));
  for (const [name, digest] of expectedAssets) {
    const asset = byName.get(name);
    if (!asset) throw new Error(`TRUST_ASSET_MISSING ${name}`);
    if (asset.sha256 !== digest) throw new Error(`TRUST_ASSET_DIGEST_MISMATCH ${name}`);
  }
  return true;
}

export async function installRelease({ artifact, manifestPath, releaseRoot, tag, statePath, owner = 'shinemage-dsh', restartDependency = 'shinemage-dsh.service', publicationPath = null, sumsPath = null, evidenceIndexPath = null, attestationBundlePath = null, repository = null, sourceRef = null, signerWorkflow = null, gh = 'gh' }) {
  assertTag(tag); const root = resolve(releaseRoot); const releases = join(root, 'releases'); const target = releasePath(root, tag);
  if (!OWNER.test(owner) || !OWNER.test(restartDependency)) throw new Error('RELEASE_OWNER_INVALID');
  await mkdir(releases, { recursive: true, mode: 0o700 });
  const manifest = await readJson(manifestPath);
  if (manifest.release_tag !== tag) throw new Error('RELEASE_TAG_MANIFEST_MISMATCH');
  let trust = null;
  if (publicationPath !== null) {
    if (![sumsPath, evidenceIndexPath, attestationBundlePath, repository, sourceRef].every(value => typeof value === 'string' && value)) throw new Error('RELEASE_TRUST_INPUTS_REQUIRED');
    const [manifestSha256, sha256sumsSha256, evidenceIndexSha256] = await Promise.all([sha256(manifestPath), sha256(sumsPath), sha256(evidenceIndexPath)]);
    const publication = await readJson(publicationPath);
    trust = await verifyPublicationRecord(publicationPath, {
      releaseTag: tag,
      sourceSha: manifest.source_sha,
      manifestSha256,
      sha256sumsSha256,
      evidenceIndexSha256,
      requiredAssets: [basename(artifact), basename(manifestPath), basename(sumsPath), basename(evidenceIndexPath)],
    });
    assertPublicationAssets(publication, [
      [basename(artifact), manifest.artifact_sha256],
      [basename(manifestPath), manifestSha256],
      [basename(sumsPath), sha256sumsSha256],
      [basename(evidenceIndexPath), evidenceIndexSha256],
    ]);
    const attestation = await verifyAttestationBundle({ artifactPath: artifact, bundlePath: attestationBundlePath, repository, sourceRef, signerWorkflow, gh });
    if (attestation.status !== 'VERIFIED' || trust.provenance_status !== 'VERIFIED') throw new Error('RELEASE_PROVENANCE_NOT_VERIFIED');
    assertDeploymentTrust(trust);
  }
  if (await access(target).then(() => true, () => false)) throw new Error('RELEASE_EXISTS');
  const staging = join(releases, `.incoming-${tag}-${process.pid}-${Date.now()}`);
  try {
    const received = await receiveArtifact({ artifact, manifestPath, destination: staging });
    await writeMarker(staging, { tag, source_sha: manifest.source_sha, artifact_sha256: received.sha256, owner, restart_dependency: restartDependency, publication_status: trust?.status ?? 'NOT_CHECKED', provenance_status: trust?.provenance_status ?? 'NOT_AVAILABLE', state: 'PREPARED', prepared_at: new Date().toISOString() });
    await fsyncDir(staging);
    // Rename is exclusive: never remove or replace an existing release.
    await rename(staging, target); await fsyncDir(releases);
    if (statePath) await recordEvent(statePath, { release_tag: tag, status: 'PREPARED', path: target, source_sha: manifest.source_sha });
    return { status: 'PREPARED', tag, path: target, sourceSha: manifest.source_sha };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

export async function activateRelease({ releaseRoot, tag, sourceSha, statePath, expectedOwner = null }) {
  assertTag(tag); if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('SOURCE_SHA_INVALID');
  const root = resolve(releaseRoot); const target = releasePath(root, tag); const marker = await readJson(join(target, 'release-marker.json'));
  if (marker.tag !== tag || marker.source_sha !== sourceSha) throw new Error('RELEASE_MARKER_MISMATCH');
  if (!OWNER.test(marker.owner ?? '') || !OWNER.test(marker.restart_dependency ?? '')) throw new Error('RELEASE_OWNER_MISSING');
  if (expectedOwner !== null && marker.owner !== expectedOwner) throw new Error('RELEASE_OWNER_MISMATCH');
  const current = join(root, 'current'); let previous = null;
  try {
    const currentStat = await lstat(current);
    if (!currentStat.isSymbolicLink()) throw new Error('CURRENT_TARGET_INVALID');
    const linked = resolve(await readlink(current));
    try {
      const recorded = resolve((await readFile(join(root, 'current-target'), 'utf8')).trim());
      if (recorded !== linked) throw new Error('CURRENT_TARGET_DRIFT');
    } catch (error) { if (error.code === 'ENOENT') throw new Error('CURRENT_TARGET_RECORD_MISSING'); throw error; }
    previous = linked;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous) {
    const releases = resolve(root, 'releases'); const prevResolved = resolve(previous);
    if (!prevResolved.startsWith(`${releases}/`)) throw new Error('ROLLBACK_TARGET_INVALID');
    await writeFileAtomic(join(root, 'rollback-target.json'), JSON.stringify({ target: prevResolved, recorded_at: new Date().toISOString() }, null, 2) + '\n');
  }
  try {
    const currentStat = await lstat(current);
    if (currentStat.isSymbolicLink()) {
      const linked = resolve(await readlink(current));
      if (linked === target) return { status: 'ACTIVE', tag, previous, current: target, idempotent: true };
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await replaceSymlink(current, target); await writeFileAtomic(join(root, 'current-target'), `${target}\n`);
  const completedAt = new Date().toISOString();
  await writeFileAtomic(join(target, 'active.json'), JSON.stringify({ tag, source_sha: sourceSha, activated_at: completedAt }, null, 2) + '\n');
  await writeReceipt(root, { schema_version: 'promotion-receipt/v1', release_tag: tag, status: 'ACTIVE', source_sha: sourceSha, started_at: completedAt, completed_at: completedAt });
  if (statePath) await recordEvent(statePath, { release_tag: tag, status: 'ACTIVE', previous, source_sha: sourceSha });
  return { status: 'ACTIVE', tag, previous, current: target };
}

export async function rollbackRelease({ releaseRoot, statePath }) {
  const root = resolve(releaseRoot); const rollbackRecord = await readJson(join(root, 'rollback-target.json'));
  if (!rollbackRecord || typeof rollbackRecord.target !== 'string') throw new Error('ROLLBACK_TARGET_MISSING');
  const previous = rollbackRecord.target;
  const releases = resolve(root, 'releases'); const target = resolve(previous);
  if (!target.startsWith(`${releases}/`) || target === releases) throw new Error('ROLLBACK_TARGET_INVALID');
  const targetStat = await lstat(target); if (!targetStat.isDirectory()) throw new Error('ROLLBACK_TARGET_INVALID');
  const marker = await readJson(join(target, 'release-marker.json')); if (!/^[0-9a-f]{40}$/.test(marker.source_sha)) throw new Error('ROLLBACK_SOURCE_INVALID');
  await replaceSymlink(join(root, 'current'), target); await writeFileAtomic(join(root, 'current-target'), `${target}\n`);
  const completedAt = new Date().toISOString();
  await writeReceipt(root, { schema_version: 'promotion-receipt/v1', release_tag: marker.tag, status: 'ROLLED_BACK', source_sha: marker.source_sha, started_at: completedAt, completed_at: completedAt });
  if (statePath) await recordEvent(statePath, { status: 'ROLLED_BACK', target, source_sha: marker.source_sha });
  return { status: 'ROLLED_BACK', target };
}
async function writeReceipt(root, value) {
  const path = join(root, 'evidence', value.release_tag, `promotion-${value.status.toLowerCase()}.v1.json`); const content = JSON.stringify(value, null, 2) + '\n';
  try { if (await readFile(path, 'utf8') !== content) throw new Error('EVIDENCE_IMMUTABLE'); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFileAtomic(path, content);
}
