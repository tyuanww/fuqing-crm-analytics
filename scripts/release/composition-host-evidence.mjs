/** Verify terminal/browser observations for a two-profile composition candidate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { validateCompositionCandidate } from './composition-candidate.mjs';
import { insideArtifact, readArtifactFile } from './service-artifact-evidence.mjs';
import { readState, recordEvent } from './state.mjs';

// v2 binds each target digest to a bounded file path and journal parent chain.
// v1 receipts did not carry those bindings and remain historical evidence.
export const COMPOSITION_HOST_SCHEMA = 'dsh-composition-host-evidence/v2';
const HEX = /^[a-f0-9]{64}$/;
const PHASES = new Set(['terminal', 'browser']);
const TARGET_FILES = Object.freeze(['input', 'receipt', 'runner']);
const MAX_TARGET_FILE_BYTES = 8 * 1024 * 1024;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytesDigest = value => createHash('sha256').update(value).digest('hex');

function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

function absolute(path, code) {
  assert.equal(typeof path, 'string', code);
  assert.ok(isAbsolute(path) && !path.includes('..'), code);
  return resolve(path);
}

function validateTargetPaths(target) {
  exact(target.paths, TARGET_FILES, 'COMPOSITION_HOST_TARGET_PATHS');
  for (const name of TARGET_FILES) absolute(target.paths[name], 'COMPOSITION_HOST_TARGET_PATH');
  assert.equal(new Set(TARGET_FILES.map(name => target.paths[name])).size, TARGET_FILES.length,
    'COMPOSITION_HOST_TARGET_PATH_DUPLICATE');
}

async function verifyTargetFiles(target, evidencePath) {
  const root = resolve(dirname(evidencePath));
  for (const name of TARGET_FILES) {
    const path = resolve(target.paths[name]);
    const rel = relative(root, path);
    assert.ok(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
      'COMPOSITION_HOST_TARGET_PATH_SCOPE');
    const bytes = await insideArtifact(root, rel.split(sep).join('/'), MAX_TARGET_FILE_BYTES);
    assert.equal(bytesDigest(bytes), target[`${name}_sha256`], 'COMPOSITION_HOST_TARGET_DIGEST_MISMATCH');
  }
}

async function readJson(path, code) {
  try { return JSON.parse((await readArtifactFile(path, 8 * 1024 * 1024)).toString('utf8')); }
  catch (error) { throw new Error(code, { cause: error }); }
}

function packRows(candidate) {
  return candidate.plugins.map(item => ({ id: item.id, source_sha: item.source_sha,
    manifest_sha256: item.manifest_sha256, pack_sha256: item.pack.sha256 }));
}

/** Read an immutable composition candidate and require its source parent event. */
export async function readPreparedCompositionCandidate({ candidatePath, statePath } = {}) {
  const candidateFile = absolute(candidatePath, 'COMPOSITION_HOST_CANDIDATE_PATH_REQUIRED');
  const stateFile = absolute(statePath, 'COMPOSITION_HOST_STATE_PATH_REQUIRED');
  const candidateBytes = await readArtifactFile(candidateFile, 8 * 1024 * 1024);
  const candidate = validateCompositionCandidate(JSON.parse(candidateBytes.toString('utf8')));
  const state = await readState(stateFile);
  const prepared = [...state.journal].reverse().find(row => row.status === 'COMPOSITION_CANDIDATE_PREPARED'
    && row.candidate_digest === candidate.candidate_digest);
  assert.ok(prepared, 'COMPOSITION_HOST_CANDIDATE_NOT_PREPARED');
  const source = [...state.journal].reverse().find(row => row.status === 'COMPOSITION_SOURCE_HTTP_TARGET_OBSERVED'
    && row.candidate_digest === candidate.candidate_digest);
  assert.ok(source, 'COMPOSITION_HOST_SOURCE_PARENT_REQUIRED');
  assert.equal(source.service_binding?.source_sha, candidate.service_compatibility.binding.source_sha,
    'COMPOSITION_HOST_SOURCE_PARENT_MISMATCH');
  const terminal = [...state.journal].reverse().find(row => row.status === 'COMPOSITION_TERMINAL_HOST_OBSERVED'
    && row.candidate_digest === candidate.candidate_digest);
  return { candidate, candidateBytes, state, prepared, source, terminal };
}

