import { PNPM_VERSION, DSH_SDK_VERSION, DSH_UPSTREAM_SHA } from './toolchain.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { createPluginCandidate } from './plugin-candidate.mjs';
import { packPlugin } from './plugin-pack.mjs';
import { recordEvent } from './state.mjs';
import { serviceFixture } from './test-fixtures/service-compatibility.mjs';
import { writeBuildProvenance } from './generated-provenance.mjs';

const exec = promisify(execFile);
const SHA = DSH_UPSTREAM_SHA;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'config'), { recursive: true });
  await mkdir(join(root, 'plugin/lib'), { recursive: true });
  await writeFile(join(root, 'plugin/package.json'), JSON.stringify({
    name: '@shine-mage/test-plugin', version: '0.1.0', private: true, type: 'module', packageManager: `pnpm@${PNPM_VERSION}`,
    peerDependencies: { '@deepseek-ai/dsh-tools': DSH_SDK_VERSION }, files: ['lib/', 'cordis.patch.yml'],
  }) + '\n');
  await writeFile(join(root, 'plugin/lib/index.js'), 'export const testPlugin = true;\n');
  await writeFile(join(root, 'plugin/cordis.patch.yml'), '[]\n');
  await writeFile(join(root, 'config/profile.json'), JSON.stringify({ schema_version: 'dsh-profile/v1', profile_id: 'test', dsh: { sdk_version: DSH_SDK_VERSION, upstream_sha: SHA }, plugins: [{ path: 'plugin', id: '@shine-mage/test-plugin', build: 'build.mjs', enabled: true }] }));
  await writeFile(join(root, 'plugin/build.mjs'), 'export {}\n');
  await exec('git', ['-C', root, 'init', '-q']);
  await exec('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid']);
  await exec('git', ['-C', root, 'config', 'user.name', 'fixture']);
  await exec('git', ['-C', root, 'add', '.']);
  await exec('git', ['-C', root, 'commit', '-qm', 'fixture']);
  return { root, plugin: join(root, 'plugin'), profile: 'config/profile.json', outputDir: join(root, 'candidate'), statePath: join(root, 'state.json') };
}

test('plugin candidate binds pack, profile and durable journal receipt', async t => {
  const input = await fixture(t);
  const candidate = await createPluginCandidate({ ...input, profileManifest: input.profile });
  assert.equal(candidate.schema_version, 'dsh-plugin-candidate/v1');
  assert.match(candidate.candidate_digest, /^[a-f0-9]{64}$/);
  assert.equal(candidate.state_scope, 'local-explicit-journal');
  assert.ok(!JSON.stringify(candidate).includes(input.root));
  assert.equal(candidate.canary.status, 'NOT_RUN');
  assert.equal(candidate.next_commands.receive.status, 'NOT_AVAILABLE');
  const snapshot = await readFile(join(input.outputDir, 'profile.json'));
  assert.deepEqual(snapshot, await readFile(join(input.root, input.profile)));
  assert.deepEqual(candidate.profile_snapshot, { name: 'profile.json', sha256: createHash('sha256').update(snapshot).digest('hex') });
  assert.deepEqual(JSON.parse(await readFile(join(input.outputDir, 'candidate.json'), 'utf8')), candidate);
  const state = JSON.parse(await readFile(input.statePath, 'utf8'));
  assert.equal(state.journal.at(-1).status, 'CANDIDATE_PREPARED');
  assert.equal(state.journal.at(-1).candidate_digest, candidate.candidate_digest);
});

test('plugin candidate leaves only a pending receipt when final journal commit conflicts', async t => {
  const input = await fixture(t);
  const candidateKey = createHash('sha256').update(JSON.stringify(['@shine-mage/test-plugin', '0.1.0'])).digest('hex');
  await recordEvent(input.statePath, {
    release_tag: 'dsh-plugin-shine-mage-test-plugin-0.1.0',
    status: 'OTHER_CANDIDATE',
  }, { idempotencyKey: `candidate:${candidateKey}` });
  await assert.rejects(
    () => createPluginCandidate({ ...input, outputDir: join(input.root, 'conflicting-candidate'), profileManifest: input.profile }),
    /RELEASE_EVENT_CONFLICT/,
  );
  await assert.rejects(() => readFile(join(input.root, 'conflicting-candidate/candidate.json'), 'utf8'), { code: 'ENOENT' });
  assert.match(await readFile(join(input.root, 'conflicting-candidate/candidate.pending.json'), 'utf8'), /dsh-plugin-candidate\/v1/);
});

