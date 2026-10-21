import { PNPM_VERSION } from './toolchain.mjs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, cp, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { packPlugin, readPluginPack } from './plugin-pack.mjs';
import { writeBuildProvenance } from './generated-provenance.mjs';

const exec = promisify(execFile);

async function fixture(t, { workspaceLink = null, symlinkOutput = false, lifecycle = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'plugin/lib'), { recursive: true });
  await mkdir(join(root, 'out'), { recursive: true });
  await writeFile(join(root, 'plugin/package.json'), JSON.stringify({
    name: '@shine-mage/dsh-synthetic-leaf', version: '0.1.0', private: true, packageManager: `pnpm@${PNPM_VERSION}`, type: 'module',
    peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' }, files: ['lib/', 'cordis.patch.yml'],
    exports: { '.': { import: './lib/index.js' } }, main: './lib/index.js', dsh: { bundle: { patch: 'cordis.patch.yml' } },
    ...(lifecycle ? { scripts: { prepack: 'echo executed > ../prepack-ran' } } : {}),
  }) + '\n');
  await writeFile(join(root, 'plugin/lib/index.js'), 'export const synthetic = true;\n');
  await writeFile(join(root, 'plugin/cordis.patch.yml'), '[]\n');
  if (workspaceLink) {
    const value = JSON.parse(await readFile(join(root, 'plugin/package.json'), 'utf8'));
    value.dependencies = { '@fixture/linked': workspaceLink };
    await writeFile(join(root, 'plugin/package.json'), JSON.stringify(value) + '\n');
  }
  if (symlinkOutput) {
    await rm(join(root, 'plugin/lib/index.js'));
    await writeFile(join(root, 'outside.js'), 'export const outside = true;\n');
    await symlink(join(root, 'outside.js'), join(root, 'plugin/lib/index.js'));
  }
  await exec('git', ['-C', root, 'init', '-q']);
  await exec('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid']);
  await exec('git', ['-C', root, 'config', 'user.name', 'fixture']);
  await exec('git', ['-C', root, 'add', '.']);
  await exec('git', ['-C', root, 'commit', '-qm', 'fixture']);
  return { root, plugin: join(root, 'plugin'), outputDir: join(root, 'out') };
}

test('controlled plugin pack emits an immutable tarball receipt without runtime state', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.outputDir, 'receipt.json');
  const receipt = await packPlugin({ ...input, manifestPath });
  assert.equal(receipt.schema_version, 'dsh-plugin-pack/v1');
  assert.equal(receipt.dsh_pin, '0.1.7-rc.2');
  assert.equal(receipt.activation, 'NOT_RUN');
  assert.match(receipt.tarball.sha256, /^[a-f0-9]{64}$/);
  assert.ok(receipt.entries.includes('lib/index.js'));
  assert.ok(!receipt.entries.some(entry => entry.includes('src/')));
  assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), receipt);
});

test('release lane packs an rc1 artifact from the default rc2 source peer', async t => {
  const input = await fixture(t);
  const packed = await packPlugin({
    ...input,
    sdkVersion: '0.2.1-rc.1',
    sourceSdkVersion: '0.1.7-rc.2',
  });
  assert.equal(packed.source_dsh_pin, '0.1.7-rc.2');
  assert.equal(packed.dsh_pin, '0.2.1-rc.1');
  const manifestPath = join(input.outputDir, 'receipt.json');
  await writeFile(manifestPath, `${JSON.stringify(packed)}\n`);
  const verified = await readPluginPack({
    manifestPath,
    expectedSha256: hash(await readFile(manifestPath)),
    expectedSdkVersion: '0.2.1-rc.1',
  });
  assert.equal(verified.manifest.peerDependencies['@deepseek-ai/dsh-tools'], '0.2.1-rc.1');
});

test('release lane refuses a source manifest outside its declared compatibility line', async t => {
  const input = await fixture(t);
  await assert.rejects(() => packPlugin({
    ...input,
    sdkVersion: '0.2.1-rc.1',
    sourceSdkVersion: '0.1.7-rc.1',
  }), /PLUGIN_PACK_SOURCE_DSH_PEER_INVALID/);
});

