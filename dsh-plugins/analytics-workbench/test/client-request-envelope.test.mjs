import test from 'node:test';
import assert from 'node:assert/strict';
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection';
import { parseClientRequestEnvelope } from '../src/client-request-envelope.mjs';

test('local client request parsing matches the pinned DSH envelope', () => {
  const cases = [
    null,
    [],
    {},
    { type: 'server-response', rpcId: 'r1', method: 'status', payload: {} },
    { type: 'client-request', rpcId: 1, method: 'status', payload: {} },
    { type: 'client-request', rpcId: 'r1', method: null, payload: {} },
    { type: 'client-request', rpcId: 'r1', method: 'status' },
    { type: 'client-request', rpcId: 'r1', method: 'status', payload: undefined },
    { type: 'client-request', rpcId: 'r1', method: 'status', payload: null },
    { type: 'client-request', rpcId: '', method: '', payload: { operation: 'status' } },
    { type: 'client-request', rpcId: 'r1', method: 'status', payload: { operation: 'status' }, extra: true },
  ];

  for (const input of cases) {
    const expected = clientRequestSchema.safeParse(input);
    const actual = parseClientRequestEnvelope(input);
    assert.equal(Boolean(actual), expected.success, JSON.stringify(input));
    if (actual) assert.deepEqual(actual, expected.data);
  }
});
