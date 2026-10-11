import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { installProfilePacks, loadProfilePacks } from './profile-packs.mjs';
import { parseServeArgs, resolvePluginInputs, validateRuntimeInputs } from '../dsh-dev/serve.mjs';

const exec = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const sdk = { sdk_version: '0.1.7-rc.2', upstream_sha: '477b4f420553e8a52c2fbccc464d7561b239c443' };

// Synthetic runtime packages exercise the real reader and extractor. There is
// deliberately no source directory, Git checkout, SDK, package manager or host.
async function fixture(t, ids = ['@shine-mage/dsh-synthetic-leaf']) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-profile-packs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = { schema_version: 'dsh-profile-pack-inputs/v1', profile: { path: 'profile.json', sha256: '' }, plugins: [] };
  const profile = { schema_version: 'dsh-profile/v1', profile_id: 'synthetic-pack-profile', dsh: sdk, plugins: [] };
  for (const [index, id] of ids.entries()) {
    const directory = join(root, `packs/${index}`), source = join(root, `temporary-pack/${index}`);
    await mkdir(join(source, 'package/lib'), { recursive: true });
    await mkdir(directory, { recursive: true });
    const manifest = { name: id, version: '0.1.0', type: 'module',
      peerDependencies: { '@deepseek-ai/dsh-tools': sdk.sdk_version }, files: ['lib/', 'cordis.patch.yml'],
      exports: { '.': { import: './lib/index.js' } }, main: './lib/index.js', dsh: { bundle: { patch: 'cordis.patch.yml' } } };
    await writeFile(join(source, 'package/package.json'), json(manifest));
    await writeFile(join(source, 'package/lib/index.js'), 'export const synthetic = true;\n');
    await writeFile(join(source, 'package/cordis.patch.yml'), '[]\n');
    const tarName = `${id.slice(1).replaceAll('/', '-')}-0.1.0.tgz`, tar = join(directory, tarName);
    await exec('tar', ['-czf', tar, '-C', source, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const archive = await readFile(tar);
    const receipt = { schema_version: 'dsh-plugin-pack/v1', package_name: id, package_version: '0.1.0',
      dsh_pin: sdk.sdk_version, source_sha: '1'.repeat(40), source_dirty: false,
      activation: 'NOT_RUN', state_path: 'NOT_APPLICABLE_PLUGIN_PACK_ONLY',
      tarball: { name: tarName, bytes: archive.length, sha256: hash(archive) },
      entries: ['cordis.patch.yml', 'lib/index.js', 'package.json'] };
    const bytes = Buffer.from(json(receipt));
    await writeFile(join(directory, 'plugin-pack.json'), bytes);
    input.plugins.push({ id, manifest: `packs/${index}/plugin-pack.json`, sha256: hash(bytes) });
    profile.plugins.push({ id, path: `dsh-plugins/absent-${index}`, build: 'build.mjs', enabled: true });
  }
  await rm(join(root, 'temporary-pack'), { recursive: true });
  const profileBytes = Buffer.from(json(profile));
  await writeFile(join(root, 'profile.json'), profileBytes);
  input.profile.sha256 = hash(profileBytes);
  const inputsPath = join(root, 'inputs.json');
  await writeFile(inputsPath, json(input));
  return { root, input, profile, inputsPath, output: join(root, 'installed') };
}

test('fixed profile assembles the exact runtime bytes without any source or package manager', async t => {
  const f = await fixture(t), packs = await loadProfilePacks(f);
  await assert.rejects(() => access(join(f.root, 'dsh-plugins')));
  const receipt = await installProfilePacks({ packs, output: f.output });
  assert.equal(receipt.profile_sha256, f.input.profile.sha256);
  assert.equal(receipt.inputs_sha256, hash(await readFile(f.inputsPath)));
  assert.equal(receipt.plugins[0].manifest_sha256, f.input.plugins[0].sha256);
  assert.equal(receipt.plugins[0].pack_sha256, packs.plugins[0].receipt.tarball.sha256);
  assert.equal(await readFile(join(receipt.plugins[0].root, 'lib/index.js'), 'utf8'), 'export const synthetic = true;\n');
  assert.equal(receipt.host, 'NOT_RUN');
  assert.equal(receipt.release_ready, false);
  const marker = await readFile(join(f.output, 'profile-pack-install.json'));
  await assert.rejects(() => installProfilePacks({ packs, output: f.output }), { code: 'EEXIST' });
  assert.deepEqual(await readFile(join(f.output, 'profile-pack-install.json')), marker);
});

test('input path and schema are mandatory; no workspace discovery', async t => {
  const f = await fixture(t);
  await assert.rejects(() => loadProfilePacks(), /PROFILE_PACK_INPUTS_REQUIRED/);
  await assert.rejects(() => loadProfilePacks({ inputsPath: 'inputs.json' }), /PROFILE_PACK_INPUTS_REQUIRED/);
  await assert.rejects(() => loadProfilePacks({ inputsPath: join(f.root, 'missing.json') }), { code: 'ENOENT' });
  f.input.schema_version = 'content-pack/v1';
  await writeFile(f.inputsPath, json(f.input));
  await assert.rejects(() => loadProfilePacks(f), /PROFILE_PACK_INPUTS_SCHEMA/);
});

for (const [name, change, code] of [
  ['changed profile', f => { f.input.profile.sha256 = '0'.repeat(64); }, /PROFILE_PACK_PROFILE_DIGEST/],
  ['changed manifest', f => { f.input.plugins[0].sha256 = '0'.repeat(64); }, /PROFILE_PACK_MANIFEST_DIGEST/],
  ['omitted package', f => { f.input.plugins = []; }, /PROFILE_PACK_PLUGINS_REQUIRED/],
  ['different selection', f => { f.input.plugins[0].id = '@shine-mage/dsh-other'; }, /PROFILE_PACK_SELECTION_MISMATCH/],
  ['profile escape', f => { f.input.profile.path = '../profile.json'; }, /PROFILE_PACK_PROFILE_PATH/],
  ['manifest escape', f => { f.input.plugins[0].manifest = '../plugin-pack.json'; }, /PROFILE_PACK_MANIFEST_PATH/],
]) {
  test(`${name} is rejected before an installation directory exists`, async t => {
    const f = await fixture(t); change(f);
    await writeFile(f.inputsPath, json(f.input));
    await assert.rejects(() => loadProfilePacks(f), code);
    await assert.rejects(() => access(f.output));
  });
}

test('matching manifest digest does not excuse a package identity mismatch', async t => {
  const f = await fixture(t);
  f.profile.plugins[0].id = f.input.plugins[0].id = '@shine-mage/dsh-different-leaf';
  const bytes = Buffer.from(json(f.profile));
  await writeFile(join(f.root, 'profile.json'), bytes);
  f.input.profile.sha256 = hash(bytes);
  await writeFile(f.inputsPath, json(f.input));
  await assert.rejects(() => loadProfilePacks(f), /PROFILE_PACK_PACKAGE_ID/);
});

test('modified archive is rejected by the actual formal pack reader', async t => {
  const f = await fixture(t), manifest = JSON.parse(await readFile(join(f.root, f.input.plugins[0].manifest), 'utf8'));
  const path = join(f.root, 'packs/0', manifest.tarball.name), bytes = await readFile(path);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(path, bytes);
  await assert.rejects(() => loadProfilePacks(f), /PLUGIN_PACK_DIGEST_MISMATCH/);
});

test('symlinked manifest parent cannot redirect the package input', async t => {
  const f = await fixture(t);
  await rename(join(f.root, 'packs/0'), join(f.root, 'outside'));
  await symlink(join(f.root, 'outside'), join(f.root, 'packs/0'), 'dir');
  await assert.rejects(() => loadProfilePacks(f), /SERVICE_ARTIFACT_SYMLINK/);
});

test('the profile order binds packages even when each individual pack is valid', async t => {
  const f = await fixture(t, ['@shine-mage/dsh-one', '@shine-mage/dsh-two']);
  f.input.plugins.reverse();
  await writeFile(f.inputsPath, json(f.input));
  await assert.rejects(() => loadProfilePacks(f), /PROFILE_PACK_SELECTION_MISMATCH/);
});

for (const [name, mutate, code] of [
  ['profile', packs => { packs.profile.profile_id = 'different'; }, /PROFILE_PACK_PROFILE_CHANGED/],
  ['receipt', packs => { packs.plugins[0].receipt.source_sha = '2'.repeat(40); }, /PROFILE_PACK_RECEIPT_CHANGED/],
  ['manifest', packs => { packs.plugins[0].manifestBytes[0] ^= 1; }, /PROFILE_PACK_MANIFEST_DIGEST/],
  ['archive', packs => { packs.plugins[0].archive[0] ^= 1; }, /PROFILE_PACK_ARCHIVE_CHANGED/],
]) {
  test(`mutated held ${name} fails before any installation output`, async t => {
    const f = await fixture(t), packs = await loadProfilePacks(f);
    mutate(packs);
    await assert.rejects(() => installProfilePacks({ packs, output: f.output }), code);
    await assert.rejects(() => access(f.output));
  });
}

const workbenchOnly = inputsPath => parseServeArgs(['--plugin', 'on', '--pack-inputs', inputsPath,
  '--waterfall', 'off', '--crowd-action', 'off', '--query', 'off', '--board', 'off', '--funnel', 'off']);

test('caller mutations after installation starts cannot alter the bytes or identity being installed', async t => {
  const f = await fixture(t), packs = await loadProfilePacks(f);
  const expected = structuredClone(packs.plugins[0].receipt);
  const pending = installProfilePacks({ packs, output: f.output });
  packs.plugins[0].archive[0] ^= 1;
  packs.plugins[0].manifestBytes[0] ^= 1;
  packs.plugins[0].receipt.tarball.sha256 = '0'.repeat(64);
  packs.profile.profile_id = 'caller-mutated-profile';
  const receipt = await pending;
  assert.equal(receipt.profile_id, f.profile.profile_id);
  assert.equal(receipt.plugins[0].pack_sha256, expected.tarball.sha256);
  assert.equal(await readFile(join(receipt.plugins[0].root, 'lib/index.js'), 'utf8'), 'export const synthetic = true;\n');
});

test('dev package preflight binds enabled roles and rejects mixed author paths', async t => {
  const f = await fixture(t, ['@shine-mage/dsh-analytics-workbench-b0']);
  const options = workbenchOnly(f.inputsPath), loaded = await resolvePluginInputs(options);
  assert.deepEqual(loaded.selected, { pluginPath: '@shine-mage/dsh-analytics-workbench-b0' });
  await assert.rejects(() => resolvePluginInputs({ ...options, pluginPath: '/abs/workbench' }), /DSH_DEV_PLUGIN_INPUT_CONFLICT/);
  await assert.rejects(() => resolvePluginInputs({ ...options, shineQuery: 'on' }), /DSH_DEV_PROFILE_PLUGIN_MISSING/);
});

test('reload preflight validates upstream before any runtime writes', async t => {
  const f = await fixture(t, ['@shine-mage/dsh-analytics-workbench-b0']);
  const options = { ...workbenchOnly(f.inputsPath), upstream: join(f.root, 'missing-dsh'), runtime: join(f.root, 'must-not-exist') };
  await assert.rejects(() => validateRuntimeInputs(options), /not a built pinned DSH checkout/);
  await assert.rejects(() => access(options.runtime));
});

test('a service-bound profile cannot bypass candidate admission through the dev launcher', async t => {
  const f = await fixture(t, ['@shine-mage/dsh-analytics-workbench-b0']);
  f.profile.service_binding = { schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase',
    source_sha: '3'.repeat(40), api_version: '1.0.0', state: { owner: 'analysis-service', application_id: 1397572502,
      schema_version: 1, contract: 'analytics-first-purchase-saved-provenance/v1' },
    access: 'read-write', lifecycle: 'external', rollback: 'preserve-service-and-state', evidence_sha256: '4'.repeat(64) };
  const bytes = Buffer.from(json(f.profile));
  await writeFile(join(f.root, 'profile.json'), bytes);
  f.input.profile.sha256 = hash(bytes);
  await writeFile(f.inputsPath, json(f.input));
  assert.deepEqual((await loadProfilePacks(f)).profile.service_binding, f.profile.service_binding);
  await assert.rejects(() => resolvePluginInputs(workbenchOnly(f.inputsPath)), /DSH_DEV_SERVICE_PROFILE_USE_CANDIDATE_HARNESS/);
  await assert.rejects(() => access(f.output));
});
