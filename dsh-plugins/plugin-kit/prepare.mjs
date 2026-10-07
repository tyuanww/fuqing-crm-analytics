/** Explicit online SDK bootstrap. Fresh, caller-owned directory; no running DSH. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependencyCommands, packageNetworkEnv } from './package-manager.mjs';
import { inspectToolchain, toolchainRoot } from './toolchain.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const buildInputs = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'patches/antd@5.29.3.patch', 'patches/rc-picker@4.11.3.patch'];
const usage = 'node prepare.mjs --destination /absolute/new-directory [--ca-file /absolute/public-ca-bundle.pem]\nOnline, dev-only: fetch fixed source, frozen install, official SDK build. Existing destinations are refused. TLS verification stays enabled.';

export function bootstrapEnvironment(destination, node = process.execPath) {
  return { PATH: `${join(destination, 'bin')}:${dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: join(destination, 'home'), TMPDIR: join(destination, 'tmp'),
    XDG_CACHE_HOME: join(destination, 'cache'), COREPACK_HOME: join(destination, 'corepack'),
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', COREPACK_DEFAULT_TO_LATEST: '0',
    COREPACK_ENABLE_PROJECT_SPEC: '1', CI: '1', LEFTHOOK: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0', LANG: 'C.UTF-8', PYTHONNOUSERSITE: '1', PYTHON_DOTENV_DISABLED: '1' };
}

/** Bounded process group, no shell; errors never expose the command output. */
export async function runPreparationCommand(command, args, { cwd, env, signal, timeout = 900000, maxBytes = 8 * 1024 * 1024 }) {
  assert.ok(isAbsolute(cwd), 'KIT_PREPARE_CWD');
  signal?.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0, failure;
    const stop = code => {
      failure ??= code;
      if (!child.pid) return;
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') failure = 'KIT_PREPARE_CLEANUP_FAILED'; }
    };
    const timer = setTimeout(() => stop('KIT_PREPARE_TIMEOUT'), timeout);
    const aborted = () => stop('KIT_PREPARE_INTERRUPTED');
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop('KIT_PREPARE_LOG_LIMIT');
      else chunks.push(chunk);
    });
    child.on('error', () => { failure = 'KIT_PREPARE_EXECUTABLE_UNAVAILABLE'; });
    child.on('exit', code => { if (code !== 0 && !failure) stop('KIT_PREPARE_STAGE_FAILED'); });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', aborted);
      const output = Buffer.concat(chunks).toString('utf8');
      if (failure || code !== 0) reject(Object.assign(new Error(failure ?? 'KIT_PREPARE_STAGE_FAILED'), { output }));
      else resolveResult(output);
    });
  });
}

function redact(output, transport) {
  for (const value of Object.values(transport)) output = output.split(value).join('[transport redacted]');
  return output.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@');
}

