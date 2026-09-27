import assert from 'node:assert/strict';
import test from 'node:test';
import { runLocalVerification } from './local-verify.mjs';

test('local verification reports synthetic compatibility and loopback HTTP scopes', async () => {
  const result = await runLocalVerification();
  assert.equal(result.compatibility.status, 'PASS');
  assert.equal(result.compatibility.scope, 'synthetic-json-only');
  assert.equal(result.compatibility.wsl2, 'NOT_RUN');
  assert.equal(result.backpressure.status, 'PASS');
  assert.equal(result.backpressure.evidence_scope, 'synthetic-loopback-http');
  assert.equal(result.backpressure.results.length, 100);
});
