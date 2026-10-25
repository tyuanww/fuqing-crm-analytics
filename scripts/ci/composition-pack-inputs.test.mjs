import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, cp, link, mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fixture } from '../crm-calibration/test-support/formal-packs.fixture.mjs';
import { generateBusinessProfile, inspectGitHubArtifact, loadCompositionArtifactReference, prepareCompositionPacks } from './composition-pack-inputs.mjs';
import { TOOLCHAIN } from '../release/toolchain.mjs';
import { loadReleasePacks, prepareReleasePayload } from '../release/release-profile-packs.mjs';
import { collectAllowlist, packArtifact, receiveArtifact } from '../release/artifact.mjs';
import { collectReleaseReadiness } from '../release/readiness.mjs';

const exec = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const python = process.env.FQ_B0_PYTHON ?? 'python3';

async function inputs(t, mutate, selected = ['crm', 'knowledge', 'page']) {
  const f = await fixture(t, selected, mutate);
  const inputDirectory = join(f.root, 'input'), profileRoot = join(f.root, 'profiles');
  await mkdir(inputDirectory); await mkdir(profileRoot);
  await cp(join(f.root, 'packs'), join(inputDirectory, 'packs'), { recursive: true });
  const lock = { schema_version: 'shinemage-composition-pack-lock/v1', profiles: [], plugins: [] };
  for (const name of ['crm', 'page']) {
    const profile = { ...f.profile, plugins: f.profile.plugins.filter(row =>
      name === 'crm' ? ['@shine-mage/dsh-crm-knowledge', '@shine-mage/dsh-knowledge'].includes(row.id)
        : !['@shine-mage/dsh-crm-knowledge', '@shine-mage/dsh-knowledge'].includes(row.id)) };
    const bytes = Buffer.from(json(profile)), path = `${name}.json`;
    await writeFile(join(profileRoot, path), bytes);
    lock.profiles.push({ name, path, sha256: hash(bytes) });
  }
  for (const row of f.inputs.plugins) {
    const receipt = JSON.parse(await readFile(join(inputDirectory, row.manifest)));
    lock.plugins.push({ directory: row.manifest.split('/')[1], id: row.id, source_sha: receipt.source_sha,
      version: receipt.package_version, manifest_sha256: row.sha256 });
  }
  const lockPath = join(f.root, 'lock.json'), output = join(f.root, 'prepared');
  await writeFile(lockPath, json(lock));
  return { ...f, inputDirectory, profileRoot, lock, lockPath, output };
}

async function businessInputs(t) {
  const f = await inputs(t, undefined, ['crm', 'knowledge', 'page', 'brand', 'waterfall', 'crowd-action', 'query', 'board', 'funnel']);
  const businessProfile = 'config/dsh-profile.business.rc3.json';
  const business = { ...f.profile, profile_id: 'business-rc3' };
  await mkdir(join(f.profileRoot, 'config'));
  await writeFile(join(f.profileRoot, businessProfile), json(business));
  return { ...f, businessProfile, business };
}

test('business preparation binds the complete ordered union and paired runtime selection', async t => {
  const f = await businessInputs(t), proof = await prepareCompositionPacks(f);
  assert.deepEqual(proof.profiles.map(row => row.name), ['crm', 'page']);
  assert.equal(proof.env.DSH_PROFILE_MANIFEST, f.businessProfile);
  assert.equal(proof.env.DSH_PROFILE_PACK_INPUTS, join(f.output, 'business-inputs.json'));
  const input = JSON.parse(await readFile(proof.env.DSH_PROFILE_PACK_INPUTS));
  assert.deepEqual(input.plugins.map(row => row.id), f.profile.plugins.map(row => row.id));
  assert.equal(input.plugins.length, 9);
  const bytes = await readFile(join(f.profileRoot, f.businessProfile));
  assert.deepEqual(await readFile(join(f.output, input.profile.path)), bytes);
  assert.equal(input.profile.sha256, hash(bytes));
  assert.equal(f.business.service_binding, undefined);
  for (const row of f.inputs.plugins) {
    const receipt = JSON.parse(await readFile(join(f.inputDirectory, row.manifest)));
    const path = join(dirname(row.manifest), receipt.tarball.name);
    assert.deepEqual(await readFile(join(f.output, path)), await readFile(join(f.inputDirectory, path)));
  }
});

