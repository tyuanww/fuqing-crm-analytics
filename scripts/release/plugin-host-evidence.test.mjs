import { PNPM_VERSION } from './toolchain.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import test, { before, after } from 'node:test';
import { createPluginCandidate } from './plugin-candidate.mjs';
import { packPlugin } from './plugin-pack.mjs';
import { prepareProfile } from '../crm-calibration/prepare-profile.mjs';
import { readState, recordEvent } from './state.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA } from './toolchain.mjs';
import { verifyPluginHost, HOST_EVIDENCE_SCHEMA, HOST_SCOPE, HOST_INPUTS, HOST_SCENARIOS } from './plugin-host-evidence.mjs';

const exec = promisify(execFile), repository = join(import.meta.dirname, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const parse = async path => JSON.parse(await readFile(path));
let baseline;

// These records test the verifier, not the host. Only the opt-in pinned-host
// runner may produce actual lifecycle evidence. No fixture proof is retained.
before(async () => {
  baseline = await mkdtemp(join(tmpdir(), 'plugin-host-contract-only-'));
  await mkdir(join(baseline, 'config'));
  const profile = { schema_version: 'dsh-profile/v1', profile_id: 'crm-knowledge-rc2',
    dsh: { sdk_version: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA }, plugins: [] };
  for (const domain of ['crm-knowledge', 'knowledge']) {
    const crm = domain === 'crm-knowledge', root = join(baseline, domain);
    await mkdir(join(root, 'lib'), { recursive: true });
    const exports = crm ? { '.': './lib/index.js', './host': './lib/host.js', './client': './lib/client.js' }
      : { '.': './lib/index.js', './graph-tools': './lib/graph-tools.js' };
    await json(join(root, 'package.json'), { name: '@shine-mage/dsh-' + domain, version: '0.1.0',
      type: 'module', packageManager: `pnpm@${PNPM_VERSION}`, exports, files: [...Object.values(exports).map(p => p.slice(2)), 'lib/data.json', 'lib/empty.txt'],
      peerDependencies: { '@deepseek-ai/dsh-tools': DSH_SDK_VERSION, '@deepseek-ai/cordis': '4.0.4' },
      shinemage: { plugin_domain: crm ? 'crm' : 'knowledge', composition_contract: 'crm-knowledge-split/v1' } });
    for (const name of Object.values(exports)) await writeFile(join(root, name), '// Contract fixture; never started.\nexport {};\n');
    await writeFile(join(root, 'lib/data.json'), '{"fixture":true}\n');
    await writeFile(join(root, 'lib/empty.txt'), '');
    await writeFile(join(root, 'build.mjs'), 'export {};\n');
    profile.plugins.push({ id: '@shine-mage/dsh-' + domain, path: domain, enabled: true, build: 'build.mjs' });
  }
  await json(join(baseline, 'config/profile.json'), profile);
  for (const args of [['init', '-q'], ['config', 'user.email', 'fixture@example.invalid'], ['config', 'user.name', 'fixture'], ['add', '.'], ['commit', '-qm', 'isolated verifier fixture']]) await exec('git', args, { cwd: baseline });
  const statePath = join(baseline, 'state.json'), outputDir = join(baseline, 'candidate');
  await createPluginCandidate({ root: baseline, plugin: join(baseline, 'crm-knowledge'), outputDir, statePath, profileManifest: 'config/profile.json' });
  const host = join(baseline, 'host'); await mkdir(host);
  const packages = {};
  for (const domain of ['crm-knowledge', 'knowledge']) {
    const receipt = domain === 'crm-knowledge' ? await parse(join(outputDir, 'plugin-pack.json'))
      : await packPlugin({ plugin: join(baseline, domain), outputDir: join(baseline, 'companion') });
    const packDir = join(host, 'packs', domain); await mkdir(packDir, { recursive: true });
    const archive = join(packDir, receipt.tarball.name);
    await cp(join(domain === 'crm-knowledge' ? outputDir : join(baseline, 'companion'), receipt.tarball.name), archive);
    await exec('python3', [join(repository, 'scripts/release/secure-unpack.py'), archive, join(host, 'installed', domain)]);
    packages[domain] = { ...receipt.tarball, source_sha: receipt.source_sha, package_name: receipt.package_name, package_version: receipt.package_version };
  }
  const assets = await prepareProfile({ output: join(host, 'assets'), plugin: join(host, 'installed/crm-knowledge/package'), knowledgePlugin: join(host, 'installed/knowledge/package') });
  const composition = ['@deepseek-ai/dsh-persona', ...Object.values(assets.packages).map(p => {
    const url = pathToFileURL(join(p.root, 'lib/index.js')); url.searchParams.set('build', p.sha256); return url.href;
  })];
  const session = join(host, 'dsh-home/sessions/fixture.jsonl'); await mkdir(dirname(session), { recursive: true });
  await writeFile(session, '{"fixture":"not-a-host-run"}\n');
  await json(join(host, 'evidence.json'), { schema: HOST_EVIDENCE_SCHEMA, fixture: 'validator-only-no-host-started', overall: 'PASS', scope: HOST_SCOPE,
    platform: { os: process.platform, arch: process.arch, node: process.versions.node },
    dsh: { version: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA, cli_sha256: 'a'.repeat(64) },
    inputs: Object.fromEntries(await Promise.all(HOST_INPUTS.map(async p => [p, hash(await readFile(join(repository, p)))]))),
    packages, profile_assets: { name: 'assets/manifest.json', sha256: hash(await readFile(join(host, 'assets/manifest.json'))) },
    session_files: ['fixture.jsonl'], session_sha256: { 'fixture.jsonl': hash(await readFile(session)) },
    rows: HOST_SCENARIOS.map(id => ({ id, status: 'PASS', ...['profile-load', 'restore-previous-pinned-profile'].includes(id) ? { crm_identity: 'shinemage-knowledge-access/v1' } : {},
      ...id === 'loaded-composition-reconcile' ? { modules: composition, digest: digest(composition) } : {} })) });
});
after(async () => { if (baseline) await rm(baseline, { force: true, recursive: true }); });

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-host-mutation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['candidate', 'host', 'state.json']) await cp(join(baseline, path), join(root, path), { recursive: true });
  return { root, candidatePath: join(root, 'candidate/candidate.json'), evidencePath: join(root, 'host/evidence.json'), statePath: join(root, 'state.json') };
}
async function changeEvidence(input, change) {
  const data = await parse(input.evidencePath); change(data); await json(input.evidencePath, data);
}