test('plugin candidate rejects missing state path and unallowlisted package', async t => {
  const input = await fixture(t);
  await assert.rejects(() => createPluginCandidate({ ...input, statePath: '', profileManifest: input.profile }), /PLUGIN_CANDIDATE_STATE_PATH_REQUIRED/);
  const other = join(input.root, 'other');
  await mkdir(join(other, 'lib'), { recursive: true });
  await writeFile(join(other, 'package.json'), JSON.stringify({ name: '@shine-mage/other', version: '0.1.0', packageManager: `pnpm@${PNPM_VERSION}`, type: 'module', peerDependencies: { '@deepseek-ai/dsh-tools': DSH_SDK_VERSION }, files: ['lib/'] }));
  await writeFile(join(other, 'lib/index.js'), 'export {};\n');
  await assert.rejects(() => createPluginCandidate({ ...input, plugin: other, outputDir: join(input.root, 'other-candidate'), profileManifest: input.profile }), /PLUGIN_CANDIDATE_NOT_ALLOWLISTED/);
});

test('candidate binds service proof and rejects missing/tampered evidence before packing', async t => {
  const input = await fixture(t), { binding, evidenceJson, gate } = await serviceFixture();
  const profilePath = join(input.root, input.profile);
  const profile = JSON.parse(await readFile(profilePath));
  await writeFile(profilePath, JSON.stringify({ ...profile, service_binding: binding }));
  await assert.rejects(() => createPluginCandidate({ ...input, profileManifest: input.profile }), /SERVICE_EVIDENCE_REQUIRED/);
  await assert.rejects(() => readFile(join(input.outputDir, 'candidate.json')), { code: 'ENOENT' });
  const evidencePath = join(input.root, 'service-evidence.json');
  await writeFile(evidencePath, evidenceJson + ' ');
  await assert.rejects(() => createPluginCandidate({ ...input, profileManifest: input.profile, serviceEvidencePath: evidencePath }), /SERVICE_EVIDENCE_DIGEST_MISMATCH/);
  await assert.rejects(() => readFile(input.statePath), { code: 'ENOENT' });
  await writeFile(evidencePath, evidenceJson);
  const result = await createPluginCandidate({ ...input, profileManifest: input.profile, serviceEvidencePath: evidencePath });
  assert.deepEqual(result.service_compatibility, gate);
  assert.deepEqual(JSON.parse(await readFile(input.statePath)).journal.at(-1).service_binding, binding);
  const { candidate_digest, activation, state_scope, ...base } = result;
  assert.equal(candidate_digest, createHash('sha256').update(JSON.stringify(base)).digest('hex'));
});

test('candidate cannot remove a previous profile service contract or request an old writer', async t => {
  const input = await fixture(t), { binding, evidenceJson, evidence } = await serviceFixture();
  const profile = JSON.parse(await readFile(join(input.root, input.profile)));
  const previous = 'config/previous.json', path = join(input.root, 'receipt.json');
  await writeFile(join(input.root, previous), JSON.stringify({ ...profile, service_binding: binding }));
  await assert.rejects(() => createPluginCandidate({ ...input, profileManifest: input.profile, previousProfile: previous }), /SERVICE_BINDING_REMOVAL_FORBIDDEN/);
  await writeFile(join(input.root, input.profile), JSON.stringify({ ...profile, service_binding: { ...binding, source_sha: evidence.baseline } }));
  await writeFile(path, evidenceJson);
  await assert.rejects(() => createPluginCandidate({ ...input, profileManifest: input.profile, serviceEvidencePath: path }), /SERVICE_OLD_WRITER_FORBIDDEN/);
  await assert.rejects(() => readFile(input.statePath), { code: 'ENOENT' });
});

