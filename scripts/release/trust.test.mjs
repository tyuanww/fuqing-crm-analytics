import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertDeploymentTrust, verifyAttestationBundle, verifyReviewedCommit, verifyProtectedTag, verifyPublicationRecord } from './trust.mjs';
test('trust blocks mismatched reviewed commit and marks missing provenance unavailable', async () => {
  const sha = 'a'.repeat(40); await assert.rejects(() => verifyReviewedCommit({ sourceSha: sha, reviewedSha: 'b'.repeat(40) }), /TRUST_REVIEWED_SHA_MISMATCH/);
  assert.equal((await verifyReviewedCommit({ sourceSha: sha, reviewedSha: sha })).status, 'NOT_AVAILABLE');
});
test('trust refuses unverified provenance and signature', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-trust-')); const sha = 'a'.repeat(40); const provenance = join(dir, 'provenance.json'); const signature = join(dir, 'signature.sig');
  await writeFile(provenance, JSON.stringify({ subject_sha: sha })); await writeFile(signature, 'synthetic-signature'); assert.equal((await verifyReviewedCommit({ sourceSha: sha, reviewedSha: sha, provenancePath: provenance, signaturePath: signature })).status, 'NOT_AVAILABLE');
});

test('deployment trust never promotes an unverified publication sidecar', async () => {
  assert.throws(() => assertDeploymentTrust({ status: 'PUBLICATION_RECORD_VALID', provenance_status: 'NOT_AVAILABLE' }), /RELEASE_PROVENANCE_NOT_VERIFIED/);
  const missing = await verifyAttestationBundle({ artifactPath: '/tmp/a', bundlePath: '/tmp/b', repository: 'tyuanww/fuqing-crm-analytics', sourceRef: 'refs/tags/dsh-test', gh: '/path/that/does/not/exist' });
  assert.equal(missing.status, 'NOT_AVAILABLE');
});

test('protected tag binds reviewed commit and approval reference', () => {
  const sha = 'a'.repeat(40); const base = { releaseTag: 'dsh-test', protectedRef: 'refs/tags/dsh-test', sourceSha: sha, reviewedSha: sha, refTargetSha: sha, approvalRef: 'approval-123' };
  assert.equal(verifyProtectedTag(base).status, 'PROTECTED_TAG_REVIEWED');
  assert.throws(() => verifyProtectedTag({ ...base, protectedRef: 'refs/heads/feature' }), /TRUST_PROTECTED_REF_INVALID/);
  assert.throws(() => verifyProtectedTag({ ...base, refTargetSha: 'b'.repeat(40) }), /TRUST_REVIEWED_SHA_MISMATCH/);
  assert.throws(() => verifyProtectedTag({ ...base, approvalRef: '' }), /TRUST_APPROVAL_REQUIRED/);
});

test('publication sidecar is fail-closed and binds five asset identities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-publication-')); const sha = 'a'.repeat(40); const digest = 'b'.repeat(64);
  const path = join(dir, 'publication.json');
  const assets = ['app.tar.zst', 'upstream.tar.zst', 'release-manifest.v1.json', 'SHA256SUMS', 'ci-evidence-index.v1.json'].map(name => ({ name, id: name, url: 'https://github.example/' + name, size: 1, sha256: digest }));
  const publication = { schema_version: 'release-publication/v1', release_tag: 'dsh-test', status: 'PUBLISHED_VERIFIED', draft: false, immutable: true, source_sha: sha, reviewed_sha: sha, protected_ref: 'refs/tags/dsh-test', ref_target_sha: sha, approval_ref: 'approval-123', manifest_sha256: digest, sha256sums_sha256: digest, evidence_index_sha256: digest, release_url: 'https://github.example/releases/dsh-test', assets };
  await writeFile(path, JSON.stringify(publication));
  const checked = await verifyPublicationRecord(path, { releaseTag: 'dsh-test', sourceSha: sha, manifestSha256: digest, sha256sumsSha256: digest, evidenceIndexSha256: digest, requiredAssets: assets.map(item => item.name) });
  assert.equal(checked.status, 'PUBLICATION_RECORD_VALID');
  assert.equal(checked.provenance_status, 'NOT_AVAILABLE');
  await writeFile(path, JSON.stringify({ ...publication, status: 'RELEASED_UNVERIFIED' }));
  await assert.rejects(() => verifyPublicationRecord(path, { releaseTag: 'dsh-test', sourceSha: sha, manifestSha256: digest, sha256sumsSha256: digest, evidenceIndexSha256: digest }), /TRUST_PUBLICATION_NOT_VERIFIED/);
});
