import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  PRODUCTION_ONLY_CLOSURE_SCHEMA,
  RECEIPT_BEGIN,
  RECEIPT_END,
  REQUIRED_CHECKS,
  SIMULATED_ABSENT_DIRECTORIES,
  RETAINED_PLUGIN_DIRECTORIES,
  extractReceiptJson,
  validateProductionOnlyClosureReceipt,
} from './production-only-closure-receipt.mjs';
import {
  assertSourceAbsence,
  checkProductionOnlyClosureReceipt,
  materializeRef,
  simulateSourceAbsence,
  validateCompositionManifest,
  validateProfilesFromLock,
} from './production-only-closure.mjs';

const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const SHA1 = 'a'.repeat(40);
const SHA256 = 'b'.repeat(64);

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

async function gitRepo(t) {
  const root = await mkdtemp(join(tmpdir(), 'production-only-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', '-q', '-b', 'main'], { cwd: root });
  await exec('git', ['-C', root, 'config', 'user.email', 'fixture@example.com']);
  await exec('git', ['-C', root, 'config', 'user.name', 'Fixture']);
  for (const name of [...SIMULATED_ABSENT_DIRECTORIES, ...RETAINED_PLUGIN_DIRECTORIES]) {
    await mkdir(join(root, 'dsh-plugins', name), { recursive: true });
    await writeFile(join(root, 'dsh-plugins', name, 'index.js'), `export const name = '${name}';\n`);
  }
  await writeFile(join(root, 'config.json'), '{"fixture":true}\n');
  await exec('git', ['-C', root, 'add', '.']);
  await exec('git', ['-C', root, 'commit', '-qm', 'fixture']);
  return root;
}

