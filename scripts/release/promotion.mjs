import { access, mkdir, open, readFile, rename, rm, symlink, lstat, readlink, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { receiveArtifact, sha256 } from './artifact.mjs';
import { recordEvent } from './state.mjs';
import { assertSchema } from './schema.mjs';
import { assertDeploymentTrust, verifyAttestationBundle, verifyGitHubEnvironmentApproval, verifyGitHubRelease, verifyPublicationRecord } from './trust.mjs';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const TAG = /^dsh-[A-Za-z0-9._-]+$/;
const OWNER = /^[A-Za-z0-9._:-]{3,128}$/;
const EVIDENCE_SCHEMA = fileURLToPath(new URL('./schemas/ci-evidence-index.v1.schema.json', import.meta.url));
const RUNTIME_RECEIVER = fileURLToPath(new URL('./secure-runtime-unpack.py', import.meta.url));
const execFile = promisify(execFileCallback);
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

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
async function withPromotionLock(root, fn) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lock = join(root, '.promotion.lock');
  let handle;
  const nonce = randomBytes(16).toString('hex');
  try {
    handle = await open(lock, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, nonce }) + '\n');
    await handle.sync();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const owner = JSON.parse(await readFile(lock, 'utf8'));
      if (processIsAlive(owner.pid)) throw new Error('PROMOTION_LOCKED');
      await rm(lock);
      handle = await open(lock, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, nonce }) + '\n');
      await handle.sync();
    } catch (retryError) {
      if (retryError.message === 'PROMOTION_LOCKED') throw retryError;
      throw new Error('PROMOTION_LOCKED');
    }
  } finally { await handle?.close(); }
  try { return await fn(); } finally {
    try {
      const owner = JSON.parse(await readFile(lock, 'utf8'));
      if (owner.nonce === nonce) await rm(lock);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export function assertPublicationAssets(publication, expectedAssets) {
  const byName = new Map((publication?.assets ?? []).map(asset => [asset.name, asset]));
  for (const [name, digest] of expectedAssets) {
    const asset = byName.get(name);
    if (!asset) throw new Error(`TRUST_ASSET_MISSING ${name}`);
    if (asset.sha256 !== digest) throw new Error(`TRUST_ASSET_DIGEST_MISMATCH ${name}`);
  }
  return true;
}

export async function assertReleaseInputs({ artifact, upstreamRuntimeArtifact = null, manifestPath, sumsPath, evidenceIndexPath, tag, manifest }) {
  const sums = await readFile(sumsPath, 'utf8');
  const entries = new Map();
  for (const line of sums.split(/\r?\n/).filter(Boolean)) {
    const match = /^(?<digest>[0-9a-f]{64})\s+(?<name>[^\s]+)$/.exec(line);
    if (!match || entries.has(match.groups.name)) throw new Error('RELEASE_CHECKSUM_FORMAT_INVALID');
    entries.set(match.groups.name, match.groups.digest);
  }
  const expected = [[basename(artifact), manifest.artifact_sha256], [basename(manifestPath), await sha256(manifestPath)]];
  if (manifest.upstream_runtime) {
    const runtime = manifest.upstream_runtime;
    if (runtime.name !== basename(runtime.name) || runtime.name.includes('\\')) throw new Error('RELEASE_UPSTREAM_RUNTIME_NAME_INVALID');
    if (!upstreamRuntimeArtifact) throw new Error('RELEASE_UPSTREAM_RUNTIME_REQUIRED');
    const info = await stat(upstreamRuntimeArtifact);
    if (info.size !== runtime.bytes || await sha256(upstreamRuntimeArtifact) !== runtime.sha256) throw new Error('RELEASE_UPSTREAM_RUNTIME_DIGEST_MISMATCH');
    expected.push([runtime.name, runtime.sha256]);
  }
  for (const [name, digest] of expected) if (entries.get(name) !== digest) throw new Error(`RELEASE_CHECKSUM_BINDING_MISMATCH ${name}`);
  let evidence;
  try { evidence = JSON.parse(await readFile(evidenceIndexPath, 'utf8')); } catch { throw new Error('RELEASE_EVIDENCE_INVALID'); }
  await assertSchema(evidence, EVIDENCE_SCHEMA);
  if (evidence.release_tag !== tag) throw new Error('RELEASE_EVIDENCE_TAG_MISMATCH');
  if (manifest.upstream_runtime) {
    const entry = evidence.entries.find(item => item.name === 'upstream-runtime-bundle' || item.ref === manifest.upstream_runtime.name);
    if (!entry || entry.status !== 'PASS' || entry.sha256 !== manifest.upstream_runtime.sha256) throw new Error('RELEASE_EVIDENCE_RUNTIME_MISMATCH');
  }
  return true;
}

async function receiveRuntimeArtifact({ artifact, destination }) {
  const python = process.env.DSH_PYTHON || 'python3';
  const { stdout } = await execFile(python, [RUNTIME_RECEIVER, artifact, destination], { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return stdout.trim();
}

export async function installRelease({ artifact, upstreamRuntimeArtifact = null, manifestPath, releaseRoot, tag, statePath, owner = 'shinemage-dsh', restartDependency = 'shinemage-dsh.service', publicationPath = null, sumsPath = null, evidenceIndexPath = null, attestationBundlePath = null, runtimeAttestationBundlePath = null, repository = null, sourceRef = null, signerWorkflow = null, gh = 'gh', offline = false }) {
  assertTag(tag); const root = resolve(releaseRoot); const releases = join(root, 'releases'); const target = releasePath(root, tag);
  if (!OWNER.test(owner) || !OWNER.test(restartDependency)) throw new Error('RELEASE_OWNER_INVALID');
  await mkdir(releases, { recursive: true, mode: 0o700 });
  const manifest = await readJson(manifestPath);
  if (manifest.release_tag !== tag) throw new Error('RELEASE_TAG_MANIFEST_MISMATCH');
  if (manifest.upstream_runtime && manifest.upstream_runtime.upstream_sha !== manifest.dsh_upstream_sha) throw new Error('RELEASE_UPSTREAM_RUNTIME_SHA_MISMATCH');
  if (manifest.upstream_runtime && !upstreamRuntimeArtifact) throw new Error('RELEASE_UPSTREAM_RUNTIME_REQUIRED');
  if (publicationPath === null && offline !== true) throw new Error('RELEASE_TRUST_INPUTS_REQUIRED');
  let trust = null;
  if (publicationPath !== null) {
    if (![sumsPath, evidenceIndexPath, attestationBundlePath, repository, sourceRef].every(value => typeof value === 'string' && value)) throw new Error('RELEASE_TRUST_INPUTS_REQUIRED');
    if (manifest.upstream_runtime && (typeof runtimeAttestationBundlePath !== 'string' || !runtimeAttestationBundlePath)) throw new Error('RELEASE_UPSTREAM_RUNTIME_ATTESTATION_REQUIRED');
    const [manifestSha256, sha256sumsSha256, evidenceIndexSha256] = await Promise.all([sha256(manifestPath), sha256(sumsPath), sha256(evidenceIndexPath)]);
    await assertReleaseInputs({ artifact, upstreamRuntimeArtifact, manifestPath, sumsPath, evidenceIndexPath, tag, manifest });
    const publication = await readJson(publicationPath);
    const requiredAssetDigests = [
      [basename(artifact), manifest.artifact_sha256],
      [basename(manifestPath), manifestSha256],
      [basename(sumsPath), sha256sumsSha256],
      [basename(evidenceIndexPath), evidenceIndexSha256],
    ];
    if (manifest.upstream_runtime) requiredAssetDigests.push([manifest.upstream_runtime.name, manifest.upstream_runtime.sha256]);
    trust = await verifyPublicationRecord(publicationPath, {
      releaseTag: tag,
      sourceSha: manifest.source_sha,
      manifestSha256,
      sha256sumsSha256,
      evidenceIndexSha256,
      requiredAssets: requiredAssetDigests.map(([name]) => name),
    });
    assertPublicationAssets(publication, requiredAssetDigests);
    const approval = await verifyGitHubEnvironmentApproval({ repository, approvalRef: publication.approval_ref, releaseTag: tag, sourceSha: manifest.source_sha, gh });
    if (approval.status !== 'VERIFIED') throw new Error('RELEASE_APPROVAL_NOT_VERIFIED');
    const attestation = await verifyAttestationBundle({ artifactPath: artifact, bundlePath: attestationBundlePath, repository, sourceRef, signerWorkflow, gh });
    const runtimeAttestation = manifest.upstream_runtime ? await verifyAttestationBundle({ artifactPath: upstreamRuntimeArtifact, bundlePath: runtimeAttestationBundlePath, repository, sourceRef, signerWorkflow, gh }) : null;
    if (sourceRef !== `refs/tags/${tag}`) throw new Error('RELEASE_SOURCE_REF_MISMATCH');
    const liveAssets = [
      { name: basename(artifact), sha256: manifest.artifact_sha256, size: (await stat(artifact)).size },
      { name: basename(manifestPath), sha256: manifestSha256, size: (await stat(manifestPath)).size },
      { name: basename(sumsPath), sha256: sha256sumsSha256, size: (await stat(sumsPath)).size },
      { name: basename(evidenceIndexPath), sha256: evidenceIndexSha256, size: (await stat(evidenceIndexPath)).size },
    ];
    if (manifest.upstream_runtime) liveAssets.push({ name: manifest.upstream_runtime.name, sha256: manifest.upstream_runtime.sha256, size: (await stat(upstreamRuntimeArtifact)).size });
    const liveRelease = await verifyGitHubRelease({ repository, releaseTag: tag, sourceSha: manifest.source_sha, expectedAssets: liveAssets, gh });
    if (attestation.status !== 'VERIFIED' || runtimeAttestation?.status === 'NOT_AVAILABLE' || liveRelease.status !== 'VERIFIED') throw new Error('RELEASE_PROVENANCE_NOT_VERIFIED');
    trust = { ...trust, approval_status: approval.status, provenance_status: 'VERIFIED', runtime_provenance_status: runtimeAttestation?.status ?? 'NOT_REQUIRED', live_release_status: liveRelease.status };
    assertDeploymentTrust(trust);
  }
  if (await access(target).then(() => true, () => false)) throw new Error('RELEASE_EXISTS');
  const staging = join(releases, `.incoming-${tag}-${process.pid}-${Date.now()}`);
  try {
    const received = await receiveArtifact({ artifact, manifestPath, destination: staging });
    let runtimeReceipt = null;
    if (manifest.upstream_runtime) runtimeReceipt = await receiveRuntimeArtifact({ artifact: upstreamRuntimeArtifact, destination: join(staging, 'upstream') });
    await writeMarker(staging, { tag, source_sha: manifest.source_sha, artifact_sha256: received.sha256, upstream_runtime: manifest.upstream_runtime ?? null, upstream_path: manifest.upstream_runtime ? 'upstream' : null, runtime_unpack: runtimeReceipt, owner, restart_dependency: restartDependency, publication_status: trust?.status ?? 'NOT_CHECKED', provenance_status: trust?.provenance_status ?? 'NOT_AVAILABLE', state: 'PREPARED', prepared_at: new Date().toISOString() });
    await fsyncDir(staging);
    // Rename is exclusive: never remove or replace an existing release.
    await rename(staging, target); await fsyncDir(releases);
    if (statePath) await recordEvent(statePath, { release_tag: tag, status: 'PREPARED', path: target, source_sha: manifest.source_sha, upstream_runtime_sha256: manifest.upstream_runtime?.sha256 ?? null });
    return { status: 'PREPARED', tag, path: target, sourceSha: manifest.source_sha };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

export async function activateRelease({ releaseRoot, tag, sourceSha, statePath, expectedOwner = null, expectedRestartDependency = null }) {
  assertTag(tag); if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('SOURCE_SHA_INVALID');
  const root = resolve(releaseRoot);
  return withPromotionLock(root, async () => {
  const target = releasePath(root, tag); const marker = await readJson(join(target, 'release-marker.json'));
  if (marker.tag !== tag || marker.source_sha !== sourceSha) throw new Error('RELEASE_MARKER_MISMATCH');
  if (!OWNER.test(marker.owner ?? '') || !OWNER.test(marker.restart_dependency ?? '')) throw new Error('RELEASE_OWNER_MISSING');
  if (expectedOwner !== null && marker.owner !== expectedOwner) throw new Error('RELEASE_OWNER_MISMATCH');
  if (expectedRestartDependency !== null && marker.restart_dependency !== expectedRestartDependency) throw new Error('RELEASE_RESTART_DEPENDENCY_MISMATCH');
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
  try {
    const currentStat = await lstat(current);
    if (currentStat.isSymbolicLink()) {
      const linked = resolve(await readlink(current));
      if (linked === target) return { status: 'ACTIVE', tag, previous, current: target, idempotent: true };
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous) {
    const releases = resolve(root, 'releases'); const prevResolved = resolve(previous);
    if (!prevResolved.startsWith(`${releases}/`)) throw new Error('ROLLBACK_TARGET_INVALID');
    await writeFileAtomic(join(root, 'rollback-target.json'), JSON.stringify({ target: prevResolved, recorded_at: new Date().toISOString() }, null, 2) + '\n');
  }
  await replaceSymlink(current, target); await writeFileAtomic(join(root, 'current-target'), `${target}\n`);
  const completedAt = new Date().toISOString();
  await writeFileAtomic(join(target, 'active.json'), JSON.stringify({ tag, source_sha: sourceSha, activated_at: completedAt }, null, 2) + '\n');
  await writeReceipt(root, { schema_version: 'promotion-receipt/v1', release_tag: tag, status: 'ACTIVE', source_sha: sourceSha, started_at: completedAt, completed_at: completedAt });
  if (statePath) await recordEvent(statePath, { release_tag: tag, status: 'ACTIVE', previous, source_sha: sourceSha });
  return { status: 'ACTIVE', tag, previous, current: target };
  });
}

export async function rollbackRelease({ releaseRoot, statePath, expectedOwner = null, expectedRestartDependency = null }) {
  const root = resolve(releaseRoot);
  return withPromotionLock(root, async () => {
  const current = join(root, 'current');
  let currentTarget = null;
  try {
    const currentStat = await lstat(current);
    if (!currentStat.isSymbolicLink()) throw new Error('CURRENT_TARGET_INVALID');
    currentTarget = resolve(await readlink(current));
    const recorded = resolve((await readFile(join(root, 'current-target'), 'utf8')).trim());
    if (recorded !== currentTarget) throw new Error('CURRENT_TARGET_DRIFT');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const rollbackRecord = await readJson(join(root, 'rollback-target.json'));
  if (!rollbackRecord || typeof rollbackRecord.target !== 'string') throw new Error('ROLLBACK_TARGET_MISSING');
  const previous = rollbackRecord.target;
  const releases = resolve(root, 'releases'); const target = resolve(previous);
  if (!target.startsWith(`${releases}/`) || target === releases) throw new Error('ROLLBACK_TARGET_INVALID');
  if (currentTarget === target) {
    const marker = await readJson(join(target, 'release-marker.json'));
    return { status: 'ROLLED_BACK', target, idempotent: true, releaseTag: marker.tag };
  }
  const targetStat = await lstat(target); if (!targetStat.isDirectory()) throw new Error('ROLLBACK_TARGET_INVALID');
  const marker = await readJson(join(target, 'release-marker.json'));
  if (!/^[0-9a-f]{40}$/.test(marker.source_sha)) throw new Error('ROLLBACK_SOURCE_INVALID');
  if (!OWNER.test(marker.owner ?? '') || !OWNER.test(marker.restart_dependency ?? '')) throw new Error('RELEASE_OWNER_MISSING');
  if (expectedOwner !== null && marker.owner !== expectedOwner) throw new Error('RELEASE_OWNER_MISMATCH');
  if (expectedRestartDependency !== null && marker.restart_dependency !== expectedRestartDependency) throw new Error('RELEASE_RESTART_DEPENDENCY_MISMATCH');
  await replaceSymlink(current, target); await writeFileAtomic(join(root, 'current-target'), `${target}\n`);
  const completedAt = new Date().toISOString();
  await writeReceipt(root, { schema_version: 'promotion-receipt/v1', release_tag: marker.tag, status: 'ROLLED_BACK', source_sha: marker.source_sha, started_at: completedAt, completed_at: completedAt });
  if (statePath) await recordEvent(statePath, { status: 'ROLLED_BACK', target, source_sha: marker.source_sha });
  return { status: 'ROLLED_BACK', target };
  });
}
async function writeReceipt(root, value) {
  const dir = join(root, 'evidence', value.release_tag); const content = JSON.stringify(value, null, 2) + '\n';
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `promotion-${value.status.toLowerCase()}-${value.completed_at.replace(/[^0-9TZ-]/g, '')}-${randomBytes(6).toString('hex')}.v1.json`);
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  await fsyncDir(dir);
}
