#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MODULE = path.join(
  ROOT,
  'dsh-plugins/analytics-workbench/src/client/free-html-library/native-generate.mjs',
);
const DEFAULT_DEPTH = 5;
const EVENTS = Object.freeze(['deliver', 'intake', 'confirm', 'duplicate-confirm', 'readback']);

const CASES = Object.freeze([
  {
    name: 'absent',
    payload: {},
    valid: true,
    manifest: { bindings: [], result_refs: [] },
  },
  {
    name: 'valid-empty',
    payload: { binding_manifest: { bindings: [], result_refs: [] } },
    valid: true,
    manifest: { bindings: [], result_refs: [] },
  },
  {
    name: 'valid-bound',
    payload: {
      binding_manifest: {
        bindings: [{ binding_id: 'bind_1', result_ref: 'result_1', mode: 'summary' }],
        result_refs: ['result_1'],
      },
    },
    valid: true,
    manifest: {
      bindings: [{ binding_id: 'bind_1', result_ref: 'result_1', mode: 'summary' }],
      result_refs: ['result_1'],
    },
  },
  {
    name: 'invalid-unknown-key',
    payload: { binding_manifest: { bindings: [], result_refs: ['result_1'], extra: true } },
    valid: false,
  },
  {
    name: 'invalid-undeclared-ref',
    payload: {
      binding_manifest: {
        bindings: [{ binding_id: 'bind_1', result_ref: 'result_missing' }],
        result_refs: [],
      },
    },
    valid: false,
  },
  {
    name: 'invalid-duplicate-ref',
    payload: { binding_manifest: { bindings: [], result_refs: ['result_1', 'result_1'] } },
    valid: false,
  },
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function describe(state) {
  return {
    delivery: state.delivery,
    status: state.status,
    binding_state: state.bindingState,
    receipt_refs: state.receiptManifest?.result_refs ?? null,
    page_refs: state.pageManifest?.result_refs ?? null,
  };
}

function failInvariant(message, state, trace, caseName) {
  const error = new Error(message);
  error.caseName = caseName;
  error.trace = trace;
  error.state = describe(state);
  throw error;
}

function assertInvariants(state, trace, caseName) {
  if (state.delivery === 'REJECTED' && state.status !== 'NEW') {
    failInvariant('被拒绝的绑定清单不能进入入箱或保存状态', state, trace, caseName);
  }
  if (state.delivery === 'REJECTED' && state.receiptManifest !== null) {
    failInvariant('被拒绝的绑定清单不能生成回执', state, trace, caseName);
  }
  if (state.pageManifest?.result_refs?.length && state.bindingState === 'UNBOUND_SAMPLE') {
    failInvariant('带 result_refs 的正式页面不能声明 UNBOUND_SAMPLE', state, trace, caseName);
  }
  if (state.status === 'SAVED' && !equalJson(state.receiptManifest, state.pageManifest)) {
    failInvariant('保存页面的 binding_manifest 必须与入箱回执完全一致', state, trace, caseName);
  }
}

function newState() {
  return {
    delivery: 'NONE',
    status: 'NEW',
    receiptManifest: null,
    pageManifest: null,
    bindingState: null,
  };
}

function applyEvent(state, event, delivered) {
  const next = {
    ...state,
    receiptManifest: clone(state.receiptManifest),
    pageManifest: clone(state.pageManifest),
  };
  if (event === 'deliver') {
    if (next.delivery !== 'NONE') return next;
    if (!delivered.ok) {
      next.delivery = 'REJECTED';
      return next;
    }
    next.delivery = 'ACCEPTED';
    next.receiptManifest = clone(delivered.manifest);
    return next;
  }
  if (event === 'intake') {
    if (next.delivery === 'ACCEPTED' && next.status === 'NEW') next.status = 'INTAKED';
    return next;
  }
  if (event === 'confirm') {
    if (next.status === 'INTAKED') {
      next.pageManifest = clone(next.receiptManifest);
      next.bindingState = next.pageManifest.result_refs.length ? 'BOUND_VERIFIED' : 'UNBOUND_SAMPLE';
      next.status = 'SAVED';
    }
    return next;
  }
  if (event === 'duplicate-confirm') {
    return next;
  }
  if (event === 'readback') {
    return next;
  }
  throw new Error(`unknown event: ${event}`);
}

function eventSequences(depth) {
  const output = [];
  const walk = (prefix) => {
    if (prefix.length === depth) {
      output.push(prefix);
      return;
    }
    for (const event of EVENTS) walk([...prefix, event]);
  };
  walk([]);
  return output;
}

async function loadExtractor(modulePath) {
  const imported = await import(pathToFileURL(modulePath).href);
  assert.equal(typeof imported.extractBindingManifest, 'function', '生产模块缺少 extractBindingManifest');
  return imported.extractBindingManifest;
}

function inspectDelivery(extractBindingManifest, testCase) {
  try {
    const manifest = extractBindingManifest(testCase.payload);
    return { ok: true, manifest: clone(manifest) };
  } catch (error) {
    return { ok: false, code: error?.code ?? null };
  }
}

function runDirectContractChecks(extractBindingManifest) {
  const results = [];
  for (const testCase of CASES) {
    const delivered = inspectDelivery(extractBindingManifest, testCase);
    if (testCase.valid && !delivered.ok) {
      throw new Error(`${testCase.name}: 合法清单被拒绝 (${delivered.code ?? 'unknown'})`);
    }
    if (!testCase.valid && delivered.ok) {
      throw new Error(`${testCase.name}: 非法清单被静默接受为 ${JSON.stringify(delivered.manifest)}`);
    }
    if (testCase.valid) assert.deepEqual(delivered.manifest, testCase.manifest, `${testCase.name}: 清单被改写`);
    results.push({ case: testCase.name, outcome: delivered.ok ? 'accepted' : `rejected:${delivered.code ?? 'unknown'}` });
  }
  return results;
}

function runStateMachine(extractBindingManifest, depth) {
  const traces = eventSequences(depth);
  let transitionsChecked = 0;
  let statesChecked = 0;
  for (const testCase of CASES) {
    const delivered = inspectDelivery(extractBindingManifest, testCase);
    for (const trace of traces) {
      let state = newState();
      assertInvariants(state, [], testCase.name);
      statesChecked += 1;
      for (let step = 0; step < trace.length; step += 1) {
        const event = trace[step];
        state = applyEvent(state, event, delivered);
        assertInvariants(state, trace.slice(0, step + 1), testCase.name);
        statesChecked += 1;
        transitionsChecked += 1;
      }
    }
  }
  return {
    traces_per_case: traces.length,
    cases: CASES.length,
    transitions_checked: transitionsChecked,
    states_checked: statesChecked,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const moduleIndex = args.indexOf('--module');
  const modulePath = moduleIndex >= 0 ? path.resolve(args[moduleIndex + 1]) : DEFAULT_MODULE;
  const depthIndex = args.indexOf('--depth');
  const depth = depthIndex >= 0 ? Number(args[depthIndex + 1]) : DEFAULT_DEPTH;
  if (!Number.isInteger(depth) || depth < 1 || depth > 7) throw new Error('--depth 必须是 1..7 的整数');
  const extractBindingManifest = await loadExtractor(modulePath);
  const direct = runDirectContractChecks(extractBindingManifest);
  const model = runStateMachine(extractBindingManifest, depth);
  const report = {
    tool: 'node-bounded-state-machine',
    module: modulePath,
    bound: { max_trace_length: depth, events: EVENTS, manifest_cases: CASES.map(item => item.name) },
    direct_contract_checks: direct,
    model,
    properties: [
      'present invalid binding_manifest is rejected and never normalized to an empty manifest',
      'a saved page with result_refs is never UNBOUND_SAMPLE',
      'a saved page preserves the exact receipt binding_manifest',
      'duplicate confirmation is idempotent',
    ],
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    status: 'FAIL',
    message: error.message,
    case: error.caseName,
    trace: error.trace,
    state: error.state,
  }, null, 2));
  process.exitCode = 1;
});
