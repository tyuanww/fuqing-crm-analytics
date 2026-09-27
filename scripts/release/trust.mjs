import { readFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertSchema } from './schema.mjs';

const TAG = /^dsh-[A-Za-z0-9._-]+$/;
const SHA40 = /^[0-9a-f]{40}$/;
const APPROVAL_REF = /^run:(\d+)$/;
const execFile = promisify(execFileCallback);

/** Public trust verification is intentionally fail-closed until a pinned Sigstore verifier is configured. */
export async function verifyReviewedCommit({ sourceSha, reviewedSha, provenancePath = null, signaturePath = null }) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha) || sourceSha !== reviewedSha) throw new Error('TRUST_REVIEWED_SHA_MISMATCH');
  if (!provenancePath || !signaturePath) return { status: 'NOT_AVAILABLE', reason: 'pinned OIDC/Sigstore verifier and trusted identity are required' };
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  const signature = await readFile(signaturePath, 'utf8');
  if (provenance.subject_sha !== sourceSha || !signature.length) throw new Error('TRUST_PROVENANCE_MISMATCH');
  // A non-empty text file is not a signature. Never promote this path to PASS.
  return { status: 'NOT_AVAILABLE', reason: 'signature verifier is unavailable; refusing unsigned/unchecked trust', source_sha: sourceSha };
}

/** Verify a GitHub artifact-attestation bundle without trusting sidecar text. */
export async function verifyAttestationBundle({ artifactPath, bundlePath, repository, sourceRef, signerWorkflow = null, gh = 'gh' } = {}) {
  if (typeof artifactPath !== 'string' || !artifactPath || typeof bundlePath !== 'string' || !bundlePath || typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)) return { status: 'NOT_AVAILABLE', reason: 'artifact, bundle and repository are required' };
  if (typeof sourceRef !== 'string' || !sourceRef) return { status: 'NOT_AVAILABLE', reason: 'source_ref is required' };
  if (typeof signerWorkflow !== 'string' || !signerWorkflow) return { status: 'NOT_AVAILABLE', reason: 'signer_workflow is required' };
  const args = ['attestation', 'verify', artifactPath, '--bundle', bundlePath, '--repo', repository, '--source-ref', sourceRef, '--format', 'json'];
  args.push('--signer-workflow', signerWorkflow);
  try {
    const { stdout } = await execFile(gh, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const result = JSON.parse(stdout);
    if (!Array.isArray(result) || result.length === 0) return { status: 'NOT_AVAILABLE', reason: 'attestation verification returned no records' };
    return { status: 'VERIFIED', repository, source_ref: sourceRef, signer_workflow: signerWorkflow, attestation_count: result.length };
  } catch (error) {
    return { status: 'NOT_AVAILABLE', reason: 'attestation verification failed', detail: String(error?.message ?? error).slice(0, 240) };
  }
}

async function ghJson(gh, args) {
  const { stdout } = await execFile(gh, ['api', ...args], { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return JSON.parse(stdout);
}

/** Verify that the live GitHub Release and tag agree with the local sidecars. */
export async function verifyGitHubRelease({ repository, releaseTag, sourceSha, expectedAssets = [], gh = 'gh' } = {}) {
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository) || !TAG.test(releaseTag) || !SHA40.test(sourceSha)) return { status: 'NOT_AVAILABLE', reason: 'repository, release_tag and source_sha are required' };
  try {
    const release = await ghJson(gh, [`repos/${repository}/releases/tags/${releaseTag}`, '--header', 'Accept: application/vnd.github+json']);
    if (release.tag_name !== releaseTag || release.draft !== false || release.immutable !== true) return { status: 'NOT_AVAILABLE', reason: 'live release is not a published immutable release' };
    const ref = await ghJson(gh, [`repos/${repository}/git/ref/tags/${releaseTag}`, '--header', 'Accept: application/vnd.github+json']);
    let refSha = ref?.object?.sha;
    if (ref?.object?.type === 'tag') {
      const annotated = await ghJson(gh, [`repos/${repository}/git/tags/${refSha}`, '--header', 'Accept: application/vnd.github+json']);
      refSha = annotated?.object?.sha;
    }
    if (refSha !== sourceSha) return { status: 'NOT_AVAILABLE', reason: 'live tag target does not match source_sha' };
    const liveAssets = new Map((release.assets ?? []).map(asset => [asset.name, asset]));
    for (const expected of expectedAssets) {
      const asset = liveAssets.get(expected.name);
      const digest = typeof asset?.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : null;
      if (!asset || digest !== expected.sha256 || (Number.isInteger(expected.size) && asset.size !== expected.size)) return { status: 'NOT_AVAILABLE', reason: `live release asset mismatch: ${expected.name}` };
    }
    return { status: 'VERIFIED', release_tag: releaseTag, source_sha: sourceSha, asset_count: expectedAssets.length };
  } catch (error) {
    return { status: 'NOT_AVAILABLE', reason: 'live GitHub release verification failed', detail: String(error?.message ?? error).slice(0, 240) };
  }
}

