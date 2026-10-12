import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCompositionCandidate, validateCompositionCandidate, COMPOSITION_CANDIDATE_SCHEMA } from './composition-candidate.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const binding = {
  schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase',
  source_sha: '1'.repeat(40), api_version: '1.0.0',
  state: { owner: 'analysis-service', application_id: 1397572502, schema_version: 1, contract: 'analytics-first-purchase-saved-provenance/v1' },
  access: 'read-write', lifecycle: 'external', rollback: 'preserve-service-and-state', evidence_sha256: '2'.repeat(64),
};
const gate = { schema_version: 'dsh-service-compatibility-gate/v1', binding, evidence_json: '{}', status: 'LOCAL_COMPATIBLE', release_ready: false, activation: 'BLOCKED_SERVICE_PACKAGE_AND_HOST_EVIDENCE_REQUIRED' };

function candidate() {
  const base = {
    schema_version: COMPOSITION_CANDIDATE_SCHEMA,
    profiles: [{ name: 'crm', profile_id: 'crm-knowledge-rc2', sha256: '3'.repeat(64), plugins: ['@shine-mage/dsh-plugin-0', '@shine-mage/dsh-plugin-1'] },
      { name: 'page', profile_id: 'dsh-rc2', sha256: '4'.repeat(64), plugins: Array.from({ length: 7 }, (_, i) => `@shine-mage/dsh-plugin-${i + 2}`) }],
    plugins: Array.from({ length: 9 }, (_, i) => ({ id: `@shine-mage/dsh-plugin-${i}`, path: `dsh-plugins/plugin-${i}`, profile: i < 2 ? 'crm' : 'page', version: '0.1.0', dsh_pin: '0.1.7-rc.2', source_sha: `${i}`.repeat(40), manifest_sha256: `${i + 1}`.repeat(64), pack: { name: `shine-mage-dsh-plugin-${i}-0.1.0.tgz`, bytes: 1, sha256: `${i + 1}`.repeat(64) } })),
    service_compatibility: gate,
    capabilities: { source_http: 'NOT_RUN', terminal: 'NOT_RUN', browser: 'NOT_RUN', recovery: 'NOT_RUN' },
    activation: 'NOT_RUN', canary: 'NOT_RUN', rollback: 'NOT_RUN', release_ready: false, state_scope: 'local-explicit-journal',
  };
  return { ...base, candidate_digest: digest(base) };
}

test('composition candidate contract validates nine plugins, two profiles and explicit service gate', () => {
  const result = validateCompositionCandidate(candidate());
  assert.equal(result.schema_version, COMPOSITION_CANDIDATE_SCHEMA);
  assert.equal(result.plugins.length, 9);
});

test('composition candidate rejects a missing service gate before any output is created', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-composition-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const value = candidate(); delete value.service_compatibility;
  value.candidate_digest = digest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'candidate_digest')));
  assert.throws(() => validateCompositionCandidate(value), /COMPOSITION_SERVICE_GATE_REQUIRED/);
  await assert.rejects(() => createCompositionCandidate({ crmInputsPath: join(root, 'crm.json'), pageInputsPath: join(root, 'page.json'), outputDir: join(root, 'out'), statePath: join(root, 'journal.json') }), /COMPOSITION_SERVICE_BINDING_REQUIRED/);
  await assert.rejects(() => readFile(join(root, 'out/composition-candidate.json')), { code: 'ENOENT' });
});
