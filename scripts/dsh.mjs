#!/usr/bin/env node
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreManifest, packArtifact, receiveArtifact, sha256 } from './release/artifact.mjs';
import { assertSchema } from './release/schema.mjs';
import { verifyPayload } from './release/artifact.mjs';
import { readState, reconcileState, resume } from './release/state.mjs';
import { runCompatibilityMatrix } from './release/compat-check.mjs';
import { verifyOperatorGate, evaluateSli } from './release/operator-gate.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const releaseEvidence = join(root, '.context/release-evidence');
function usage() { console.log('Usage: pnpm dsh <dev|test|release|receive|reconcile|verify|rollback|doctor|status|why-blocked|retry|resume> [options]'); }
function git(args) { try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); } catch { return null; } }
async function doctor() {
  const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim(); const pin = '477b4f420553e8a52c2fbccc464d7561b239c443';
  const checks = [
    ['node24', Number(process.versions.node.split('.')[0]) === 24, process.versions.node],
    ['version', /^\d+\.\d+\.\d+\.\d+$/.test(version), version],
    ['rc2-pin', (await readFile(join(root, 'scripts/dsh-dev/constants.mjs'), 'utf8')).includes(pin), pin],
    ['release-schemas', await access(join(root, 'scripts/release/schemas/release-manifest.v1.schema.json')).then(() => true).catch(() => false), 'present'],
  ];
  for (const [name, ok, value] of checks) console.log(`DSH_DOCTOR ${ok ? 'PASS' : 'FAIL'} ${name}=${value}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 2;
  return checks.every(([, ok]) => ok);
}
async function release(args) {
  const tagIndex = args.indexOf('--tag');
  if (tagIndex >= 0 && !args[tagIndex + 1]) throw new Error('RELEASE_TAG_REQUIRED');
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : `dsh-${(await readFile(join(root, 'VERSION'), 'utf8')).trim()}-candidate`;
  const offline = args.includes('--offline') || args.includes('--dry-run');
  if (!offline) throw new Error('RELEASE_NETWORK_AUTH_REQUIRED use --offline for local preparation; GitHub publish is a separate authorized step');
  const status = git(['status', '--porcelain', '--untracked-files=all']);
  if (status) throw new Error('RELEASE_BLOCKED_DIRTY_WORKTREE reviewed commit must be clean; use a clean CI checkout to build the immutable artifact');
  const sourceSha = git(['rev-parse', 'HEAD']); const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
  const dir = join(releaseEvidence, tag);
  await mkdir(releaseEvidence, { recursive: true });
  if (await access(dir).then(() => true, () => false)) {
    const entries = await readdir(dir);
    if (entries.length > 0) throw new Error('RELEASE_EVIDENCE_EXISTS evidence is immutable; choose a new tag or reconcile the existing record');
    await rm(dir, { recursive: true });
  }
  await mkdir(dir, { recursive: false });
  try {
  const pre = await buildPreManifest({ releaseTag: tag, productVersion: version, sourceSha, dshUpstreamSha: '477b4f420553e8a52c2fbccc464d7561b239c443', output: join(dir, 'pre-manifest.v1.json') });
  const prePath = join(dir, 'pre-manifest.v1.json'); const preSha = await sha256(prePath);
  const bundle = await packArtifact({ rootDir: root, allowlist: pre.archive_allowlist, output: join(dir, `${tag}.tar.zst`) });
  const manifest = { schema_version: 'release-manifest/v1', release_tag: tag, product_version: version, source_sha: sourceSha, dsh_upstream_sha: '477b4f420553e8a52c2fbccc464d7561b239c443', pre_manifest_sha256: preSha, archive_allowlist: pre.archive_allowlist, denylist_version: 'release-denylist/v1', build_time: new Date().toISOString(), retention_until: 'NOT_SET_UNTIL_PUBLISHED', toolchain: { node: process.versions.node, pnpm: '11.7.0' }, artifact_bytes: bundle.bytes, artifact_sha256: bundle.sha256,
    payload: await Promise.all(pre.archive_allowlist.map(async path => ({ path, role: 'runtime-source', bytes: (await stat(join(root, path))).size, sha256: await sha256(join(root, path)) }))) };
  await assertSchema(manifest, join(root, 'scripts/release/schemas/release-manifest.v1.schema.json'));
  const manifestPath = join(dir, 'release-manifest.v1.json'); await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const sums = `${bundle.sha256}  ${tag}.tar.zst\n${await sha256(manifestPath)}  release-manifest.v1.json\n`; await writeFile(join(dir, 'SHA256SUMS'), sums, { mode: 0o600 });
  await writeFile(join(dir, 'ci-evidence-index.v1.json'), JSON.stringify({ schema_version: 'ci-evidence-index/v1', release_tag: tag, entries: [{ name: 'local-doctor', status: 'PARTIAL', ref: 'pnpm dsh doctor', sha256: preSha }, { name: 'wsl2-cold', status: 'NOT_RUN', ref: 'docs/release/dsh-rc2-candidate/host-preflight.md' }] }, null, 2) + '\n', { mode: 0o600 });
  await verifyPayload(manifestPath, root);
  console.log(`DSH_RELEASE_PREPARED tag=${tag} pre_manifest=${prePath} manifest=${manifestPath}`); console.log('DSH_RELEASE_STATUS INTERNAL_ONLY_PARTIAL');
  } catch (error) {
    const entries = await readdir(dir).catch(() => []);
    if (entries.length === 0) await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
function requiredOption(args, name) {
  const index = args.indexOf(name);
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
  const maxEntries = positiveOption(args, '--max-entries', 10000);
  const maxBytes = positiveOption(args, '--max-bytes', 512 * 1024 * 1024);
  const allowed = new Set(['--artifact', '--manifest', '--destination', '--max-entries', '--max-bytes']);
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('--')) continue;
    if (!allowed.has(args[index])) throw new Error(`RECEIVE_OPTION_UNKNOWN ${args[index]}`);
    index += 1;
  }
  const result = await receiveArtifact({ artifact, manifestPath, destination, maxEntries, maxBytes });
  console.log(`DSH_RECEIVE_PASS tag=${result.manifest.release_tag} entries=${result.entries} artifact_sha256=${result.sha256} destination=${destination}`);
}
async function test() { const tests = readdirSync(join(root, 'scripts/release')).filter(name => name.endsWith('.test.mjs')).map(name => join('scripts/release', name)); return execFileSync(process.execPath, ['--test', ...tests], { cwd: root, encoding: 'utf8', stdio: 'inherit' }); }
async function verify() {
  await doctor();
  console.log('DSH_VERIFY_COMPAT NOT_RUN reason=rc1/rc2 runtime and WAL fixtures are not connected');
  console.log('DSH_VERIFY_SLI NOT_RUN reason=no 15-minute HTTP probe evidence');
  console.log('DSH_VERIFY_BACKPRESSURE NOT_RUN reason=no real HTTP service under test');
  console.log('DSH_VERIFY_STATUS RELEASE_BLOCKED reason=one or more required verification layers are NOT_RUN');
  // `verify` is a release gate: a healthy local doctor is not evidence that
  // runtime/WAL, HTTP SLI, or backpressure checks passed.
  process.exitCode = 2;
}
async function main() {
  const [command, ...args] = process.argv.slice(2); if (!command) return usage();
  if (command === 'doctor') return doctor();
  if (command === 'release') return release(args);
  if (command === 'receive') return receive(args);
  if (command === 'test') return test();
  if (command === 'verify') return verify();
  if (command === 'reconcile') {
    const statePath = args[0] || join(releaseEvidence, 'state.json');
    const remotePath = args[1];
    if (!remotePath) throw new Error('REMOTE_RECEIPT_REQUIRED');
    const remote = JSON.parse(await readFile(remotePath, 'utf8'));
    const result = await reconcileState(statePath, remote);
    console.log(JSON.stringify(result, null, 2));
    if (['CONFLICT', 'UNKNOWN'].includes(result.status)) process.exitCode = 2;
    return;
  }
  if (command === 'status' || command === 'resume') { const path = args[0] || join(releaseEvidence, 'state.json'); console.log(JSON.stringify(await (command === 'resume' ? resume(path) : readState(path)), null, 2)); return; }
  if (command === 'why-blocked') { console.log('DSH_BLOCKED GitHub push/tag/release、杭州重启/route/切换需要单独授权；真实模型、131GB DuckDB、WSL2 冷验证为 NOT_RUN/PARTIAL'); return; }
  if (command === 'retry') { console.log('DSH_RETRY requires a durable state path and idempotency key; no remote side effect was attempted'); return; }
  if (command === 'dev') { const { spawn } = await import('node:child_process'); const child = spawn(process.execPath, [join(root, 'scripts/dsh-dev/cli.mjs'), ...args], { cwd: root, stdio: 'inherit' }); child.on('exit', code => { process.exitCode = code ?? 1; }); return; }
  if (command === 'rollback') { console.log('DSH_ROLLBACK dry-run only; use deploy/wsl/rollback-release.sh with a recorded receipt'); return; }
  return usage();
}
main().catch(error => { console.error(`DSH_ERROR ${error.message}`); process.exitCode = 2; });
