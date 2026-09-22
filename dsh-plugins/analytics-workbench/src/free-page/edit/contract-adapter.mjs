/**
 * T1 is the only free-page edit contract.
 * Fallback field sets are not accepted. T1_SEAM.ready is true only when the
 * contract module exports the parsers this engine calls.
 */
import * as pageContract from '../contract/index.mjs';

const REQUIRED = ['parseNodeRef', 'parseCAS', 'parseEditOperation', 'parseEditContext'];

export const T1_SEAM = Object.freeze({
  module: 'dsh-plugins/analytics-workbench/src/free-page/contract/index.mjs',
  symbols: Object.freeze(REQUIRED),
  ready: REQUIRED.every(name => typeof pageContract[name] === 'function'),
});

function invalid(code, reason) {
  const http = code === 'PACKAGE_TOO_LARGE' ? 413
    : code === 'CAPABILITY_DENIED' || code === 'FORBIDDEN' ? 403
      : code === 'VERSION_CONFLICT' || code === 'CAS_CONFLICT' || code === 'MAPPING_STALE' || code === 'IDEMPOTENCY_CONFLICT' ? 409
        : 422;
  return Object.freeze({ ok: false, error: Object.freeze({ code, http }), reason });
}

function fromContract(parsed, fallback) {
  if (!T1_SEAM.ready) return invalid(fallback, 't1_contract_missing');
  if (!parsed?.ok) return invalid(parsed?.error?.code ?? fallback, parsed?.error?.message ?? 't1');
  return { ok: true, value: parsed.value };
}

export function adaptEditOperation(raw) {
  if (!T1_SEAM.ready) return invalid('INVALID_EDIT', 't1_contract_missing');
  return fromContract(pageContract.parseEditOperation(raw), 'INVALID_EDIT');
}

export function adaptEditContext(raw) {
  if (!T1_SEAM.ready) return invalid('INVALID_EDIT_CONTEXT', 't1_contract_missing');
  return fromContract(pageContract.parseEditContext(raw), 'INVALID_EDIT_CONTEXT');
}