/** Verify that approval_ref names a successful protected environment run for this exact tag SHA. */
export async function verifyGitHubEnvironmentApproval({ repository, approvalRef, releaseTag, sourceSha, gh = 'gh' } = {}) {
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository) || !APPROVAL_REF.test(approvalRef) || !TAG.test(releaseTag) || !SHA40.test(sourceSha)) return { status: 'NOT_AVAILABLE', reason: 'repository, run approval_ref, release_tag and source_sha are required' };
  const runId = approvalRef.slice(4);
  try {
    const run = await ghJson(gh, [`repos/${repository}/actions/runs/${runId}`, '--header', 'Accept: application/vnd.github+json']);
    if (String(run.id) !== runId || run.path !== '.github/workflows/dsh-release-evidence.yml' || run.event !== 'workflow_dispatch' || run.head_sha !== sourceSha || run.head_branch !== releaseTag || run.status !== 'completed' || run.conclusion !== 'success') return { status: 'NOT_AVAILABLE', reason: 'approval run is not the successful protected-tag evidence run' };
    const jobs = await ghJson(gh, [`repos/${repository}/actions/runs/${runId}/jobs?per_page=100`, '--header', 'Accept: application/vnd.github+json']);
    const evidence = (jobs.jobs ?? []).find(job => job.name === 'evidence');
    if (!evidence || evidence.conclusion !== 'success') return { status: 'NOT_AVAILABLE', reason: 'approval run evidence job did not succeed' };

    // The Actions jobs API does not consistently include the environment
    // object for a completed job. The deployment record is the authoritative
    // fallback: it is created by the protected environment gate and binds the
    // environment, tag ref, source SHA, and final success status together.
    if (evidence.environment?.name === 'dsh-release-evidence') {
      return { status: 'VERIFIED', approval_ref: approvalRef, release_tag: releaseTag, source_sha: sourceSha, environment: evidence.environment.name, environment_source: 'job' };
    }
    const deployments = await ghJson(gh, [`repos/${repository}/deployments?sha=${sourceSha}&environment=dsh-release-evidence&per_page=100`, '--header', 'Accept: application/vnd.github+json']);
    for (const deployment of deployments ?? []) {
      if (deployment.environment !== 'dsh-release-evidence' || deployment.ref !== releaseTag || deployment.sha !== sourceSha) continue;
      const statuses = await ghJson(gh, [`repos/${repository}/deployments/${deployment.id}/statuses?per_page=100`, '--header', 'Accept: application/vnd.github+json']);
      if ((statuses ?? []).some(status => status.environment === 'dsh-release-evidence' && status.state === 'success')) {
        return { status: 'VERIFIED', approval_ref: approvalRef, release_tag: releaseTag, source_sha: sourceSha, environment: 'dsh-release-evidence', environment_source: 'deployment' };
      }
    }
    return { status: 'NOT_AVAILABLE', reason: 'approval run did not complete in dsh-release-evidence environment' };
  } catch (error) {
    return { status: 'NOT_AVAILABLE', reason: 'GitHub approval verification failed', detail: String(error?.message ?? error).slice(0, 240) };
  }
}

export function assertDeploymentTrust(result) {
  if (!result || result.status !== 'PUBLICATION_RECORD_VALID' || result.provenance_status !== 'VERIFIED') throw new Error('RELEASE_PROVENANCE_NOT_VERIFIED');
  if (result.approval_status !== 'VERIFIED') throw new Error('RELEASE_APPROVAL_NOT_VERIFIED');
  return result;
}

export function verifyProtectedTag({ releaseTag, protectedRef, sourceSha, reviewedSha, refTargetSha, approvalRef }) {
  if (!TAG.test(releaseTag) || protectedRef !== 'refs/tags/' + releaseTag) throw new Error('TRUST_PROTECTED_REF_INVALID');
  if (![sourceSha, reviewedSha, refTargetSha].every(value => SHA40.test(value)) || sourceSha !== reviewedSha || sourceSha !== refTargetSha) throw new Error('TRUST_REVIEWED_SHA_MISMATCH');
  if (typeof approvalRef !== 'string' || !APPROVAL_REF.test(approvalRef)) throw new Error('TRUST_APPROVAL_REQUIRED');
  return { status: 'PROTECTED_TAG_REVIEWED', release_tag: releaseTag, protected_ref: protectedRef, source_sha: sourceSha, approval_ref: approvalRef };
}

export async function verifyPublicationRecord(path, { releaseTag, sourceSha, manifestSha256, sha256sumsSha256, evidenceIndexSha256, requiredAssets = [] } = {}) {
  const publication = JSON.parse(await readFile(path, 'utf8'));
  await assertSchema(publication, fileURLToPath(new URL('./schemas/release-publication.v1.schema.json', import.meta.url)));
  if (publication.status !== 'PUBLISHED_VERIFIED' || publication.draft !== false || publication.immutable !== true) throw new Error('TRUST_PUBLICATION_NOT_VERIFIED');
  if (publication.release_tag !== releaseTag || publication.source_sha !== sourceSha || publication.reviewed_sha !== sourceSha) throw new Error('TRUST_PUBLICATION_BINDING_MISMATCH');
  if (publication.manifest_sha256 !== manifestSha256 || publication.sha256sums_sha256 !== sha256sumsSha256 || publication.evidence_index_sha256 !== evidenceIndexSha256) throw new Error('TRUST_PUBLICATION_DIGEST_MISMATCH');
  verifyProtectedTag({
    releaseTag: publication.release_tag,
    protectedRef: publication.protected_ref,
    sourceSha: publication.source_sha,
    reviewedSha: publication.reviewed_sha,
    refTargetSha: publication.ref_target_sha,
    approvalRef: publication.approval_ref,
  });
  const names = new Set();
  for (const asset of publication.assets) {
    if (names.has(asset.name)) throw new Error('TRUST_ASSET_DUPLICATE');
    names.add(asset.name);
  }
  for (const required of requiredAssets) if (!names.has(required)) throw new Error('TRUST_ASSET_MISSING ' + required);
  // This file is supplied by the release operator. Its schema and digests
  // can be checked locally, but its claims are not proof of a signed build.
  return { status: 'PUBLICATION_RECORD_VALID', release_tag: publication.release_tag, source_sha: publication.source_sha, assets: publication.assets.length, provenance_status: publication.provenance_status ?? 'NOT_AVAILABLE' };
}
