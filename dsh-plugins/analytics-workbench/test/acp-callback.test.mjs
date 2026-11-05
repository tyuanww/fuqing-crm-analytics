/** ACP callback wire contract and scoped runtime resolution. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACP_CALLBACK_PATH, ACP_CONTEXT_PATH, acpCallbackEnabled, acpCallbackPayload,
  acpCallbackUrl, acpContextUrl,
} from '../src/acp-callback.mjs';
import { resolveNativeRuntime } from '../src/runtime-endpoints.ts';

const TOKEN = 't'.repeat(32);

function withEnv(values, body) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return body();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('the ACP callback body carries only the ACP session id and model call id', () => {
  assert.equal(ACP_CALLBACK_PATH, '/internal/acp/tool-call');
  assert.equal(ACP_CONTEXT_PATH, '/internal/acp/run-context');
  assert.deepEqual(acpCallbackPayload({ id: 'acp-session' }, 'call-1', { query: 'channel_repeat_rate' }), {
    acp_session_id: 'acp-session', call_id: 'call-1', query: 'channel_repeat_rate',
  });
  assert.throws(() => acpCallbackPayload(undefined, 'call-1', {}), /no bound session/);
  assert.throws(() => acpCallbackPayload({ id: '' }, 'call-1', {}), /no bound session/);
  assert.throws(() => acpCallbackPayload({ id: 'acp' }, '', {}), /no bound call id/);
  assert.throws(() => acpCallbackPayload({ id: 'acp' }, 'call-1', null), /must be an object/);
});

test('ACP callback URLs require a loopback origin and use the ACP paths', () => {
  assert.equal(acpCallbackUrl('http://127.0.0.1:5321'), 'http://127.0.0.1:5321/internal/acp/tool-call');
  assert.equal(acpContextUrl('http://127.0.0.1:5321/'), 'http://127.0.0.1:5321/internal/acp/run-context');
  assert.throws(() => acpCallbackUrl('https://example.com'), /loopback/);
  assert.throws(() => acpContextUrl('http://127.0.0.1.evil:1'), /loopback/);
});

test('ACP mode resolves its scoped base/token and never the bridge fallbacks', () => {
  withEnv({
    B0_ACP_CALLBACK: '1', B0_ACP_BASE_URL: 'http://127.0.0.1:5321', B0_ACP_RUNTIME_TOKEN: TOKEN,
    B0_RUNTIME_TOKEN: undefined, B0_GATEWAY_TOKEN: undefined, B0_PORT_BASE: undefined,
    B0_RUNTIME_FAMILY: 'channel_followup',
  }, () => {
    assert.equal(acpCallbackEnabled(), true);
    const runtime = resolveNativeRuntime({});
    assert.equal(runtime.kernelOrigin, 'http://127.0.0.1:5321');
    assert.equal(runtime.kernelSource, 'acp-env');
    assert.equal(runtime.bridgeOrigin, runtime.kernelOrigin);
    assert.equal(runtime.runtimeToken, TOKEN);
    assert.equal(runtime.family, 'channel_followup');
    // Config still wins over the scoped environment.
    const configured = resolveNativeRuntime({ baseUrl: 'http://127.0.0.1:6001', runtimeToken: TOKEN });
    assert.equal(configured.kernelOrigin, 'http://127.0.0.1:6001');
    assert.equal(configured.kernelSource, 'config');
  });
});

test('ACP mode without its explicit origin/token fails closed', () => {
  withEnv({ B0_ACP_CALLBACK: '1', B0_ACP_BASE_URL: undefined, B0_ACP_RUNTIME_TOKEN: undefined }, () => {
    assert.throws(() => resolveNativeRuntime({}), /NATIVE_CONFIG_INVALID/);
  });
});

test('bridge default is unchanged outside ACP mode', () => {
  withEnv({ B0_ACP_CALLBACK: undefined, B0_PORT_BASE: '4315', B0_RUNTIME_TOKEN: TOKEN }, () => {
    const runtime = resolveNativeRuntime({});
    assert.equal(acpCallbackEnabled(), false);
    assert.equal(runtime.kernelOrigin, 'http://127.0.0.1:4315');
    assert.equal(runtime.kernelSource, 'legacy-env');
    assert.equal(runtime.runtimeToken, TOKEN);
  });
});