test('source compatibility does not invent a peer absent from the package contract', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.peerDependencies;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await commitFixture(input.root);
  await assert.rejects(() => packPlugin({
    ...input,
    sdkVersion: '0.2.1-rc.1',
    sourceSdkVersion: '0.1.7-rc.2',
  }), /PLUGIN_PACK_DSH_PEER_INVALID/);
});

test('packed host entry rejects an undeclared runtime dependency', async t => {
  const input = await fixture(t);
  await writeFile(join(input.plugin, 'lib/index.js'),
    "import '@deepseek-ai/dsh-client-connection';\nexport const synthetic = true;\n");
  await commitFixture(input.root);
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_UNDECLARED_RUNTIME_IMPORT .*dsh-client-connection/);
});

test('packed host entry accepts a declared dependency subpath', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.peerDependencies['@deepseek-ai/dsh-client-connection'] = '0.1.7-rc.2';
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await writeFile(join(input.plugin, 'lib/index.js'),
    "import '@deepseek-ai/dsh-client-connection/client';\nexport const synthetic = true;\n");
  await commitFixture(input.root);
  const receipt = await packPlugin(input);
  assert.equal(receipt.package_name, manifest.name);
});

test('configuration bundle packs without a synthetic dsh-tools peer', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.peerDependencies;
  manifest.files = ['lib/', 'cordis.patch.yml', 'locale/*.json'];
  manifest.exports = { './tool-policy': './lib/index.js', './locale/*.json': './locale/*.json' };
  manifest.shinemage = { bundle_role: 'configuration-bundle' };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await mkdir(join(input.plugin, 'locale'));
  await writeFile(join(input.plugin, 'locale/en.json'), '{"meta":{"title":"Synthetic"}}\n');
  await commitFixture(input.root);
  const receipt = await packPlugin(input);
  assert.equal(receipt.package_name, manifest.name);
  assert.equal(receipt.entries.includes('cordis.patch.yml'), true);
  assert.equal(receipt.entries.includes('locale/en.json'), true);
  const packed = JSON.parse((await exec('tar', ['-xOf', join(input.outputDir, receipt.tarball.name),
    'package/package.json'])).stdout);
  assert.equal(packed.peerDependencies, undefined);
});

test('configuration bundle rejects a tool dependency disguised as a normal dependency', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.peerDependencies;
  manifest.dependencies = { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' };
  manifest.shinemage = { bundle_role: 'configuration-bundle' };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await commitFixture(input.root);
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_CONFIGURATION_BUNDLE_TOOL_DEPENDENCY/);
});

test('configuration bundle cannot import dsh-tools or compute a dynamic module load', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.peerDependencies;
  manifest.shinemage = { bundle_role: 'configuration-bundle' };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await writeFile(join(input.plugin, 'lib/index.js'), "import '@deepseek-ai/dsh-tools';\n");
  await commitFixture(input.root);
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_CONFIGURATION_BUNDLE_TOOL_IMPORT/);
  await writeFile(join(input.plugin, 'lib/index.js'),
    "const moduleName = '@deepseek-ai/' + 'dsh-tools';\nexport const load = () => import(moduleName);\n");
  await commitFixture(input.root);
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_CONFIGURATION_BUNDLE_DYNAMIC_MODULE_LOAD/);
});

test('configuration bundle rejects unsafe wildcard shapes before reading files', async t => {
  const variants = [
    {
      manifest(value) {
        value.files = ['lib/', 'cordis.patch.yml'];
        value.exports['./exact'] = './lib/*.js';
      },
    },
    {
      manifest(value) {
        value.exports['./nested'] = './lib/*/index.js';
      },
    },
    {
      manifest(value) {
        value.exports['./nested/*/module'] = './lib/index.js';
      },
    },
    {
      manifest(value) {
        value.main = './lib/*.js';
      },
    },
    {
      manifest(value) {
        value.files = ['locale/../*.json'];
      },
    },
  ];
  for (const variant of variants) {
    const input = await fixture(t);
    const manifestPath = join(input.plugin, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    delete manifest.peerDependencies;
    manifest.shinemage = { bundle_role: 'configuration-bundle' };
    variant.manifest(manifest);
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    await commitFixture(input.root);
    await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_(?:PATTERN|FILE_PATH)_INVALID/);
  }
});

