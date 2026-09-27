import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCleanupReceipt, validateMetrics, validateUatLedger } from './ops-contract.mjs';

const rows = ['auth', 'native', 'plugin', 'page', 'crm', 'weknora', 'recovery'].map((group) => ({ group, owner: 'NOT_ASSIGNED', status: 'NOT_RUN', started_at: null, ended_at: null, evidence_ref: '' }));

test('UAT ledger requires exactly seven explicit groups and fail-closed statuses', () => {
  assert.equal(validateUatLedger(rows).status, 'PARTIAL');
  assert.throws(() => validateUatLedger(rows.slice(0, 6)), /UAT_GROUP_COUNT/);
  assert.throws(() => validateUatLedger(rows.map((row, index) => index === 0 ? { ...row, owner: '' } : row)), /UAT_OWNER_REQUIRED/);
  const pass = rows.map((row) => ({ ...row, status: 'PASS', started_at: '2026-09-26T00:00:00Z', ended_at: '2026-09-26T00:01:00Z', evidence_ref: 'synthetic://uat' }));
  assert.equal(validateUatLedger(pass).status, 'PASS');
});

test('operational metrics and cleanup receipt preserve NOT_MEASURED/NOT_RUN', () => {
  const metrics = Object.fromEntries(['tthw_seconds', 'lead_time_seconds', 'mttr_seconds'].map((name) => [name, { status: 'NOT_MEASURED', value: null, evidence_ref: '' }]));
  assert.equal(validateMetrics(metrics).status, 'PARTIAL');
  assert.throws(() => validateMetrics({ ...metrics, mttr_seconds: { status: 'MEASURED', value: -1 } }), /METRIC_VALUE_INVALID/);
  const receipt = { schema_version: 'cleanup-receipt/v1', release_tag: 'dsh-test', owner: 'NOT_ASSIGNED', status: 'NOT_RUN', deleted_paths: [], reason: 'stable window and explicit deletion authorization are not available' };
  assert.equal(validateCleanupReceipt(receipt).status, 'NOT_RUN');
  assert.throws(() => validateCleanupReceipt({ ...receipt, status: 'PASS' }), /CLEANUP_EMPTY_PASS/);
});