test('candidate host verification is durable, idempotent and does not rewrite or activate the candidate', async t => {
  const input = await fixture(t), original = await readFile(input.candidatePath);
  const first = await verifyPluginHost(input);
  assert.equal(first.status, 'LOCAL_HOST_VERIFIED');
  assert.equal(first.release_ready, false);
  assert.equal(first.activation, 'NOT_RUN');
  assert.equal(first.service_state, 'NOT_RUN');
  assert.equal(first.tested_plugins.length, 2);
  const journal = await readFile(input.statePath);
  // Simulate loss of stdout after the durable write, then retry in a new process.
  const retry = await exec(process.execPath, [join(repository, 'scripts/dsh.mjs'), 'plugin', 'verify-host', '--candidate', input.candidatePath, '--evidence', input.evidencePath, '--state-path', input.statePath]);
  assert.deepEqual(JSON.parse(retry.stdout), first);
  assert.deepEqual(await readFile(input.statePath), journal);
  assert.deepEqual(await readFile(input.candidatePath), original);
  assert.equal((await readState(input.statePath)).journal.at(-1).status, 'CANDIDATE_HOST_VERIFIED');
});

for (const [title, mutate, error] of [
  ['old v1 proof', e => { e.schema = 'dsh-pinned-host-acceptance/v1'; }, /PLUGIN_HOST_EVIDENCE_SCHEMA/],
  ['unfinished proof', e => { e.overall = 'RUNNING'; }, /PLUGIN_HOST_EVIDENCE_NOT_PASS/],
  ['cleanup failure', e => { e.cleanup_errors = ['not reaped']; }, /PLUGIN_HOST_EVIDENCE_FAILED_CLEANUP/],
  ['wrong DSH', e => { e.dsh.upstream_sha = '0'.repeat(40); }, /PLUGIN_HOST_DSH_SHA_MISMATCH/],
  ['wrong node', e => { e.platform.node = '25.0.0'; }, /PLUGIN_HOST_NODE_MISMATCH/],
  ['changed harness', e => { e.inputs[HOST_INPUTS[0]] = '0'.repeat(64); }, /PLUGIN_HOST_VERIFIER_SOURCE_DRIFT/],
  ['missing scenario', e => { e.rows.pop(); }, /PLUGIN_HOST_SCENARIOS_MISMATCH/],
  ['failed scenario', e => { e.rows[2].status = 'NOT_RUN'; }, /PLUGIN_HOST_SCENARIO_NOT_PASS/],
  ['missing identity provider', e => { delete e.rows.at(-1).crm_identity; }, /PLUGIN_HOST_IDENTITY_NOT_VERIFIED/],
  ['different selected source', e => { e.packages['crm-knowledge'].source_sha = '0'.repeat(40); }, /PLUGIN_HOST_TESTED_SOURCE_MISMATCH/],
  ['different selected version', e => { e.packages['crm-knowledge'].package_version = '0.9.0'; }, /PLUGIN_HOST_TESTED_PACKAGE_VERSION_MISMATCH/],
  ['different composition', e => { e.rows[1].modules.pop(); }, /PLUGIN_HOST_COMPOSITION_MISMATCH/],
  ['no session evidence', e => { e.session_files = []; }, /PLUGIN_HOST_SESSION_REQUIRED/],
]) test('rejects ' + title + ' without changing the journal', async t => {
  const input = await fixture(t), prior = await readFile(input.statePath);
  await changeEvidence(input, mutate);
  await assert.rejects(verifyPluginHost(input), error);
  assert.deepEqual(await readFile(input.statePath), prior);
});

