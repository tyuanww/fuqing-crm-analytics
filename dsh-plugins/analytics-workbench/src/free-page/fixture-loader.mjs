/** Test-only frozen synthetic contracts, shipped with plugin source. Never read a neighboring repository. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const digests = Object.freeze({
  'analytics-page.openapi.json': 'aaba98882b5b3bd2b334cc4cafa740f7777035edacb2998695d7e29599655c05',
  'frozen-contract-v0.json': '076b63f4b43c4b06c4e2a7066e25456e7f30410e8b84f3ecf3da523bfe6dc517',
  'd48-scope.fixture.json': '37605e4391675f0f03cf76bbbecbcc4cd482519691aead9dec123b4811becfb8',
});
export function loadCoordinatorFixture(name) {
  assert.ok(Object.hasOwn(digests, name), 'COORDINATOR_FIXTURE_NAME');
  const bytes = readFileSync(new URL(`../../test/fixtures/coordinator/${name}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), digests[name], 'COORDINATOR_FIXTURE_DIGEST');
  return JSON.parse(bytes);
}
