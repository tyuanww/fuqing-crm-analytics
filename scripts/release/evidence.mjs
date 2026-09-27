import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assertSchema } from './schema.mjs';

const SECRET_KEYS = /token|secret|password|cookie|authorization|api[_-]?key/i;
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[REDACTED]' : redact(item)]));
  return typeof value === 'string' && (/(sk-|github_pat_|-----BEGIN .*PRIVATE KEY-----)/i.test(value) || /(?:token|secret|password|authorization|api[_-]?key)\s*[:=]\s*['"][^'"]+/i.test(value)) ? '[REDACTED]' : value;
}
export async function writeEvidence(path, value) {
  await mkdir(dirname(path), { recursive: true }); const payload = JSON.stringify(redact(value), null, 2) + '\n'; const digest = createHash('sha256').update(payload).digest('hex');
  // Create the final path exclusively. A check-then-rename sequence can
  // overwrite a valid receipt when two release workers race.
  try {
    const handle = await import('node:fs/promises').then(fs => fs.open(path, 'wx', 0o600));
    try { await handle.writeFile(payload); await handle.sync(); } finally { await handle.close(); }
    const parent = await import('node:fs/promises').then(fs => fs.open(dirname(path), 'r'));
    try { await parent.sync(); } finally { await parent.close(); }
    return { sha256: digest, replay: false };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const old = await readFile(path, 'utf8');
    if (old !== payload) throw new Error('EVIDENCE_IMMUTABLE');
    return { sha256: digest, replay: true };
  }
}
export async function verifyEvidence(path, { expectedSha256, schemaPath } = {}) {
  const raw = await readFile(path, 'utf8');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('EVIDENCE_JSON_INVALID'); }
  const canonical = JSON.stringify(value, null, 2) + '\n';
  if (raw !== canonical) throw new Error('EVIDENCE_NOT_CANONICAL');
  if (canonical !== JSON.stringify(redact(value), null, 2) + '\n') throw new Error('EVIDENCE_UNREDACTED');
  const digest = createHash('sha256').update(raw).digest('hex');
  if (expectedSha256 && expectedSha256 !== digest) throw new Error('EVIDENCE_DIGEST_MISMATCH');
  if (schemaPath) await assertSchema(value, schemaPath);
  return { status: 'PASS', sha256: digest, path };
}
export async function makeCiIndex({ releaseTag, entries, schemaPath }) { const value = { schema_version: 'ci-evidence-index/v1', release_tag: releaseTag, entries: entries.map(item => redact(item)) }; if (schemaPath) await assertSchema(value, schemaPath); return value; }