for (const [path, error] of [
  ['candidate/profile.json', /PLUGIN_HOST_PROFILE_DIGEST_MISMATCH/],
  ['host/installed/knowledge/package/lib/index.js', /PLUGIN_HOST_INSTALLED_ENTRY_CHANGED/],
  ['host/assets/preset.patch.yml', /PLUGIN_HOST_PROFILE_FILE_CHANGED/],
  ['host/dsh-home/sessions/fixture.jsonl', /PLUGIN_HOST_SESSION_CHANGED/],
]) test('rejects modified file ' + path, async t => {
  const input = await fixture(t), prior = await readFile(input.statePath);
  await writeFile(join(input.root, path), 'modified');
  await assert.rejects(verifyPluginHost(input), error);
  assert.deepEqual(await readFile(input.statePath), prior);
});

test('rejects tarball mutation for the candidate and its companion', async t => {
  for (const domain of ['candidate', 'knowledge']) {
    const input = await fixture(t), prior = await readFile(input.statePath);
    const pack = domain === 'candidate' ? (await parse(input.candidatePath)).pack : (await parse(input.evidencePath)).packages.knowledge;
    const path = join(input.root, domain === 'candidate' ? 'candidate' : 'host/packs/knowledge', pack.name);
    const bytes = await readFile(path); bytes[0] ^= 1; await writeFile(path, bytes);
    await assert.rejects(verifyPluginHost(input), /PLUGIN_HOST_PACK_DIGEST_MISMATCH/);
    assert.deepEqual(await readFile(input.statePath), prior);
  }
});

test('rejects an unprepared journal, changed candidate digest, missing snapshot and broader profile', async t => {
  const input = await fixture(t);
  await assert.rejects(verifyPluginHost({ ...input, statePath: join(input.root, 'absent-state.json') }), /PLUGIN_HOST_CANDIDATE_NOT_PREPARED/);
  await assert.rejects(readFile(join(input.root, 'absent-state.json')), /ENOENT/);
  const candidate = await parse(input.candidatePath), original = structuredClone(candidate);
  candidate.candidate_digest = '0'.repeat(64); await json(input.candidatePath, candidate);
  await assert.rejects(verifyPluginHost(input), /PLUGIN_HOST_CANDIDATE_DIGEST_MISMATCH/);
  for (const alter of ['missing', 'broader']) {
    const { candidate_digest, activation, state_scope, ...base } = original;
    if (alter === 'missing') delete base.profile_snapshot;
    else {
      const profile = await parse(join(input.root, 'candidate/profile.json'));
      profile.plugins.push({ id: '@shine-mage/extra', path: 'extra', enabled: true, build: 'build.mjs' });
      await json(join(input.root, 'candidate/profile.json'), profile);
      base.profile_digest = hash(await readFile(join(input.root, 'candidate/profile.json')));
      base.profile_snapshot = { name: 'profile.json', sha256: base.profile_digest };
    }
    await json(input.candidatePath, { ...base, candidate_digest: digest(base), activation, state_scope });
    await assert.rejects(verifyPluginHost(input), alter === 'missing' ? /PLUGIN_HOST_PROFILE_SNAPSHOT_REQUIRED/ : /PLUGIN_HOST_PROFILE_SCOPE_MISMATCH/);
  }
});