async function detachedPack(t) {
  const input = await fixture(t);
  const packRoot = await mkdtemp(join(tmpdir(), 'dsh-external-pack-'));
  t.after(() => rm(packRoot, { recursive: true, force: true }));
  const packManifest = join(packRoot, 'plugin-pack.json');
  const builderReceipt = join(packRoot, 'builder-provenance.json');
  const previous = process.env.SHINEMAGE_CLEAN_BUILDER;
  process.env.SHINEMAGE_CLEAN_BUILDER = '1';
  try {
    await writeBuildProvenance({ root: input.plugin, outputPath: builderReceipt,
      command: 'synthetic fixture build', networkMode: 'offline' });
  } finally {
    if (previous === undefined) delete process.env.SHINEMAGE_CLEAN_BUILDER;
    else process.env.SHINEMAGE_CLEAN_BUILDER = previous;
  }
  const receipt = await packPlugin({ plugin: input.plugin, outputDir: packRoot, manifestPath: packManifest,
    builderProvenancePath: builderReceipt });
  const packSha256 = createHash('sha256').update(await readFile(packManifest)).digest('hex');
  await rm(input.plugin, { recursive: true });
  return { ...input, plugin: undefined, packManifest, packSha256, receipt, profileManifest: input.profile };
}

test('candidate consumes an external formal pack with all plugin sources absent', async t => {
  const input = await detachedPack(t), result = await createPluginCandidate(input);
  assert.equal(result.plugin.path, 'plugin');
  assert.equal(result.source_sha, input.receipt.source_sha);
  assert.deepEqual(result.pack, input.receipt.tarball);
  assert.deepEqual(await readFile(join(input.outputDir, 'plugin-pack.json')), await readFile(input.packManifest));
  assert.equal(result.activation, 'NOT_RUN');
  assert.equal(JSON.parse(await readFile(input.statePath)).journal.at(-1).status, 'CANDIDATE_PREPARED');
  await assert.rejects(() => createPluginCandidate(input), /PLUGIN_CANDIDATE_OUTPUT_MUST_BE_EMPTY/);
});

test('artifact candidate rejects mixed input, missing pin and an unallowlisted package before writing', async t => {
  const input = await detachedPack(t);
  await assert.rejects(() => createPluginCandidate({ ...input, plugin: join(input.root, 'plugin') }), /PLUGIN_CANDIDATE_INPUT_CONFLICT/);
  await assert.rejects(() => createPluginCandidate({ ...input, packSha256: null }), /PLUGIN_PACK_MANIFEST_DIGEST_REQUIRED/);
  const path = join(input.root, input.profile), profile = JSON.parse(await readFile(path));
  profile.plugins[0].id = '@shine-mage/another-plugin'; await writeFile(path, JSON.stringify(profile));
  await assert.rejects(() => createPluginCandidate(input), /PLUGIN_CANDIDATE_NOT_ALLOWLISTED/);
  await assert.rejects(() => readFile(input.statePath), { code: 'ENOENT' });
  await assert.rejects(() => readFile(join(input.outputDir, 'plugin-pack.json')), { code: 'ENOENT' });
});

test('artifact candidate retains service evidence and previous binding removal gates without sources', async t => {
  const input = await detachedPack(t), { binding, evidenceJson, gate } = await serviceFixture();
  const path = join(input.root, input.profile), original = JSON.parse(await readFile(path));
  await writeFile(path, JSON.stringify({ ...original, service_binding: binding }));
  await assert.rejects(() => createPluginCandidate(input), /SERVICE_EVIDENCE_REQUIRED/);
  const evidence = join(input.root, 'service.json'); await writeFile(evidence, evidenceJson + ' ');
  await assert.rejects(() => createPluginCandidate({ ...input, serviceEvidencePath: evidence }), /SERVICE_EVIDENCE_DIGEST_MISMATCH/);
  await assert.rejects(() => readFile(input.statePath), { code: 'ENOENT' });
  const previous = 'config/previous.json'; await writeFile(join(input.root, previous), await readFile(path));
  await writeFile(path, JSON.stringify(original));
  await assert.rejects(() => createPluginCandidate({ ...input, previousProfile: previous }), /SERVICE_BINDING_REMOVAL_FORBIDDEN/);
  await writeFile(path, JSON.stringify({ ...original, service_binding: binding }));
  await writeFile(evidence, evidenceJson);
  assert.deepEqual((await createPluginCandidate({ ...input, serviceEvidencePath: evidence })).service_compatibility, gate);
});
