#!/usr/bin/env node
/** Opt-in exact Web-host drill. Owns every HOME/profile, process, port and synthetic session. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, rename, symlink, readdir, lstat } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA, NODE_MAJOR } from '../release/toolchain.mjs';
import { packPlugin } from '../release/plugin-pack.mjs';
import { prepareProfile } from '../crm-calibration/prepare-profile.mjs';
import { HOST_EVIDENCE_SCHEMA, HOST_SCOPE, HOST_INPUTS } from '../release/plugin-host-evidence.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const observer = fileURLToPath(new URL('./pinned-host-observer.mjs', import.meta.url));
const exec = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const PRIVATE = { mode: 0o600, flag: 'wx' };
async function bounded(promise, ms, code) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(code)), ms); })]); }
  finally { clearTimeout(timer); }
}

async function modelFixture() {
  const requests = [];
  let interruptTurn = true;
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/messages') { res.writeHead(404); res.end(); return; }
    let bytes = 0, body = '';
    req.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) req.destroy(); else body += chunk; });
    req.on('end', () => {
      try {
        const input = JSON.parse(body);
        const interrupted = JSON.stringify(input.messages?.findLast(m => m.role === 'user')?.content ?? '').includes('HANG_OWNED');
        const hang = interruptTurn && interrupted;
        requests.push({ path: req.url, tool_names: (input.tools ?? []).map(t => t.name), hang });
        if (hang) return; // Parent explicitly kills its host while this synthetic response is pending.
        const events = [
          { type: 'message_start', message: { id: 'owned-fixture', model: 'deepseek-v4-flash', usage: { input_tokens: 3, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'SYNTHETIC_NATIVE_OK' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
          { type: 'message_stop' },
        ];
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
      } catch { res.writeHead(400); res.end(); }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { origin: 'http://127.0.0.1:' + server.address().port, requests,
    recover: () => { interruptTurn = false; },
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

export async function startHost({ root, upstream, patches, modelOrigin, generation, signal, nativeFixture }) {
  signal.throwIfAborted();
  if (nativeFixture) {
    assert.ok([4315, 4325, 4335].includes(nativeFixture.portBase), 'OWNED_HOST_PORT_BLOCK');
    assert.match(nativeFixture.sessionId, /^[A-Za-z0-9_.:-]{1,128}$/);
    assert.match(nativeFixture.runtimeToken, /^[A-Za-z0-9_-]{32,128}$/);
    if (nativeFixture.gatewayToken !== undefined) assert.match(nativeFixture.gatewayToken, /^[A-Za-z0-9_-]{32,128}$/);
  }
  const env = { PATH: dirname(process.execPath) + ':/usr/bin:/bin', HOME: join(root, 'home'),
    TMPDIR: join(root, 'tmp'), DSH_HOME: join(root, 'dsh-home'), DSH_AGENTS_HOME: join(root, 'agents-home'),
    DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: 'synthetic',
    DEEPSEEK_BASE_URL: modelOrigin, DSH_PRIMARY_RUNTIME: '', NODE_NO_WARNINGS: '1',
    ...nativeFixture ? { B0_PORT_BASE: String(nativeFixture.portBase), B0_SESSION_ID: nativeFixture.sessionId,
      B0_RUNTIME_TOKEN: nativeFixture.runtimeToken, B0_RUNTIME_FAMILY: 'first_purchase',
      ...(nativeFixture.gatewayToken ? { B0_GATEWAY_TOKEN: nativeFixture.gatewayToken } : {}) } : {} };
  const child = spawn(process.execPath, [join(upstream, 'apps/cli/lib/bin.js'), '--profile', 'web',
    ...patches.flatMap(path => ['--patch', path]), '--host', '127.0.0.1', '--port',
    String(nativeFixture ? nativeFixture.portBase + 2 : 0), '--no-open'],
  { cwd: join(root, 'workspace'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const abort = () => { child.kill('SIGKILL'); };
  signal.addEventListener('abort', abort, { once: true });
  let out = '', err = '', seq = 0; const pending = new Map();
  child.stdout.on('data', chunk => { out = (out + chunk).slice(-512 * 1024); });
  child.stderr.on('data', chunk => { err = (err + chunk).slice(-512 * 1024); });
  const exited = Promise.withResolvers(), ready = Promise.withResolvers();
  child.once('error', error => ready.reject(error));
  child.once('close', (code, signal) => {
    const failure = Error(`OWNED_HOST_EXIT_${code ?? signal}`);
    ready.reject(failure); for (const item of pending.values()) item.reject(failure); pending.clear();
    exited.resolve({ code, signal });
  });
  child.once('close', () => signal.removeEventListener('abort', abort));
  child.on('message', message => {
    if (message.ready) ready.resolve(message);
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); message.error ? request.reject(Error(message.error)) : request.resolve(message.result);
  });
  async function request(command, options = {}, timeout = 20000) {
    assert.ok(child.connected && child.exitCode === null, 'OWNED_HOST_NOT_RUNNING');
    const id = ++seq, result = Promise.withResolvers(); pending.set(id, result);
    child.send({ id, command, ...options }, error => { if (error) result.reject(error); });
    try { return await bounded(result.promise, timeout, 'OWNED_HOST_COMMAND_TIMEOUT_' + command); }
    finally { pending.delete(id); }
  }
  let stopping;
  function stop(force = false) {
    return stopping ??= (async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(force ? 'SIGKILL' : 'SIGTERM');
      let result;
      try { result = await bounded(exited.promise, 8000, 'OWNED_HOST_STOP_TIMEOUT'); }
      catch { child.kill('SIGKILL'); result = await bounded(exited.promise, 3000, 'OWNED_HOST_KILL_TIMEOUT'); }
      const redact = value => value.replace(/([?&]token=)[^\s&]+/g, '$1[REDACTED]');
      await writeFile(join(root, `host-${generation}.stdout.log`), redact(out), PRIVATE);
      await writeFile(join(root, `host-${generation}.stderr.log`), redact(err), PRIVATE);
      return result;
    })();
  }
  try { await bounded(ready.promise, 45000, 'OWNED_HOST_START_TIMEOUT'); }
  catch (error) { await stop(true); throw error; }
  return { pid: child.pid, request, stop };
}

export async function runPinnedHostAcceptance({ upstream, output, packagesFrom, legacyProbe = false }) {
  assert.ok(isAbsolute(upstream) && isAbsolute(output), 'PINNED_HOST_ABSOLUTE_PATH_REQUIRED');
  assert.ok(!packagesFrom || isAbsolute(packagesFrom), 'PINNED_HOST_ABSOLUTE_PATH_REQUIRED');
  assert.equal(Number(process.versions.node.split('.')[0]), NODE_MAJOR, 'PINNED_HOST_NODE_VERSION');
  const git = args => exec('git', args, { cwd: upstream, timeout: 5000 });
  assert.equal((await git(['rev-parse', 'HEAD'])).stdout.trim(), DSH_UPSTREAM_SHA, 'PINNED_HOST_SHA_MISMATCH');
  assert.equal((await git(['status', '--porcelain', '-uno'])).stdout.trim(), '', 'PINNED_HOST_UPSTREAM_DIRTY');
  const cli = JSON.parse(await readFile(join(upstream, 'apps/cli/package.json')));
  assert.equal(cli.version, DSH_SDK_VERSION, 'PINNED_HOST_VERSION_MISMATCH');
  const cliDigest = sha(await readFile(join(upstream, 'apps/cli/lib/bin.js')));
  await mkdir(output, { mode: 0o700 });
  for (const name of ['home', 'tmp', 'workspace', 'dsh-home', 'agents-home']) await mkdir(join(output, name), { mode: 0o700 });
  const evidence = { schema: HOST_EVIDENCE_SCHEMA, started_at: new Date().toISOString(),
    platform: { os: process.platform, arch: process.arch, node: process.versions.node },
    dsh: { version: cli.version, upstream_sha: DSH_UPSTREAM_SHA, cli_sha256: cliDigest, source: 'unchanged-built-official-web-cli' },
    source_sha: (await exec('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim(),
    scope: HOST_SCOPE, rows: [], packages: {}, overall: 'RUNNING',
    limitations: ['No real model, real business data, browser, Windows/WSL or production deployment.',
      'Profile rollback does not roll back service data; in-process arbitrary plugin isolation is not promised.',
      'No rc1-to-rc2 migration, torn-frame recovery, signed runtime artifact or production journal activation is certified.'] };
  const inputs = HOST_INPUTS;
  evidence.inputs = Object.fromEntries(await Promise.all(inputs.map(async name => [name, sha(await readFile(join(repository, name)))])));
  evidence.source_dirty = (await exec('git', ['status', '--porcelain', '--', ...inputs], { cwd: repository })).stdout.trim().split('\n').filter(Boolean);
  let host, model;
  const controller = new AbortController();
  const interrupt = () => controller.abort(Error('PINNED_HOST_INTERRUPTED'));
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  const launch = options => startHost({ ...options, signal: controller.signal });
  const record = (id, details) => { evidence.rows.push({ ...details, id, status: 'PASS', at: new Date().toISOString() }); console.log('PINNED_HOST_PASS ' + id); };
  try {
    const previous = packagesFrom ? JSON.parse(await readFile(join(packagesFrom, 'evidence.json'))) : null;
    // v1 may supply immutable tarballs only. Every host observation is rerun;
    // the candidate verifier deliberately refuses v1 as host evidence.
    if (previous) assert.ok(['dsh-pinned-host-acceptance/v1', HOST_EVIDENCE_SCHEMA].includes(previous.schema), 'PINNED_HOST_PACKAGE_RECEIPT_SCHEMA');
    for (const domain of ['crm-knowledge', 'knowledge']) {
      const receipt = previous ? { tarball: previous.packages?.[domain], source_sha: previous.packages?.[domain]?.source_sha }
        : await packPlugin({ plugin: join(repository, 'dsh-plugins', domain), outputDir: join(output, 'packs', domain) });
      assert.ok(receipt.tarball && receipt.tarball.name === basename(receipt.tarball.name), 'PINNED_HOST_PACKAGE_NAME');
      assert.match(receipt.source_sha, /^[a-f0-9]{40}$/, 'PINNED_HOST_PACKAGE_SOURCE');
      const original = join(packagesFrom ?? output, 'packs', domain, receipt.tarball.name);
      const info = await lstat(original);
      assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 16 * 1024 * 1024, 'PINNED_HOST_PACKAGE_FILE');
      const bytes = await readFile(original);
      assert.equal(sha(bytes), receipt.tarball.sha256, 'PINNED_HOST_PACKAGE_DIGEST_MISMATCH');
      assert.equal(bytes.length, receipt.tarball.bytes, 'PINNED_HOST_PACKAGE_SIZE_MISMATCH');
      const archive = join(output, 'packs', domain, receipt.tarball.name);
      if (previous) {
        await mkdir(dirname(archive), { recursive: true, mode: 0o700 });
        await writeFile(archive, bytes, PRIVATE);
      }
      const installed = join(output, 'installed', domain);
      await exec('python3', [join(repository, 'scripts/release/secure-unpack.py'),
        archive, installed, '--max-entries', '100', '--max-bytes', '4194304']);
      await symlink(join(upstream, 'apps/cli/node_modules'), join(installed, 'package/node_modules'), 'dir');
      evidence.packages[domain] = { ...receipt.tarball, source_sha: receipt.source_sha };
    }
    controller.signal.throwIfAborted();
    const assets = join(output, 'assets');
    const profile = await prepareProfile({ output: assets, plugin: join(output, 'installed/crm-knowledge/package'),
      knowledgePlugin: join(output, 'installed/knowledge/package') });
    for (const [domain, key] of [['crm-knowledge', 'crm'], ['knowledge', 'knowledge']]) {
      evidence.packages[domain].package_name = profile.packages[key].name;
      evidence.packages[domain].package_version = profile.packages[key].version;
    }
    evidence.profile_assets = { name: 'assets/manifest.json', sha256: sha(await readFile(join(assets, 'manifest.json'))) };
    if (legacyProbe) {
      const legacy = join(output, 'dsh-home/.agent-presets/crm-knowledge');
      await mkdir(legacy, { recursive: true, mode: 0o700 });
      for (const name of ['preset.yml', 'agent.cordis.yml']) {
        await writeFile(join(legacy, name), await readFile(join(assets, 'preset', name)), PRIVATE);
      }
      evidence.legacy_preset_directory = legacy;
    }
    model = await modelFixture();
    const syntheticHost = join(output, 'host-synthetic.patch.yml');
    const hostPatch = JSON.parse(await readFile(join(assets, 'host.patch.yml')));
    for (const row of hostPatch.flatMap(p => p.insert ?? [])) row.config = { baseUrl: model.origin, dataKind: 'synthetic' };
    await writeFile(syntheticHost, json(hostPatch), PRIVATE);
    const common = join(output, 'observer.patch.yml');
    await writeFile(common, json([
      { id: 'session-log-deepseek', disabled: true }, { id: 'plugin-package-inventory-deepseek', disabled: true },
      { id: 'hmr', disabled: true },
      { insert: [{ id: 'owned-host-observer', name: pathToFileURL(observer).href,
        config: { presetId: 'crm-knowledge', workspace: join(output, 'workspace'),
          llmModule: pathToFileURL(join(upstream, 'packages/llm/llm/lib/index.js')).href } }] },
    ]), PRIVATE);
    const patches = [syntheticHost, ...legacyProbe ? [] : [join(assets, 'preset.patch.yml')], common];
    const candidateSelection = { patches, sha256: Object.fromEntries(await Promise.all(patches.map(async p => [p, sha(await readFile(p))]))) };
    await writeFile(join(output, 'active-profile.json'), json(candidateSelection), PRIVATE);
    host = await launch({ root: output, upstream, patches, modelOrigin: model.origin, generation: 1 });
    const roster = await host.request('roster');
    await writeFile(join(output, 'roster.json'), json(roster), PRIVATE);
    assert.ok(roster.presets.some(p => p.id === 'crm-knowledge' && !p.broken), 'PINNED_HOST_PRESET_NOT_LOADED');
    assert.equal(roster.crm_identity, 'shinemage-knowledge-access/v1', 'PINNED_HOST_IDENTITY_PROVIDER_MISSING');
    record('profile-load', { pid: host.pid, presets: roster.presets.map(p => p.id), crm_identity: roster.crm_identity });
    const declared = JSON.parse(await readFile(join(assets, 'preset/agent.cordis.yml'))).map(row => row.name);
    assert.deepEqual(roster.composition.find(row => row.id === 'crm-knowledge').rows.map(row => row.moduleName), declared);
    record('loaded-composition-reconcile', { modules: declared, digest: sha(JSON.stringify(declared)) });
    const sessionId = 'owned-g0-session';
    const names = await host.request('tools', { sessionId });
    assert.ok(names.includes('crm_knowledge_explain') && names.includes('query_crm_metrics_v1'), 'PINNED_HOST_DOMAIN_TOOLS_MISSING');
    const unavailable = await host.request('tool', { sessionId, name: 'crm_knowledge_explain', args: { topic: 'aus' } });
    assert.equal(unavailable.value?.reason?.code, 'SERVICE_NOT_CONFIGURED');
    record('domain-tools', { names, missing_service: unavailable.value.reason.code });
    const first = await host.request('prompt', { sessionId, text: 'Native loop synthetic baseline.' });
    assert.ok(first.assistant.includes('SYNTHETIC_NATIVE_OK'), 'PINNED_HOST_NATIVE_LOOP_FAILED');
    record('native-loop-and-durable-session', first);
    assert.equal((await host.stop()).code, 0); host = null;
    host = await launch({ root: output, upstream, patches, modelOrigin: model.origin, generation: 2 });
    await host.request('tools', { sessionId, resume: true });
    const after = await host.request('prompt', { sessionId, text: 'Resume the synthetic conversation.', prefix: first.count });
    assert.equal(after.prefix_digest, first.digest, 'PINNED_HOST_RESTART_PREFIX_CHANGED');
    assert.equal(after.assistant.length, first.assistant.length + 1);
    record('controlled-restart-session-replay', { pid: host.pid, ...after });
    const retired = await host.request('retire-preset', { sessionId });
    assert.ok(!retired.presets.some(p => p.id === 'crm-knowledge'));
    assert.ok(retired.existing_tools.includes('crm_knowledge_explain'));
    await assert.rejects(host.request('tools', { sessionId: 'new-after-retirement' }), /Unknown agent preset/);
    record('retired-preset-retains-live-session', { action: 'HOST_RESTART_REQUIRED', new_bindings: 'REJECTED', live_tools_retained: true });
    const hungPrompt = host.request('prompt', { sessionId, text: 'HANG_OWNED: hold this synthetic turn open.' })
      .then(() => ({ unexpected_success: true }), error => ({ code: error.message }));
    const hangDeadline = Date.now() + 10000;
    while (!model.requests.some(r => r.hang)) {
      assert.ok(Date.now() < hangDeadline, 'PINNED_HOST_MODEL_HANG_NOT_STARTED');
      await delay(10);
    }
    const committed = await host.request('inspect', { sessionId });
    assert.ok(committed.count > after.count, 'PINNED_HOST_OPEN_TURN_NOT_PERSISTED');
    assert.equal((await host.stop(true)).signal, 'SIGKILL'); host = null;
    assert.equal((await hungPrompt).unexpected_success, undefined);
    // Native resume replays the interrupted prompt before queued follow-ups.
    // Restore the synthetic provider here so replay tests recovery, not another outage.
    model.recover();
    host = await launch({ root: output, upstream, patches, modelOrigin: model.origin, generation: 3 });
    await host.request('tools', { sessionId, resume: true });
    const crash = await host.request('prompt', { sessionId, text: 'Recover the synthetic conversation after process loss.', prefix: committed.count });
    assert.equal(crash.prefix_digest, committed.digest, 'PINNED_HOST_CRASH_PREFIX_CHANGED');
    assert.ok(crash.assistant.length > after.assistant.length && crash.assistant.at(-1) === 'SYNTHETIC_NATIVE_OK', 'PINNED_HOST_CRASH_NO_NEW_RESPONSE');
    assert.ok(crash.events.some(e => e.type === 'turn/end' && e.seq >= committed.count), 'PINNED_HOST_RECOVERY_CLOSER_MISSING');
    record('inflight-crash-durable-prefix-replay', { pid: host.pid, committed_prefix: committed.count, ...crash });
    await assert.rejects(host.request('fault-hang', {}, 350), /OWNED_HOST_COMMAND_TIMEOUT/);
    assert.equal((await host.stop(true)).signal, 'SIGKILL'); host = null;
    record('blocking-plugin-requires-process-restart', { action: 'HOST_RESTART_REQUIRED', in_process_containment: 'UNSUPPORTED' });
    const fallback = join(output, 'native-fallback.patch.yml');
    const preset = JSON.parse(await readFile(join(assets, 'preset.patch.yml')));
    const row = preset.flatMap(p => p.insert ?? []).find(p => p.config?.id === 'crm-knowledge');
    assert.ok(row, 'PINNED_HOST_PRESET_DECLARATION_REQUIRED');
    await writeFile(fallback, json([{ insert: [{ ...row, config: { ...row.config,
      plugins: row.config.plugins.filter(p => p.name === '@deepseek-ai/dsh-persona') } }] }]), PRIVATE);
    const selected = { profile: fallback, sha256: sha(await readFile(fallback)), reason: 'disable-plugins-and-restart', service_data: 'UNCHANGED' };
    await writeFile(join(output, 'active-profile.tmp'), json(selected), PRIVATE);
    await rename(join(output, 'active-profile.tmp'), join(output, 'active-profile.json'));
    host = await launch({ root: output, upstream, patches: [fallback, common], modelOrigin: model.origin, generation: 4 });
    const nativeTools = await host.request('tools', { sessionId, resume: true });
    assert.ok(!nativeTools.includes('crm_knowledge_explain') && !nativeTools.includes('query_crm_metrics_v1'));
    const native = await host.request('prompt', { sessionId, text: 'Continue after plugin rollback.', prefix: crash.count });
    assert.equal(native.prefix_digest, crash.digest, 'PINNED_HOST_ROLLBACK_PREFIX_CHANGED');
    assert.equal(native.assistant.length, crash.assistant.length + 1, 'PINNED_HOST_FALLBACK_NO_NEW_RESPONSE');
    const fallbackRoster = await host.request('roster');
    assert.equal(fallbackRoster.crm_identity, null);
    assert.deepEqual(fallbackRoster.composition.find(row => row.id === 'crm-knowledge').rows.map(row => row.moduleName),
      row.config.plugins.filter(p => p.name === '@deepseek-ai/dsh-persona').map(p => p.name));
    record('native-fallback-restart', { pid: host.pid, tools: nativeTools, selected, ...native });
    assert.equal((await host.stop()).code, 0); host = null;
    await writeFile(join(output, 'active-profile.tmp'), json(candidateSelection), PRIVATE);
    await rename(join(output, 'active-profile.tmp'), join(output, 'active-profile.json'));
    host = await launch({ root: output, upstream, patches, modelOrigin: model.origin, generation: 5 });
    const restoredTools = await host.request('tools', { sessionId, resume: true });
    assert.deepEqual(restoredTools, names, 'PINNED_HOST_RESTORE_TOOLSET_CHANGED');
    const restoredRoster = await host.request('roster');
    assert.equal(restoredRoster.crm_identity, 'shinemage-knowledge-access/v1', 'PINNED_HOST_RESTORE_IDENTITY_PROVIDER_MISSING');
    assert.deepEqual(restoredRoster.composition.find(p => p.id === 'crm-knowledge').rows.map(p => p.moduleName), declared);
    const restored = await host.request('prompt', { sessionId, text: 'Continue with the same pinned plugin packages restored.', prefix: native.count });
    assert.equal(restored.prefix_digest, native.digest, 'PINNED_HOST_RESTORE_PREFIX_CHANGED');
    assert.equal(restored.assistant.length, native.assistant.length + 1, 'PINNED_HOST_RESTORE_NO_NEW_RESPONSE');
    record('restore-previous-pinned-profile', { pid: host.pid, tools: restoredTools, crm_identity: restoredRoster.crm_identity, ...restored });
    assert.equal((await host.stop()).code, 0); host = null;
    const logs = await readdir(join(output, 'dsh-home/sessions'), { recursive: true });
    evidence.session_files = logs.filter(p => p.endsWith('.jsonl') || p.endsWith('.jsonl.zstd'));
    assert.ok(evidence.session_files.length, 'PINNED_HOST_SESSION_NOT_PERSISTED');
    evidence.session_sha256 = Object.fromEntries(await Promise.all(evidence.session_files.map(async name =>
      [name, sha(await readFile(join(output, 'dsh-home/sessions', name)))])));
    evidence.overall = 'PASS';
    controller.signal.throwIfAborted();
    evidence.next = 'G0 service-state and supply-chain gates remain open before physical repository migration.';
  } catch (error) {
    evidence.overall = 'BLOCKED'; evidence.error = String(controller.signal.reason?.message ?? error.message); throw error;
  } finally {
    if (model) evidence.model_requests = model.requests;
    const cleanup = await Promise.allSettled([host?.stop(true), model?.close()]);
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    const failures = cleanup.filter(row => row.status === 'rejected').map(row => String(row.reason.message));
    if (failures.length) { evidence.overall = 'BLOCKED'; evidence.cleanup_errors = failures; }
    evidence.finished_at = new Date().toISOString();
    await writeFile(join(output, 'evidence.json'), json(evidence), PRIVATE);
    if (failures.length) throw Error('PINNED_HOST_CLEANUP_FAILED');
  }
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {}; const args = process.argv.slice(2);
  try {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--legacy-probe') options.legacyProbe = true;
      else { assert.ok(['--upstream', '--output', '--packages-from'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--'), 'PINNED_HOST_ARGUMENTS');
        const key = args[i] === '--packages-from' ? 'packagesFrom' : args[i].slice(2);
        assert.equal(options[key], undefined, 'PINNED_HOST_DUPLICATE_ARGUMENT'); options[key] = resolve(args[++i]); }
    }
    assert.ok(options.upstream && options.output, 'Use --upstream /pinned/dsh --output /new/private/evidence');
    const result = await runPinnedHostAcceptance(options); console.log('PINNED_HOST_ACCEPTANCE ' + result.overall);
  } catch (error) { console.error('PINNED_HOST_BLOCKED ' + error.message); process.exitCode = 2; }
}