test('business profile drift is rejected before output creation', async t => {
  const f = await businessInputs(t);
  for (const [name, mutate] of [
    ['missing', p => { p.plugins.pop(); }],
    ['extra', p => { p.plugins.push({ ...p.plugins[0], id: '@shine-mage/extra', path: 'dsh-plugins/extra' }); }],
    ['duplicate', p => { p.plugins.push(p.plugins[0]); }],
    ['order', p => { p.plugins.reverse(); }],
    ['plugin-path', p => { p.plugins[0].path = 'dsh-plugins/replaced'; }],
    ['pin', p => { p.dsh.upstream_sha = '0'.repeat(40); }],
    ['identity', p => { p.profile_id = 'page-only'; }],
    ['service', p => { p.service_binding = {}; }],
  ]) {
    const profile = structuredClone(f.business); mutate(profile);
    await writeFile(join(f.profileRoot, f.businessProfile), json(profile));
    await assert.rejects(prepareCompositionPacks(f), /CI_COMPOSITION_BUSINESS_PROFILE_DRIFT/, name);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  }
  await writeFile(join(f.profileRoot, f.businessProfile), JSON.stringify(f.business));
  await assert.rejects(prepareCompositionPacks(f), /CI_COMPOSITION_BUSINESS_PROFILE_DRIFT/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('business profile paths cannot escape, alias sources or collide with prepared output', async t => {
  const f = await businessInputs(t);
  for (const businessProfile of ['../outside.json', join(f.root, 'outside.json'), 'crm.json', 'page.json',
    'preparation.json', 'crm-inputs.json', 'page-inputs.json', 'business-inputs.json', 'toolchain.json',
    'packs/business.json', 'domain/business.json', 'runs/business.json']) {
    await assert.rejects(prepareCompositionPacks({ ...f, businessProfile }), /CI_COMPOSITION_BUSINESS_PROFILE_PATH/);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  }
  await symlink(join(f.profileRoot, f.businessProfile), join(f.profileRoot, 'alias.json'));
  await assert.rejects(prepareCompositionPacks({ ...f, businessProfile: 'alias.json' }), /SERVICE_ARTIFACT_SYMLINK/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('the reproducible business projection checks raw bytes and regenerates from locked sources', async t => {
  const f = await businessInputs(t), path = join(f.profileRoot, f.businessProfile);
  const expected = await readFile(path);
  await generateBusinessProfile({ ...f, check: true });
  await writeFile(path, JSON.stringify(f.business));
  await assert.rejects(generateBusinessProfile({ ...f, check: true }), /CI_COMPOSITION_BUSINESS_PROFILE_DRIFT/);
  const generated = await generateBusinessProfile(f);
  assert.deepEqual(await readFile(path), expected);
  assert.equal(generated.sha256, hash(expected));
  await generateBusinessProfile(f);
  assert.deepEqual(await readFile(path), expected);
  for (const businessProfile of ['crm.json', '../outside.json', 'business-inputs.json']) {
    await assert.rejects(generateBusinessProfile({ ...f, businessProfile }), /CI_COMPOSITION_BUSINESS_PROFILE_PATH/);
  }
  const source = join(f.profileRoot, 'crm.json'), before = await readFile(source);
  await link(source, join(f.profileRoot, 'alias.json'));
  await assert.rejects(generateBusinessProfile({ ...f, businessProfile: 'alias.json' }), /CI_COMPOSITION_BUSINESS_PROFILE_PATH/);
  assert.deepEqual(await readFile(source), before);
  const cli = fileURLToPath(new URL('./composition-pack-inputs.mjs', import.meta.url));
  await exec(process.execPath, [cli, '--check-business-profile', 'config/dsh-profile.business.rc3.json']);
  await assert.rejects(exec(process.execPath, [cli, '--check-business-profile', 'config/dsh-profile.business.rc3.json',
    '--output', f.output]), /CI_COMPOSITION_ARGUMENTS/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('business generator preserves its active composition lock', async t => {
  const f = await businessInputs(t), businessProfile = 'config/source-lock.json';
  const lockPath = join(f.profileRoot, businessProfile), before = await readFile(f.lockPath);
  await writeFile(lockPath, before);
  await assert.rejects(generateBusinessProfile({ ...f, lockPath, businessProfile }), /CI_COMPOSITION_BUSINESS_PROFILE_PATH/);
  assert.deepEqual(await readFile(lockPath), before);
});

test('business generator preserves source profiles through filesystem case aliases', async t => {
  const f = await businessInputs(t);
  for (const row of f.lock.profiles) {
    const alias = row.path.toUpperCase(), source = join(f.profileRoot, row.path);
    const actual = await realpath(join(f.profileRoot, alias)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (actual === null) { t.skip('filesystem is case-sensitive'); return; }
    assert.equal(actual, await realpath(source));
    const before = await readFile(source);
    await assert.rejects(generateBusinessProfile({ ...f, businessProfile: alias }), /CI_COMPOSITION_BUSINESS_PROFILE_PATH/);
    assert.deepEqual(await readFile(source), before);
  }
});

test('business mode preserves proof, source, peer, source overlap and service declaration gates', async t => {
  const f = await businessInputs(t), manifestPath = join(f.inputDirectory, f.inputs.plugins[0].manifest);
  const original = JSON.parse(await readFile(manifestPath));
  for (const [key, code] of [['generated_bytes_provenance', /PLUGIN_PACK_BUILD_PROVENANCE_REQUIRED/],
    ['source_sha', /PLUGIN_PACK_GIT_SHA_INVALID/]]) {
    const receipt = structuredClone(original); delete receipt[key];
    const bytes = Buffer.from(json(receipt)); await writeFile(manifestPath, bytes);
    f.lock.plugins[0].manifest_sha256 = hash(bytes); await writeFile(f.lockPath, json(f.lock));
    await assert.rejects(prepareCompositionPacks(f), code);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  }
  await writeFile(manifestPath, json(original));
  f.lock.plugins[0].manifest_sha256 = hash(Buffer.from(json(original)));
  const sourcePath = join(f.profileRoot, f.lock.profiles[0].path);
  const source = JSON.parse(await readFile(sourcePath));
  const binding = { schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase',
    source_sha: '1'.repeat(40), api_version: '1.0.0', access: 'read-write', lifecycle: 'external',
    rollback: 'preserve-service-and-state', evidence_sha256: '2'.repeat(64),
    state: { owner: 'analysis-service', application_id: 1397572502, schema_version: 1, contract: 'analytics-first-purchase-saved-provenance/v1' } };
  for (const name of ['crm', 'page']) {
    const row = f.lock.profiles.find(row => row.name === name), path = join(f.profileRoot, row.path);
    const before = await readFile(path), profile = JSON.parse(before);
    profile.service_binding = binding;
    const bytes = Buffer.from(json(profile)); await writeFile(path, bytes);
    row.sha256 = hash(bytes); await writeFile(f.lockPath, json(f.lock));
    await assert.rejects(prepareCompositionPacks(f), /CRM_COMPOSITION_SERVICE_BINDING_REQUIRES_CANDIDATE/);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
    await writeFile(path, before); row.sha256 = hash(before);
  }
  source.plugins.push(f.business.plugins[2]);
  const bytes = Buffer.from(json(source)); await writeFile(sourcePath, bytes);
  f.lock.profiles[0].sha256 = hash(bytes); await writeFile(f.lockPath, json(f.lock));
  await assert.rejects(prepareCompositionPacks(f), /CI_COMPOSITION_PROFILE_OVERLAP/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
  const peer = await inputs(t, manifest => { delete manifest.peerDependencies['@deepseek-ai/dsh-tools']; });
  await assert.rejects(prepareCompositionPacks({ ...peer, businessProfile: 'business.json' }), /PLUGIN_PACK_DSH_PEER_INVALID/);
  await assert.rejects(access(peer.output), { code: 'ENOENT' });
});

test('business inputs flow through readiness, release archive and receiver with nine exact packs', async t => {
  const f = await businessInputs(t), proof = await prepareCompositionPacks(f);
  await writeFile(join(f.profileRoot, 'VERSION'), '0.20.0.0\n');
  await exec('git', ['init', '-q', f.profileRoot]);
  const manifestPath = proof.env.DSH_PROFILE_MANIFEST, inputsPath = proof.env.DSH_PROFILE_PACK_INPUTS;
  const readiness = await collectReleaseReadiness({ root: f.profileRoot, profileManifest: manifestPath,
    profilePackInputs: inputsPath, requireClean: false, requireRuntime: false, requireUpstream: false });
  assert.equal(readiness.checks.find(row => row.name === 'plugin-packs').ok, true);
  assert.equal(readiness.pluginPacks.plugins.length, 9);
  for (const [wrongManifest, wrongInputs] of [[f.lock.profiles[0].path, inputsPath],
    [f.lock.profiles[1].path, inputsPath], [manifestPath, proof.env.CRM_COMPOSITION_PAGE_INPUTS],
    [manifestPath, proof.env.CRM_COMPOSITION_PACK_INPUTS]]) {
    await assert.rejects(loadReleasePacks({ root: f.profileRoot, manifestPath: wrongManifest, inputsPath: wrongInputs }), /RELEASE_PACK_PROFILE_MISMATCH/);
    const output = join(f.root, 'wrong-profile-payload');
    await assert.rejects(prepareReleasePayload({ root: f.profileRoot, manifestPath: wrongManifest, inputsPath: wrongInputs, output, python }),
      /RELEASE_PACK_PROFILE_MISMATCH/);
    await assert.rejects(access(output), { code: 'ENOENT' });
  }
  const output = join(f.root, 'payload');
  const receipt = await prepareReleasePayload({ root: f.profileRoot, manifestPath, inputsPath, output, python });
  const files = await collectAllowlist(output), artifact = join(f.root, 'business.tar.zst');
  const packed = await packArtifact({ rootDir: output, allowlist: files, output: artifact });
  const manifest = { schema_version: 'release-manifest/v1', release_tag: 'dsh-business-test', product_version: '0.20.0.0',
    source_sha: '2'.repeat(40), dsh_upstream_sha: f.business.dsh.upstream_sha,
    archive_allowlist: files, denylist_version: 'release-denylist/v1', artifact_bytes: packed.bytes, artifact_sha256: packed.sha256,
    profile_snapshot: { path: receipt.profile_path, sha256: hash(await readFile(join(f.profileRoot, manifestPath))) },
    profile_pack_snapshot: receipt.profile_pack_snapshot,
    payload: await Promise.all(files.map(async path => { const bytes = await readFile(join(output, path));
      return { path, role: 'runtime-source', bytes: bytes.length, sha256: hash(bytes) }; })) };
  const releaseManifest = join(f.root, 'manifest.json'); await writeFile(releaseManifest, json(manifest));
  const destination = join(f.root, 'received');
  await receiveArtifact({ artifact, manifestPath: releaseManifest, destination });
  assert.deepEqual((await readdir(join(destination, 'dsh-plugins'))).sort(), f.profile.plugins.map(row => row.path.split('/')[1]).sort());
  const received = await loadReleasePacks({ root: destination, manifestPath,
    inputsPath: join(destination, receipt.profile_pack_snapshot.path), requireGeneratedProvenance: true });
  assert.deepEqual(received.plugins.map(row => row.id), f.profile.plugins.map(row => row.id));
  for (const [index, row] of received.plugins.entries()) {
    const source = f.inputs.plugins[index];
    const original = JSON.parse(await readFile(join(f.inputDirectory, source.manifest)));
    assert.deepEqual(row.archive, await readFile(join(f.inputDirectory, dirname(source.manifest), original.tarball.name)));
    for (const entry of row.receipt.entries.filter(path => path.startsWith('lib/'))) {
      assert.equal(await readFile(join(destination, row.path, entry), 'utf8'),
        'throw new Error("synthetic profile preparation must never execute this package");\n');
    }
  }
});

test('CLI passes business selection through directory, archive and offline GitHub acquisition', async t => {
  const f = await businessInputs(t), sandbox = join(f.root, 'cli'), ci = join(sandbox, 'scripts/ci');
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  await cp(f.profileRoot, sandbox, { recursive: true });
  await mkdir(ci, { recursive: true });
  for (const name of ['composition-pack-inputs.mjs', 'unpack-composition-inputs.py']) {
    await cp(join(repo, 'scripts/ci', name), join(ci, name));
  }
  for (const name of ['release', 'dsh-dev', 'crm-calibration']) {
    await symlink(join(repo, 'scripts', name), join(sandbox, 'scripts', name));
  }
  await writeFile(join(sandbox, 'config/shinemage-composition-packs.lock.json'), json(f.lock));
  const archive = join(f.root, 'packs.zip');
  await exec(python, ['-I', '-B', '-c', `
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w') as z:
    for path in sorted(root.rglob('*')):
        if path.is_file(): z.write(path, path.relative_to(root).as_posix())
`, f.inputDirectory, archive]);
  const archiveBytes = await readFile(archive), bin = join(f.root, 'bin'), calls = join(f.root, 'gh-calls.jsonl');
  await mkdir(bin);
  await writeFile(join(bin, 'gh'), `#!${process.execPath}\n` + `
import { appendFile, readFile } from 'node:fs/promises';
const route = process.argv[3];
await appendFile(${JSON.stringify(calls)}, JSON.stringify(route) + '\\n');
if (route.endsWith('/zip')) process.stdout.write(await readFile(${JSON.stringify(archive)}));
else if (route.includes('/actions/artifacts/')) console.log(JSON.stringify({
  id: 123, expired: false, digest: 'sha256:${hash(archiveBytes)}', size_in_bytes: ${archiveBytes.length},
  workflow_run: { id: 456, head_sha: '${'b'.repeat(40)}' }
}));
else if (route.endsWith('/actions/runs/456')) console.log(JSON.stringify({
  id: 456, status: 'completed', conclusion: 'success', head_sha: '${'b'.repeat(40)}'
}));
else process.exit(1);
`, { mode: 0o700 });
  const artifactLock = join(sandbox, 'config/artifact.json');
  await writeFile(artifactLock, json({ schema_version: 'dsh-composition-artifact/v1', repository: 'tyuanww/fuqing-crm-analytics',
    id: 123, sha256: hash(archiveBytes), runId: 456, headSha: 'b'.repeat(40),
    composition_lock_sha256: hash(Buffer.from(json(f.lock))) }));
  const cli = await realpath(join(ci, 'composition-pack-inputs.mjs'));
  for (const [name, selector] of [['directory', ['--input-dir', f.inputDirectory]], ['archive', ['--archive', archive]],
    ['github', ['--artifact-lock', artifactLock]]]) {
    const output = join(f.root, `cli-${name}`), githubEnv = join(f.root, `${name}.env`);
    await writeFile(githubEnv, '');
    const { stdout } = await exec(process.execPath, [cli, ...selector, '--business-profile', f.businessProfile,
      '--output', output, '--python', python, '--github-env', githubEnv], {
      cwd: sandbox, env: { ...process.env, GH_TOKEN: 'synthetic-gh-test', PATH: `${bin}:${process.env.PATH}` },
    });
    const proof = JSON.parse(stdout), env = await readFile(githubEnv, 'utf8');
    assert.equal(proof.env.DSH_PROFILE_MANIFEST, f.businessProfile);
    assert.equal(proof.env.DSH_PROFILE_PACK_INPUTS, join(output, 'business-inputs.json'));
    assert.ok(env.includes(`DSH_PROFILE_MANIFEST=${f.businessProfile}\n`));
    assert.ok(env.includes(`DSH_PROFILE_PACK_INPUTS=${join(output, 'business-inputs.json')}\n`));
    const loaded = await loadReleasePacks({ root: sandbox, manifestPath: proof.env.DSH_PROFILE_MANIFEST,
      inputsPath: proof.env.DSH_PROFILE_PACK_INPUTS, requireGeneratedProvenance: true });
    assert.deepEqual(loaded.plugins.map(row => row.id), f.profile.plugins.map(row => row.id));
    const profilePath = join(sandbox, f.businessProfile), before = await readFile(profilePath);
    await writeFile(profilePath, Buffer.concat([before, Buffer.from('\n')]));
    const rejected = join(f.root, `rejected-${name}`);
    await assert.rejects(exec(process.execPath, [cli, ...selector, '--business-profile', f.businessProfile,
      '--output', rejected, '--python', python], {
      cwd: sandbox, env: { ...process.env, GH_TOKEN: 'synthetic-gh-test', PATH: `${bin}:${process.env.PATH}` },
    }), /CI_COMPOSITION_BUSINESS_PROFILE_DRIFT/);
    await assert.rejects(access(rejected), { code: 'ENOENT' });
    await writeFile(profilePath, before);
  }
  const routes = (await readFile(calls, 'utf8')).trim().split('\n').map(row => JSON.parse(row));
  assert.equal(routes.length, 6);
  assert.equal(routes.filter(route => route.endsWith('/zip')).length, 2);
});

test('preparation copies sealed bytes and existing profiles, without executing package code', async t => {
  const f = await inputs(t), proof = await prepareCompositionPacks(f);
  assert.equal(proof.plugins.length, 3);
  assert.equal(proof.release_ready, false);
  assert.equal(proof.remote_ci, 'NOT_RUN');
  for (const row of f.inputs.plugins) {
    assert.deepEqual(await readFile(join(f.output, row.manifest)), await readFile(join(f.inputDirectory, row.manifest)));
  }
  assert.deepEqual(Object.keys(proof.env), ['CRM_COMPOSITION_PACK_INPUTS', 'CRM_COMPOSITION_PAGE_INPUTS', 'CRM_COMPOSITION_OUTPUT']);
});

test('explicit toolchain is copied into the prepared inputs for downstream consumers', async t => {
  const f = await inputs(t), toolchain = { ...TOOLCHAIN };
  const proof = await prepareCompositionPacks({ ...f, toolchain });
  const path = join(f.output, 'toolchain.json');
  assert.equal(proof.env.DSH_COMPOSITION_TOOLCHAIN, path);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), toolchain);
});

test('missing and digest-changed inputs fail before output creation', async t => {
  const f = await inputs(t);
  f.lock.plugins[0].manifest_sha256 = '0'.repeat(64);
  await writeFile(f.lockPath, json(f.lock));
  await assert.rejects(prepareCompositionPacks(f), /CI_COMPOSITION_MANIFEST_DIGEST/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
  await assert.rejects(prepareCompositionPacks({ ...f, inputDirectory: join(f.root, 'absent') }), /ENOENT/);
});

test('a valid pack cannot substitute another source SHA or version', async t => {
  const f = await inputs(t);
  for (const [key, value, code] of [['source_sha', 'f'.repeat(40), /CI_COMPOSITION_SOURCE_MISMATCH/],
    ['version', '9.9.9', /CI_COMPOSITION_PACKAGE_VERSION/]]) {
    const old = f.lock.plugins[0][key]; f.lock.plugins[0][key] = value;
    await writeFile(f.lockPath, json(f.lock));
    await assert.rejects(prepareCompositionPacks(f), code);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
    f.lock.plugins[0][key] = old;
  }
});

test('profile drift and invalid domain peers fail before outputs or runtime startup', async t => {
  const f = await inputs(t, (manifest, domain) => {
    if (domain === 'crm') manifest.peerDependencies['@deepseek-ai/cordis'] = '4.0.2';
  });
  await assert.rejects(prepareCompositionPacks(f), /CRM_COMPOSITION_CORDIS_PIN/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
  f.lock.profiles[0].sha256 = '0'.repeat(64);
  await writeFile(f.lockPath, json(f.lock));
  await assert.rejects(prepareCompositionPacks(f), /CI_COMPOSITION_PROFILE_DIGEST/);
});

test('input links and output aliases cannot mutate the input tree', async t => {
  const f = await inputs(t), alias = join(f.root, 'alias');
  await symlink(f.inputDirectory, alias);
  await assert.rejects(prepareCompositionPacks({ ...f, inputDirectory: alias }), /CI_COMPOSITION_PACK_DIRECTORY_INVALID/);
  await assert.rejects(prepareCompositionPacks({ ...f, output: join(alias, 'prepared') }), /CI_COMPOSITION_OUTPUT_INSIDE_INPUT/);
  await assert.rejects(prepareCompositionPacks({ ...f, output: 'relative' }), /CI_COMPOSITION_OUTPUT_REQUIRED/);
});

test('a second preparation rejects EEXIST and preserves the first receipts', async t => {
  const f = await inputs(t); await prepareCompositionPacks(f);
  const path = join(f.output, 'preparation.json'), before = await readFile(path);
  await assert.rejects(prepareCompositionPacks(f), { code: 'EEXIST' });
  assert.deepEqual(await readFile(path), before);
});

test('bounded ZIP receiving accepts only pack files and rejects traversal, duplicates and links', async t => {
  const f = await inputs(t), source = fileURLToPath(new URL('./unpack-composition-inputs.py', import.meta.url));
  for (const kind of ['valid', 'valid-domain', 'domain-extra', 'domain-traversal', 'traversal', 'duplicate', 'symlink']) {
    const archive = join(f.root, `${kind}.zip`), output = join(f.root, `${kind}-unpacked`);
    await exec(python, ['-I', '-B', '-c', `
import pathlib, stat, sys, zipfile
path, kind = sys.argv[1:]
with zipfile.ZipFile(path, 'w') as z:
    name = {'valid-domain': 'domain/board-components-pack.json', 'domain-extra': 'domain/credentials.json', 'domain-traversal': 'domain/../escape', 'traversal': '../escape'}.get(kind, 'packs/crm/plugin-pack.json')
    info = zipfile.ZipInfo(name)
    info.external_attr = (stat.S_IFLNK | 0o777) << 16 if kind == 'symlink' else (stat.S_IFREG | 0o600) << 16
    z.writestr(info, b'{}')
    if kind == 'duplicate': z.writestr(info, b'{}')
`, archive, kind]);
    for (const optimized of [false, true]) {
      const destination = optimized ? output + '-optimized' : output;
      const args = ['-I', '-B', ...(optimized ? ['-O'] : []), source, archive, destination];
      if (kind === 'valid' || kind === 'valid-domain') {
        await exec(python, args);
        assert.equal((await readFile(join(destination, kind === 'valid' ? 'packs/crm/plugin-pack.json' : 'domain/board-components-pack.json'))).toString(), '{}');
      } else {
        await assert.rejects(exec(python, args), /CI_COMPOSITION_ARCHIVE_/);
        await assert.rejects(access(destination), { code: 'ENOENT' });
      }
    }
  }
});

test('artifact metadata cannot replace the pinned identity, digest or bounded unexpired archive', () => {
  const options = { repository: 'tyuanww/dsh-analytics-workbench', id: 123, sha256: 'a'.repeat(64) };
  const artifact = { id: 123, expired: false, digest: `sha256:${options.sha256}`, size_in_bytes: 1024,
    workflow_run: { id: 456, head_sha: 'f'.repeat(40) } };
  inspectGitHubArtifact(artifact, options);
  for (const change of [{ id: 999 }, { expired: true }, { digest: 'sha256:' + 'b'.repeat(64) },
    { size_in_bytes: 65 * 1024 * 1024 }, { workflow_run: null }, { workflow_run: { id: 456 } }]) {
    assert.throws(() => inspectGitHubArtifact({ ...artifact, ...change }, options), /CI_COMPOSITION_ARTIFACT_/);
  }
  assert.throws(() => inspectGitHubArtifact(artifact, { ...options, repository: '../another' }), /CI_COMPOSITION_ARTIFACT_REPOSITORY/);
});

test('hosted preparation without explicit read authorization never invokes gh or creates an output', async t => {
  const f = await inputs(t), cli = fileURLToPath(new URL('./composition-pack-inputs.mjs', import.meta.url));
  await assert.rejects(exec(process.execPath, [cli, '--repository', 'tyuanww/dsh-analytics-workbench', '--artifact-id', '123',
    '--artifact-sha256', 'a'.repeat(64), '--output', f.output], { env: { ...process.env, GH_TOKEN: '', PATH: '/nonexistent' } }),
  /CI_COMPOSITION_ARTIFACT_AUTH_REQUIRED/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('versioned artifact reference binds the same composition lock before network acquisition', async t => {
  const f = await inputs(t), artifactLockPath = join(f.root, 'artifact.json');
  const reference = { schema_version: 'dsh-composition-artifact/v1', repository: 'tyuanww/fuqing-crm-analytics',
    id: 123, sha256: 'a'.repeat(64), runId: 456, headSha: 'b'.repeat(40),
    composition_lock_sha256: hash(await readFile(f.lockPath)) };
  await writeFile(artifactLockPath, json(reference));
  assert.deepEqual(await loadCompositionArtifactReference({ artifactLockPath, compositionLockPath: f.lockPath }), {
    repository: reference.repository, id: 123, sha256: reference.sha256, runId: 456, headSha: reference.headSha,
  });
  for (const change of [{ runId: 0 }, { headSha: 'bad' }, { id: -1 }, { composition_lock_sha256: '0'.repeat(64) },
    { schema_version: 'content-pack/v1' }, { unknown: true }]) {
    await writeFile(artifactLockPath, json({ ...reference, ...change }));
    await assert.rejects(loadCompositionArtifactReference({ artifactLockPath, compositionLockPath: f.lockPath }), /CI_COMPOSITION_ARTIFACT_/);
  }
  await writeFile(artifactLockPath, json(reference));
  await writeFile(f.lockPath, json({ ...f.lock, plugins: [] }));
  await assert.rejects(loadCompositionArtifactReference({ artifactLockPath, compositionLockPath: f.lockPath }), /CI_COMPOSITION_ARTIFACT_COMPOSITION_DIGEST/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('artifact reference rejects a different successful workflow run or head', () => {
  const reference = { repository: 'tyuanww/fuqing-crm-analytics', id: 123, sha256: 'a'.repeat(64), runId: 456, headSha: 'b'.repeat(40) };
  const artifact = { id: 123, expired: false, digest: `sha256:${reference.sha256}`, size_in_bytes: 1024,
    workflow_run: { id: 456, head_sha: reference.headSha } };
  inspectGitHubArtifact(artifact, reference);
  assert.throws(() => inspectGitHubArtifact({ ...artifact, workflow_run: { id: 789, head_sha: reference.headSha } }, reference), /CI_COMPOSITION_ARTIFACT_RUN_ID/);
  assert.throws(() => inspectGitHubArtifact({ ...artifact, workflow_run: { id: 456, head_sha: 'c'.repeat(40) } }, reference), /CI_COMPOSITION_ARTIFACT_HEAD_SHA/);
});

test('artifact lock cannot be mixed with another input selector or remote identity', async t => {
  const f = await inputs(t), cli = fileURLToPath(new URL('./composition-pack-inputs.mjs', import.meta.url));
  for (const extra of [['--archive', '/unused.zip'], ['--input-dir', '/unused'], ['--repository', 'tyuanww/fuqing-crm-analytics'],
    ['--artifact-id', '123'], ['--artifact-sha256', 'a'.repeat(64)]]) {
    await assert.rejects(exec(process.execPath, [cli, '--artifact-lock', '/must-not-read.json', '--output', f.output, ...extra],
      { env: { ...process.env, GH_TOKEN: '', PATH: '/nonexistent' } }), /CI_COMPOSITION_(INPUT_REQUIRED|ARGUMENTS)/);
  }
  await assert.rejects(exec(process.execPath, [cli, '--output', f.output]), /CI_COMPOSITION_INPUT_REQUIRED/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('all hosted composition callers select the checked-in artifact and source manifest', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  await loadCompositionArtifactReference({ artifactLockPath: join(root, 'config/shinemage-composition-artifact.lock.json') });
  for (const name of ['lint.yml', 'dsh-b0.yml', 'dsh-release-preflight.yml']) {
    const workflow = await readFile(join(root, '.github/workflows', name), 'utf8');
    assert.ok(workflow.includes('--artifact-lock "$GITHUB_WORKSPACE/config/shinemage-composition-artifact.lock.json"'), name);
    assert.ok(workflow.includes('--manifest "$GITHUB_WORKSPACE/config/shinemage-composition-pack-manifest.v1.json"'), name);
    assert.doesNotMatch(workflow, /vars\.SHINEMAGE_PACK_ARTIFACT_/, name);
  }
  const preflight = await readFile(join(root, '.github/workflows/dsh-release-preflight.yml'), 'utf8');
  assert.ok(preflight.includes("'config/shinemage-composition*.json'"));
});

test('GitHub acquisition confines CLI state to its owned temporary directory', async t => {
  const f = await inputs(t), bin = join(f.root, 'bin'), observed = join(f.root, 'gh-state.json');
  await mkdir(bin);
  const command = `#!${process.execPath}\n` + `
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const base = process.env.XDG_STATE_HOME || join(process.env.HOME || '.', '.local', 'state');
const state = join(base, 'gh', 'device-id');
await mkdir(dirname(state), { recursive: true });
await writeFile(state, 'owned synthetic device identity');
await writeFile(${JSON.stringify(observed)}, JSON.stringify({ state, config: process.env.GH_CONFIG_DIR }));
process.exit(1);
`;
  await writeFile(join(bin, 'gh'), command, { mode: 0o700 });
  const cli = fileURLToPath(new URL('./composition-pack-inputs.mjs', import.meta.url));
  await assert.rejects(exec(process.execPath, [cli, '--repository', 'tyuanww/dsh-analytics-workbench',
    '--artifact-id', '123', '--artifact-sha256', 'a'.repeat(64), '--output', f.output], {
    cwd: f.root, env: { ...process.env, GH_TOKEN: 'synthetic-gh-test', PATH: `${bin}:/usr/bin:/bin` },
  }), /CI_COMPOSITION_ARTIFACT_FETCH_FAILED/);
  const record = JSON.parse(await readFile(observed));
  assert.equal(dirname(dirname(record.state)), record.config);
  await assert.rejects(access(join(f.root, '.local')), { code: 'ENOENT' });
  await assert.rejects(access(record.config), { code: 'ENOENT' });
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});
