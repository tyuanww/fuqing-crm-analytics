import { readFile } from 'node:fs/promises';

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
