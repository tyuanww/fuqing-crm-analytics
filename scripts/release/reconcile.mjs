import { createHash } from 'node:crypto';

const PHASES = [
  'BUILD',
  'CREATE_DRAFT_RELEASE',
  'UPLOAD_TARBALLS',
  'FINALIZE_MANIFEST',
  'GENERATE_SUMS',
  'UPLOAD_METADATA',
  'PREPARE_PUBLICATION',
  'PUBLISH_RELEASE',
  'RECEIPT',
];
const STATUSES = new Set(['DRAFT', 'UPLOADED', 'PUBLISHED', 'PUBLISHED_VERIFIED', 'FAILED', 'UNKNOWN', 'PREPARED', 'ACTIVE', 'ROLLED_BACK']);
const DIGEST = /^[0-9a-f]{64}$/;
const SOURCE_SHA = /^[0-9a-f]{40}$/;

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function phaseIndex(value) { return value == null ? -1 : PHASES.indexOf(value); }
function conflict(key, local, remote) { return { status: 'CONFLICT', key, local, remote, action: 'STOP_AND_INSPECT' }; }

function checkDigestPair(key, local, remote) {
  if (local == null && remote == null) return null;
  if (local == null || remote == null) return { status: 'UNKNOWN', reason: 'digest_missing', key, local, remote, action: 'QUERY_REMOTE_METADATA' };
  const pattern = key === 'source_sha' ? SOURCE_SHA : DIGEST;
  if (typeof local !== 'string' || !pattern.test(local) || typeof remote !== 'string' || !pattern.test(remote)) return conflict(key, local, remote);
  return local === remote ? null : conflict(key, local, remote);
}

/**
 * Compare an authoritative local journal/manifest projection with a remote
 * release receipt. This is intentionally side-effect free: callers must use
 * the returned action before retrying an upload or publication request.
 */
export function reconcileRemote({ local, remote }) {
  if (!local || typeof local !== 'object' || Array.isArray(local)) return { status: 'UNKNOWN', reason: 'local_state_missing', action: 'REPAIR_LOCAL_STATE' };
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return { status: 'UNKNOWN', reason: 'remote_receipt_missing', action: 'QUERY_REMOTE_BY_TAG' };
  if (local.release_tag != null && remote.release_tag !== local.release_tag) return conflict('release_tag', local.release_tag, remote.release_tag);
  if (local.idempotency_key != null && remote.idempotency_key !== local.idempotency_key) return conflict('idempotency_key', local.idempotency_key, remote.idempotency_key);
  for (const key of ['source_sha', 'manifest_sha256', 'artifact_sha256', 'sha256sums_sha256']) {
    const result = checkDigestPair(key, local[key], remote[key]);
    if (result) return result;
  }
  if (remote.status != null && !STATUSES.has(remote.status)) return { status: 'UNKNOWN', reason: 'remote_status_unrecognized', remote_status: remote.status, action: 'STOP_AND_INSPECT' };
  if (remote.status === 'UNKNOWN') return { status: 'UNKNOWN', reason: 'remote_status_unknown', action: 'QUERY_REMOTE_BY_TAG' };
  if (remote.phase != null && !PHASES.includes(remote.phase)) return { status: 'UNKNOWN', reason: 'remote_phase_unrecognized', remote_phase: remote.phase, action: 'STOP_AND_INSPECT' };
  const localPhase = phaseIndex(local.phase);
  const remotePhase = phaseIndex(remote.phase);
  if (remotePhase > localPhase) return { status: 'REMOTE_AHEAD', remote_phase: remote.phase, local_phase: local.phase ?? null, action: 'ADOPT_REMOTE_AFTER_DIGEST_CHECK' };
  if (remotePhase < localPhase) return { status: 'REMOTE_BEHIND', remote_phase: remote.phase ?? null, local_phase: local.phase, action: 'RESUME_MISSING_REMOTE_PHASE' };
  // phase_status=COMMITTED describes the local journal transition, while
  // remote status describes the publication/release state. Comparing them
  // would reject a valid same-phase DRAFT receipt.
  const localStatus = local.status;
  const remoteStatus = remote.status;
  if (localStatus && remoteStatus && localStatus !== remoteStatus && remoteStatus !== 'PUBLISHED_VERIFIED') {
    return conflict('status', localStatus, remoteStatus);
  }
  if (Array.isArray(local.assets) || Array.isArray(remote.assets)) {
    if (!Array.isArray(local.assets) || !Array.isArray(remote.assets)) return { status: 'UNKNOWN', reason: 'asset_list_missing', action: 'QUERY_REMOTE_ASSETS' };
    const byName = (assets) => {
      const map = new Map();
      for (const asset of assets) {
        if (!asset || typeof asset.name !== 'string' || map.has(asset.name)) return null;
        map.set(asset.name, asset);
      }
      return map;
    };
    const left = byName(local.assets); const right = byName(remote.assets);
    if (!left || !right) return { status: 'UNKNOWN', reason: 'asset_list_invalid_or_duplicate', action: 'QUERY_REMOTE_ASSETS' };
    for (const [name, asset] of left) {
      const other = right.get(name);
      if (!other) return conflict(`asset:${name}`, asset, null);
      for (const key of ['sha256', 'size', 'asset_id']) {
        if (asset[key] != null && other[key] != null && String(asset[key]) !== String(other[key])) return conflict(`asset:${name}.${key}`, asset[key], other[key]);
      }
    }
    for (const name of right.keys()) if (!left.has(name)) return conflict(`asset:${name}`, null, right.get(name));
  }
  return { status: 'RECONCILED', action: 'NOOP', release_tag: local.release_tag ?? remote.release_tag, phase: remote.phase ?? local.phase ?? null, remote_status: remoteStatus ?? 'PRESENT', receipt_digest: digest(remote) };
}

export function reconcileJournal({ state, remote }) {
  if (!state || typeof state !== 'object') return { status: 'UNKNOWN', reason: 'local_state_missing' };
  const result = reconcileRemote({ local: state, remote });
  if (result.status === 'RECONCILED' && Object.values(state.idempotency ?? {}).some((entry) => entry?.status === 'IN_PROGRESS' || entry?.status === 'UNKNOWN')) {
    return { status: 'UNKNOWN', reason: 'local_unknown_operation_requires_reconcile', action: 'RECONCILE_OPERATION' };
  }
  return result;
}
