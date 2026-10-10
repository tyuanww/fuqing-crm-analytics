import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyAttestationBundle } from './trust.mjs';

// This executable models gh's verified output, not cryptographic verification.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-attestation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactPath = join(root, 'artifact.bin'), bundlePath = join(root, 'bundle.jsonl');
  const config = join(root, 'response.json'), calls = join(root, 'args.json');
  const bytes = 'owned synthetic artifact\n';
  await writeFile(artifactPath, bytes); await writeFile(bundlePath, 'synthetic only\n');
  const gh = join(root, 'gh');
  await writeFile(gh, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify(args));
const config = JSON.parse(fs.readFileSync(${JSON.stringify(config)}, 'utf8'));
if (config.expectedSha && args[args.indexOf('--source-digest') + 1] !== config.expectedSha) process.exit(1);
if (config.error) { console.error(config.error); process.exit(1); }
if (config.changeArtifact) fs.appendFileSync(args[2], 'changed during verification');
process.stdout.write(config.raw ?? JSON.stringify(config.records));
`, { mode: 0o700 });
  const digest = createHash('sha256').update(bytes).digest('hex');
  const record = { verificationResult: { statement: { predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{ name: 'artifact.bin', digest: { sha256: digest } }] }, signature: { certificate: {} } } };
  const input = { artifactPath, bundlePath, repository: 'owner/repo', sourceRef: 'refs/tags/dsh-test',
    sourceSha: 'a'.repeat(40), signerWorkflow: 'owner/repo/.github/workflows/evidence.yml', gh };
  await writeFile(config, JSON.stringify({ records: [record] }));
  return { input, digest, record, calls, respond: value => writeFile(config, JSON.stringify(value)) };
}

test('attestation requires an exact source SHA before invoking the verifier', async t => {
  const f = await fixture(t);
  for (const sourceSha of [undefined, '', 'main', 'a'.repeat(39), 'a'.repeat(41)]) {
    const receipt = await verifyAttestationBundle({ ...f.input, sourceSha });
    assert.equal(receipt.status, 'NOT_AVAILABLE');
    assert.equal(receipt.code, 'TRUST_SOURCE_SHA_REQUIRED');
  }
  await assert.rejects(readFile(f.calls), { code: 'ENOENT' });
});

test('attestation pins the certificate source digest and returns artifact/source identity', async t => {
  const f = await fixture(t);
  await f.respond({ expectedSha: f.input.sourceSha, records: [f.record] });
  const receipt = await verifyAttestationBundle(f.input);
  assert.equal(receipt.status, 'VERIFIED');
  assert.equal(receipt.source_sha, f.input.sourceSha);
  assert.equal(receipt.artifact_sha256, f.digest);
  const args = JSON.parse(await readFile(f.calls));
  for (const [flag, value] of [['--source-digest', f.input.sourceSha], ['--source-ref', f.input.sourceRef],
    ['--signer-workflow', f.input.signerWorkflow], ['--repo', f.input.repository],
    ['--predicate-type', 'https://slsa.dev/provenance/v1']]) assert.equal(args[args.indexOf(flag) + 1], value);
  assert.equal((await verifyAttestationBundle({ ...f.input, sourceSha: 'b'.repeat(40) })).status, 'NOT_AVAILABLE');
});

test('attestation rejects empty, malformed or unrelated verified output', async t => {
  const f = await fixture(t);
  for (const value of [[], {}, [null], [{}], [{ verificationResult: {} }],
    [{ verificationResult: { statement: { predicateType: 'other', subject: f.record.verificationResult.statement.subject } } }],
    [{ verificationResult: { statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [] } } }],
    [{ verificationResult: { statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{ digest: { sha256: 'b'.repeat(64) } }] } } }],
    [f.record, {}]]) {
    await f.respond({ records: value });
    assert.equal((await verifyAttestationBundle(f.input)).status, 'NOT_AVAILABLE');
  }
  await f.respond({ raw: 'not json' });
  assert.equal((await verifyAttestationBundle(f.input)).status, 'NOT_AVAILABLE');
});

test('verifier failure receipts do not echo stderr, paths or credentials', async t => {
  const f = await fixture(t), secret = 'SYNTHETIC_SENTINEL_NEVER_LOG';
  await f.respond({ error: `Authorization: Bearer ${secret}` });
  const receipt = await verifyAttestationBundle(f.input);
  assert.equal(receipt.status, 'NOT_AVAILABLE');
  assert.equal(receipt.code, 'TRUST_ATTESTATION_VERIFY_FAILED');
  assert.ok(!JSON.stringify(receipt).includes(secret));
  assert.ok(!JSON.stringify(receipt).includes(f.input.artifactPath));
});

test('an artifact change during verification invalidates the receipt', async t => {
  const f = await fixture(t);
  await f.respond({ records: [f.record], changeArtifact: true });
  const receipt = await verifyAttestationBundle(f.input);
  assert.equal(receipt.status, 'NOT_AVAILABLE');
  assert.equal(receipt.code, 'TRUST_ARTIFACT_CHANGED');
});
