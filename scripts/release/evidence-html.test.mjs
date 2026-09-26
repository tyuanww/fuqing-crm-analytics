import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makeCiIndex, verifyEvidence, writeEvidence } from './evidence.mjs';
import { evaluatePublicHtmlPolicy } from './html-policy.mjs';
import { assertSchema } from './schema.mjs';

const fixture = () => mkdtemp(join(tmpdir(), 'dsh-evidence-'));
const schema = join(import.meta.dirname, 'schemas/ci-evidence-index.v1.schema.json');

test('evidence is canonical, redacted, schema-valid and digest-verifiable', async () => {
  const root = await fixture();
  const path = join(root, 'index.json');
  const value = await makeCiIndex({ releaseTag: 'dsh-test', entries: [{ name: 'doctor', status: 'PARTIAL', ref: 'pnpm dsh doctor' }], schemaPath: schema });
  await assertSchema(value, schema);
  const first = await writeEvidence(path, value);
  assert.equal((await verifyEvidence(path, { expectedSha256: first.sha256, schemaPath: schema })).status, 'PASS');
  const secretPath = join(root, 'secret.json');
  await writeEvidence(secretPath, { release_tag: 'dsh-test', authorization: 'secret-value' });
  assert.doesNotMatch(await readFile(secretPath, 'utf8'), /secret-value/);
  await writeFile(path, '{"schema_version":"ci-evidence-index/v1"}\n');
  await assert.rejects(() => verifyEvidence(path, { schemaPath: schema }), /EVIDENCE_NOT_CANONICAL|SCHEMA_/);
});

test('public HTML policy fails closed and keeps native fallback', () => {
  assert.equal(evaluatePublicHtmlPolicy().status, 'DISABLED');
  assert.equal(evaluatePublicHtmlPolicy({ csp: "default-src 'none'", sandbox: '' }).status, 'PASS');
  const scripts = evaluatePublicHtmlPolicy({ csp: "default-src 'none'", sandbox: 'allow-scripts' });
  assert.equal(scripts.status, 'DISABLED');
  assert.equal(scripts.native_fallback, 'AVAILABLE');
  assert.equal(evaluatePublicHtmlPolicy({ csp: "default-src 'none'", sandbox: 'allow-scripts', sanitized: true }).status, 'PASS');
});