test('materializes a clean ref without .git or untracked files', async t => {
  const repository = await gitRepo(t);
  await writeFile(join(repository, 'untracked.txt'), 'not committed\n');
  const destination = await mkdtemp(join(tmpdir(), 'production-only-copy-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  const result = await materializeRef({ repository, ref: 'HEAD', destination });
  assert.match(result.commit, /^[a-f0-9]{40}$/);
  assert.match(result.tree, /^[a-f0-9]{40}$/);
  assert.match(result.commitDate, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(await readFile(join(destination, 'config.json'), 'utf8'), '{"fixture":true}\n');
  assert.equal(existsSync(join(destination, '.git')), false);
  assert.equal(existsSync(join(destination, 'untracked.txt')), false);
});

test('removes exactly the ten source trees and keeps the three retained trees', async t => {
  const repository = await gitRepo(t);
  const destination = await mkdtemp(join(tmpdir(), 'production-only-copy-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  await materializeRef({ repository, ref: 'HEAD', destination });
  const result = await simulateSourceAbsence({ root: destination });
  assert.deepEqual(result.removed.sort(), [...SIMULATED_ABSENT_DIRECTORIES].sort());
  assert.deepEqual(result.retained.sort(), [...RETAINED_PLUGIN_DIRECTORIES].sort());
  await assertSourceAbsence({ root: destination });
  assert.deepEqual((await readdir(join(destination, 'dsh-plugins'))).sort(),
    ['contracts', 'plugin-kit', 'query-agent']);
});

test('a fake source absence fails the strict boundary', async t => {
  const repository = await gitRepo(t);
  const destination = await mkdtemp(join(tmpdir(), 'production-only-copy-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  await materializeRef({ repository, ref: 'HEAD', destination });
  await simulateSourceAbsence({ root: destination });
  // Re-create one supposedly absent tree: this is the "fake absence" shape.
  await mkdir(join(destination, 'dsh-plugins', 'shine-board'), { recursive: true });
  await assert.rejects(assertSourceAbsence({ root: destination }), /UNEXPECTED_PLUGIN_TREE/);
  await rm(join(destination, 'dsh-plugins', 'shine-board'), { recursive: true, force: true });
  // A retained tree must not be deleted to manufacture "absence".
  await rm(join(destination, 'dsh-plugins', 'plugin-kit'), { recursive: true, force: true });
  await assert.rejects(simulateSourceAbsence({ root: destination }), /RETAINED_MISSING/);
});

test('a missing lock fails profile validation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'production-only-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(validateProfilesFromLock({ root }), /LOCK_MISSING/);
});

test('validates both profile inputs from the lock without plugin sources', async t => {
  const root = await mkdtemp(join(tmpdir(), 'production-only-profiles-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const crm = { schema_version: 'dsh-profile/v1', profile_id: 'crm', dsh: { sdk_version: '0.2.1-rc.5', upstream_sha: SHA1 },
    plugins: [{ path: 'dsh-plugins/shine-brand', id: '@shine-mage/dsh-shine-brand', build: 'build.mjs', enabled: true }] };
  const page = { ...crm, profile_id: 'page', plugins: [{ path: 'dsh-plugins/shine-query', id: '@shine-mage/dsh-shine-query',
    build: 'build.mjs', enabled: true }] };
  const sources = {
    crm: Buffer.from(JSON.stringify(crm, null, 2) + '\n'),
    page: Buffer.from(JSON.stringify(page, null, 2) + '\n'),
  };
  const lock = {
    schema_version: 'shinemage-composition-pack-lock/v1',
    profiles: [
      { name: 'crm', path: 'config/crm.json', sha256: hash(sources.crm) },
      { name: 'page', path: 'config/page.json', sha256: hash(sources.page) },
    ],
    plugins: [
      { directory: 'shine-brand', id: '@shine-mage/dsh-shine-brand', source_sha: SHA1, version: '0.0.0-b0', manifest_sha256: SHA256 },
      { directory: 'shine-query', id: '@shine-mage/dsh-shine-query', source_sha: SHA1, version: '0.0.0-b0', manifest_sha256: SHA256 },
    ],
  };
  await writeJson(join(root, 'config', 'crm.json'), crm);
  await writeJson(join(root, 'config', 'page.json'), page);
  await writeJson(join(root, 'config', 'shinemage-composition-packs.lock.json'), lock);
  const loadProfileSnapshot = async ({ root: profileRoot, manifestPath }) => {
    const bytes = await readFile(join(profileRoot, manifestPath));
    return { digest: hash(bytes), profile: JSON.parse(bytes) };
  };
  const result = await validateProfilesFromLock({ root, loadProfileSnapshot });
  assert.equal(result.lockSha256, hash(Buffer.from(JSON.stringify(lock, null, 2) + '\n')));
  assert.deepEqual(result.profiles.map(row => row.name), ['crm', 'page']);
  assert.deepEqual([...result.selected].sort(), ['@shine-mage/dsh-shine-brand', '@shine-mage/dsh-shine-query']);
  // Digest drift is rejected before any pack is read.
  await writeJson(join(root, 'config', 'crm.json'), { ...crm, profile_id: 'tampered' });
  await assert.rejects(validateProfilesFromLock({ root, loadProfileSnapshot }), /PROFILE_DIGEST/);
});

test('validates the composition manifest against the lock without pack bytes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'production-only-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = { id: '@shine-mage/dsh-shine-brand', directory: 'shine-brand', repository: 'tyuanww/dsh-shine-brand',
    ref: 'main', sha: SHA1, manifest_sha256: SHA256, pack_sha256: SHA256, status: 'PASS' };
  const domain = { package: '@shine-mage/board-components', directory: 'board-components',
    repository: 'tyuanww/shinemage-board-components', ref: 'main', sha: SHA1, manifest: 'domain/pack.json',
    manifest_sha256: SHA256, pack_sha256: SHA256, status: 'PASS' };
  const manifest = { schema_version: 'shinemage-composition-pack-manifest/v1',
    lock: { path: 'config/shinemage-composition-packs.lock.json', sha256: SHA256 },
    sources: [source], domains: [domain], deletion_gate: { status: 'BLOCKED', blocking_reasons: ['remote_main_not_verified'] } };
  const lock = { schema_version: 'shinemage-composition-pack-lock/v1',
    profiles: [{ name: 'crm', path: 'config/crm.json', sha256: SHA256 }, { name: 'page', path: 'config/page.json', sha256: SHA256 }],
    plugins: [{ directory: 'shine-brand', id: source.id, source_sha: SHA1, version: '0.0.0-b0', manifest_sha256: SHA256 }] };
  await writeJson(join(root, 'config', 'shinemage-composition-pack-manifest.v1.json'), manifest);
  const lockInfo = { lock, lockSha256: SHA256, selected: [source.id] };
  let called = 0;
  const validateManifest = (value, options) => {
    called += 1;
    assert.equal(options.lockSha256, SHA256);
    assert.deepEqual(options.expectedIds, [source.id]);
    assert.equal(value.sources.length, 1);
    return value;
  };
  const result = await validateCompositionManifest({ root, lockInfo, validateManifest });
  assert.equal(called, 1);
  assert.equal(result.manifestSha256, hash(Buffer.from(JSON.stringify(manifest, null, 2) + '\n')));
  assert.deepEqual(result.sources, [{ id: source.id, directory: source.directory, sha: SHA1,
    manifest_sha256: SHA256, pack_sha256: SHA256 }]);
  assert.deepEqual(result.domains, [{ package: domain.package, directory: domain.directory, sha: SHA1,
    manifest_sha256: SHA256, pack_sha256: SHA256 }]);
  // A source row that disagrees with the lock must fail before any pack read.
  await writeJson(join(root, 'config', 'shinemage-composition-pack-manifest.v1.json'), {
    ...manifest, sources: [{ ...source, sha: 'c'.repeat(40) }],
  });
  await assert.rejects(validateCompositionManifest({ root, lockInfo, validateManifest }), /MANIFEST_SOURCE_SHA/);
});

function buildReceipt({ manifest, lockSha256, commit = SHA1, tree = SHA1, checks = null, overrides = {} }) {
  const sources = manifest.sources.map(({ id, directory, sha, manifest_sha256, pack_sha256 }) => ({
    id, directory, sha, manifest_sha256, pack_sha256,
  }));
  const domains = manifest.domains.map(({ package: packageName, directory, sha, manifest_sha256, pack_sha256 }) => ({
    package: packageName, directory, sha, manifest_sha256, pack_sha256,
  }));
  const plugins = sources.map((source, index) => ({ id: source.id, source_sha: source.sha,
    version: index === 0 ? '0.0.0-b0' : '0.0.0-crm.5', manifest_sha256: source.manifest_sha256,
    pack_sha256: source.pack_sha256 }));
  const receipt = {
    schema_version: PRODUCTION_ONLY_CLOSURE_SCHEMA,
    verdict: 'PASS',
    ref: 'origin/main',
    commit,
    tree,
    absence: {
      simulated_absent: [...SIMULATED_ABSENT_DIRECTORIES],
      retained: [...RETAINED_PLUGIN_DIRECTORIES],
      boundary: 'S1/S2/S3/S5 delete exactly the ten plugin source trees; contracts, plugin-kit and query-agent stay.',
    },
    inputs: {
      lock: { path: 'config/shinemage-composition-packs.lock.json', sha256: lockSha256 },
      manifest: { path: 'config/shinemage-composition-pack-manifest.v1.json', sha256: SHA256 },
      artifact_lock: {
        path: 'config/shinemage-composition-artifact.lock.json',
        sha256: SHA256,
        id: 1,
        run_id: 2,
        head_sha: SHA1,
        artifact_sha256: SHA256,
        composition_lock_sha256: lockSha256,
      },
      artifact_zip_sha256: SHA256,
      profiles: [
        { name: 'crm', path: 'config/dsh-profile.crm-knowledge.rc3.json', sha256: SHA256 },
        { name: 'page', path: 'config/dsh-profile.rc3.json', sha256: SHA256 },
      ],
      sources,
      domains,
    },
    environment: {
      node: 'v24.19.0', pnpm: '11.28.2', python: '3.14.8', platform: 'linux', arch: 'x64',
      install_mode: 'PRODUCTION_ONLY', commit_date: '2026-11-05T00:00:00+08:00',
    },
    checks: checks ?? REQUIRED_CHECKS.map(id => ({ id, status: 'PASS' })),
    composition: {
      lock_sha256: lockSha256,
      source_manifest_sha256: SHA256,
      profiles: [
        { name: 'crm', path: 'config/dsh-profile.crm-knowledge.rc3.json', sha256: SHA256 },
        { name: 'page', path: 'config/dsh-profile.rc3.json', sha256: SHA256 },
      ],
      plugins,
      domains: domains.map(domain => ({ package: domain.package, source_sha: domain.sha, manifest: 'domain/pack.json',
        manifest_sha256: domain.manifest_sha256, pack_sha256: domain.pack_sha256 })),
      business_profile: { path: 'config/dsh-profile.business.rc3.json', sha256: SHA256 },
    },
    release_payload: {
      files: 1,
      bytes: 1,
      profile_pack_snapshot: { path: 'shinemage-release-pack-inputs.json', sha256: SHA256 },
      plugins,
      activation: 'NOT_RUN',
    },
    consumer: {
      packages: plugins.length,
      install: 'PASS',
      imports: plugins.map(plugin => ({ specifier: plugin.id, status: 'PASS' })),
      dev_dependencies: 'excluded',
      peer_dependencies: 'installed',
      client_bundles: 'NOT_RUN_BROWSER_TARGET',
    },
    unproven: ['real production host'],
  };
  return { ...receipt, ...overrides };
}

test('accepts a PASS receipt only when it binds the lock, sources and domains', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../config/shinemage-composition-pack-manifest.v1.json', import.meta.url), 'utf8'));
  const lockBytes = await readFile(new URL('../../config/shinemage-composition-packs.lock.json', import.meta.url));
  const lockSha256 = hash(lockBytes);
  const receipt = buildReceipt({ manifest, lockSha256 });
  validateProductionOnlyClosureReceipt(receipt, { lockSha256, sources: manifest.sources, domains: manifest.domains });
  assert.throws(() => validateProductionOnlyClosureReceipt(receipt, { lockSha256: 'c'.repeat(64), sources: manifest.sources,
    domains: manifest.domains }), /LOCK_MISMATCH/);
  assert.throws(() => validateProductionOnlyClosureReceipt({ ...receipt, verdict: 'FAIL' }), /VERDICT/);
  assert.throws(() => validateProductionOnlyClosureReceipt({ ...receipt,
    absence: { ...receipt.absence, simulated_absent: receipt.absence.simulated_absent.slice(1) } }), /ABSENCE_BOUNDARY/);
  assert.throws(() => validateProductionOnlyClosureReceipt({ ...receipt,
    checks: receipt.checks.filter(check => check.id !== 'main_production_install') }), /CHECK_MISSING/);
  assert.throws(() => validateProductionOnlyClosureReceipt({ ...receipt,
    consumer: { ...receipt.consumer, install: 'SKIPPED' } }), /CONSUMER_INSTALL/);
});

test('extracts the deterministic JSON block from a markdown receipt', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../config/shinemage-composition-pack-manifest.v1.json', import.meta.url), 'utf8'));
  const lockSha256 = hash(await readFile(new URL('../../config/shinemage-composition-packs.lock.json', import.meta.url)));
  const receipt = buildReceipt({ manifest, lockSha256 });
  const text = `# receipt\n\n${RECEIPT_BEGIN}\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\`\n${RECEIPT_END}\n`;
  assert.deepEqual(extractReceiptJson(text), receipt);
  assert.deepEqual(extractReceiptJson(JSON.stringify(receipt)), receipt);
});

test('the receipt check reads the tracked lock and manifest', async t => {
  const manifest = JSON.parse(await readFile(new URL('../../config/shinemage-composition-pack-manifest.v1.json', import.meta.url), 'utf8'));
  const lockSha256 = hash(await readFile(new URL('../../config/shinemage-composition-packs.lock.json', import.meta.url)));
  const receipt = buildReceipt({ manifest, lockSha256 });
  const root = await mkdtemp(join(tmpdir(), 'production-only-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'receipt.md');
  await writeFile(path, `${RECEIPT_BEGIN}\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\`\n${RECEIPT_END}\n`);
  const result = checkProductionOnlyClosureReceipt({ repo: fileURLToPath(new URL('../..', import.meta.url)), receiptPath: path });
  assert.equal(result.status, 'RECORDED');
  assert.equal(result.lock_sha256, lockSha256);
  const bad = buildReceipt({ manifest: { ...manifest, sources: manifest.sources.map(row => ({ ...row, sha: 'c'.repeat(40) })) },
    lockSha256 });
  await writeFile(path, JSON.stringify(bad));
  assert.throws(() => checkProductionOnlyClosureReceipt({ repo: fileURLToPath(new URL('../..', import.meta.url)), receiptPath: path }),
    /SOURCE_MISMATCH/);
});

test('the committed receipt, when present, binds the tracked lock and manifest', async t => {
  const path = new URL('../../docs/operating/production-only-closure-receipt.md', import.meta.url);
  if (!existsSync(path)) return t.skip('receipt not generated yet');
  const result = checkProductionOnlyClosureReceipt({ repo: fileURLToPath(new URL('../..', import.meta.url)), receiptPath: fileURLToPath(path) });
  assert.equal(result.status, 'RECORDED');
});
