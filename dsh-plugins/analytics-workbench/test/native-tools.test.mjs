/** P3-2: the single native surface binding table, its backend projection and Config resolution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NATIVE_TOOLS, NATIVE_TOOLS_SCHEMA, assertToolBindings, bridgeSurface, kernelSurface,
  nativeSurface, toolSurface,
} from '../src/native-tools.mjs';
import { Config, isLoopbackOrigin, parseNativeConfig, validateNativeConfig } from '../src/config.mjs';
import { kernelUrl, resolveNativeRuntime } from '../src/runtime-endpoints.ts';
import { TOOL_NAME } from '../src/model.mjs';
import { QUERY_TOOL_NAME } from '../src/query-model.mjs';
import { FIRST_PURCHASE_TOOL_NAME } from '../src/first-purchase-query-model.mjs';
import { checkNativeTools, validateNativeTools } from '../../../scripts/ci/analytics-native-tools-sync.mjs';

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'c'.repeat(40);

test('the deployment projection is byte-identical to the reviewed table', async () => {
  const table = await checkNativeTools();
  assert.equal(table.schema_version, NATIVE_TOOLS_SCHEMA);
  const raw = await readFile(join(plugin, '../../config/analytics-native-tools.v1.json'), 'utf8');
  assert.equal(raw, `${JSON.stringify(NATIVE_TOOLS, null, 2)}\n`);
});

test('transport is mandatory and a v1 table is refused', () => {
  const table = structuredClone(NATIVE_TOOLS);
  assert.equal(table.schema_version, 'analytics-native-tools/v2');
  assert.ok(table.surfaces.every(row => ['gateway', 'bridge', 'acp'].includes(row.transport)));
  const acp = table.surfaces.filter(row => row.transport === 'acp').map(row => row.id).sort();
  assert.deepEqual(acp, ['kernel.acp-run-context', 'kernel.acp-tool-call']);
  for (const row of table.surfaces.filter(row => row.transport === 'acp')) {
    assert.deepEqual([...row.families].sort(), ['b0', 'first_purchase']);
  }
  assert.throws(() => validateNativeTools({ ...table, schema_version: 'analytics-native-tools/v1' }),
    /NATIVE_TOOLS_SCHEMA_V1/);
  const missing = structuredClone(table);
  delete missing.surfaces[0].transport;
  assert.throws(() => validateNativeTools(missing), /NATIVE_TOOLS_SURFACE_TRANSPORT/);
});

test('every model-facing tool binds exactly one kernel surface and one family', () => {
  assert.deepEqual(assertToolBindings('b0', [TOOL_NAME]), ['analytics_b0_query']);
  assert.deepEqual(assertToolBindings('channel_followup', [QUERY_TOOL_NAME]), ['analytics_channel_followup_query']);
  assert.deepEqual(assertToolBindings('first_purchase', [FIRST_PURCHASE_TOOL_NAME]), ['analytics_first_purchase_query']);
  assert.throws(() => assertToolBindings('b0', ['analytics_other']), /NATIVE_TOOLS_TOOL_DRIFT/);
  for (const name of [TOOL_NAME, QUERY_TOOL_NAME, FIRST_PURCHASE_TOOL_NAME]) {
    const surface = toolSurface(name);
    assert.equal(surface.side, 'kernel');
    assert.equal(surface.families.length, 1);
    assert.equal(surface.tool.name, name);
    assert.ok(surface.path.startsWith('/internal/native/'));
    assert.equal(surface.method, 'POST');
  }
  assert.throws(() => toolSurface('analytics_missing'), /NATIVE_TOOLS_UNKNOWN_TOOL/);
});

test('the bridge serves only the five documented POST operations', () => {
  const paths = NATIVE_TOOLS.surfaces.filter(row => row.side === 'bridge').map(row => row.path).sort();
  assert.deepEqual(paths, ['/cancel', '/dispatch', '/health', '/identity', '/observe']);
  for (const id of ['bridge.health', 'bridge.identity', 'bridge.dispatch', 'bridge.observe', 'bridge.cancel']) {
    assert.equal(bridgeSurface(id).method, 'POST');
    assert.ok(bridgeSurface(id).families.includes('competition_growth'), `${id} keeps the legacy competition family`);
  }
  assert.throws(() => bridgeSurface('kernel.run-context'), /NATIVE_TOOLS_SURFACE_SIDE/);
});

test('kernel surfaces are family-scoped and unknown ids fail closed', () => {
  assert.equal(kernelSurface('b0', 'kernel.b0-fixture').path, '/internal/native/fixture');
  assert.throws(() => kernelSurface('b0', 'kernel.channel-followup'), /NATIVE_TOOLS_SURFACE_FAMILY/);
  assert.throws(() => kernelSurface('channel_followup', 'kernel.first-purchase'), /NATIVE_TOOLS_SURFACE_FAMILY/);
  assert.throws(() => nativeSurface('kernel.missing'), /NATIVE_TOOLS_UNKNOWN_SURFACE/);
});

function withEnvironment(values, run) {
  const prior = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('Config.baseUrl/bridgeUrl win over the legacy port block and derive the bridge origin', () => {
  withEnvironment({ B0_PORT_BASE: '4325', B0_RUNTIME_TOKEN: 'e'.repeat(40), B0_GATEWAY_TOKEN: undefined }, () => {
    const configured = resolveNativeRuntime({ baseUrl: 'http://127.0.0.1:5100', runtimeToken: TOKEN }, 'b0');
    assert.equal(configured.kernelOrigin, 'http://127.0.0.1:5100');
    assert.equal(configured.kernelSource, 'config');
    assert.equal(configured.bridgeOrigin, 'http://127.0.0.1:5101');
    assert.equal(configured.bridgeSource, 'legacy-derived');
    assert.equal(configured.runtimeToken, TOKEN, 'Config.runtimeToken wins over B0_RUNTIME_TOKEN');
    assert.equal(configured.gatewayToken, undefined);
    assert.equal(kernelUrl(configured, 'kernel.b0-fixture'), 'http://127.0.0.1:5100/internal/native/fixture');
    const bridged = resolveNativeRuntime({ baseUrl: 'http://127.0.0.1:5100', bridgeUrl: 'http://127.0.0.1:6000' }, 'b0');
    assert.equal(bridged.bridgeOrigin, 'http://127.0.0.1:6000');
    assert.equal(bridged.bridgeSource, 'config');
  });
});

test('the transitional port block still resolves both origins when Config is absent', () => {
  withEnvironment({ B0_PORT_BASE: '4335', B0_RUNTIME_TOKEN: 'e'.repeat(40) }, () => {
    const runtime = resolveNativeRuntime({}, 'first_purchase');
    assert.equal(runtime.kernelOrigin, 'http://127.0.0.1:4335');
    assert.equal(runtime.kernelSource, 'legacy-env');
    assert.equal(runtime.bridgeOrigin, 'http://127.0.0.1:4336');
    assert.equal(runtime.runtimeToken, 'e'.repeat(40));
    assert.equal(kernelUrl(runtime, 'kernel.first-purchase'), 'http://127.0.0.1:4335/internal/native/first-purchase');
    assert.throws(() => kernelUrl(runtime, 'kernel.b0-fixture'), /NATIVE_TOOLS_SURFACE_FAMILY/);
  });
  withEnvironment({ B0_PORT_BASE: undefined, B0_RUNTIME_TOKEN: undefined }, () => {
    const runtime = resolveNativeRuntime({}, 'b0');
    assert.equal(runtime.kernelOrigin, 'http://127.0.0.1:4315');
    assert.equal(runtime.kernelSource, 'legacy-default');
    assert.equal(runtime.bridgeOrigin, 'http://127.0.0.1:4316');
    assert.equal(runtime.runtimeToken, undefined);
  });
  withEnvironment({ B0_PORT_BASE: '8000' }, () => {
    assert.throws(() => resolveNativeRuntime({}, 'b0'), /Invalid isolated analytics port block/);
    assert.equal(resolveNativeRuntime({ baseUrl: 'http://127.0.0.1:5200' }, 'b0').kernelOrigin, 'http://127.0.0.1:5200');
  });
});

test('Config rejects remote, path, scheme and credential shapes before any fetch', () => {
  for (const baseUrl of ['https://127.0.0.1:4315', 'http://localhost:4315', 'http://127.0.0.1', 'http://127.0.0.1:4315/api',
    'http://127.0.0.1:4315?x=1', 'http://127.0.0.1:4315#f', 'http://user@127.0.0.1:4315', 'http://127.0.0.1:4315@evil.invalid',
    'http://10.0.0.1:4315', '', 4315]) {
    assert.throws(() => resolveNativeRuntime({ baseUrl }, 'b0'), /NATIVE_CONFIG_INVALID/, JSON.stringify(baseUrl));
  }
  assert.equal(parseNativeConfig({ baseUrl: 'http://127.0.0.1:4315/' }).baseUrl, 'http://127.0.0.1:4315');
  assert.equal(isLoopbackOrigin('http://127.0.0.1:4315'), true);
  assert.equal(isLoopbackOrigin('http://127.0.0.1:4315/'), false);
  assert.deepEqual(validateNativeConfig({ unknown: true }).issues?.[0]?.path, ['unknown']);
});

test('rc.5 reads Config through the Standard Schema interface Cordis calls', () => {
  // Same call as vendor/cordis/src/fiber.ts:53: runtime.Config['~standard'].validate(config).
  const validate = Config['~standard'].validate;
  assert.equal(Config['~standard'].version, 1);
  assert.deepEqual(validate(undefined), { value: {} });
  assert.deepEqual(validate({ firstPurchaseCandidateDigest: 'a'.repeat(64) }),
    { value: { firstPurchaseCandidateDigest: 'a'.repeat(64) } });
  const { issues } = validate({ baseUrl: 'http://127.0.0.1:4315', shell: 'rm' });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path[0], 'shell');
  // Cordis rejects async validation; the schema must stay synchronous.
  assert.equal(typeof validate({}).then, 'undefined');
});
