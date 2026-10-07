/** Attach local service artifact evidence to an existing immutable candidate. */
import assert from 'node:assert/strict';
import { dirname, isAbsolute } from 'node:path';
import { insideArtifact, readArtifactFile, verifyServiceArtifactEvidence } from './service-artifact-evidence.mjs';
import { serviceDigest as hash, validateServiceGate } from './service-compatibility.mjs';
import { validateProfile } from './profile.mjs';
import { readState, recordEvent } from './state.mjs';
import { DSH_SDK_VERSION } from './toolchain.mjs';
import { verifyServiceTargetEvidence } from './service-target-evidence.mjs';

const digest = value => hash(JSON.stringify(value));
const decode = bytes => JSON.parse(bytes.toString('utf8'));

export async function verifyPluginService({ candidatePath, evidencePath, statePath, targetEvidencePath, targetInputPath } = {}) {
  assert.equal(targetEvidencePath !== undefined, targetInputPath !== undefined, 'PLUGIN_SERVICE_TARGET_ARGUMENTS_REQUIRED');
  for (const path of [candidatePath, evidencePath, statePath]) {
    assert.ok(typeof path === 'string' && isAbsolute(path), 'PLUGIN_SERVICE_ABSOLUTE_PATH_REQUIRED');
  }
  const candidateBytes = await readArtifactFile(candidatePath), candidate = decode(candidateBytes), directory = dirname(candidatePath);
  assert.equal(candidate.schema_version, 'dsh-plugin-candidate/v1', 'PLUGIN_SERVICE_CANDIDATE_SCHEMA');
  assert.equal(candidate.activation, 'NOT_RUN', 'PLUGIN_SERVICE_CANDIDATE_ACTIVATION');
  assert.equal(candidate.state_scope, 'local-explicit-journal', 'PLUGIN_SERVICE_CANDIDATE_STATE_SCOPE');
  const { candidate_digest: candidateDigest, activation: _activation, state_scope: _scope, ...base } = candidate;
  assert.match(candidateDigest ?? '', /^[a-f0-9]{64}$/, 'PLUGIN_SERVICE_CANDIDATE_DIGEST');
  assert.equal(candidateDigest, digest(base), 'PLUGIN_SERVICE_CANDIDATE_DIGEST');
  assert.match(candidate.source_sha ?? '', /^[a-f0-9]{40}$/, 'PLUGIN_SERVICE_CANDIDATE_SOURCE');
  assert.deepEqual(candidate.profile_snapshot, { name: 'profile.json', sha256: candidate.profile_digest }, 'PLUGIN_SERVICE_PROFILE_SNAPSHOT');
  const profileBytes = await insideArtifact(directory, 'profile.json', 256 * 1024), profile = decode(profileBytes);
  assert.equal(hash(profileBytes), candidate.profile_digest, 'PLUGIN_SERVICE_PROFILE_DIGEST');
  validateProfile(profile);
  assert.equal(profile.profile_id, candidate.profile_id, 'PLUGIN_SERVICE_PROFILE_ID');
  assert.ok(Object.hasOwn(profile, 'service_binding'), 'PLUGIN_SERVICE_BINDING_REQUIRED');
  await validateServiceGate(candidate.service_compatibility, profile.service_binding);
  const selected = profile.plugins.find(item => item.id === candidate.plugin?.id);
  assert.ok(selected?.enabled && selected.path === candidate.plugin.path, 'PLUGIN_SERVICE_NOT_SELECTED');
  assert.equal(candidate.plugin.dsh_pin, DSH_SDK_VERSION, 'PLUGIN_SERVICE_DSH_MISMATCH');
  const pack = decode(await insideArtifact(directory, 'plugin-pack.json'));
  assert.equal(pack.schema_version, 'dsh-plugin-pack/v1', 'PLUGIN_SERVICE_PACK_SCHEMA');
  for (const [key, value] of Object.entries({ package_name: candidate.plugin.id, package_version: candidate.plugin.version,
    dsh_pin: DSH_SDK_VERSION, source_sha: candidate.source_sha, source_dirty: false, tarball: candidate.pack })) {
    assert.deepEqual(pack[key], value, 'PLUGIN_SERVICE_PACK_MISMATCH');
  }
  assert.match(candidate.pack?.sha256 ?? '', /^[a-f0-9]{64}$/, 'PLUGIN_SERVICE_PACK_DIGEST');
  assert.ok(typeof candidate.pack.name === 'string' && /^[a-zA-Z0-9_.-]+\.tgz$/.test(candidate.pack.name), 'PLUGIN_SERVICE_PACK_NAME');
  assert.ok(Number.isSafeInteger(candidate.pack.bytes) && candidate.pack.bytes > 0 && candidate.pack.bytes <= 20 * 1024 * 1024, 'PLUGIN_SERVICE_PACK_SIZE');
  const packBytes = await insideArtifact(directory, candidate.pack.name, 20 * 1024 * 1024);
  assert.equal(packBytes.length, candidate.pack.bytes, 'PLUGIN_SERVICE_PACK_SIZE');
  assert.equal(hash(packBytes), candidate.pack.sha256, 'PLUGIN_SERVICE_PACK_DIGEST');
  const journal = await readState(statePath), key = digest([candidate.plugin.id, candidate.plugin.version]);
  const prepared = journal.idempotency[`candidate:${key}`];
  assert.ok(prepared?.status === 'COMMITTED' && prepared.result?.status === 'CANDIDATE_PREPARED', 'PLUGIN_SERVICE_NOT_PREPARED');
  assert.ok(Number.isSafeInteger(prepared.result.seq) && prepared.result.seq > 0, 'PLUGIN_SERVICE_PREPARED_NOT_DURABLE');
  assert.deepEqual(prepared.result, journal.journal[prepared.result.seq - 1], 'PLUGIN_SERVICE_PREPARED_NOT_DURABLE');
  const candidateFields = { candidate_digest: candidateDigest, profile_digest: candidate.profile_digest,
    pack_sha256: candidate.pack.sha256, service_binding: profile.service_binding };
  for (const [name, value] of Object.entries(candidateFields)) {
    assert.deepEqual(prepared.result[name], value, 'PLUGIN_SERVICE_JOURNAL_MISMATCH');
  }
  const observation = await verifyServiceArtifactEvidence({ gate: candidate.service_compatibility, evidencePath });
  // Reject invalid target inputs before appending even the base artifact event.
  const target = targetEvidencePath === undefined ? null : await verifyServiceTargetEvidence({
    artifactObservation: observation, evidencePath, targetEvidencePath, targetInputPath, candidate, candidateBytes });
  const event = await recordEvent(statePath, { release_tag: prepared.result.release_tag,
    status: 'CANDIDATE_SERVICE_ARTIFACTS_VERIFIED', ...candidateFields,
    service_evidence_sha256: observation.service_evidence_sha256, observation },
  { idempotencyKey: `candidate-service:${candidateDigest}:${observation.service_evidence_sha256}`,
    requiredEvent: { seq: prepared.result.seq, digest: prepared.result.digest } });
  if (target) {
    // A crash after the base event is safe: retry reuses it and appends only this observation.
    const targetEvent = await recordEvent(statePath, { release_tag: prepared.result.release_tag,
      status: 'CANDIDATE_SERVICE_TARGET_OBSERVED', ...candidateFields,
      service_artifact_event: { seq: event.seq, digest: event.digest }, observation: target },
    { idempotencyKey: `candidate-service-target:${candidateDigest}:${target.target_evidence_sha256}`,
      requiredEvent: { seq: event.seq, digest: event.digest } });
    return { ...target, candidate_digest: candidateDigest, service_artifacts: observation,
      service_artifact_journal_seq: event.seq, journal_seq: targetEvent.seq, journal_digest: targetEvent.digest };
  }
  return { ...observation, candidate_digest: candidateDigest, journal_seq: event.seq, journal_digest: event.digest };
}
