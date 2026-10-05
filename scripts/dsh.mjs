#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreManifest, packArtifact, sha256 } from './release/artifact.mjs';
import { receiveRelease } from './release/receive.mjs';
import { assertSchema } from './release/schema.mjs';
import { verifyPayload } from './release/artifact.mjs';
import { readState, reconcileState, recordEvent, resume } from './release/state.mjs';
import { runLocalVerification } from './release/local-verify.mjs';
import { collectReleaseReadiness, printReadiness } from './release/readiness.mjs';
import { DSH_UPSTREAM_SHA, NODE_MAJOR, PNPM_VERSION } from './release/toolchain.mjs';
import { createPluginCandidate } from './release/plugin-candidate.mjs';
import { verifyPluginHost } from './release/plugin-host-evidence.mjs';
import { verifyPluginService } from './release/plugin-service-evidence.mjs';
import { loadReleaseProfile } from './release/profile.mjs';
import { prepareServiceCompatibility } from './release/service-compatibility.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const releaseEvidence = join(root, '.context/release-evidence');
const COMMANDS = ['dev', 'test', 'preflight', 'release', 'receive', 'reconcile', 'verify', 'rollback', 'doctor', 'status', 'why-blocked', 'retry', 'resume', 'plugin'];
function usage() {
  console.log(`Usage: pnpm dsh <command> [options]

Commands: ${COMMANDS.join(', ')}
Global options: --help, --version
doctor --release is a read-only release-readiness check; verify --scope local|release selects local or release evidence.
Release preparation is offline by default only with --offline/--dry-run; remote publish is a separate authorized action.
Exit codes: 0=success, 2=usage/error/release-gate-blocked.`);
}
async function printVersion() {
  const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
  console.log(`DSH_VERSION ${version} upstream=${DSH_UPSTREAM_SHA}`);
}
function git(args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
  catch (error) { throw new Error(`RELEASE_GIT_UNAVAILABLE ${String(error?.message ?? error).split('\n')[0]}`); }
}
async function doctor(args = [], { setExitCode = true } = {}) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: pnpm dsh doctor [--release]');
    console.log('Default checks are lightweight; --release adds read-only toolchain, clean-tree, runtime and output checks.');
    return true;
  }
  if (args.some(arg => arg !== '--release')) throw new Error(`DOCTOR_OPTION_UNKNOWN ${args.find(arg => arg !== '--release')}`);
  const releaseMode = args.includes('--release');
  const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim(); const pin = DSH_UPSTREAM_SHA;
  const checks = [
    [`node${NODE_MAJOR}`, Number(process.versions.node.split('.')[0]) === NODE_MAJOR, process.versions.node],
    ['version', /^\d+\.\d+\.\d+\.\d+$/.test(version), version],
    ['rc2-pin', /^[0-9a-f]{40}$/.test(pin), pin],
    ['release-schemas', await access(join(root, 'scripts/release/schemas/release-manifest.v1.schema.json')).then(() => true).catch(() => false), 'present'],
  ];
  for (const [name, ok, value] of checks) console.log(`DSH_DOCTOR ${ok ? 'PASS' : 'FAIL'} ${name}=${value}`);
  let ok = checks.every(([, value]) => value);
  if (releaseMode) {
    const readiness = await collectReleaseReadiness({ root, requireClean: true, requireRuntime: true });
    ok = printReadiness(readiness) && ok;
    console.log(`DSH_DOCTOR_RELEASE_STATUS ${ok ? 'PASS' : 'BLOCKED'} scope=release-readiness`);
  }
  if (setExitCode && !ok) process.exitCode = 2;
  return ok;
}
async function release(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: pnpm dsh release [--offline|--dry-run] [--tag TAG] [--config PATH] --state-path /absolute/release-state.json [--service-evidence /absolute/receipt.json]');
    console.log('Precedence: --tag > DSH_RELEASE_TAG > config.release_tag > VERSION default; config path: --config > DSH_CONFIG_FILE > .dshrc.json');
    return;
  }
  const tagIndex = args.indexOf('--tag');
  if (args.filter(value => value === '--tag').length > 1) throw new Error('RELEASE_TAG_AMBIGUOUS');
  if (tagIndex >= 0 && !args[tagIndex + 1]) throw new Error('RELEASE_TAG_REQUIRED');
  const configIndex = args.indexOf('--config');
  if (args.filter(value => value === '--config').length > 1) throw new Error('RELEASE_CONFIG_AMBIGUOUS');
  if (configIndex >= 0 && !args[configIndex + 1]) throw new Error('RELEASE_CONFIG_REQUIRED');
  const configPath = configIndex >= 0 ? args[configIndex + 1] : (process.env.DSH_CONFIG_FILE || join(root, '.dshrc.json'));
  let config = {};
  if (await access(configPath).then(() => true, () => false)) {
    try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { throw new Error('DSH_CONFIG_INVALID'); }
    if (!config || typeof config !== 'object' || Array.isArray(config) || (config.release_tag !== undefined && typeof config.release_tag !== 'string')) throw new Error('DSH_CONFIG_INVALID');
  }
  const configuredTag = config.release_tag || `dsh-${(await readFile(join(root, 'VERSION'), 'utf8')).trim()}-candidate`;
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : (process.env.DSH_RELEASE_TAG || configuredTag);
  const allowed = new Set(['--offline', '--dry-run', '--tag', '--config', '--state-path', '--service-evidence']);
  if (args.filter(value => value === '--service-evidence').length > 1) throw new Error('SERVICE_EVIDENCE_AMBIGUOUS');
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith('--')) continue;
    if (!allowed.has(item)) throw new Error(`RELEASE_OPTION_UNKNOWN ${item}`);
    if (item === '--tag' || item === '--config' || item === '--state-path' || item === '--service-evidence') index += 1;
  }
  const offline = args.includes('--offline') || args.includes('--dry-run');
  if (!offline) throw new Error('RELEASE_NETWORK_AUTH_REQUIRED use --offline for local preparation; GitHub publish is a separate authorized step');
  const statePath = explicitStatePath(args);
  const status = git(['status', '--porcelain', '--untracked-files=all']);
  if (status) throw new Error('RELEASE_BLOCKED_DIRTY_WORKTREE reviewed commit must be clean; use a clean CI checkout to build the immutable artifact');
  const sourceSha = git(['rev-parse', 'HEAD']); const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
  const upstreamSha = DSH_UPSTREAM_SHA;
  const profile = await loadReleaseProfile({ root });
  const serviceGate = await prepareServiceCompatibility(profile.profile.service_binding,
    args.includes('--service-evidence') ? requiredOption(args, '--service-evidence') : null);
  const runtimeInput = process.env.DSH_UPSTREAM_RUNTIME_BUNDLE;
  if (!runtimeInput) throw new Error('RELEASE_UPSTREAM_RUNTIME_REQUIRED');
  const runtimeInfo = await stat(runtimeInput).catch(() => null);
  if (!runtimeInfo?.isFile() || runtimeInfo.size < 1) throw new Error('RELEASE_UPSTREAM_RUNTIME_INVALID');
  const runtimeName = `shinemage-dsh-upstream-runtime-${upstreamSha}.tar.zst`;
  const dir = join(releaseEvidence, tag);
  await recordEvent(statePath, { release_tag: tag, status: 'RELEASE_PREPARE_INTENT', source_sha: sourceSha, dsh_upstream_sha: upstreamSha, profile_digest: profile.digest });
  await mkdir(releaseEvidence, { recursive: true });
  if (await access(dir).then(() => true, () => false)) {
    const entries = await readdir(dir);
    if (entries.length > 0) throw new Error('RELEASE_EVIDENCE_EXISTS evidence is immutable; choose a new tag or reconcile the existing record');
    await rm(dir, { recursive: true });
  }
  await mkdir(dir, { recursive: false });
  try {
  const runtimeOutput = join(dir, runtimeName);
  const runtimeInputResolved = resolve(runtimeInput);
  if (runtimeInputResolved !== resolve(runtimeOutput)) await copyFile(runtimeInputResolved, runtimeOutput);
  const runtimeBytes = (await stat(runtimeOutput)).size;
  const runtimeSha256 = await sha256(runtimeOutput);
  const pre = await buildPreManifest({ releaseTag: tag, productVersion: version, sourceSha, dshUpstreamSha: upstreamSha, artifacts: [{ name: `${tag}.tar.zst`, role: 'source-bundle', path: `${tag}.tar.zst` }, { name: runtimeName, role: 'upstream-runtime-bundle', path: runtimeName }], output: join(dir, 'pre-manifest.v1.json') });
  const prePath = join(dir, 'pre-manifest.v1.json'); const preSha = await sha256(prePath);
  const bundle = await packArtifact({ rootDir: root, allowlist: pre.archive_allowlist, output: join(dir, `${tag}.tar.zst`) });
  const manifest = { schema_version: 'release-manifest/v1', release_tag: tag, product_version: version, source_sha: sourceSha, dsh_upstream_sha: upstreamSha, pre_manifest_sha256: preSha, archive_allowlist: pre.archive_allowlist, denylist_version: 'release-denylist/v1', build_time: new Date().toISOString(), retention_until: 'NOT_SET_UNTIL_PUBLISHED', toolchain: { node: process.versions.node, pnpm: PNPM_VERSION }, artifact_bytes: bundle.bytes, artifact_sha256: bundle.sha256, upstream_runtime: { name: runtimeName, role: 'upstream-runtime-bundle', upstream_sha: upstreamSha, bytes: runtimeBytes, sha256: runtimeSha256 },
    profile_snapshot: { path: profile.path.slice(root.length + 1), sha256: profile.digest },
    ...(serviceGate ? { service_compatibility: serviceGate } : {}),
    payload: await Promise.all(pre.archive_allowlist.map(async path => ({ path, role: 'runtime-source', bytes: (await stat(join(root, path))).size, sha256: await sha256(join(root, path)) }))) };
  await assertSchema(manifest, join(root, 'scripts/release/schemas/release-manifest.v1.schema.json'));
  const manifestPath = join(dir, 'release-manifest.v1.json'); await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const sums = `${bundle.sha256}  ${tag}.tar.zst\n${runtimeSha256}  ${runtimeName}\n${await sha256(manifestPath)}  release-manifest.v1.json\n`; await writeFile(join(dir, 'SHA256SUMS'), sums, { mode: 0o600 });
  await writeFile(join(dir, 'ci-evidence-index.v1.json'), JSON.stringify({ schema_version: 'ci-evidence-index/v1', release_tag: tag, entries: [{ name: 'local-doctor', status: 'PARTIAL', ref: 'pnpm dsh doctor', sha256: preSha }, { name: 'upstream-runtime-bundle', status: 'PASS', ref: runtimeName, sha256: runtimeSha256 }, { name: 'wsl2-cold', status: 'NOT_RUN', ref: 'docs/release/dsh-rc2-candidate/host-preflight.md' }] }, null, 2) + '\n', { mode: 0o600 });
  await verifyPayload(manifestPath, root);
  await recordEvent(statePath, { release_tag: tag, status: 'RELEASE_PREPARED', source_sha: sourceSha, dsh_upstream_sha: upstreamSha, profile_digest: profile.digest, artifact_sha256: bundle.sha256, manifest_sha256: await sha256(manifestPath) });
  console.log(`DSH_RELEASE_PREPARED tag=${tag} pre_manifest=${prePath} manifest=${manifestPath}`); console.log('DSH_RELEASE_STATUS INTERNAL_ONLY_PARTIAL');
  } catch (error) {
    await recordEvent(statePath, { release_tag: tag, status: 'RELEASE_FAILED', error_code: String(error?.message ?? '').match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'RELEASE_FAILED' }).catch(() => {});
    const entries = await readdir(dir).catch(() => []);
    if (entries.length === 0) await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
function explicitStatePath(args) {
  const indexes = args.flatMap((value, index) => value === '--state-path' ? [index] : []);
  if (indexes.length > 1) throw new Error('RELEASE_STATE_PATH_AMBIGUOUS');
  const index = indexes[0] ?? -1;
  const value = index >= 0 ? args[index + 1] : process.env.RELEASE_STATE_PATH;
  if (!value || value.startsWith('--')) throw new Error('RELEASE_STATE_PATH_REQUIRED');
  if (!value.startsWith('/')) throw new Error('RELEASE_STATE_PATH_ABSOLUTE_REQUIRED');
  return resolve(value);
}
function stateCommandArgs(args, { remote = false } = {}) {
  const positional = [];
  if (args.filter(value => value === '--state-path').length > 1) throw new Error('RELEASE_STATE_PATH_AMBIGUOUS');
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--state-path') {
      requiredOption(args, '--state-path');
      index += 1;
    } else if (args[index].startsWith('-')) {
      throw new Error(`STATE_OPTION_UNKNOWN ${args[index]}`);
    } else positional.push(args[index]);
  }
  const hasOption = args.includes('--state-path');
  let statePath;
  if (hasOption) statePath = explicitStatePath(args);
  else if (positional.length > (remote ? 1 : 0)) statePath = explicitStatePath(['--state-path', positional.shift()]);
  else statePath = explicitStatePath([]);
  if (positional.length !== (remote ? 1 : 0)) throw new Error(remote ? 'REMOTE_RECEIPT_REQUIRED' : 'STATE_ARGUMENTS_INVALID');
  return { statePath, remotePath: positional[0] };
}
function requiredOption(args, name) {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) throw new Error(`${name.slice(2).toUpperCase()}_AMBIGUOUS`);
  const index = indexes[0] ?? -1;
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name.slice(2).toUpperCase()}_REQUIRED`);
  return args[index + 1];
}
function positiveOption(args, name, fallback) {
  const value = args.includes(name) ? requiredOption(args, name) : fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) <= 0) throw new Error(`${name.slice(2).toUpperCase()}_INVALID`);
  return Number(value);
}
async function receive(args) {
  const artifact = requiredOption(args, '--artifact');
  const manifestPath = requiredOption(args, '--manifest');
  const destination = requiredOption(args, '--destination');
  const statePath = explicitStatePath(args);
  const maxEntries = positiveOption(args, '--max-entries', 10000);
  const maxBytes = positiveOption(args, '--max-bytes', 512 * 1024 * 1024);
  const allowed = new Set(['--artifact', '--manifest', '--destination', '--max-entries', '--max-bytes', '--state-path']);
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('--')) continue;
    if (!allowed.has(args[index])) throw new Error(`RECEIVE_OPTION_UNKNOWN ${args[index]}`);
    index += 1;
  }
  const result = await receiveRelease({ statePath, artifact, manifestPath, destination, maxEntries, maxBytes });
  console.log(`DSH_RECEIVE_PASS tag=${result.release_tag} entries=${result.entries} artifact_sha256=${result.artifact_sha256} destination=${destination}`);
}
async function test() { const tests = readdirSync(join(root, 'scripts/release')).filter(name => name.endsWith('.test.mjs')).map(name => join('scripts/release', name)); return execFileSync(process.execPath, ['--test', ...tests], { cwd: root, encoding: 'utf8', stdio: 'inherit' }); }
async function preflight(args) { return execFileSync(process.execPath, [join(root, 'scripts/release/preflight.mjs'), ...args], { cwd: root, encoding: 'utf8', stdio: 'inherit' }); }
async function plugin(args) {
  const [subcommand, ...options] = args;
  const usage = 'Usage:\n  pnpm dsh plugin candidate --plugin /absolute/plugin --output-dir /absolute/output --state-path /absolute/state.json [--profile config/profile.json] [--previous-profile config/profile.json] [--service-evidence /absolute/receipt.json]\n  pnpm dsh plugin verify-host --candidate /absolute/candidate.json --evidence /absolute/evidence.json --state-path /absolute/state.json\n  pnpm dsh plugin verify-service --candidate /absolute/candidate.json --evidence /absolute/service-pair/receipt.json --state-path /absolute/state.json\nverify-host checks existing local evidence and appends to the candidate journal; it does not start or activate a host.\nverify-service checks local service artifacts and appends to the same journal; target-host and supply-chain gates remain BLOCKED. It does not start or activate a service.';
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(usage);
    return;
  }
  if (!['candidate', 'verify-host', 'verify-service'].includes(subcommand)) throw new Error(`PLUGIN_COMMAND_UNKNOWN ${subcommand}`);
  if (options.includes('--help') || options.includes('-h')) {
    console.log(usage);
    return;
  }
  const allowed = new Set(subcommand === 'candidate' ? ['--plugin', '--output-dir', '--state-path', '--profile', '--previous-profile', '--service-evidence'] : ['--candidate', '--evidence', '--state-path']);
  const seen = new Set();
  for (let index = 0; index < options.length; index += 2) {
    const item = options[index];
    if (!allowed.has(item)) throw new Error(`PLUGIN_OPTION_UNKNOWN ${item}`);
    if (seen.has(item)) throw new Error(`PLUGIN_OPTION_DUPLICATE ${item}`);
    if (!options[index + 1] || options[index + 1].startsWith('--')) throw new Error(`PLUGIN_OPTION_VALUE_REQUIRED ${item}`);
    seen.add(item);
  }
  if (subcommand === 'verify-host' || subcommand === 'verify-service') {
    const verifier = subcommand === 'verify-host' ? verifyPluginHost : verifyPluginService;
    let observation;
    try {
      observation = await verifier({ candidatePath: requiredOption(options, '--candidate'),
        evidencePath: requiredOption(options, '--evidence'), statePath: requiredOption(options, '--state-path') });
    } catch (error) {
      if (subcommand !== 'verify-service') throw error;
      // Assertion diffs and child stderr may contain untrusted artifact values.
      // Only the stable code belongs in CLI/CI logs, never the supplied content.
      const code = String(error.message).match(/^(?:SERVICE|PLUGIN_SERVICE|RELEASE|ARCHIVE|DSH)_[A-Z0-9_]+\b/)?.[0];
      throw new Error(code ?? 'PLUGIN_SERVICE_VERIFICATION_FAILED');
    }
    console.log(JSON.stringify(observation, null, 2));
    return;
  }
  const candidate = await createPluginCandidate({
    plugin: requiredOption(options, '--plugin'),
    outputDir: requiredOption(options, '--output-dir'),
    statePath: requiredOption(options, '--state-path'),
    profileManifest: options.includes('--profile') ? requiredOption(options, '--profile') : null,
    previousProfile: options.includes('--previous-profile') ? requiredOption(options, '--previous-profile') : null,
    serviceEvidencePath: options.includes('--service-evidence') ? requiredOption(options, '--service-evidence') : null,
  });
  console.log(JSON.stringify(candidate, null, 2));
}
async function verify(args = []) {
  const scopeIndex = args.indexOf('--scope');
  if (args.filter(value => value === '--scope').length > 1) throw new Error('VERIFY_SCOPE_AMBIGUOUS');
  const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : 'release';
  if (scopeIndex >= 0 && (!scope || scope.startsWith('--'))) throw new Error('VERIFY_SCOPE_REQUIRED');
  if (!['local', 'release'].includes(scope)) throw new Error(`VERIFY_SCOPE_INVALID ${scope}`);
  const allowed = new Set(['--scope']);
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('--')) continue;
    if (!allowed.has(args[index])) throw new Error(`VERIFY_OPTION_UNKNOWN ${args[index]}`);
    index += 1;
  }
  const doctorOk = await doctor(scope === 'release' ? ['--release'] : [], { setExitCode: false });
  const local = await runLocalVerification();
  console.log(`DSH_VERIFY_COMPAT ${local.compatibility.status} scope=${local.compatibility.scope} wsl2=${local.compatibility.wsl2} real_duckdb=${local.compatibility.real_duckdb}`);
  console.log(`DSH_VERIFY_BACKPRESSURE ${local.backpressure.status} scope=${local.backpressure.evidence_scope} real_http=NOT_RUN`);
  if (scope === 'local') {
    console.log('DSH_VERIFY_SLI NOT_APPLICABLE scope=local reason=release-only evidence');
    const passed = doctorOk && local.compatibility.status === 'PASS' && local.backpressure.status === 'PASS';
    console.log(`DSH_VERIFY_STATUS ${passed ? 'LOCAL_PASS' : 'LOCAL_BLOCKED'} scope=local`);
    if (!passed) process.exitCode = 2;
    return;
  }
  console.log('DSH_VERIFY_SLI NOT_RUN reason=no 15-minute HTTP probe evidence');
  console.log('DSH_VERIFY_STATUS RELEASE_BLOCKED reason=15-minute SLI, WSL2 cold runtime/WAL, and host HTTP evidence remain NOT_RUN');
  // `verify` is a release gate: synthetic local evidence does not substitute
  // for the target WSL2 runtime/WAL, 15-minute SLI, or host HTTP evidence.
  process.exitCode = 2;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') { usage(); if (!command) process.exitCode = 2; return; }
  if (command === '--version' || command === '-V') return printVersion();
  if (!COMMANDS.includes(command)) throw new Error(`DSH_COMMAND_UNKNOWN ${command}`);
  if (command === 'doctor') return doctor(args);
  if (command === 'release') return release(args);
  if (command === 'preflight') return preflight(args);
  if (command === 'receive') return receive(args);
  if (command === 'test') return test();
  if (command === 'verify') return verify(args);
  if (command === 'reconcile') {
    const { statePath, remotePath } = stateCommandArgs(args, { remote: true });
    const remote = JSON.parse(await readFile(remotePath, 'utf8'));
    const result = await reconcileState(statePath, remote);
    console.log(JSON.stringify(result, null, 2));
    if (['CONFLICT', 'UNKNOWN'].includes(result.status)) process.exitCode = 2;
    return;
  }
  if (command === 'status' || command === 'resume') { const { statePath } = stateCommandArgs(args); console.log(JSON.stringify(await (command === 'resume' ? resume(statePath) : readState(statePath)), null, 2)); return; }
  if (command === 'why-blocked') { console.log('DSH_BLOCKED GitHub push/tag/release、杭州重启/route/切换需要单独授权；真实模型、131GB DuckDB、WSL2 冷验证为 NOT_RUN/PARTIAL'); return; }
  if (command === 'retry') { console.log('DSH_RETRY requires a durable state path and idempotency key; no remote side effect was attempted'); return; }
  if (command === 'dev') { const { spawn } = await import('node:child_process'); const child = spawn(process.execPath, [join(root, 'scripts/dsh-dev/cli.mjs'), ...args], { cwd: root, stdio: 'inherit' }); child.on('exit', code => { process.exitCode = code ?? 1; }); return; }
  if (command === 'rollback') { console.log('DSH_ROLLBACK dry-run only; use deploy/wsl/rollback-release.sh with a recorded receipt'); return; }
  if (command === 'plugin') return plugin(args);
  return usage();
}
main().catch(error => { console.error(`DSH_ERROR ${error.message}`); process.exitCode = 2; });
