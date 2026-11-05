import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { checkVendored, cutKitArtifact } from './cut-kit-artifact.mjs';

const exec = promisify(execFile);
const files = ['toolchain.json', 'toolchain.mjs', 'prepare.mjs', 'sdk-archive.py',
  'package-manager.mjs', 'packaged-dependencies.mjs', 'provenance.mjs', 'client-banner.mjs',
  'README.md'];

async function fixture(t, { exports = true, contract = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'kit-cut-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const kit = join(root, 'dsh-plugins/plugin-kit');
  await mkdir(kit, { recursive: true });
  const manifest = {
    name: '@shine-mage/dsh-plugin-kit',
    version: '0.1.1',
    private: true,
    packageManager: 'pnpm@11.28.2',
    type: 'module',
    exports: exports ? {
      './toolchain': './toolchain.mjs', './provenance': './provenance.mjs',
      './client-banner': './client-banner.mjs', './packaged-dependencies': './packaged-dependencies.mjs',
      './pin': './toolchain.json', './package.json': './package.json',
    } : {
      './toolchain': './toolchain.mjs', './pin': './toolchain.json', './package.json': './package.json',
    },
    files,
  };
  await writeFile(join(kit, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(kit, 'toolchain.json'), `${JSON.stringify({ schema_version: 'dsh-b0-toolchain/v2', node_major: 24, pnpm: '11.28.2' })}\n`);
  for (const name of ['toolchain.mjs', 'prepare.mjs', 'sdk-archive.py', 'package-manager.mjs',
    'provenance.mjs', 'client-banner.mjs', 'README.md']) {
    await writeFile(join(kit, name), `// fixture ${name}\n`);
  }
  await writeFile(join(kit, 'packaged-dependencies.mjs'), contract
    ? "export const CONTRACT_PACKAGE_NAME = '@shine-mage/dsh-contracts';\n"
    : 'export const DEV_KIT_NAME = "@shine-mage/dsh-plugin-kit";\n');
  const git = (...args) => exec('git', ['-C', root, ...args], { encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
  await git('init', '-q');
  await git('add', '-A');
  await git('-c', 'user.name=kit-fixture', '-c', 'user.email=kit@example.invalid', 'commit', '-q', '-m', 'fixture');
  return root;
}

const PINNED = '11.28.2';

async function pinnedPnpm() {
  try {
    const { stdout } = await exec('pnpm', ['--version'], { encoding: 'utf8', timeout: 30000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function owned(t) {
  const out = await mkdtemp(join(tmpdir(), 'kit-cut-out-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  return out;
}

test('cuts a reproducible tarball from the committed kit, not the worktree', async t => {
  if (await pinnedPnpm() !== PINNED) return t.skip('pinned pnpm 11.28.2 is unavailable');
  const repo = await fixture(t), out = await owned(t);
  const dry = await cutKitArtifact({ repo, commit: 'HEAD', dryRun: true });
  assert.equal(dry.schema, 'shinemage-kit-cut/v1');
  assert.equal(dry.version, '0.1.1');
  assert.match(dry.sha256, /^[a-f0-9]{64}$/);
  assert.ok(dry.bytes > 0);
  assert.equal(dry.entries, files.length + 1);
  assert.deepEqual(dry.reproducible, { sha256: dry.sha256, bytes: dry.bytes, identical: true });
  assert.equal(dry.surface.contract_package_name, '@shine-mage/dsh-contracts');
  assert.deepEqual(await readdir(out), []);
  // An uncommitted edit must never reach the cut: the staging tree is the commit.
  await writeFile(join(repo, 'dsh-plugins/plugin-kit/README.md'), 'dirty worktree\n');
  const written = await cutKitArtifact({ repo, commit: 'HEAD', out, verifyRepro: false });
  assert.equal(written.sha256, dry.sha256);
  assert.equal(written.written.status, 'WRITTEN');
  assert.deepEqual(await readdir(out), [written.tarball]);
  assert.equal((await readFile(written.written.path)).length, written.bytes);
  const again = await cutKitArtifact({ repo, commit: 'HEAD', out, verifyRepro: false });
  assert.equal(again.written.status, 'UNCHANGED');
});

test('refuses a kit without the required public exports before packing', async t => {
  const repo = await fixture(t, { exports: false });
  await assert.rejects(cutKitArtifact({ repo, commit: 'HEAD', dryRun: true }), /KIT_EXPORT_MISSING \.\/provenance/);
});

test('refuses a tarball whose packaged-dependencies lacks CONTRACT_PACKAGE_NAME', async t => {
  if (await pinnedPnpm() !== PINNED) return t.skip('pinned pnpm 11.28.2 is unavailable');
  const repo = await fixture(t, { contract: false });
  await assert.rejects(cutKitArtifact({ repo, commit: 'HEAD', dryRun: true }), /KIT_CONTRACT_PACKAGE_NAME/);
});

test('checkVendored reports drift until every author repo carries the cut', () => {
  const cut = { package: '@shine-mage/dsh-plugin-kit', sha256: 'a'.repeat(64), bytes: 100 };
  const row = { repository: 'tyuanww/dsh-shine-query', main: { sha256: 'b'.repeat(64), bytes: 1 },
    pr: { sha256: 'a'.repeat(64), bytes: 100 } };
  const manifest = { schema: 'shinemage-kit-vendored/v1', package: cut.package,
    authoritative: { sha256: cut.sha256, bytes: cut.bytes }, repos: [row] };
  const drifted = checkVendored({ summary: cut, manifest });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.drift, 1);
  assert.deepEqual(drifted.rows.map(item => item.status), ['DRIFT', 'MATCH']);
  manifest.repos[0].main = { sha256: cut.sha256, bytes: cut.bytes };
  const matched = checkVendored({ summary: cut, manifest });
  assert.equal(matched.ok, true);
  assert.equal(matched.drift, 0);
  manifest.authoritative.sha256 = 'c'.repeat(64);
  assert.equal(checkVendored({ summary: cut, manifest }).ok, false);
});
