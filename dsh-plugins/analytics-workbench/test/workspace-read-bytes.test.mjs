import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWorkspaceReadBytes, workspaceReadBytesRequest } from '../src/client/workspace-read-bytes.mjs';

test('readBytes request wraps the window in range', () => {
  assert.deepEqual(workspaceReadBytesRequest({ offset: 65536, length: 65536 }), {
    range: { offset: 65536, length: 65536 },
  });
});

test('native byte windows become the base64 envelope the delivery reader expects', () => {
  const raw = { offset: 0, bytes: 3, version: 'v', eof: true, data: new Uint8Array([65, 0, 66]) };
  assert.deepEqual(normalizeWorkspaceReadBytes(raw), {
    ok: true,
    value: { offset: 0, bytes: 3, version: 'v', eof: true, data: btoa('A\u0000B') },
  });
});

test('an already encoded envelope is left unchanged', () => {
  const raw = { ok: true, value: { offset: 0, data: 'QQ==', eof: true } };
  assert.equal(normalizeWorkspaceReadBytes(raw), raw);
});

test('a failed envelope is left unchanged', () => {
  const raw = { ok: false, error: { message: 'no' } };
  assert.equal(normalizeWorkspaceReadBytes(raw), raw);
});

test('an empty byte window encodes to an empty base64 payload', () => {
  const raw = { ok: true, value: { offset: 0, bytes: 0, version: 'v', eof: true, data: new Uint8Array() } };
  assert.equal(normalizeWorkspaceReadBytes(raw).value.data, '');
});