test('rejects profile symlinks escaping the candidate directory', async t => {
  const input = await fixture(t), target = join(input.root, 'outside.json'), path = join(input.root, 'candidate/profile.json');
  await cp(path, target); await rm(path); await symlink(target, path);
  await assert.rejects(verifyPluginHost(input), /PLUGIN_HOST_FILE_OUTSIDE_ROOT/);
});

test('rejects incomplete profile assets and mismatched prepared journal', async t => {
  const input = await fixture(t), assetsPath = join(input.root, 'host/assets/manifest.json');
  const assets = await parse(assetsPath); delete assets.sha256['preset.patch.yml']; await json(assetsPath, assets);
  await changeEvidence(input, e => { e.profile_assets.sha256 = hash(JSON.stringify(assets, null, 2) + '\n'); });
  await assert.rejects(verifyPluginHost(input), /PLUGIN_HOST_ASSET_ALLOWLIST_MISMATCH/);
  const other = await fixture(t), candidate = await parse(other.candidatePath);
  const badState = join(other.root, 'wrong-state.json');
  await recordEvent(badState, { status: 'CANDIDATE_PREPARED', candidate_digest: '0'.repeat(64), release_tag: 'dsh-wrong' },
    { idempotencyKey: 'candidate:' + digest([candidate.plugin.id, candidate.plugin.version]) });
  const prior = await readFile(badState);
  await assert.rejects(verifyPluginHost({ ...other, statePath: badState }), /PLUGIN_HOST_JOURNAL_CANDIDATE_MISMATCH/);
  assert.deepEqual(await readFile(badState), prior);
});

test('rejects FIFO input promptly without touching the journal', { skip: process.platform === 'win32' }, async t => {
  const input = await fixture(t), prior = await readFile(input.statePath);
  const fifo = join(input.root, 'candidate.fifo');
  await exec('mkfifo', [fifo]);
  await assert.rejects(exec(process.execPath, [join(repository, 'scripts/dsh.mjs'), 'plugin', 'verify-host',
    '--candidate', fifo, '--evidence', input.evidencePath, '--state-path', input.statePath], { timeout: 3000 }), error => {
    assert.equal(error.killed, false, 'a special input must be rejected, not wait indefinitely for a FIFO writer');
    assert.equal(error.code, 2);
    assert.match(error.stderr, /PLUGIN_HOST_FILE_INVALID/);
    return true;
  });
  assert.deepEqual(await readFile(input.statePath), prior);
});

test('rejects self-consistent installed hashes that do not match the archived package', async t => {
  const input = await fixture(t), prior = await readFile(input.statePath);
  const entry = join(input.root, 'host/installed/crm-knowledge/package/lib/index.js');
  await writeFile(entry, '// Other build under the same package version.\nexport const different = true;\n');
  const assetsPath = join(input.root, 'host/assets/manifest.json'), assets = await parse(assetsPath);
  assets.packages.crm.entries['lib/index.js'] = hash(await readFile(entry));
  assets.packages.crm.sha256 = digest(assets.packages.crm.entries);
  await json(assetsPath, assets);
  await changeEvidence(input, e => {
    e.profile_assets.sha256 = hash(JSON.stringify(assets, null, 2) + '\n');
    const module = pathToFileURL(join(assets.packages.crm.root, 'lib/index.js'));
    module.searchParams.set('build', assets.packages.crm.sha256);
    e.rows[1].modules[1] = module.href;
    e.rows[1].digest = digest(e.rows[1].modules);
  });
  await assert.rejects(verifyPluginHost(input), /PLUGIN_HOST_INSTALLED_PACK_MISMATCH/);
  assert.deepEqual(await readFile(input.statePath), prior);
});

for (const name of ['lib/data.json', 'lib/extra.js']) test('rejects changed or additional non-entry package asset ' + name, async t => {
  const input = await fixture(t), prior = await readFile(input.statePath);
  await writeFile(join(input.root, 'host/installed/knowledge/package', name), 'other build');
  await assert.rejects(verifyPluginHost(input), /PLUGIN_HOST_INSTALLED_PACK_MISMATCH/);
  assert.deepEqual(await readFile(input.statePath), prior);
});
