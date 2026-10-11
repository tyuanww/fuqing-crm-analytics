/** Compiled pinned React card in jsdom; does not claim headed Chrome/real DSH. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { FIRST_PURCHASE_TOOL_NAME, FIRST_PURCHASE_RECEIPT_SCHEMA } from './test-support/workbench-client.fixture.mjs';
import { inspected, saved, unknown, status, ok, target } from './test-support/workbench-client.fixture.mjs';
import { loadWorkbenchClient } from './workbench-client-pack-inputs.mjs';
const runtime = await loadWorkbenchClient({ scope: 'workbench-first-purchase-save' });
const { source, stores, webRequire: webReq, JSDOM } = runtime;
const React = webReq('react'), { createRoot } = webReq('react-dom/client');
const act = React.act ?? webReq('react-dom/test-utils').act;
const block = { kind: 'tool-result', seq: 2, time: 1, callId: target.call_id, call: { name: FIRST_PURCHASE_TOOL_NAME, argsRaw: '{}' },
  callTime: 0, content: [], isError: false, subCalls: [], meta: { schema_version: FIRST_PURCHASE_RECEIPT_SCHEMA, run_id: target.run_id,
    request_id: 'req-1', call_id: target.call_id, attempt_id: 'attempt-1', step_id: 'step-1', disposition: 'EXECUTE', run_status: 'SUCCEEDED', result: inspected.result } };
async function waitFor(check) {
  for (let i = 0; i < 40; i++) { if (check()) return; await act(async () => { await delay(10); }); }
  throw new Error('compiled first-purchase save did not reach expected state');
}
test('compiled card disables unavailable actions, saves explicitly, recovers lost ACK, clears on CRM switch', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1:43299/' });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mounted;
  try {
    let factory, available = false, written = false, writes = 0;
    const fetchImpl = async (url, options) => {
      assert.equal(url, '/api/analytics-first-purchase/save');
      const body = JSON.parse(options.body);
      if (!available) return Response.json({ schema_version: status.schema_version, ok: false, code: 'NOT_AVAILABLE' }, { status: 409 });
      if (body.operation === 'status') return Response.json(status);
      if (body.operation === 'inspect') return Response.json(ok(inspected));
      if (body.operation === 'reconcile') return Response.json(ok(written ? saved : unknown));
      if (body.operation === 'save') { writes++; written = true; throw new Error('lost browser ACK'); }
      throw new Error('unexpected operation');
    };
    vm.runInNewContext(source, { window: Object.assign(dom.window, { __ModuleLoader__: { load: f => { factory = f; } }, fetch: fetchImpl }),
      document: dom.window.document, fetch: fetchImpl, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
      AbortController, AbortSignal, TextDecoder, Uint8Array, crypto: globalThis.crypto,
      __SHINE_QUERY__: false, __SHINE_BOARD__: false }, { timeout: 2000 });
    const api = factory.factory(name => {
      if (name === 'react') return React;
      if (name === 'react-dom') return webReq('react-dom');
      if (name === 'react/jsx-runtime') return webReq('react/jsx-runtime');
      if (name === '@deepseek-ai/dsh-client-store') return stores;
      throw new Error(`unexpected module ${name}`);
    });
    const registrations = []; api.apply({ effect() {}, sessions: {}, slots: { inject: (_, fn) => fn(), register: (options, component) => { registrations.push({ options, component }); return () => {}; } } });
    const Card = registrations.find(r => r.options.key === FIRST_PURCHASE_TOOL_NAME).component;
    mounted = createRoot(dom.window.document.getElementById('root'));
    await act(() => { mounted.render(React.createElement(Card, { block, sessionId: target.session_id })); });
    const save = () => dom.window.document.querySelector('[data-testid="analytics-first-purchase-save-button"]');
    const text = () => dom.window.document.body.textContent;
    await waitFor(() => text().includes('NOT_AVAILABLE：保存服务'));
    assert.equal(save().disabled, true); assert.equal(writes, 0);
    available = true; await act(() => { dom.window.dispatchEvent(new dom.window.Event('crm-connection-changed')); });
    await waitFor(() => save() && !save().disabled); assert.ok(text().includes('暂不检查'));
    await act(() => { save().click(); save().click(); });
    await waitFor(() => text().includes('SAVE_UNKNOWN')); assert.equal(writes, 1); assert.equal(save().disabled, true);
    const reconcile = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === '核对保存');
    await act(() => { reconcile.click(); }); await waitFor(() => text().includes('已保存为独立分析版本'));
    assert.ok(text().includes(saved.analysis_ref.analysis_id)); assert.equal(writes, 1);
    available = false; await act(() => { dom.window.dispatchEvent(new dom.window.Event('crm-connection-changed')); });
    await waitFor(() => text().includes('NOT_AVAILABLE：保存服务')); assert.ok(!text().includes(saved.analysis_ref.analysis_id));
    for (const label of ['加入驾驶舱', '导出', '发送']) assert.equal([...dom.window.document.querySelectorAll('button')].find(b => b.textContent === label).disabled, true);
  } finally {
    if (mounted) await act(() => mounted.unmount()); dom.window.close();
    for (const [key, value] of Object.entries({ window: previous.window, document: previous.document, IS_REACT_ACT_ENVIRONMENT: previous.act })) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('compiled cancel uses exact call identity, suppresses double click and drops late replies after session switch', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1:43299/' });
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mounted, finish;
  try {
    let factory; const requests = [];
    const fetchImpl = async (url, options) => {
      assert.equal(url, '/api/commands/execute');
      const wire = JSON.parse(options.body); requests.push(wire);
      if (requests.length === 1) await new Promise(resolve => { finish = resolve; });
      return Response.json({ type: 'server-response', rpcId: wire.rpcId, result: { ok: true, value: { result:
        requests.length === 1 ? { kind: 'success', text: 'CANCEL_ACCEPTED: 取消请求已受理；请核对执行是否退出。' }
          : { kind: 'error', text: 'WORKER_ACTIVE: still active' } } } });
    };
    vm.runInNewContext(source, { window: Object.assign(dom.window, { __ModuleLoader__: { load: f => { factory = f; } } }),
      document: dom.window.document, fetch: fetchImpl, AbortController, AbortSignal, crypto: globalThis.crypto,
      __SHINE_QUERY__: false, __SHINE_BOARD__: false }, { timeout: 2000 });
    const api = factory.factory(name => {
      if (name === 'react') return React;
      if (name === 'react-dom') return webReq('react-dom');
      if (name === 'react/jsx-runtime') return webReq('react/jsx-runtime');
      if (name === '@deepseek-ai/dsh-client-store') return stores;
      throw new Error(`unexpected module ${name}`);
    });
    const registrations = []; api.apply({ effect() {}, sessions: {}, slots: { inject: (_, fn) => fn(), register: (options, component) => { registrations.push({ options, component }); return () => {}; } } });
    const Card = registrations.find(r => r.options.key === FIRST_PURCHASE_TOOL_NAME).component;
    mounted = createRoot(dom.window.document.getElementById('root'));
    const running = { callId: 'same-call', name: FIRST_PURCHASE_TOOL_NAME, argsRaw: '{}', turn: 1, step: 1, time: 0, subCalls: [] };
    const render = sessionId => act(() => { mounted.render(React.createElement(Card, { block: running, sessionId })); });
    const button = () => dom.window.document.querySelector('[data-testid="analytics-first-purchase-cancel"]');
    const phase = () => dom.window.document.querySelector('[data-cancel-state]').getAttribute('data-cancel-state');
    await render('original-session');
    await act(() => { button().click(); button().click(); });
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].payload.args, { agentId: 'original-session', line: '/first-purchase-cancel call same-call', submittedAttachments: [] });
    await render('new-session'); await act(async () => { finish(); await delay(10); });
    assert.equal(phase(), 'idle');
    await act(async () => { button().click(); await delay(10); });
    assert.equal(requests[1].payload.args.agentId, 'new-session'); assert.equal(phase(), 'active');
    assert.ok(dom.window.document.body.textContent.includes('执行尚未确认退出'));
  } finally {
    finish?.(); if (mounted) await act(() => mounted.unmount()); dom.window.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
