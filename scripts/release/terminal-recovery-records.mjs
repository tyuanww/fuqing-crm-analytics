/** Finite archived terminal-recovery contract; no runtime or business data access. */
import assert from 'node:assert/strict';
import { checkObservations } from './runtime-host-evidence.mjs';
import { DSH_UPSTREAM_SHA } from './toolchain.mjs';

const CODE = 'PLUGIN_HOST_TERMINAL_', HEX = /^[a-f0-9]{64}$/;
export const TERMINAL_TEST_ROOT = 'host-result/tests/test_official_host_crm_query_s0';
export function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), CODE + code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), CODE + code);
}
function session(value) {
  exact(value, ['id','preset','count','digest','prefix_digest','assistant','events'], 'SESSION');
  assert.ok(Number.isSafeInteger(value.count) && value.count > 0 && value.count <= 10000, CODE + 'SESSION');
  assert.match(value.digest ?? '', HEX, CODE + 'SESSION');
  assert.match(value.prefix_digest ?? '', HEX, CODE + 'SESSION');
  assert.ok(Array.isArray(value.assistant) && value.assistant.length > 0
    && value.assistant.every(s => typeof s === 'string' && s.length > 0 && s.length <= 32768), CODE + 'SESSION');
  assert.ok(Array.isArray(value.events) && value.events.length === value.count, CODE + 'SESSION');
  for (const [i, row] of value.events.entries()) {
    exact(row, ['seq','type'], 'SESSION');
    assert.equal(row.seq, i, CODE + 'SESSION_SEQUENCE');
    assert.ok(typeof row.type === 'string' && /^[a-z][a-z0-9/-]{0,100}$/.test(row.type), CODE + 'SESSION');
  }
}
export function checkTerminalRecords({ recovery, http, run, packages, candidate }) {
  exact(recovery, ['schema_version','candidate_digest','expected_business_recovery','upstream_sha','artifacts',
    'observations','cleanup_ok','package_integrity','production_activation','release_ready'], 'RECOVERY');
  assert.equal(recovery.schema_version, 'first-purchase-owned-recovery/v1', CODE + 'RECOVERY');
  assert.equal(recovery.expected_business_recovery, 'FAILED_SLOT_RELEASED', CODE + 'TERMINAL_MODE');
  for (const row of [recovery, http]) {
    assert.equal(row.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
    assert.equal(row.upstream_sha, DSH_UPSTREAM_SHA, CODE + 'DSH');
    assert.deepEqual(row.artifacts, packages, CODE + 'PACKAGES');
    assert.equal(row.cleanup_ok, true, CODE + 'CLEANUP');
    assert.equal(row.package_integrity, 'PASS', CODE + 'INTEGRITY');
  }
  exact(http, ['upstream_sha','observations','cleanup_ok','browser','candidate_digest','artifacts','package_integrity','admission'], 'HTTP');
  assert.equal(http.admission, 'official commands/execute HTTP; browser rendering NOT_RUN', CODE + 'ADMISSION');
  assert.equal(http.browser, 'NOT_RUN', CODE + 'UNPROVEN');
  assert.equal(recovery.production_activation, 'NOT_RUN', CODE + 'UNPROVEN');
  assert.equal(recovery.release_ready, false, CODE + 'UNPROVEN');
  assert.ok(Array.isArray(http.observations) && http.observations.length === 23, CODE + 'HTTP_SCENARIOS');
  checkObservations(http.observations.slice(0,20));
  const restart = http.observations[21];
  exact(restart, ['stage','pid','generation'], 'RESTART');
  assert.equal(restart.stage, 'official-host-restarted', CODE + 'RESTART');
  assert.equal(restart.generation, 3, CODE + 'RESTART');
  const hostPids = [http.observations[0].pid, http.observations[15].pid, restart.pid];
  assert.ok(hostPids.every(p => Number.isSafeInteger(p) && p > 1) && new Set(hostPids).size === 3, CODE + 'RESTART');
  assert.deepEqual(http.observations[20], {stage:'official-native-command',command:'/first-purchase',kind:'success'}, CODE + 'HTTP_SCENARIOS');
  assert.deepEqual(http.observations[22], {stage:'same-save-intent-after-independent-service-restart',status:'PASS'}, CODE + 'HTTP_SCENARIOS');
  assert.ok(Array.isArray(recovery.observations) && recovery.observations.length === 2, CODE + 'RECOVERY_SCENARIOS');
  const [crash, fallback] = recovery.observations;
  exact(crash, ['stage','status','killed_pid','resumed_pid','signal','committed','recovered','crm_relogin_required'], 'CRASH');
  assert.equal(crash.stage, 'current-candidate-inflight-crash', CODE + 'CRASH');
  assert.equal(crash.status, 'PASS', CODE + 'CRASH');
  assert.equal(crash.signal, 'SIGKILL', CODE + 'CRASH');
  assert.equal(crash.killed_pid, hostPids[1], CODE + 'CRASH');
  assert.equal(crash.resumed_pid, hostPids[2], CODE + 'CRASH');
  assert.equal(crash.crm_relogin_required, true, CODE + 'AUTH');
  const before = crash.committed, after = crash.recovered;
  session(before); session(after);
  assert.equal(before.id, 'session-first-purchase', CODE + 'SESSION');
  assert.equal(before.preset, 'owned-first-purchase', CODE + 'SESSION');
  assert.equal(after.id, before.id, CODE + 'SESSION'); assert.equal(after.preset, before.preset, CODE + 'SESSION');
  assert.equal(before.prefix_digest, before.digest, CODE + 'PREFIX');
  assert.equal(after.prefix_digest, before.digest, CODE + 'PREFIX');
  assert.ok(after.count > before.count, CODE + 'PREFIX');
  assert.deepEqual(after.events.slice(0,before.count), before.events, CODE + 'PREFIX');
  assert.deepEqual(after.assistant, before.assistant, CODE + 'PREFIX');
  assert.equal(before.events.at(-1).type, 'request/header', CODE + 'INFLIGHT');
  assert.ok(before.events.findLastIndex(e => e.type === 'turn/start') > before.events.findLastIndex(e => e.type === 'turn/end'), CODE + 'INFLIGHT');
  assert.deepEqual(after.events.slice(before.count).map(e => e.type), ['step/end','turn/end','session/end-seed'], CODE + 'TERMINAL_EVENTS');
  exact(fallback, ['stage','status','recovered'], 'FALLBACK');
  assert.equal(fallback.stage, 'native-fallback-after-inflight-crash', CODE + 'FALLBACK');
  assert.equal(fallback.status, 'PASS', CODE + 'FALLBACK'); session(fallback.recovered);
  assert.equal(fallback.recovered.id, 'session-first-purchase-recovered-native', CODE + 'FALLBACK');
  assert.equal(fallback.recovered.preset, 'owned-native', CODE + 'FALLBACK');
  assert.deepEqual(fallback.recovered.assistant, ['SYNTHETIC_CRASH_RECOVERY_OK'], CODE + 'FALLBACK');
  assert.equal(fallback.recovered.events.at(-1).type, 'turn/end', CODE + 'FALLBACK');
  assert.ok(!fallback.recovered.events.some(e => e.type === 'tool/call'), CODE + 'FALLBACK');
  exact(run, ['schema_version','run_id','version','source_kind','source_ref','conversation_id','parent_run_id','status',
    'phase','created_at','updated_at','deadline','answer_mode','result','evidence_digest','primary_result_ref',
    'evidence_refs','last_sequence','diagnostics','limitations'], 'RUN');
  exact(run.diagnostics, ['attempt_id','runtime_status','execution_active','tool_steps_used','dispatch_attempts',
    'profile_version','profile_hash','error_code'], 'DIAGNOSTICS');
  assert.ok(Number.isSafeInteger(run.version) && run.version > 0 && Number.isSafeInteger(run.last_sequence)
    && run.last_sequence > 0, CODE + 'RUN');
  for (const key of ['created_at','updated_at','deadline']) assert.ok(typeof run[key] === 'string' && Number.isFinite(Date.parse(run[key])), CODE + 'RUN');
  assert.ok(Date.parse(run.updated_at) >= Date.parse(run.created_at) && Date.parse(run.deadline) > Date.parse(run.created_at), CODE + 'RUN');
  assert.ok(Array.isArray(run.limitations) && run.limitations.length > 0 && run.limitations.every(s => typeof s === 'string'), CODE + 'RUN');
  assert.match(run.diagnostics.attempt_id ?? '', /^attempt_[a-f0-9]{32}$/, CODE + 'DIAGNOSTICS');
  assert.equal(run.diagnostics.profile_version, 'b0-run-resource/v1', CODE + 'DIAGNOSTICS');
  assert.match(run.diagnostics.profile_hash ?? '', HEX, CODE + 'DIAGNOSTICS');
  assert.equal(run.schema_version, 'analytics-run-first-purchase-path/v1', CODE + 'RUN');
  assert.match(run.run_id ?? '', /^run_[a-f0-9]{32}$/, CODE + 'RUN');
  assert.equal(run.status, 'FAILED', CODE + 'TERMINAL_STATUS');
  assert.equal(run.phase, 'FINALIZING', CODE + 'TERMINAL_STATUS');
  assert.equal(run.source_kind, 'CHAT', CODE + 'RUN');
  assert.match(run.conversation_id ?? '', /^conv_[a-f0-9]{32}$/, CODE + 'RUN');
  assert.equal(run.source_ref, run.conversation_id, CODE + 'RUN');
  for (const key of ['parent_run_id','result','evidence_digest','primary_result_ref']) assert.equal(run[key], null, CODE + 'RUN');
  assert.deepEqual(run.evidence_refs, [], CODE + 'RUN');
  assert.equal(run.answer_mode, 'DETERMINISTIC_TOOL', CODE + 'RUN');
  assert.equal(run.diagnostics?.runtime_status, 'EXITED', CODE + 'TERMINAL_STATUS');
  assert.equal(run.diagnostics?.execution_active, false, CODE + 'SLOT');
  assert.equal(run.diagnostics?.error_code, 'EXECUTION_UNKNOWN', CODE + 'TERMINAL_STATUS');
  assert.equal(run.diagnostics?.dispatch_attempts, 1, CODE + 'DISPATCH');
  assert.equal(run.diagnostics?.tool_steps_used, 0, CODE + 'DISPATCH');
  return { interrupted_status:'FAILED',runtime_status:'EXITED',execution_active:false,error_code:'EXECUTION_UNKNOWN',
    dispatch_attempts:1,committed_event_count:before.count,committed_prefix_sha256:before.digest,native_fallback:'PASS' };
}