test('configuration bundle syntax checks tolerate comments but reject module loading', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.peerDependencies;
  manifest.shinemage = { bundle_role: 'configuration-bundle' };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await writeFile(join(input.plugin, 'lib/index.js'),
    "import /* pinned module */ '@deepseek-ai/dsh-tools';\nexport const load = name => import /* computed */ (name);\n");
  await commitFixture(input.root);
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_CONFIGURATION_BUNDLE_TOOL_IMPORT/);
  await writeFile(join(input.plugin, 'lib/index.js'),
    "export const load = name => require /* computed */ (name);\n");
  await commitFixture(input.root);
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_CONFIGURATION_BUNDLE_DYNAMIC_MODULE_LOAD/);
});

test('overlapping files wildcards produce one archive entry per file', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files = ['lib/', 'cordis.patch.yml', 'lib/*.js', 'lib/index*'];
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await commitFixture(input.root);
  const receipt = await packPlugin(input);
  assert.equal(receipt.entries.filter(entry => entry === 'lib/index.js').length, 1);
  assert.equal(new Set(receipt.entries).size, receipt.entries.length);
});

test('formal pack rejects an ignored lib replacement against a clean builder receipt', async t => {
  const input = await fixture(t);
  await writeFile(join(input.plugin, '.gitignore'), '/lib/\n/.build-provenance.json\n');
  await exec('git', ['-C', input.root, 'rm', '-q', '--cached', '-r', 'plugin/lib']);
  await exec('git', ['-C', input.root, 'add', 'plugin/.gitignore']);
  await exec('git', ['-C', input.root, 'commit', '-qm', 'ignore generated output']);
  await chmod(join(input.plugin, 'lib/index.js'), 0o600);
  const previous = process.env.SHINEMAGE_CLEAN_BUILDER;
  process.env.SHINEMAGE_CLEAN_BUILDER = '1';
  try {
    const proofPath = join(input.plugin, '.build-provenance.json');
    await writeBuildProvenance({ root: input.plugin, outputPath: proofPath });
    await writeFile(join(input.plugin, 'lib/index.js'), 'export const synthetic = false;\n');
    await assert.rejects(() => packPlugin({ ...input, builderProvenancePath: proofPath }), /PLUGIN_PACK_GENERATED_TREE_MISMATCH/);
    assert.deepEqual(await readdir(input.outputDir), []);
  } finally {
    if (previous === undefined) delete process.env.SHINEMAGE_CLEAN_BUILDER;
    else process.env.SHINEMAGE_CLEAN_BUILDER = previous;
  }
});

test('formal pack requires an explicit builder receipt', async t => {
  const input = await fixture(t);
  await assert.rejects(() => packPlugin({ ...input, requireGeneratedProvenance: true }), /PLUGIN_PACK_BUILD_PROVENANCE_REQUIRED/);
  assert.deepEqual(await readdir(input.outputDir), []);
});

