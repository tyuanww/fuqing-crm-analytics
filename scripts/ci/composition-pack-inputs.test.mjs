import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fixture } from '../crm-calibration/test-support/formal-packs.fixture.mjs';
import { inspectGitHubArtifact, loadCompositionArtifactReference, prepareCompositionPacks } from './composition-pack-inputs.mjs';
import { TOOLCHAIN } from '../release/toolchain.mjs';

const exec = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const python = process.env.FQ_B0_PYTHON ?? 'python3';

async function inputs(t, mutate) {
  const f = await fixture(t, ['crm', 'knowledge', 'page'], mutate);
  const inputDirectory = join(f.root, 'input'), profileRoot = join(f.root, 'profiles');
  await mkdir(inputDirectory); await mkdir(profileRoot);
  await cp(join(f.root, 'packs'), join(inputDirectory, 'packs'), { recursive: true });
  const lock = { schema_version: 'shinemage-composition-pack-lock/v1', profiles: [], plugins: [] };
  for (const name of ['crm', 'page']) {
    const profile = { ...f.profile, plugins: f.profile.plugins.filter(row =>
      name === 'crm' ? !row.id.endsWith('workbench-b0') : row.id.endsWith('workbench-b0')) };
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