export async function prepareSdk(destination, { signal, onStage = () => {}, transport = {}, caFile } = {}) {
  assert.ok(isAbsolute(destination ?? ''), 'KIT_PREPARE_DESTINATION_ABSOLUTE');
  assert.ok(['darwin', 'linux'].includes(process.platform), 'KIT_PREPARE_PLATFORM_USE_WSL');
  const pin = JSON.parse(await readFile(join(toolchainRoot, 'toolchain.json')));
  assert.equal(Number(process.versions.node.split('.')[0]), pin.node_major, 'KIT_PREPARE_NODE');
  // The recipe is fixed by the installed kit. No caller URL, branch or hook.
  assert.equal(pin.upstream_url, 'https://github.com/deepseek-ai/deepseek-harness.git', 'KIT_PREPARE_SOURCE');
  assert.match(pin.upstream_sha, /^[a-f0-9]{40}$/, 'KIT_PREPARE_SOURCE');
  assert.match(pin.upstream_lock_sha256, /^[a-f0-9]{64}$/, 'KIT_PREPARE_LOCK');
  let ca;
  if (caFile !== undefined) {
    assert.ok(isAbsolute(caFile), 'KIT_PREPARE_CA_INVALID');
    const info = await lstat(caFile);
    assert.ok(info.isFile() && info.size > 0 && info.size <= 4 * 1024 * 1024, 'KIT_PREPARE_CA_INVALID');
    ca = await readFile(caFile);
    assert.ok(ca.includes('-----BEGIN CERTIFICATE-----') && !ca.includes('PRIVATE KEY'), 'KIT_PREPARE_CA_INVALID');
  }
  const parent = await realpath(dirname(destination));
  destination = join(parent, resolve(destination).split('/').at(-1));
  try { await mkdir(destination, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('KIT_PREPARE_DESTINATION_EXISTS'); throw error; }
  const env = bootstrapEnvironment(destination), network = packageNetworkEnv(transport);
  const upstream = join(destination, 'upstream'), buildTools = join(destination, 'build-tools');
  const receipt = { schema_version: 'shinemage-kit-preparation/v1', status: 'PREPARING',
    scope: 'development-sdk-only', upstream_sha: pin.upstream_sha, upstream_lock_sha256: pin.upstream_lock_sha256,
    pin_sha256: hash(await readFile(join(toolchainRoot, 'toolchain.json'))),
    platform: process.platform, arch: process.arch, node: process.version, pnpm: pin.pnpm,
    paths: { upstream: 'upstream', build_tools: 'build-tools', store: 'store' },
    inputs: {}, stages: [], transport_ca_sha256: ca ? hash(ca) : null,
    supply_chain: 'NOT_VERIFIED', production_runtime: 'NOT_BUILT', release_ready: false };
  const save = () => writeFile(join(destination, 'preparation.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  async function stage(name, command, args, cwd, online = false) {
    signal?.throwIfAborted(); onStage({ stage: name, status: 'RUNNING' });
    const started = Date.now(); const row = { name, status: 'RUNNING', network: online, log: `logs/${name}.log` };
    receipt.stages.push(row); await save();
    try {
      const timeout = name === 'source-fetch' ? 180000 : name.startsWith('manager-') ? 90000 : 900000;
      const output = await runPreparationCommand(command, args, { cwd, env: { ...env, ...(online ? network : {}) }, signal, timeout });
      const safe = redact(output, network); await writeFile(join(destination, row.log), safe, { mode: 0o600 });
      Object.assign(row, { status: 'PASS', duration_ms: Date.now() - started, log_sha256: hash(safe) });
      await save(); onStage({ stage: name, status: 'PASS', duration_ms: row.duration_ms }); return output.trim();
    } catch (error) {
      const safe = redact(error.output ?? '', network); await writeFile(join(destination, row.log), safe, { mode: 0o600 });
      Object.assign(row, { status: 'FAILED', code: error.message, duration_ms: Date.now() - started, log_sha256: hash(safe) });
      await save(); throw error;
    }
  }
  try {
    for (const path of ['home', 'tmp', 'cache', 'corepack', 'bin', 'logs', 'store', 'upstream', 'build-tools/patches']) {
      await mkdir(join(destination, path), { recursive: true, mode: 0o700 });
    }
    if (ca) {
      const path = join(destination, 'transport-ca.pem');
      await writeFile(path, ca, { mode: 0o600, flag: 'wx' });
      network.NODE_EXTRA_CA_CERTS = path;
    }
    await save();
    for (const file of buildInputs) {
      const source = join(toolchainRoot, 'build-tools', file);
      assert.ok((await lstat(source)).isFile(), 'KIT_PREPARE_TOOL_INPUT');
      await copyFile(source, join(buildTools, file)); receipt.inputs[file] = hash(await readFile(source));
    }
    await stage('git-init', 'git', ['init', '--quiet'], upstream);
    await stage('source-fetch', 'git', ['-c', 'credential.helper=', 'fetch', '--depth=1', pin.upstream_url, pin.upstream_sha], upstream, true);
    await stage('source-checkout', 'git', ['checkout', '--detach', '--quiet', 'FETCH_HEAD'], upstream);
    assert.equal(await stage('source-sha', 'git', ['rev-parse', 'HEAD'], upstream), pin.upstream_sha, 'KIT_PREPARE_SOURCE');
    receipt.source_tree = await stage('source-tree', 'git', ['rev-parse', 'HEAD^{tree}'], upstream);
    assert.equal(hash(await readFile(join(upstream, 'pnpm-lock.yaml'))), pin.upstream_lock_sha256, 'KIT_PREPARE_LOCK');
    assert.equal(JSON.parse(await readFile(join(upstream, 'package.json'))).packageManager, `pnpm@${pin.pnpm}`, 'KIT_PREPARE_MANAGER');
    await stage('manager-shim', 'corepack', ['enable', '--install-directory', join(destination, 'bin'), 'pnpm'], upstream);
    assert.equal(await stage('manager-version', 'corepack', ['pnpm', '--version'], upstream, true), pin.pnpm, 'KIT_PREPARE_MANAGER');
    const store = ['--store-dir', join(destination, 'store')];
    await stage('sdk-install', 'corepack', [...dependencyCommands.install, ...store], upstream, true);
    // SDK-only official build scripts: no web app, runtime install or host startup.
    await stage('sdk-host', 'corepack', ['pnpm', 'run', 'build:lib:host'], upstream);
    await stage('sdk-client', 'corepack', ['pnpm', 'run', 'build:lib:client'], upstream);
    await stage('tools-install', 'corepack', [...dependencyCommands.install, ...store], buildTools, true);
    assert.equal(await stage('source-clean', 'git', ['status', '--porcelain', '--untracked-files=no'], upstream), '', 'KIT_PREPARE_SOURCE_DIRTY');
    assert.equal(hash(await readFile(join(upstream, 'pnpm-lock.yaml'))), pin.upstream_lock_sha256, 'KIT_PREPARE_LOCK');
    for (const file of buildInputs) assert.equal(hash(await readFile(join(buildTools, file))), receipt.inputs[file], 'KIT_PREPARE_TOOL_DRIFT');
    const { bindings } = await inspectToolchain(upstream, buildTools);
    receipt.bindings = bindings.size; receipt.sdk_packages = Object.keys(pin.sdk_bindings).length;
    receipt.status = 'READY'; await save();
    return receipt;
  } catch (error) {
    receipt.status = 'BLOCKED'; receipt.code = /^KIT_[A-Z_]+$/.test(error.message) ? error.message : 'KIT_PREPARE_INPUTS_FAILED';
    await save(); throw Object.assign(new Error(receipt.code), { receipt });
  }
}

// pnpm exposes the executable through a symlink; Node resolves import.meta to
// its store path but leaves argv[1] at the consumer path.
if (process.argv[1] && await realpath(resolve(process.argv[1])).catch(() => null) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) console.log(usage);
  else {
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    try {
      assert.ok([2, 4].includes(args.length) && args[0] === '--destination'
        && (args.length === 2 || args[2] === '--ca-file'), 'KIT_PREPARE_ARGUMENTS');
      const receipt = await prepareSdk(args[1], { signal: controller.signal, transport: process.env,
        caFile: args[3],
        onStage: event => console.log(JSON.stringify({ schema_version: 'shinemage-kit-stage/v1', ...event })) });
      console.log(JSON.stringify(receipt));
    } catch (error) {
      console.log(JSON.stringify({ status: 'BLOCKED', code: /^KIT_[A-Z_]+$/.test(error.message) ? error.message : 'KIT_PREPARE_FAILED',
        remedy: 'Inspect the owned destination preparation.json and logs; fix prerequisites and choose a new destination.', release_ready: false }));
      process.exitCode = 2;
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  }
}
