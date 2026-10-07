/** Opt-in IPC driver for the unchanged official Host. No real accounts/model/data. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { startHost } from './pinned-host-acceptance.mjs';
import { startB0MockProvider } from './mock-provider.mjs';
import { firstPurchaseMockScript } from './first-purchase-scenario.mjs';
import { DSH_UPSTREAM_SHA } from '../release/toolchain.mjs';
import { createSaveController } from '../../dsh-plugins/analytics-workbench/src/first-purchase-save-client.mjs';
import { firstPurchaseCommandEnvelope } from '../../dsh-plugins/analytics-workbench/src/first-purchase-command-client.mjs';
import { prepareFirstPurchaseArtifacts, verifyFirstPurchaseInstalledArtifacts } from './first-purchase-artifacts.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
assert.equal(Number(process.versions.node.split('.')[0]), 24);
const packed = process.env.B0_NATIVE_CRM_ARTIFACT_MANIFEST ? await prepareFirstPurchaseArtifacts({
  manifestPath: process.env.B0_NATIVE_CRM_ARTIFACT_MANIFEST,
  output: process.env.B0_NATIVE_CRM_ARTIFACT_OUTPUT,
  upstream: process.env.B0_NATIVE_CRM_HOST_UPSTREAM,
  python: process.env.B0_NATIVE_CRM_SERVICE_PYTHON,
  wheelhouse: process.env.B0_NATIVE_CRM_SERVICE_WHEELHOUSE,
  kernelWheelhouse: process.env.B0_NATIVE_CRM_KERNEL_WHEELHOUSE,
}) : null;
const workbench = packed?.workbench ?? join(repository, 'dsh-plugins/analytics-workbench');
const crmPlugin = packed?.crm ?? join(repository, 'dsh-plugins/crm-knowledge');
const candidateDigest = packed?.candidateDigest ?? 'a'.repeat(64);
if (packed) {
  // Fail before starting services when a cold package cannot resolve its SDK.
  for (const entry of [join(workbench, 'lib/index.js'), join(crmPlugin, 'lib/host.js')]) {
    assert.equal(typeof (await import(pathToFileURL(entry).href)).apply, 'function');
  }
}
const { firstPurchaseMethodPackageDigest } = await import(pathToFileURL(join(workbench, 'lib/skills.js')).href);
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
send({ method_digest: firstPurchaseMethodPackageDigest, candidate_digest: candidateDigest,
  ...packed?.kernel ? { kernel: { app: packed.kernel.app, python: packed.kernel.python,
    manifest_sha256: packed.kernel.receipt.manifest_sha256,
    ...packed.kernel.receipt.source_contract ? { source_contract: packed.kernel.receipt.source_contract } : {} } } : {},
  ...packed?.service ? { service: { app: packed.service.app, python: packed.service.python,
    manifest_sha256: packed.service.receipt.manifest_sha256,
    query_runtime: packed.service.receipt.query_runtime,
    ...packed.service.receipt.source_contract ? { source_contract: packed.service.receipt.source_contract } : {} } } : {} });
const lines = createInterface({ input: process.stdin }), iterator = lines[Symbol.asyncIterator]();
const firstInput = await iterator.next();
// The parent may fail to bind its own fixtures after receiving our handshake.
// No Host/model exists yet; exit cleanly so its original error remains visible.
if (firstInput.done) process.exit(0);
const input = JSON.parse(firstInput.value);
const upstream = packed?.runtime?.upstream ?? input.upstream;
if (packed?.runtime) assert.equal(input.upstream, undefined, 'HOST_ARTIFACT_AMBIGUOUS_RUNTIME');
else {
  assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), DSH_UPSTREAM_SHA);
  assert.equal(execFileSync('git', ['-C', upstream, 'status', '--porcelain', '-uno'], { encoding: 'utf8' }).trim(), '');
}
const root = input.output;
await mkdir(root, { mode: 0o700 });
for (const name of ['home', 'tmp', 'workspace', 'dsh-home', 'agents-home', 'presets/owned-first-purchase']) {
  await mkdir(join(root, name), { mode: 0o700, recursive: true });
}
const write = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const agentPlugins = [
  { id: 'owned-tools', name: pathToFileURL(join(workbench, 'lib/tool.js')).href },
  { id: 'owned-skill-roots', name: '@deepseek-ai/dsh-skill-filesystem', config: { includeDefaultRoots: false, customSkillDirs: [], watch: false } },
  { id: 'owned-native-skill', name: '@deepseek-ai/dsh-tool-skill' },
  { id: 'owned-skills', name: pathToFileURL(join(workbench, 'lib/skills.js')).href },
];
await write(join(root, 'presets/owned-first-purchase/agent.cordis.yml'), agentPlugins);
let host, model, origin, cookie, browserResult, generation = 0;
const controllers = [], observations = [], signal = new AbortController();
const interrupt = () => signal.abort();
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
const record = value => observations.push(value);
try {
  const { startMockLlmServer } = await import(pathToFileURL(packed?.runtime?.mockModule
    ?? join(upstream, 'packages/test-support/llm-mock-server/lib/index.js')).href);
  model = await startB0MockProvider(startMockLlmServer, { host: '127.0.0.1', port: 0, apiKey: 'synthetic',
    script: [...firstPurchaseMockScript(), { sequence: ['success'], successText: 'SYNTHETIC_NATIVE_FALLBACK_OK', chunkDelayMs: 0 }] });
  const patch = join(root, 'host.patch.yml');
  await write(patch, [
    ...['session-title-llm', 'llm-pi-ai', 'web-search-deepseek', 'web-fetch-http', 'session-telemetry-otel',
      'session-log-deepseek', 'plugin-package-inventory-deepseek', 'agent-instructions', 'skill-filesystem', 'hmr'].map(id => ({ id, disabled: true })),
    { id: 'llm-deepseek', config: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: model.baseURL, thinking: 'disabled',
      reasoningEffort: 'off', maxTokens: 1024, retryPolicy: { mode: 'normal', maxRetries: 0 } } },
    { insert: [
      { id: 'owned-preset', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'owned-first-purchase',
        name: 'Owned synthetic first-purchase', plugins: agentPlugins } },
      { id: 'owned-native-preset', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'owned-native', name: 'Owned native', plugins: [] } },
      { id: 'owned-crm', name: pathToFileURL(join(crmPlugin, 'lib/host.js')).href,
        config: { baseUrl: input.crm_origin, firstPurchaseOrigin: input.service_origin, dataKind: 'synthetic' } },
      { id: 'owned-workbench', name: pathToFileURL(join(workbench, 'lib/index.js')).href,
        config: { firstPurchaseCandidateDigest: candidateDigest } },
      { id: 'owned-observer', name: pathToFileURL(join(repository, 'scripts/dsh-b0/pinned-host-observer.mjs')).href,
        config: { presetId: 'owned-first-purchase', nativePresetId: 'owned-native', workspace: join(root, 'workspace'),
          llmModule: pathToFileURL(packed?.runtime?.llmModule ?? join(upstream, 'packages/llm/llm/lib/index.js')).href } },
    ] },
  ]);
  async function launch(resume = false) {
    host = await startHost({ root, upstream, runtimeLayout: Boolean(packed?.runtime), patches: [patch], modelOrigin: model.baseURL,
      generation: ++generation, signal: signal.signal,
      nativeFixture: { portBase: input.port_base, sessionId: input.session_id,
        runtimeToken: input.runtime_token, gatewayToken: input.gateway_token } });
    const names = await host.request('tools', { sessionId: input.session_id, resume });
    assert.ok(names.includes('analytics_first_purchase_query'));
    const web = await host.request('web-access'); origin = web.origin;
    if (!cookie) {
      const exchange = await fetch(web.launchUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      cookie = exchange.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
      assert.ok(cookie); assert.equal(exchange.status, 303);
    }
    record({ stage: resume ? 'official-host-restarted' : 'official-host-loaded', pid: host.pid, generation });
  }
  async function post(path, body, extra = {}) {
    const response = await fetch(origin + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { cookie, origin, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
    const raw = await response.text();
    assert.ok(!raw.includes(input.runtime_token) && !raw.includes(input.gateway_token) && !raw.includes('synthetic-query-save-token'));
    let value; try { value = JSON.parse(raw); } catch { value = null; }
    return { status: response.status, value };
  }
  const crm = operation => post('/api/crm-knowledge/connection', { operation, session_id: input.session_id,
    ...operation === 'login' ? { username: 'crm-owner', password: 'synthetic-password' } : {} }, { 'x-crm-ui': '1' });
  await launch();
  const statusBody = { operation: 'status', session_id: input.session_id };
  assert.equal((await post('/api/crm-knowledge/connection', statusBody, { cookie: '', 'x-crm-ui': '1' })).status, 401);
  record({ stage: 'missing-cookie-rejected', status: 'PASS' });
  assert.equal((await post('/api/crm-knowledge/connection', statusBody, { origin: 'https://foreign.invalid', 'x-crm-ui': '1' })).status, 403);
  record({ stage: 'foreign-origin-rejected', status: 'PASS' });
  let csrf;
  try { csrf = (await post('/api/crm-knowledge/connection', statusBody)).status; }
  catch (error) {
    // The pinned streaming carrier may close an unread rejected request before
    // flushing the 403. Do not accept a transport failure on positive paths.
    assert.equal(error.cause?.code, 'UND_ERR_SOCKET'); csrf = 'CONNECTION_CLOSED';
  }
  assert.ok([403, 'CONNECTION_CLOSED'].includes(csrf));
  record({ stage: 'missing-csrf-header-rejected', outcome: csrf });
  assert.deepEqual((await crm('status')).value, { ok: true, connected: false, username: null, expires_at: null });
  record({ stage: 'cookie-origin-csrf-and-login-bootstrap', status: 'PASS' });
  send({ ready: true });
  let replaySaved;
  for await (const line of { [Symbol.asyncIterator]: () => iterator }) {
    const command = JSON.parse(line);
    if (command.operation === 'settle-query') {
      const settled = await host.request('idle', { sessionId: input.session_id });
      assert.ok(settled.assistant.length > 0);
      record({ stage: 'official-query-summary-settled', status: 'PASS' });
      send({ ok: true, settled: true }); continue;
    }
    if (command.operation === 'native-fallback') {
      const sessionId = input.session_id + '-native';
      const native = await host.request('create-native-session', { sessionId });
      assert.ok(!native.tool_names.includes('analytics_first_purchase_query'));
      const response = await host.request('prompt', { sessionId, text: 'Owned synthetic native fallback' });
      assert.ok(response.assistant.includes('SYNTHETIC_NATIVE_FALLBACK_OK'));
      record({ stage: 'native-session-without-business-tools', status: 'PASS' });
      send({ ok: true, fallback: true }); continue;
    }
    if (command.operation === 'browser') {
      const { runFirstPurchaseBrowser } = await import('./first-purchase-browser.probe.mjs');
      browserResult = { ok: false, browser: 'Chrome headless', status: 'PARTIAL' };
      browserResult = await runFirstPurchaseBrowser({ modulePath: command.module_path, host, sessionId: input.session_id, output: root });
      send(browserResult);
      continue;
    }
    if (command.operation === 'command') {
      const rpcId = `owned-${observations.length}`;
      const response = await post('/api/commands/execute', firstPurchaseCommandEnvelope(input.session_id, command.line, rpcId));
      assert.equal(response.status, 200); assert.equal(response.value.rpcId, rpcId);
      assert.equal(response.value.result.ok, true);
      const value = response.value.result.value;
      assert.ok(['success', 'error'].includes(value.result.kind));
      record({ stage: 'official-native-command', command: command.line.split(' ')[0], kind: value.result.kind });
      send(value); continue;
    }
    if (['login', 'disconnect', 'status'].includes(command.operation)) {
      const response = await crm(command.operation); assert.equal(response.status, 200);
      send({ ok: true, connected: response.value.connected }); continue;
    }
    if (command.operation === 'restart') {
      const before = await host.request('inspect', { sessionId: input.session_id });
      assert.equal((await host.stop()).code, 0); host = null;
      await launch(true);
      const after = await host.request('inspect', { sessionId: input.session_id, prefix: before.count });
      assert.equal(after.prefix_digest, before.digest);
      const status = await crm('status'); assert.equal(status.status, 200);
      assert.equal(status.value.connected, false);
      record({ stage: 'durable-session-and-cookie-reused-crm-relogin-required', status: 'PASS' });
      send({ ok: true, preserved: true }); continue;
    }
    if (command.operation === 'replay-save') {
      assert.equal(typeof replaySaved, 'function');
      await replaySaved();
      record({ stage: 'same-save-intent-after-independent-service-restart', status: 'PASS' });
      send({ ok: true, replayed: true }); continue;
    }
    assert.equal(command.operation, 'save');
    const target = { session_id: input.session_id, run_id: command.run_id, call_id: command.call_id };
    const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    let writes = 0, original;
    const transport = async (_target, operation, payload) => {
      const response = await post('/api/analytics-first-purchase/save', { operation, target, payload }, { 'x-first-purchase-ui': '1' });
      assert.equal(response.status, 200); return response.value;
    };
    const request = async (...args) => {
      const value = await transport(...args);
      if (args[1] === 'save') { writes++; original = args[2]; assert.equal(value.value.status, 'SAVED'); throw Error('controlled ACK loss'); }
      return value;
    };
    const first = createSaveController({ target, storage, request, onChange() {} }); controllers.push(first);
    await first.start(); assert.equal(first.getState().phase, 'ready');
    assert.equal(first.getState().result.provenance.permission_scope.owner_id, 'crm-owner');
    await first.save('官方宿主合成首购'); assert.equal(first.getState().phase, 'unknown'); first.dispose();
    const reopened = createSaveController({ target, storage, request, onChange() {} }); controllers.push(reopened);
    await reopened.start(); assert.equal(reopened.getState().phase, 'saved'); assert.equal(writes, 1);
    assert.deepEqual((await transport(target, 'save', original)).value, reopened.getState().receipt);
    replaySaved = async () => assert.deepEqual((await transport(target, 'save', original)).value, reopened.getState().receipt);
    record({ stage: 'official-fetch-save-ack-loss-reconcile-replay', status: 'PASS' });
    send({ ok: true, saved: true, writes });
  }
} finally {
  controllers.forEach(controller => controller.dispose());
  const cleanup = await Promise.allSettled([host?.stop(true), model?.close()]);
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  let packageIntegrity = 'NOT_APPLICABLE_WORKSPACE';
  if (packed) {
    try { await verifyFirstPurchaseInstalledArtifacts(packed); packageIntegrity = 'PASS'; }
    catch { packageIntegrity = 'FAIL'; }
  }
  await write(join(root, 'http-observations.json'), { upstream_sha: DSH_UPSTREAM_SHA, observations,
    cleanup_ok: cleanup.every(item => item.status === 'fulfilled'), browser: browserResult ?? 'NOT_RUN',
    candidate_digest: candidateDigest, artifacts: packed?.evidence ?? 'WORKSPACE_COMPILED_OUTPUT',
    package_integrity: packageIntegrity,
    admission: browserResult ? 'official native composer slash command in Chrome' : 'official commands/execute HTTP; browser rendering NOT_RUN' });
  assert.ok(cleanup.every(item => item.status === 'fulfilled'), 'OWNED_CRM_HOST_CLEANUP_FAILED');
  assert.notEqual(packageIntegrity, 'FAIL', 'OWNED_CRM_HOST_PACKAGE_CHANGED');
}