test('formal reader accepts generated bytes provenance emitted from a clean builder receipt', async t => {
  const input = await fixture(t), proofPath = join(input.plugin, '.build-provenance.json');
  await writeFile(join(input.plugin, '.gitignore'), '/lib/\n/.build-provenance.json\n');
  await exec('git', ['-C', input.root, 'add', 'plugin/.gitignore']);
  await exec('git', ['-C', input.root, 'commit', '-qm', 'ignore generated output']);
  await chmod(join(input.plugin, 'lib/index.js'), 0o600);
  const previous = process.env.SHINEMAGE_CLEAN_BUILDER;
  process.env.SHINEMAGE_CLEAN_BUILDER = '1';
  try {
    await writeBuildProvenance({ root: input.plugin, outputPath: proofPath });
    const manifestPath = join(input.outputDir, 'receipt.json');
    const packed = await packPlugin({ ...input, manifestPath, builderProvenancePath: proofPath });
    const manifestSha256 = hash(await readFile(manifestPath));
    const received = await readPluginPack({ manifestPath, expectedSha256: manifestSha256, requireGeneratedProvenance: true });
    assert.equal(received.receipt.generated_bytes_provenance.schema_version, 'dsh-generated-bytes/v1');
    assert.equal(received.receipt.generated_bytes_provenance.builder_receipt_schema_version, 'dsh-plugin-build/v1');
    assert.equal(received.receipt.tarball.sha256, packed.tarball.sha256);
  } finally {
    if (previous === undefined) delete process.env.SHINEMAGE_CLEAN_BUILDER;
    else process.env.SHINEMAGE_CLEAN_BUILDER = previous;
  }
});

test('formal reader refuses a pack without clean-builder provenance', async t => {
  const input = await fixture(t), packed = await packPlugin(input);
  const manifestPath = join(input.root, 'receipt.json');
  await writeFile(manifestPath, `${JSON.stringify(packed)}\n`);
  const manifestSha256 = hash(await readFile(manifestPath));
  await assert.rejects(() => readPluginPack({ manifestPath, expectedSha256: manifestSha256, requireGeneratedProvenance: true }), /PLUGIN_PACK_BUILD_PROVENANCE_STATUS/);
});

async function commitFixture(root) {
  await exec('git', ['-C', root, 'add', '.']);
  await exec('git', ['-C', root, 'commit', '-qm', 'fixture change']);
}

for (const [file, content, error] of [
  ['lib/.env', 'SYNTHETIC_ONLY=1', /SECRET_SCAN_FAILED.*DENY_NAME/],
  ['lib/client.js.map', '{}', /PLUGIN_PACK_SOURCE_PATH/],
  ['lib/client.js', `const api_key = "${'0123456789'.repeat(3)}";`, /SECRET_SCAN_FAILED.*SECRET_PATTERN/],
  ['lib/test-helper.js', `const api_key = "${['synthetic', 'test-only-secret-value'].join('-')}";`, /SECRET_SCAN_FAILED.*SECRET_PATTERN/],
]) {
  test(`packed ${file} is rejected before any public tarball or receipt`, async t => {
    const input = await fixture(t);
    await writeFile(join(input.plugin, file), content);
    await commitFixture(input.root);
    const manifestPath = join(input.outputDir, 'receipt.json');
    await assert.rejects(() => packPlugin({ ...input, manifestPath }), error);
    assert.deepEqual(await readdir(input.outputDir), []);
    await assert.rejects(() => access(manifestPath));
  });
}

for (const field of ['main', 'exports', 'patch']) {
  test(`packed ${field} must resolve to a real archive file`, async t => {
    const input = await fixture(t);
    const path = join(input.plugin, 'package.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (field === 'patch') manifest.dsh.bundle.patch = 'missing.patch.yml';
    else if (field === 'exports') manifest.exports['.'].default = './lib/missing.js';
    else manifest.main = './lib/missing.js';
    await writeFile(path, JSON.stringify(manifest));
    await commitFixture(input.root);
    await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_ENTRY_MISSING/);
    assert.deepEqual(await readdir(input.outputDir), []);
  });
}

test('controlled plugin pack rejects workspace links', async t => {
  const input = await fixture(t, { workspaceLink: 'workspace:*' });
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_WORKSPACE_LINK/);
});

