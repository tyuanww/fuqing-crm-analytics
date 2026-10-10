/** Invoked with real synthetic HTTP responses by the domain provider test. */
import assert from 'node:assert/strict';
import { decodeFirstPurchaseSaveResult as result, decodeFirstPurchaseSaveReceipt as receipt,
  decodeFirstPurchaseSavedProvenance as provenance } from '../src/first-purchase-save-model.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const docs = JSON.parse(input);
for (const [name, decode] of [['fresh', result], ['stale', result], ['receipt', receipt], ['unknown', receipt], ['frozen', provenance]]) {
  const value = docs[name];
  assert.ok(decode(value), name);
  for (const key of Object.keys(value)) {
    const incomplete = structuredClone(value);
    delete incomplete[key];
    assert.equal(decode(incomplete), null, name + ': missing ' + key);
  }
  assert.equal(decode({...value, future_field: true}), null);
  assert.equal(decode({...value, schema_version: 'unreviewed/v99'}), null);
  assert.equal(decode({...value, api_version: '2.0.0'}), null);
}
for (const mutate of [
  v => { v.provenance.environment = 'production'; },
  v => { v.provenance.candidate_digest = 'b'.repeat(64); },
  v => { v.result_state = 'PARTIAL'; },
  v => { v.provenance.permission_scope.can_save = false; },
  v => { v.provenance.permission_scope.owner_id = ''; },
  v => { v.provenance.source_refs.method_package_digest = null; },
  v => { v.provenance.source_refs.evidence_digest = 'forged'; },
  v => { v.provenance.query_scope.observation_days = 90; },
  v => { v.provenance.freshness.freshness_state = 'PINNED'; },
  v => { v.provenance.freshness.freshness_expires_at = v.provenance.generated_at; },
  v => { v.provenance.freshness.reason = 'EXPIRED'; },
  v => { v.provenance.freshness.max_age_ms = 0; },
  v => { v.result.facts.products[0].finished_conversion_ratio = 90; },
  v => { v.save_ineligible_reason = 'CANDIDATE_NOT_ADMITTED'; },
]) {
  const value = structuredClone(docs.fresh);
  mutate(value);
  assert.equal(result(value), null, mutate.toString());
}
assert.equal(result({...docs.stale, save_eligible: true, save_ineligible_reason: null}), null);
if (docs.fresh.provenance.freshness.freshness_state === 'NOT_CHECKED') {
  for (const [field, value] of [
    ['freshness_state', 'FRESH'], ['reason', 'WITHIN_WINDOW'], ['policy_version', null],
    ['max_age_ms', 1000], ['expires_after_ms', 2000],
    ['freshness_stale_at', '2099-01-01T00:00:00Z'], ['freshness_expires_at', '2099-01-01T00:00:00Z'],
  ]) {
    for (const [doc, decode] of [[docs.fresh, result], [docs.frozen, provenance]]) {
      const changed = structuredClone(doc);
      changed.provenance.freshness[field] = value;
      assert.equal(decode(changed), null, 'unchecked: ' + field);
    }
  }
}
assert.equal(receipt({...docs.unknown, status: 'SAVED'}), null);
assert.equal(receipt({...docs.receipt, durable_state_key: 'invented'}), null);
const bad = structuredClone(docs.frozen);
bad.provenance.source_refs.primary_result_ref = null;
assert.equal(provenance(bad), null);
console.log('D15_WIRE_DECODER PASS actual HTTP documents and strict negative cases');