/** Validate a terminal/browser receipt before any journal mutation. */
export function validateCompositionHostEvidence({ candidate, envelope } = {}) {
  exact(envelope, ['schema_version', 'phase', 'candidate_digest', 'service_source_sha', 'profile_digests',
    'plugins', 'target', 'observation', 'release_ready', 'activation'], 'COMPOSITION_HOST_RECEIPT_SHAPE');
  assert.equal(envelope.schema_version, COMPOSITION_HOST_SCHEMA, 'COMPOSITION_HOST_RECEIPT_SCHEMA');
  assert.ok(PHASES.has(envelope.phase), 'COMPOSITION_HOST_PHASE');
  assert.equal(envelope.candidate_digest, candidate.candidate_digest, 'COMPOSITION_HOST_CANDIDATE_MISMATCH');
  assert.equal(envelope.service_source_sha, candidate.service_compatibility.binding.source_sha,
    'COMPOSITION_HOST_SERVICE_SOURCE_MISMATCH');
  assert.deepEqual(envelope.profile_digests, candidate.profiles.map(row => row.sha256),
    'COMPOSITION_HOST_PROFILE_DIGESTS');
  assert.deepEqual(envelope.plugins, packRows(candidate), 'COMPOSITION_HOST_PLUGIN_DIGESTS');
  exact(envelope.target, ['input_sha256', 'receipt_sha256', 'runner_sha256', 'paths', 'platform', 'cleanup'],
    'COMPOSITION_HOST_TARGET_SHAPE');
  // Hashes alone are claims. Bind each target digest to a bounded local file;
  // verifyCompositionHostEvidence additionally constrains those files below
  // the evidence directory before reading them.
  validateTargetPaths(envelope.target);
  for (const key of ['input_sha256', 'receipt_sha256', 'runner_sha256']) assert.match(envelope.target[key] ?? '', HEX,
    'COMPOSITION_HOST_TARGET_DIGEST');
  exact(envelope.observation, ['status', 'scope', 'scenario_count', 'cross_version_recovery', 'browser',
    'supply_chain', 'production_identity', 'release_ready', 'activation'], 'COMPOSITION_HOST_OBSERVATION_SHAPE');
  assert.equal(envelope.observation.status, 'PASS', 'COMPOSITION_HOST_OBSERVATION_NOT_PASS');
  assert.ok(Number.isSafeInteger(envelope.observation.scenario_count) && envelope.observation.scenario_count > 0,
    'COMPOSITION_HOST_SCENARIOS');
  assert.equal(envelope.observation.release_ready, false, 'COMPOSITION_HOST_FALSE_RELEASE_CLAIM');
  assert.equal(envelope.observation.supply_chain, 'NOT_VERIFIED', 'COMPOSITION_HOST_SUPPLY_CHAIN_CLAIM');
  assert.equal(envelope.observation.production_identity, 'NOT_RUN', 'COMPOSITION_HOST_IDENTITY_CLAIM');
  assert.equal(envelope.observation.activation, 'NOT_RUN', 'COMPOSITION_HOST_ACTIVATION_CLAIM');
  if (envelope.phase === 'terminal') {
    assert.equal(envelope.observation.browser, 'NOT_RUN', 'COMPOSITION_TERMINAL_BROWSER_CLAIM');
  } else {
    assert.ok(envelope.observation.browser && typeof envelope.observation.browser === 'object'
      && !Array.isArray(envelope.observation.browser), 'COMPOSITION_BROWSER_OBSERVATION_REQUIRED');
  }
  assert.equal(envelope.release_ready, false, 'COMPOSITION_HOST_FALSE_RELEASE_CLAIM');
  assert.equal(envelope.activation, 'NOT_RUN', 'COMPOSITION_HOST_ACTIVATION_CLAIM');
  assert.equal(envelope.target.platform?.system, 'Linux', 'COMPOSITION_HOST_PLATFORM');
  assert.equal(envelope.target.platform?.machine, 'x86_64', 'COMPOSITION_HOST_PLATFORM');
  assert.match(envelope.target.platform?.python ?? '', /^3\.14\.\d+$/, 'COMPOSITION_HOST_PLATFORM');
  assert.match(envelope.target.platform?.kernel ?? '', /microsoft/i, 'COMPOSITION_HOST_PLATFORM');
  assert.match(envelope.target.platform?.kernel ?? '', /wsl2/i, 'COMPOSITION_HOST_PLATFORM');
  assert.equal(envelope.target.cleanup, 'OWNED_PROCESSES_AND_TEMPORARY_INSTALL_REMOVED', 'COMPOSITION_HOST_CLEANUP');
  return envelope;
}