test('controlled plugin pack supports a standalone author repository root', async t => {
  const input = await fixture(t);
  for (const name of await readdir(input.plugin)) {
    await rename(join(input.plugin, name), join(input.root, name));
  }
  await writeFile(join(input.root, '.gitignore'), 'out/\n');
  await commitFixture(input.root);
  const receipt = await packPlugin({ ...input, plugin: input.root });
  const { stdout } = await exec('git', ['-C', input.root, 'rev-parse', 'HEAD']);
  assert.equal(receipt.source_sha, stdout.trim());
  assert.equal(receipt.source_dirty, false);
});

test('controlled plugin pack rejects an ignored package absent from the recorded commit', async t => {
  const input = await fixture(t);
  await writeFile(join(input.root, '.gitignore'), 'candidate/\n');
  await commitFixture(input.root);
  const candidate = join(input.root, 'candidate');
  await cp(input.plugin, candidate, { recursive: true });
  const { stdout } = await exec('git', ['-C', input.root, 'status', '--porcelain']);
  assert.equal(stdout, '');
  const manifestPath = join(input.outputDir, 'plugin-pack.json');
  await assert.rejects(() => packPlugin({ ...input, plugin: candidate, manifestPath }), /PLUGIN_PACK_GIT_METADATA_REQUIRED/);
  assert.deepEqual(await readdir(input.outputDir), []);
});

