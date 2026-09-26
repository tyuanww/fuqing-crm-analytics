import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSchema } from './schema.mjs';

const TAG = /^dsh-[A-Za-z0-9._-]+$/;
const SHA40 = /^[0-9a-f]{40}$/;

/** Public trust verification is intentionally fail-closed until a pinned Sigstore verifier is configured. */
export async function verifyReviewedCommit({ sourceSha, reviewedSha, provenancePath = null, signaturePath = null }) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha) || sourceSha !== reviewedSha) throw new Error('TRUST_REVIEWED_SHA_MISMATCH');
  if (!provenancePath || !signaturePath) return { status: 'NOT_AVAILABLE', reason: 'pinned OIDC/Sigstore verifier and trusted identity are required' };
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  const signature = await readFile(signaturePath, 'utf8');
  if (provenance.subject_sha !== sourceSha || !signature.length) throw new Error('TRUST_PROVENANCE_MISMATCH');
  // A non-empty text file is not a signature. Never promote this path to PASS.
  return { status: 'NOT_AVAILABLE', reason: 'signature verification is not implemented; refusing unsigned/unchecked trust', source_sha: sourceSha };
}

export function verifyProtectedTag({ releaseTag, protectedRef, sourceSha, reviewedSha, refTargetSha, approvalRef }) {
  if (!TAG.test(releaseTag) || protectedRef !== 'refs/tags/' + releaseTag) throw new Error('TRUST_PROTECTED_REF_INVALID');
  if (![sourceSha, reviewedSha, refTargetSha].every(value => SHA40.test(value)) || sourceSha !== reviewedSha || sourceSha !== refTargetSha) throw new Error('TRUST_REVIEWED_SHA_MISMATCH');
  if (typeof approvalRef !== 'string' || approvalRef.trim() === '') throw new Error('TRUST_APPROVAL_REQUIRED');
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
  return { status: 'PUBLICATION_VERIFIED', release_tag: publication.release_tag, source_sha: publication.source_sha, assets: publication.assets.length, provenance_status: 'NOT_AVAILABLE' };
}
