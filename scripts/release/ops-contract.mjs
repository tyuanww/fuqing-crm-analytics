export const UAT_GROUPS = ['auth', 'native', 'plugin', 'page', 'crm', 'weknora', 'recovery'];
export const UAT_STATUSES = ['PASS', 'PARTIAL', 'NOT_RUN', 'FAIL'];
export const METRIC_STATUSES = ['MEASURED', 'NOT_MEASURED', 'PARTIAL'];
export const CLEANUP_STATUSES = ['PASS', 'NOT_RUN', 'BLOCKED'];

export function validateUatLedger(rows) {
  if (!Array.isArray(rows) || rows.length !== UAT_GROUPS.length) throw new Error('UAT_GROUP_COUNT');
  const groups = rows.map((row) => row?.group);
  if (new Set(groups).size !== UAT_GROUPS.length || UAT_GROUPS.some((group) => !groups.includes(group))) throw new Error('UAT_GROUP_SET');
  for (const row of rows) {
    if (!row.owner || typeof row.owner !== 'string') throw new Error(`UAT_OWNER_REQUIRED ${row.group}`);
    if (!UAT_STATUSES.includes(row.status)) throw new Error(`UAT_STATUS_INVALID ${row.group}`);
    if (row.status === 'PASS' && (!row.started_at || !row.ended_at || !row.evidence_ref)) throw new Error(`UAT_EVIDENCE_REQUIRED ${row.group}`);
  }
  const status = rows.some((row) => row.status === 'FAIL') ? 'FAIL' : rows.every((row) => row.status === 'PASS') ? 'PASS' : 'PARTIAL';
  return { status, groups: rows.length };
}

export function validateMetrics(value) {
  if (!value || typeof value !== 'object') throw new Error('METRICS_INVALID');
  for (const name of ['tthw_seconds', 'lead_time_seconds', 'mttr_seconds']) {
    if (!METRIC_STATUSES.includes(value[name]?.status)) throw new Error(`METRIC_STATUS_INVALID ${name}`);
    if (value[name].status === 'MEASURED' && (!Number.isFinite(value[name].value) || value[name].value < 0)) throw new Error(`METRIC_VALUE_INVALID ${name}`);
  }
  return { status: Object.values(value).some((metric) => metric.status === 'NOT_MEASURED') ? 'PARTIAL' : 'PASS' };
}

export function validateCleanupReceipt(value) {
  if (!value || value.schema_version !== 'cleanup-receipt/v1') throw new Error('CLEANUP_SCHEMA_INVALID');
  if (!CLEANUP_STATUSES.includes(value.status)) throw new Error('CLEANUP_STATUS_INVALID');
  if (!value.release_tag || !value.owner || !Array.isArray(value.deleted_paths)) throw new Error('CLEANUP_FIELDS_REQUIRED');
  if (value.status === 'PASS' && value.deleted_paths.length === 0) throw new Error('CLEANUP_EMPTY_PASS');
  return { status: value.status, deleted: value.deleted_paths.length };
}
