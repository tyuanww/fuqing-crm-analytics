import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstPurchaseCommands } from '../src/first-purchase-commands.mjs';
import { firstPurchaseCancelOutcome, firstPurchaseCommandEnvelope } from '../src/first-purchase-command-client.mjs';
import { applyFirstPurchaseCommandFeedback } from '../src/client/first-purchase-command-feedback.mjs';
const schema_version = 'analytics-run-first-purchase-path/v1';
const accepted = { schema_version, run_id: 'run-a', version: 1, status: 'QUEUED', phase: 'ACCEPTED',
  location: '/api/v1/analytics-first-purchase/runs/run-a' };
const invocation = (rawInput = '查看合成首购路径') => ({ sessionId: 'owned', commandId: 'cmd-1', rawInput,
  signal: new AbortController().signal, requestForCall: id => id === 'call-a' ? 'original-request' : undefined });
function fixture(respond = () => Response.json(accepted, { status: 202 }), options = {}) {
  const calls = [];
  const api = createFirstPurchaseCommands({ portBase: 4335, sessionId: 'owned', gatewayToken: 'g'.repeat(32),
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); return respond(url, init); }, ...options });
  return { ...api, calls };
}
test('official command id is the exact replay key, with no native RPC or client identity', async () => {
  const api = fixture();
  for (let i = 0; i < 2; i++) assert.equal((await api.execute('first-purchase', invocation())).kind, 'success');
  assert.equal(api.calls[0].body, api.calls[1].body);
  assert.deepEqual(JSON.parse(api.calls[0].body), { sessionId: 'owned', requestId: 'fp-cmd-1', mode: 'queue',
    content: [{ type: 'text', text: '查看合成首购路径' }], clientTimeZone: 'Asia/Shanghai' });
  assert.equal(api.calls[0].url, 'http://127.0.0.1:4335/internal/native/prompt');
  assert.equal(api.calls[0].redirect, 'error');
});
test('missing config, foreign session, invalid input, aborted and disposed commands never write', async () => {
  const api = fixture();
  for (const value of ['', 'x'.repeat(8001), 'bad\0question']) assert.equal((await api.execute('first-purchase', invocation(value))).kind, 'error');
  assert.match((await api.execute('first-purchase', { ...invocation(), sessionId: 'foreign' })).text, /^NOT_AVAILABLE:/);
  assert.equal((await api.execute('first-purchase', { ...invocation(), signal: AbortSignal.abort() })).kind, 'error');
  api.dispose(); assert.match((await api.execute('first-purchase', invocation())).text, /^NOT_AVAILABLE:/);
  assert.equal(api.calls.length, 0);
  const absent = fixture(undefined, { gatewayToken: undefined });
  assert.match((await absent.execute('first-purchase', invocation())).text, /^NOT_AVAILABLE:/); assert.equal(absent.calls.length, 0);
});
test('timeouts, malformed successful replies and 5xx mutations remain UNKNOWN; errors are redacted', async () => {
  for (const respond of [() => { throw Error('credential-never-echo'); }, () => Response.json({ token: 'credential-never-echo' }),
    () => Response.json({ error: 'credential-never-echo' }, { status: 503 })]) {
    const api = fixture(respond);
    const value = await api.execute('first-purchase', invocation());
    assert.match(value.text, /^ADMISSION_UNKNOWN:/); assert.ok(!value.text.includes('credential-never-echo'));
    assert.match((await api.execute('first-purchase-cancel', invocation('run run-a'))).text, /^CANCEL_UNKNOWN:/);
  }
});
test('CRM denial and task conflict remain distinct from transport uncertainty', async () => {
  for (const [status, code] of [[401, 'NOT_CONNECTED'], [403, 'PERMISSION_DENIED'], [409, 'CONFLICT'], [422, 'INVALID_REQUEST']]) {
    const api = fixture(() => Response.json({ error: { message: 'private' } }, { status }));
    assert.match((await api.execute('first-purchase', invocation())).text, new RegExp(`^${code}:`));
  }
});
test('partial or foreign admission/cancel receipts cannot report success', async () => {
  for (const override of [{ version: undefined }, { version: 2 }, { location: '/foreign' }, { extra: true }]) {
    const api = fixture(() => Response.json({ ...accepted, ...override }));
    assert.match((await api.execute('first-purchase', invocation())).text, /^ADMISSION_UNKNOWN:/);
  }
  const foreign = fixture(() => Response.json({ schema_version, run_id: 'run-foreign', status: 'CANCELLED', diagnostics: { execution_active: false } }));
  assert.match((await foreign.execute('first-purchase-cancel', invocation('run run-a'))).text, /^CANCEL_UNKNOWN:/);
  const oversized = fixture();
  assert.match((await oversized.execute('first-purchase-cancel', { ...invocation('run run-a'), commandId: 'c'.repeat(128) })).text, /^INVALID_REQUEST:/);
  assert.equal(oversized.calls.length, 0);
});
test('status uses current owned conversation, is read-only and does not invent a missing run', async () => {
  const api = fixture(url => Response.json(url.endsWith('/context')
    ? { session_id: 'owned', family: 'first_purchase', conversation: { run_ids: ['run-a'] } }
    : { schema_version, run_id: 'run-a', status: 'UNKNOWN', diagnostics: { execution_active: true } }));
  assert.match((await api.execute('first-purchase-status', invocation(''))).text, /UNKNOWN（执行仍在途）/);
  assert.match((await api.execute('first-purchase-status', invocation('foreign-run'))).text, /^NOT_FOUND:/);
  assert.ok(api.calls.every(call => call.method === 'GET'));
  const empty = fixture(() => Response.json({ session_id: 'owned', family: 'first_purchase', conversation: null }));
  assert.match((await empty.execute('first-purchase-status', invocation(''))).text, /没有已登记任务/);
});
test('card cancel resolves its exact tool call to the original request, never latest session work', async () => {
  const api = fixture(() => Response.json({ schema_version, run_id: 'run-a', status: 'CANCELLING', diagnostics: { execution_active: true } }));
  assert.match((await api.execute('first-purchase-cancel', invocation('call call-a'))).text, /^CANCEL_ACCEPTED:/);
  assert.deepEqual(JSON.parse(api.calls[0].body), { request_id: 'original-request' });
  assert.match((await api.execute('first-purchase-cancel', invocation('call foreign-call'))).text, /^NOT_FOUND:/);
  assert.equal(api.calls.length, 1);
  for (const code of ['NO_ACTIVE_RUN', 'WORKER_ACTIVE']) {
    const denied = fixture(() => Response.json({ error: { code } }, { status: 409 }));
    assert.match((await denied.execute('first-purchase-cancel', invocation('run run-a'))).text, new RegExp(`^${code}:`));
  }
});
test('native command cancel decoder refuses generic native acknowledgements and false success', () => {
  const response = (kind, text) => ({ status: 200, body: { type: 'server-response', result: { ok: true, value: { result: { kind, text } } } } });
  assert.equal(firstPurchaseCancelOutcome(response('success', 'CANCEL_ACCEPTED: 取消请求已受理；请核对执行是否退出。')), 'accepted');
  assert.equal(firstPurchaseCancelOutcome(response('success', 'accepted')), 'unknown');
  assert.equal(firstPurchaseCancelOutcome({ status: 200, body: { result: { ok: true } } }), 'unknown');
  for (const [code, state] of [['NO_ACTIVE_RUN', 'inactive'], ['WORKER_ACTIVE', 'active'], ['NOT_CONNECTED', 'unavailable'], ['CANCEL_UNKNOWN', 'unknown']]) {
    assert.equal(firstPurchaseCancelOutcome(response('error', `${code}: controlled`)), state);
  }
  const wire = firstPurchaseCommandEnvelope('owned', '/first-purchase-cancel call call-a', 'rpc-1');
  assert.equal(wire.method, 'commands/execute'); assert.equal(wire.payload.args.agentId, 'owned');
});
test('command feedback stays on its original session and ignores native/unrelated commands', () => {
  let listener; const notifications = [], original = {};
  const scope = { on(name, fn) { assert.equal(name, 'command/executed'); listener = fn; },
    sessions: { scope: id => id === 'original' ? original : null },
    conversation: { input: { for(value) { assert.equal(value, original); return { notify: (...args) => notifications.push(args) }; } } } };
  applyFirstPurchaseCommandFeedback({ inject: (_, callback) => callback(scope) });
  listener('original', 'first-purchase', { kind: 'error', text: 'NOT_CONNECTED: connect CRM' });
  listener('original', 'goal', { kind: 'success', text: 'native-owned' });
  listener('disposed', 'first-purchase', { kind: 'success', text: 'late' });
  listener('original', 'first-purchase', { kind: 'success', text: 'x'.repeat(2401) });
  assert.deepEqual(notifications, [['error', 'NOT_CONNECTED: connect CRM']]);
});