/** Verify and append a composition terminal/browser observation. */
export async function verifyCompositionHostEvidence({ candidatePath, evidencePath, statePath } = {}) {
  const { candidate, candidateBytes, state, prepared, source, terminal } = await readPreparedCompositionCandidate({ candidatePath, statePath });
  const evidenceFile = absolute(evidencePath, 'COMPOSITION_HOST_EVIDENCE_PATH_REQUIRED');
  const envelope = validateCompositionHostEvidence({ candidate, envelope: await readJson(
    evidenceFile, 'COMPOSITION_HOST_EVIDENCE_INVALID') });
  await verifyTargetFiles(envelope.target, evidenceFile);
  assert.equal(source.seq, prepared.seq + 1, 'COMPOSITION_HOST_SOURCE_ORDER');
  assert.equal(source.prev_digest, prepared.digest, 'COMPOSITION_HOST_SOURCE_PARENT');
  if (envelope.phase === 'browser') {
    assert.ok(terminal, 'COMPOSITION_HOST_TERMINAL_PARENT_REQUIRED');
    assert.equal(terminal.seq, source.seq + 1, 'COMPOSITION_HOST_TERMINAL_ORDER');
    assert.equal(terminal.prev_digest, source.digest, 'COMPOSITION_HOST_TERMINAL_PARENT');
    assert.deepEqual(terminal.source_http_event, { seq: source.seq, digest: source.digest },
      'COMPOSITION_HOST_TERMINAL_SOURCE_PARENT');
  } else {
    assert.equal(state.journal.at(-1)?.digest, source.digest, 'COMPOSITION_HOST_SOURCE_NOT_LATEST');
  }
  const envelopeDigest = await digest(envelope);
  const idempotencyKey = `composition-host:${envelope.phase}:${candidate.candidate_digest}:${envelopeDigest}`;
  // Browser receipts written before terminal_host_event was added remain valid
  // when the same candidate terminal event is present. Reuse that immutable
  // historical result instead of turning a safe retry into an idempotency
  // conflict or rewriting the journal.
  if (envelope.phase === 'browser' && state.idempotency[idempotencyKey]?.result) {
    const prior = state.idempotency[idempotencyKey].result;
    assert.equal(prior.status, 'COMPOSITION_BROWSER_HOST_OBSERVED', 'COMPOSITION_BROWSER_IDEMPOTENCY_STATUS');
    assert.equal(prior.candidate_digest, candidate.candidate_digest, 'COMPOSITION_BROWSER_IDEMPOTENCY_CANDIDATE');
    assert.equal(state.journal[terminal.seq - 1]?.digest, terminal.digest, 'COMPOSITION_HOST_TERMINAL_PARENT_CHANGED');
    return { ...prior.observation, terminal_host_event: { seq: terminal.seq, digest: terminal.digest },
      candidate_bytes: candidateBytes.length, journal_seq: prior.seq, journal_digest: prior.digest };
  }
  if (envelope.phase === 'browser') {
    assert.equal(state.journal.at(-1)?.digest, terminal.digest, 'COMPOSITION_HOST_TERMINAL_NOT_LATEST');
  }
  const status = `COMPOSITION_${envelope.phase.toUpperCase()}_HOST_OBSERVED`;
  const observation = { ...envelope.observation, phase: envelope.phase, target: envelope.target,
    evidence_authenticity: 'UNATTESTED_OPERATOR_OBSERVATION', candidate_digest: candidate.candidate_digest };
  const event = await recordEvent(statePath, { release_tag: prepared.release_tag, status,
    candidate_digest: candidate.candidate_digest, service_binding: candidate.service_compatibility.binding,
    source_http_event: { seq: source.seq, digest: source.digest },
    ...(envelope.phase === 'browser' ? { terminal_host_event: { seq: terminal.seq, digest: terminal.digest } } : {}),
    observation },
  { idempotencyKey,
    requiredEvent: envelope.phase === 'browser'
      ? { seq: terminal.seq, digest: terminal.digest }
      : { seq: source.seq, digest: source.digest } });
  return { ...observation, candidate_bytes: candidateBytes.length, journal_seq: event.seq, journal_digest: event.digest };
}
