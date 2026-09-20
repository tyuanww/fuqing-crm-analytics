/** Explicit interactive candidate launcher. Own profile/port, no live configuration or model calls. */
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { findReadyUrl, redactLaunchLog } from '../dsh-b0/transport-safety.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const option = name => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
assert.ok(argv.length === 6 && argv[0] === '--upstream' && argv[2] === '--python' && argv[4] === '--port', 'Use --upstream /absolute/pinned-checkout --python /absolute/python3.14 --port <unused-port>');
const upstream = option('--upstream'), python = option('--python'), port = Number(option('--port'));
assert.ok(isAbsolute(upstream) && isAbsolute(python) && Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
const pin = JSON.parse(await readFile(join(root, 'dsh-plugins/analytics-workbench/toolchain.json')));
assert.equal(Number(process.versions.node.split('.')[0]), pin.node_major);
assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin.upstream_sha);
assert.equal(execFileSync('git', ['-C', upstream, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), '');
const plugin = join(root, 'dsh-plugins/crm-knowledge');
const cli = join(upstream, 'apps/cli/lib/bin.js');
for (const path of [cli, python, join(plugin, 'lib/index.js'), join(plugin, 'lib/host.js'), join(plugin, 'lib/client.js')]) await access(path);
await new Promise((ok, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(ok)); });
const parent = join(root, '.context/crm-login-candidate'); await mkdir(parent, { recursive: true, mode: 0o700 });
const runtime = await mkdtemp(join(parent, 'run-'));
const candidateHome = join(runtime, 'harness'), presets = join(runtime, 'presets'), workspace = join(runtime, 'workspace');
for (const directory of [candidateHome, join(candidateHome, 'profiles/web'), join(candidateHome, 'agents'), join(runtime, 'tmp'), join(runtime, 'skills'), workspace, join(presets, 'crm-login')]) await mkdir(directory, { recursive: true, mode: 0o700 });
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
await writeJson(join(candidateHome, 'profiles/web/package.json'), { name: 'crm-login-candidate-profile', private: true, type: 'module',
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'startup' } } });
await writeJson(join(presets, 'crm-login/agent.cordis.yml'), [
  { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { complete: true, includeRuntimeContext: false,
    prefix: '这是 CRM 登录候选。真实看板 GSV 只调用 query_crm_dashboard_gsv；需要连接时让用户点击当前对话的连接 CRM 按钮，不索取密码或令牌。其余 crm-metrics/v1 查询均为合成候选，不得作为真实业务数据。' } },
  { id: 'crm-tools', name: pathToFileURL(join(plugin, 'lib/index.js')).href },
]);
// Use public Host services to seed only this launcher's empty workspace/session.
const seedPlugin = join(runtime, 'seed.mjs');
await writeFile(seedPlugin, `export const inject = ['workspaceRegistry', 'sessionController'];
export async function apply(ctx, config) {
  const workspace = await ctx.workspaceRegistry.create(config.path);
  await workspace.setTitle('CRM 连接验证');
  await ctx.sessionController.create({workspaceId: workspace.id, agentPreset: 'crm-login'});
}
`, { mode: 0o600 });
const disabled = ['session-title-llm', 'llm-pi-ai', 'llm-deepseek', 'web-search-deepseek', 'web-fetch-http',
  'session-telemetry-otel', 'session-log-deepseek', 'plugin-package-inventory-deepseek', 'agent-instructions', 'skill-filesystem', 'client-hmr', 'directory-picker'];
await writeJson(join(runtime, 'candidate.patch.yml'), [
  ...disabled.map(id => ({ id, disabled: true })),
  { id: 'agent-presets', config: { default: 'crm-login', includeShippedRoot: false, includeUserRoot: false, roots: [{ path: presets, trust: 'system' }] } },
  { id: 'session-controller', config: { nativeOpen: false } },
  { insert: [{ id: 'crm-login-seed', name: pathToFileURL(seedPlugin).href, config: { path: workspace } }, { id: 'crm-login-host', name: pathToFileURL(join(plugin, 'lib/host.js')).href, config: { baseUrl: 'http://127.0.0.1:8000', dataKind: 'real' } }] },
]);
const environment = { HOME: process.env.HOME, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'en_US.UTF-8', TZ: 'Asia/Shanghai',
  DSH_HOME: candidateHome, DSH_AGENTS_HOME: join(candidateHome, 'agents'), DSH_BUNDLED_SKILL_DIR: join(runtime, 'skills'),
  DSH_TELEMETRY_DISABLED: '1', OPENSSL_CONF: '/dev/null', TMPDIR: join(runtime, 'tmp'), CRM_METRICS_PYTHON: python };
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [cli, '--profile', 'web', '--patch', join(runtime, 'candidate.patch.yml'), '--host', '127.0.0.1', '--port', String(port), '--no-open'],
  { cwd: workspace, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', stopped = false;
const close = new Promise(resolve => child.once('close', resolve));
const stop = () => { if (!stopped) { stopped = true; child.kill('SIGTERM'); } };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
child.on('error', () => { stopped = true; });
const collect = chunk => { log += String(chunk); if (log.length > 2 * 1024 * 1024) stop(); };
child.stdout.on('data', collect); child.stderr.on('data', collect);
try {
  const deadline = Date.now() + 45000; let launchUrl;
  while (!stopped && child.exitCode === null && Date.now() < deadline) {
    launchUrl = findReadyUrl(log, origin); if (launchUrl) break; await delay(100);
  }
  await writeFile(join(runtime, 'boot.log'), redactLaunchLog(log), { mode: 0o600 });
  assert.ok(!/did not activate|failed to mount|invalid config/.test(log), 'Candidate plugin activation failed; inspect redacted boot.log');
  assert.ok(launchUrl, 'Candidate failed to become ready; inspect its redacted boot.log');
  const metadata = { supervisor_pid: process.pid, child_pid: child.pid, origin, runtime, plugin, upstream_sha: pin.upstream_sha,
    model_enabled: false, real_login_completed: false, live_profile_changed: false };
  await writeJson(join(runtime, 'runtime.json'), metadata);
  // Let the trusted launcher exchange the newly-created DSH access URL in the
  // user's browser. Never print or persist this native access token.
  const opener = spawn('/usr/bin/open', [launchUrl], { stdio: 'ignore' });
  const openerExit = await new Promise(resolve => { opener.once('close', resolve); opener.once('error', () => resolve(-1)); });
  assert.equal(openerExit, 0, 'System browser could not open the native DSH access URL');
  console.log(JSON.stringify({ status: 'ready', origin, runtime, model_enabled: false }));
  await close;
} finally { stop(); await close; await writeFile(join(runtime, 'boot.log'), redactLaunchLog(log), { mode: 0o600 }); }
