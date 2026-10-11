/** Frozen synthetic consumer data. No decoder, gateway or plugin implementation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync(new URL('./workbench-client.fixture.json', import.meta.url));
assert.equal(hash(bytes), 'e876b1eb566d9e7d8a38911adc72b775bae408ce3f3ae5ebe3863951c6ea812b', 'WORKBENCH_CONSUMER_FIXTURE_DIGEST');
const fixture = JSON.parse(bytes);
assert.equal(fixture.synthetic_only, true);
export const { FIXTURE, TOOL_NAME, QUERY_TOOL_NAME, QUERY_CANCEL_COPY,
  FIRST_PURCHASE_TOOL_NAME, FIRST_PURCHASE_RECEIPT_SCHEMA } = fixture;
export const { target, owner, candidate, identity, inspected, command, unknown, saved, status } = fixture.first_purchase_save;
export const ok = value => ({ schema_version: 'shinemage-first-purchase-ui/v1', ok: true, value });
// This creates test props from recorded data; it does not reproduce model logic.
export const createEditor = () => structuredClone(fixture.editor);
const digests = {
  'analytics_first_purchase_v1_expected.json': 'b26e4717183e0eb40d6e08f116c6ce7c8ae5c1f8a1c83aa667632e113b34ad24',
  'analytics_first_purchase_v1_missing_role_expected.json': '26685d3c7b80aafbff4a692636c42e39158c0620171ed4be949c944261dbb0b2',
};
export function loadCoordinatorFixture(name) {
  assert.ok(Object.hasOwn(digests, name), 'WORKBENCH_CONSUMER_COORDINATOR_NAME');
  const bytes = readFileSync(new URL(`../../../backend/tests/fixtures/${name}`, import.meta.url));
  assert.equal(hash(bytes), digests[name], 'WORKBENCH_CONSUMER_COORDINATOR_DIGEST');
  return JSON.parse(bytes);
}
