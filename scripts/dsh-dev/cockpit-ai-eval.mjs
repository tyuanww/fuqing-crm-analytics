/** Explicit paid native-model eval; only creates and observes its own synthetic Sessions.
 * Reuses the named running Host's authentication; never copies provider credentials,
 * changes settings, restarts a service, or reads other Sessions.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, realpath, mkdtemp, access, mkdir, unlink, rmdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { localLaunch } from './board-model-preflight.mjs';
import { nativeArtifactPrompt } from '../../dsh-plugins/analytics-workbench/src/client/cockpit-ai-client.mjs';
import { summarizeRequest } from '../../dsh-plugins/analytics-workbench/src/native-evidence.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
assert.deepEqual(args.filter((_, i) => i % 2 === 0), ['--runtime', '--upstream', '--python', '--output'],
  'Use --runtime /absolute/running-runtime --upstream /absolute/pinned-dsh --python /absolute/python3.14 --output /absolute/new-report.json');
const [runtime, upstream, python, output] = args.filter((_, i) => i % 2 === 1);
assert.ok([runtime, upstream, python, output].every(p => typeof p === 'string' && isAbsolute(p)));
assert.equal(Number(process.versions.node.split('.')[0]), 24);
const pin = JSON.parse(await readFile(join(repo, 'dsh-plugins/analytics-workbench/toolchain.json')));
assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin.upstream_sha);
const { WebSocket } = createRequire(join(upstream, 'packages/api/gateway/package.json'))('ws');
const parent = await mkdtemp(join(tmpdir(), 'cockpit-model-eval-'));
const fixtureRoot = join(parent, 'fixtures');
const report = { schema: 'cockpit-ai-native-eval/v1', status: 'RUNNING', synthetic: true,
  started_at: new Date().toISOString(), upstream_sha: pin.upstream_sha, fixture_root: fixtureRoot,
  service_restarted: false, model_settings_changed: false, cases: [], cost_usd: null,
  cost_note: 'Provider billing cost is unavailable; token usage is recorded when supplied by the native journal.' };
const evalBoundary = '\n本轮仅用合成文件评估。只在当前工作目录操作，只允许 read/write/edit/present；不调用业务、检索、网络、Bash 或其他工具，不读取其他目录。';
const allowedTools = new Set(['read', 'write', 'edit', 'present']);
function auditTools(events, cwd, settled = false) {
  const outcomes = new Map(events.filter(row => row.type === 'tool/result')
    .flatMap(row => row.data.message.content.filter(block => block.type === 'tool-result'))
    .map(block => [block.toolCallId, block.isError]));
  for (const event of events.filter(row => row.type === 'tool/call')) {
    // Native guard denial is a safe model-recoverable result, not an executed
    // out-of-scope operation. Never treat missing results as a proven denial.
    if (!outcomes.has(event.data.callId)) { assert.ok(!settled, 'NATIVE_TOOL_RESULT_MISSING'); continue; }
    if (outcomes.get(event.data.callId) === true) continue;
    assert.ok(allowedTools.has(event.data.name), 'UNEXPECTED_TOOL_CALL');
    const input = JSON.parse(event.data.arguments);
    const paths = event.data.name === 'present' ? input.files.map(file => file.path) : [input.file_path];
    const allowed = event.data.name === 'read' ? ['TASK.md', 'source.json', 'candidate.json'] : ['candidate.json'];
    assert.ok(paths.length > 0 && paths.every(path => typeof path === 'string'
      && allowed.some(name => resolve(cwd, path) === join(cwd, name))), 'UNEXPECTED_TOOL_PATH');
  }
}
report.tool_boundary = 'Dedicated native preset, scoped execution guard, and actual-call path audit; no business tools or shell.';
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const runPython = (...argv) => JSON.parse(execFileSync(python,
  [join(repo, 'scripts/dsh-dev/cockpit-ai-eval.py'), ...argv, '--root', fixtureRoot], {
    cwd: repo, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    env: { PATH: `${dirname(python)}:/usr/bin:/bin`, PYTHONPATH: repo, PYTHONNOUSERSITE: '1', PYTHON_DOTENV_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
let cookie, origin, activeSession, socket, currentStream, ownedPreset;
async function rpc(method, payload) {
  const response = await fetch(new URL('/api/' + method, origin), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'content-type': 'application/json', cookie, origin },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload }),
  });
  assert.equal(response.status, 200, `RPC_HTTP_${response.status}`);
  const reply = await response.json();
  assert.equal(reply.result?.ok, true, 'NATIVE_RPC_REJECTED');
  return reply.result.value;
}
async function follow(sessionId, cwd) {
  const events = new Map(); let ready = false, failed = false;
  socket = new WebSocket(origin.replace('http:', 'ws:') + '/api/remote.mux', {
    headers: { cookie, origin }, handshakeTimeout: 15000, maxPayload: 4 * 1024 * 1024,
  });
  socket.on('error', () => { failed = true; });
  socket.on('close', () => { failed = true; });
  socket.on('message', bytes => {
    try {
      const frame = JSON.parse(bytes.toString());
      if (frame.streamId !== 'eval') return;
      if (frame.type === 'error') { failed = true; return; }
      if (frame.type !== 'item') return;
      const value = frame.value;
      if (value.type === 'snapshot') {
        assert.equal(value.header.id, sessionId); assert.equal(value.header.cwd, cwd);
        assert.equal(value.hasMore, false, 'New Session unexpectedly has truncated history');
        for (const row of value.records) if (row.type === 'event') events.set(row.event.seq, row.event);
        ready = true;
      } else if (value.type === 'event') events.set(value.event.seq, value.event);
    } catch { failed = true; }
  });
  await new Promise((ok, fail) => { socket.once('open', ok); socket.once('error', fail); });
  socket.send(JSON.stringify({ type: 'open', streamId: 'eval', endpoint: 'session/follow',
    payload: { args: { request: { address: { kind: 'session', sessionId }, maxMessages: 100 } } } }));
  const until = Date.now() + 20000;
  while (!ready && !failed && Date.now() < until) await delay(100);
  assert.ok(ready && !failed, 'NATIVE_FOLLOW_FAILED');
  const records = () => [...events.values()].sort((a, b) => a.seq - b.seq);
  async function prompt(text) {
    const requestId = 'cockpit-eval-' + randomUUID();
    const response = await rpc('session/prompt', { args: { request: { sessionId, requestId,
      mode: 'queue', content: [{ type: 'text', text: text + evalBoundary }], clientTimeZone: 'Asia/Shanghai' } } });
    assert.equal(response.accepted, true);
    const deadline = Date.now() + 240000;
    while (!failed && Date.now() < deadline) {
      const summary = summarizeRequest(records(), requestId);
      auditTools(records(), cwd);
      if (summary.reason) {
        auditTools(records(), cwd, true);
        assert.equal(summary.reason.kind, 'completed', 'NATIVE_TURN_NOT_COMPLETED');
        assert.equal(summary.ambiguous, false);
        return { request_id: requestId, turn: summary.targetTurn, successful_tools: summary.successful_call_ids.length };
      }
      await delay(500);
    }
    throw new Error('NATIVE_TURN_TIMEOUT_OR_CONNECTION_FAILED');
  }
  return { prompt, records };
}
function assistantText(events, turn) {
  return events.filter(row => row.type === 'assistant/message' && row.data?.turn === turn)
    .flatMap(row => row.data.message?.content ?? row.data.content ?? [])
    .filter(block => block.type === 'text').map(block => block.text).join('\n');
}
try {
  const launch = localLaunch(JSON.parse(await readFile(join(runtime, 'browser-private.json'))).launchUrl);
  origin = launch.origin;
  const exchange = await fetch(launch, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  assert.equal(exchange.status, 303, 'NATIVE_AUTH_EXCHANGE_FAILED');
  cookie = exchange.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  await exchange.arrayBuffer(); assert.ok(cookie, 'NATIVE_AUTH_COOKIE_MISSING');
  const catalog = await rpc('session/modelCatalog', { args: {} });
  const model = catalog.default;
  assert.ok(model?.provider && model?.model && !/mock|test/i.test(model.provider + '/' + model.model));
  assert.ok(catalog.routableProviders.includes(model.provider));
  report.model = { provider: model.provider, model: model.model };
  report.source_hashes = {};
  for (const path of ['backend/services/analytics/cockpit_ai.py', 'backend/services/analytics/cockpit_html_selection.py',
    'dsh-plugins/analytics-workbench/src/client/cockpit-ai-client.mjs', 'scripts/dsh-dev/cockpit-ai-eval.py',
    'scripts/dsh-dev/cockpit-ai-eval.mjs', 'scripts/dsh-dev/cockpit-ai-eval-guard.mjs']) {
    report.source_hashes[path] = createHash('sha256').update(await readFile(join(repo, path))).digest('hex');
  }
  runPython('prepare');
  const manifest = JSON.parse(await readFile(join(fixtureRoot, 'manifest.json')));
  const presetId = 'cockpit-eval-' + randomUUID();
  const presetPath = join(runtime, 'harness/.agent-presets', presetId);
  const guardModule = pathToFileURL(join(repo, 'scripts/dsh-dev/cockpit-ai-eval-guard.mjs')).href
    + '?sha256=' + report.source_hashes['scripts/dsh-dev/cockpit-ai-eval-guard.mjs'];
  const composition = JSON.stringify([
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: {
      prefix: 'You are a coding agent powered by the {{model}} model.', suffix: 'Your working directory is {{cwd}}.' } },
    { id: 'fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
    { id: 'eval-guard', name: guardModule, config: { workspaceRoot: await realpath(fixtureRoot), presetId } },
  ], null, 2) + '\n';
  await mkdir(presetPath, { mode: 0o700 });
  ownedPreset = { path: presetPath, composition };
  await writeFile(join(presetPath, 'agent.cordis.yml'), composition, { flag: 'wx', mode: 0o600 });
  report.preset_id = presetId;
  for (const item of manifest.cases) {
    const sessionId = 'session-cockpit-eval-' + randomUUID();
    activeSession = sessionId;
    const cwd = await realpath(item.job.workspace);
    const row = { case: item.id, status: 'RUNNING', session_id: sessionId, turns: [] };
    report.cases.push(row); await save();
    const created = await rpc('session/create', { args: { request: { cwd, sessionId, agentPreset: presetId } } });
    assert.equal(created.sessionId, sessionId); assert.equal(created.agentPreset, presetId);
    await rpc('session/selectModel', { args: { request: { sessionId, ...report.model } } });
    const stream = await follow(sessionId, cwd);
    currentStream = stream;
    row.turns.push(await stream.prompt(nativeArtifactPrompt(item.job)));
    try { await access(join(cwd, item.job.output_name)); throw new Error('CANDIDATE_BEFORE_USER_REQUEST'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    row.turns.push(await stream.prompt(item.request));
    const events = stream.records();
    row.tool_names = [...new Set(events.filter(event => event.type === 'tool/call').map(event => event.data.name))];
    row.denied_or_failed_tools = events.filter(event => event.type === 'tool/result')
      .flatMap(event => event.data.message.content).filter(block => block.type === 'tool-result' && block.isError === true).length;
    row.usage = {};
    for (const event of events.filter(event => event.type === 'assistant/message')) {
      for (const [key, value] of Object.entries(event.data.usage ?? {})) {
        if (typeof value === 'number' && Number.isFinite(value)) row.usage[key] = (row.usage[key] ?? 0) + value;
      }
    }
    assert.ok(Object.values(row.usage).some(value => value > 0), 'NATIVE_MODEL_USAGE_MISSING');
    if (!item.refusal) assert.ok(events.some(event => event.type === 'deliverables/presented'
      && event.data.turn === row.turns.at(-1).turn && event.data.files.some(file => resolve(cwd, file.path) === join(cwd, item.job.output_name))), 'NATIVE_PRESENT_MISSING');
    await writeFile(join(fixtureRoot, item.id + '-events.json'), JSON.stringify(events, null, 2), { mode: 0o600 });
    await writeFile(join(fixtureRoot, item.id + '-answer.txt'), assistantText(events, row.turns.at(-1).turn), { mode: 0o600 });
    row.judgment = runPython('judge', '--case', item.id);
    row.status = 'PASS';
    report.usage = {};
    for (const result of report.cases) for (const [key, value] of Object.entries(result.usage ?? {})) {
      report.usage[key] = (report.usage[key] ?? 0) + value;
    }
    socket.close(); socket = null; activeSession = null; currentStream = null;
    await save(); console.log(JSON.stringify({ case: item.id, status: row.status, model: report.model }));
  }
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  if (report.cases.at(-1)?.status === 'RUNNING') report.cases.at(-1).status = 'FAIL';
  // Never print the provider's raw exception or HTTP body; it may contain credentials.
  report.failure = 'Native execution or product judgment failed; inspect only this run\'s synthetic evidence.';
  const known = ['NATIVE_AUTH_EXCHANGE_FAILED', 'NATIVE_AUTH_COOKIE_MISSING', 'NATIVE_RPC_REJECTED',
    'NATIVE_FOLLOW_FAILED', 'NATIVE_TURN_NOT_COMPLETED', 'NATIVE_TURN_TIMEOUT_OR_CONNECTION_FAILED',
    'UNEXPECTED_TOOL_CALL', 'UNEXPECTED_TOOL_PATH', 'CANDIDATE_BEFORE_USER_REQUEST', 'NATIVE_MODEL_USAGE_MISSING', 'NATIVE_PRESENT_MISSING'];
  report.failure_code = known.find(code => error.message?.includes(code)) ?? 'EVAL_PRECONDITION_OR_JUDGMENT_FAILED';
  if (currentStream) {
    const events = currentStream.records();
    // Persist only own synthetic history, and only after the tool allowlist audit.
    let safe = false;
    const item = JSON.parse(await readFile(join(fixtureRoot, 'manifest.json'))).cases.find(item => item.id === report.cases.at(-1).case);
    try { auditTools(events, await realpath(item.job.workspace), true); safe = true; } catch { /* No raw history after an out-of-bound call. */ }
    if (safe) {
      await writeFile(join(fixtureRoot, report.cases.at(-1).case + '-failed-events.json'), JSON.stringify(events, null, 2), { mode: 0o600 });
    }
  }
  process.exitCode = 1;
} finally {
  if (activeSession && origin && cookie) {
    try { await rpc('session/cancel', { args: { request: { sessionId: activeSession } } }); }
    catch { report.cancel_status = 'UNCONFIRMED'; }
  }
  socket?.terminate();
  if (ownedPreset) {
    try {
      const file = join(ownedPreset.path, 'agent.cordis.yml');
      assert.equal(await readFile(file, 'utf8'), ownedPreset.composition);
      await unlink(file); await rmdir(ownedPreset.path);
      report.temporary_preset_removed = true;
    } catch { report.temporary_preset_removed = false; }
  }
  report.finished_at = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, report: output, cases_passed: report.cases.filter(row => row.status === 'PASS').length }));
}
