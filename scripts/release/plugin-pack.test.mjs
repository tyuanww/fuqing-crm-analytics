import { PNPM_VERSION } from './toolchain.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { packPlugin } from './plugin-pack.mjs';

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
  const manifestPath = join(input.root, 'receipt.json');
  const receipt = await packPlugin({ ...input, manifestPath });
  assert.equal(receipt.schema_version, 'dsh-plugin-pack/v1');
  assert.equal(receipt.dsh_pin, '0.1.7-rc.2');
  assert.equal(receipt.activation, 'NOT_RUN');
  assert.match(receipt.tarball.sha256, /^[a-f0-9]{64}$/);
  assert.ok(receipt.entries.includes('lib/index.js'));
  assert.ok(!receipt.entries.some(entry => entry.includes('src/')));
  assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), receipt);
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
    const manifestPath = join(input.root, 'receipt.json');
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
