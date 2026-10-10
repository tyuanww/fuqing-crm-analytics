import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { receiveArtifact, verifyReceivedArtifact, sha256 } from './artifact.mjs';
import { assertSchema } from './schema.mjs';
import { idempotent, recordEvent } from './state.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

/** Installation and its durable receipt share one recoverable operation. */
export async function receiveRelease({ statePath, ...input }) {
  const manifest = JSON.parse(await readFile(input.manifestPath, 'utf8'));
  await assertSchema(manifest, fileURLToPath(new URL('./schemas/release-manifest.v1.schema.json', import.meta.url)));
  const identity = {
    release_tag: manifest.release_tag,
    artifact_sha256: manifest.artifact_sha256,
    manifest_sha256: await sha256(input.manifestPath),
    destination_sha256: hash(resolve(input.destination)),
  };
  const key = `receive:${identity.artifact_sha256}:${identity.destination_sha256}`;
  await recordEvent(statePath, { ...identity, status: 'RECEIVE_INTENT', operation_key: key });
  const receipt = result => ({ ...identity, status: 'RECEIVED', entries: result.entries });
  const operation = await idempotent(statePath, key, async () => receipt(await receiveArtifact(input)), {
    fingerprint: hash(JSON.stringify(identity)),
    // A prior installation may already be visible. Prove all bytes before
    // closing UNKNOWN. Missing or divergent trees remain UNKNOWN; no retry
    // deletes or overwrites a destination implicitly.
    reconcile: async () => {
      try { return receipt(await verifyReceivedArtifact(input)); }
      catch { return undefined; }
    },
  });
  if (operation.status !== 'COMMITTED') throw new Error(`RECEIVE_${operation.status} reconcile destination and journal before retry`);
  if (operation.replay) await verifyReceivedArtifact(input);
  await recordEvent(statePath, operation.result);
  return operation.result;
}