test('controlled plugin pack rejects a manifest change hidden by assume-unchanged', async t => {
  const input = await fixture(t);
  const manifestPath = join(input.plugin, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.description = 'ignored overlay';
  await writeFile(manifestPath, JSON.stringify(manifest) + '\n');
  await exec('git', ['-C', input.root, 'update-index', '--assume-unchanged', 'plugin/package.json']);
  const status = (await exec('git', ['-C', input.root, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' })).stdout;
  assert.equal(status, '');
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_SOURCE_MANIFEST_MISMATCH/);
  assert.deepEqual(await readdir(input.outputDir), []);
});

test('controlled plugin pack rejects symlinked build output', async t => {
  const input = await fixture(t, { symlinkOutput: true });
  await assert.rejects(() => packPlugin(input), /PLUGIN_PACK_SYMLINK/);
});

test('controlled plugin pack removes lifecycle hooks before invoking pnpm', async t => {
  const input = await fixture(t, { lifecycle: true });
  const receipt = await packPlugin(input);
  await assert.rejects(() => access(join(input.root, 'prepack-ran')));
  const { stdout } = await exec('tar', ['-xOf', join(input.outputDir, receipt.tarball.name), 'package/package.json'], { encoding: 'utf8' });
  const packed = JSON.parse(stdout);
  assert.equal(packed.scripts, undefined);
});

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function formalPack(t) {
  const input = await fixture(t);
  const manifestPath = join(input.outputDir, 'plugin-pack.json');
  const receipt = await packPlugin({ ...input, manifestPath });
  const bytes = await readFile(manifestPath);
  return { ...input, manifestPath, receipt, expectedSha256: hash(bytes) };
}

test('formal pack reader preserves exact bytes and needs neither Git sources nor pnpm', async t => {
  const input = await formalPack(t);
  const original = await readFile(join(input.outputDir, input.receipt.tarball.name));
  await rm(input.plugin, { recursive: true });
  await rm(join(input.root, '.git'), { recursive: true });
  const received = await readPluginPack(input);
  assert.deepEqual(received.receipt, input.receipt);
  assert.deepEqual(received.archive, original);
  assert.equal(hash(received.manifestBytes), input.expectedSha256);
  assert.deepEqual(received.manifest, JSON.parse((await exec('tar', ['-xOf', join(input.outputDir, input.receipt.tarball.name), 'package/package.json'])).stdout));
});

test('formal pack reader rejects an unpinned or changed receipt and changed archive', async t => {
  const input = await formalPack(t);
  await assert.rejects(() => readPluginPack({ ...input, expectedSha256: null }), /PLUGIN_PACK_MANIFEST_DIGEST_REQUIRED/);
  await assert.rejects(() => readPluginPack({ ...input, expectedSha256: '0'.repeat(64) }), /PLUGIN_PACK_MANIFEST_DIGEST_MISMATCH/);
  const tar = join(input.outputDir, input.receipt.tarball.name), bytes = await readFile(tar);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(tar, bytes);
  await assert.rejects(() => readPluginPack(input), /PLUGIN_PACK_DIGEST_MISMATCH/);
});

for (const [name, change, error] of [
  ['plain content pack', r => { r.schema_version = 'content-pack/v1'; }, /PLUGIN_PACK_SCHEMA/],
  ['dirty source', r => { r.source_dirty = true; }, /PLUGIN_PACK_SOURCE_DIRTY/],
  ['wrong DSH', r => { r.dsh_pin = '0.0.0'; }, /PLUGIN_PACK_DSH_PEER_INVALID/],
  ['archive escape', r => { r.tarball.name = '../other.tgz'; }, /PLUGIN_PACK_TARBALL_NAME/],
  ['missing member', r => { r.entries.pop(); }, /PLUGIN_PACK_ENTRY_SET_MISMATCH/],
  ['duplicate member', r => { r.entries.push(r.entries[0]); }, /PLUGIN_PACK_FILES_DUPLICATE/],
  ['wrong version', r => { r.package_version = '0.2.0'; r.tarball.name = r.tarball.name.replace('0.1.0', '0.2.0'); }, /PLUGIN_PACK_PACKAGE_VERSION_MISMATCH/],
]) {
  test(`formal pack reader rejects ${name} even when the supplied receipt hash matches`, async t => {
    const input = await formalPack(t), oldName = input.receipt.tarball.name;
    change(input.receipt);
    if (name === 'wrong version') await writeFile(join(input.outputDir, input.receipt.tarball.name), await readFile(join(input.outputDir, oldName)));
    const bytes = Buffer.from(JSON.stringify(input.receipt));
    await writeFile(input.manifestPath, bytes);
    await assert.rejects(() => readPluginPack({ ...input, expectedSha256: hash(bytes) }), error);
  });
}

for (const [name, change, error] of [
  ['lifecycle script', m => { m.scripts = { prepack: 'exit 9' }; }, /PLUGIN_PACK_LIFECYCLE_FORBIDDEN/],
  ['unresolved peer', m => { m.peerDependencies['@deepseek-ai/dsh-tools'] = '0.0.0'; }, /PLUGIN_PACK_DSH_PEER_INVALID/],
  ['missing entry', m => { m.main = './lib/missing.js'; }, /PLUGIN_PACK_ENTRY_MISSING/],
]) {
  test(`formal pack reader rejects archive ${name} with matching receipt and tar digests`, async t => {
    const input = await formalPack(t);
    const extracted = join(input.root, 'tampered'); await mkdir(extracted);
    const tar = join(input.outputDir, input.receipt.tarball.name);
    await exec('tar', ['-xzf', tar, '-C', extracted]);
    const path = join(extracted, 'package/package.json'), manifest = JSON.parse(await readFile(path));
    change(manifest); await writeFile(path, JSON.stringify(manifest));
    await exec('tar', ['-czf', tar, '-C', extracted, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const archive = await readFile(tar);
    input.receipt.tarball.sha256 = hash(archive); input.receipt.tarball.bytes = archive.length;
    const bytes = Buffer.from(JSON.stringify(input.receipt)); await writeFile(input.manifestPath, bytes);
    await assert.rejects(() => readPluginPack({ ...input, expectedSha256: hash(bytes) }), error);
  });
}

test('formal pack reader rejects receipt and archive symlinks', async t => {
  const input = await formalPack(t), link = join(input.outputDir, 'receipt-link.json');
  await symlink(input.manifestPath, link);
  await assert.rejects(() => readPluginPack({ ...input, manifestPath: link }));
  const tar = join(input.outputDir, input.receipt.tarball.name), outside = join(input.root, 'outside.tgz');
  await writeFile(outside, await readFile(tar)); await rm(tar); await symlink(outside, tar);
  await assert.rejects(() => readPluginPack(input), /SERVICE_ARTIFACT_SYMLINK/);
});
