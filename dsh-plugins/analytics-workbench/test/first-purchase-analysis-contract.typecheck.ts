// Compiler-only first-purchase saved-analysis HTTP contract; plugin view stays NOT_CONNECTED.
import type { components, operations } from '../src/first-purchase-analysis-contract.generated.js';

type Created = components['schemas']['FirstPurchaseAnalysisCreateRequest'];
type Saved = components['schemas']['FirstPurchaseSavedAnalysis'];
type Listed = components['schemas']['FirstPurchaseSavedAnalysisList'];
type CreateHeaders = NonNullable<operations['analytics_first_purchase_analysis_create']['parameters']['header']>;

export const createBody: Created = {
  created_from_run_id: 'run_fixture',
  title: '首购商品路径 / 30日正装转化',
  visual_spec: { schema_version: 'analytics-visual-table/v1', kind: 'TABLE' },
};
export const createHeaders: CreateHeaders = { 'Idempotency-Key': 'save-1' };
export function isConnectedSnapshot(row: Saved) {
  return row.http_api === 'CONNECTED' && row.data_mode === 'SNAPSHOT' && row.finite_mock === true;
}
export function emptyList(rows: Listed) {
  return rows.items.length === 0;
}
// @ts-expect-error Browser cannot upload facts to prove success.
export type ForgedFacts = Created['facts'];
// @ts-expect-error HTTP surface is CONNECTED, not the mock NOT_CONNECTED flag.
export const mockFlag: Saved['http_api'] = 'NOT_CONNECTED';
// @ts-expect-error Unknown schema is outside this contract.
export const unknownSchema: Saved['schema_version'] = 'analytics-saved-analysis/v1';

type Receipt = operations['analytics_first_purchase_save_receipt_reconcile']['responses'][200]['content']['application/json'];
type SaveIdentity = components['schemas']['FirstPurchaseSaveIdentity'];
export const saveIdentity: SaveIdentity = {
  schema_version: 'analytics-first-purchase-save-identity/v1',
  action_id: 'save-action-1', candidate_digest: 'a'.repeat(64), correlation_id: 'correlation-1',
};
export function savedVersion(receipt: Receipt) {
  if (receipt.status === 'SAVED') return receipt.analysis_ref.version;
  return receipt.reason;
}
// @ts-expect-error Correlation is not caller-supplied save eligibility.
export type ForgedEligibility = SaveIdentity['save_eligible'];
// @ts-expect-error An UNKNOWN receipt has no durable state key.
export const unknownKey: components['schemas']['FirstPurchaseUnknownSaveReceipt']['durable_state_key'] = 'invented';

import { decodeFirstPurchaseSaveResult, decodeFirstPurchaseSaveReceipt, decodeFirstPurchaseSavedProvenance } from '../src/first-purchase-save-model.mjs';
export const saveCommand: components['schemas']['FirstPurchaseSaveCommand'] = {
  ...createBody, schema_version: 'analytics-first-purchase-save-command/v1',
  identity: saveIdentity, evidence_digest: 'a'.repeat(64),
};
export function decodePublicDocuments(value: unknown) {
  return [decodeFirstPurchaseSaveResult(value), decodeFirstPurchaseSaveReceipt(value), decodeFirstPurchaseSavedProvenance(value)];
}
// @ts-expect-error No caller-supplied eligibility proof exists.
export type ForgedCommand = components['schemas']['FirstPurchaseSaveCommand']['save_eligible'];
// @ts-expect-error PINNED retains cockpit meaning and is not a freshness state.
export const pinnedFreshness: components['schemas']['FirstPurchaseFreshness']['freshness_state'] = 'PINNED';
// @ts-expect-error This contract does not admit production business data.
export const production: components['schemas']['FirstPurchaseSaveProvenance']['environment'] = 'production';
