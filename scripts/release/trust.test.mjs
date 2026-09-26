import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyReviewedCommit } from './trust.mjs';
test('trust blocks mismatched reviewed commit and marks missing provenance unavailable', async () => {
  const sha = 'a'.repeat(40); await assert.rejects(() => verifyReviewedCommit({ sourceSha: sha, reviewedSha: 'b'.repeat(40) }), /TRUST_REVIEWED_SHA_MISMATCH/);
  assert.equal((await verifyReviewedCommit({ sourceSha: sha, reviewedSha: sha })).status, 'NOT_AVAILABLE');
});
test('trust refuses unverified provenance and signature', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-trust-')); const sha = 'a'.repeat(40); const provenance = join(dir, 'provenance.json'); const signature = join(dir, 'signature.sig');
  await writeFile(provenance, JSON.stringify({ subject_sha: sha })); await writeFile(signature, 'synthetic-signature'); assert.equal((await verifyReviewedCommit({ sourceSha: sha, reviewedSha: sha, provenancePath: provenance, signaturePath: signature })).status, 'NOT_AVAILABLE');
});
