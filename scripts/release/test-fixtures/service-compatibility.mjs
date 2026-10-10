/** Verifier-only inputs. These are NOT real service compatibility evidence. */
import { readFile } from 'node:fs/promises';
import { serviceDigest, SERVICE_CASES, SERVICE_STATE } from '../service-compatibility.mjs';

export async function serviceFixture() {
  const runner = await readFile(new URL('../../dsh-b0/service-save-compatibility.py', import.meta.url));
  const probe = await readFile(new URL('../../../backend/tests/first_purchase_service_compat_probe.py', import.meta.url));
  const baseline = 'a'.repeat(40), candidate = 'b'.repeat(40);
  const evidence = {
    schema_version: 'shinemage-service-save-compatibility/v1', status: 'PASS',
    scope: 'local-posix-synthetic-sqlite-and-asgi', release_ready: false, baseline, candidate,
    runner_sha256: serviceDigest(runner), probe_sha256: serviceDigest(probe), python: '3.14.4',
    observations: SERVICE_CASES.map(name => ({ case: name, status: 'PASS',
      ...(name.endsWith('unknown-schema') ? { rejected: true } : { source_import: 'backend/analytics_first_purchase_analysis_app.py' }),
      ...(name === 'old-readonly' ? { database_unchanged: true } : {}) })),
    platform: { system: 'Darwin', machine: 'arm64' }, dependency_mode: 'shared-current-test-environment',
    dependencies: { fastapi: '0.141.1', pydantic: '2.13.5', starlette: '1.6.0', httpx: '0.28.1', psutil: '7.2.2' },
    sources: [baseline, candidate].map(commit => ({ commit, files: {
      'backend/services/analytics/first_purchase/saved.py': 'c'.repeat(64),
      'backend/analytics_first_purchase_analysis_app.py': 'd'.repeat(64),
    } })),
    compatibility: {
      old_v1_to_candidate: 'PASS', candidate_state_old_readonly: 'PASS_WITH_READ_ONLY_IDENTITY',
      candidate_replay_after_old_read: 'PASS', candidate_forward_fix_and_backup_restore: 'PASS',
      candidate_state_old_writes: 'BLOCKED_PROVENANCE_NOT_PRESERVED', old_service_d15_api: 'NOT_AVAILABLE',
      unknown_state_schema: 'REJECTED_WITHOUT_DB_CHANGE', profile_rollback: 'KEEP_CANDIDATE_SERVICE_AND_DURABLE_STATE',
    },
  };
  const evidenceJson = JSON.stringify(evidence) + '\n';
  const binding = { schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase',
    source_sha: candidate, api_version: '1.0.0', state: { ...SERVICE_STATE }, access: 'read-write',
    lifecycle: 'external', rollback: 'preserve-service-and-state', evidence_sha256: serviceDigest(evidenceJson) };
  const gate = { schema_version: 'dsh-service-compatibility-gate/v1', binding, evidence_json: evidenceJson,
    status: 'LOCAL_COMPATIBLE', release_ready: false, activation: 'BLOCKED_SERVICE_PACKAGE_AND_HOST_EVIDENCE_REQUIRED' };
  return { evidence, evidenceJson, binding, gate };
}
