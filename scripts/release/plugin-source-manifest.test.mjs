import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sourceManifestStatus, validateSourceManifest } from './plugin-source-manifest.mjs';

const sha1 = 'a'.repeat(40), sha256 = 'b'.repeat(64);
function manifest(overrides = {}) {
  return {
    schema_version: 'shinemage-composition-pack-manifest/v1',
    lock: { path: 'config/shinemage-composition-packs.lock.json', sha256 },
    consumer: { repository: 'tyuanww/fuqing-crm-analytics', branch: 'main', reviewed_sha: sha1 },
    bundle: { repository: 'tyuanww/dsh-analytics-workbench', workflow: 'sealed-inputs', branch: 'main', run_id: null, artifact_id: null, artifact_sha256: null, artifact_head_sha: null, expires_at: null, status: 'NOT_RUN', remote_main: 'NOT_RUN' },
    toolchain: { sdk_version: '0.1.7-rc.2', pnpm: '11.28.2', node_major: 24, upstream_sha: sha1, upstream_lock_sha256: sha256 },
    sources: [{ id: '@shine-mage/dsh-shine-brand', directory: 'shine-brand', repository: 'tyuanww/dsh-shine-brand', ref: 'commit', sha: sha1, manifest_sha256: null, pack_sha256: null, status: 'NOT_RUN' }],
    domains: [],
    deletion_gate: { status: 'BLOCKED', blocking_reasons: ['formal pack not prepared'] },
    ...overrides,
  };
}

test('accepts an explicit not-run manifest without treating it as ready', () => {
  const value = validateSourceManifest(manifest(), { lockSha256: sha256, expectedIds: ['@shine-mage/dsh-shine-brand'] });
  assert.deepEqual(sourceManifestStatus(value), {
    schema_version: 'shinemage-composition-pack-manifest/v1',
    sources: [{ id: '@shine-mage/dsh-shine-brand', repository: 'tyuanww/dsh-shine-brand', ref: 'commit', sha: sha1, status: 'NOT_RUN' }],
    domains: [],
    bundle: { status: 'NOT_RUN', remote_main: 'NOT_RUN' },
    deletion_gate: 'BLOCKED',
    release_ready: false,
  });
});

test('rejects a source that claims PASS without sealed digests', () => {
  const value = manifest({ sources: [{ ...manifest().sources[0], status: 'PASS' }] });
  assert.throws(() => validateSourceManifest(value), /SOURCE_MANIFEST_SOURCE_MANIFEST_REQUIRED/);
});

test('rejects duplicate source identities', () => {
  const base = manifest();
  assert.throws(() => validateSourceManifest({ ...base, sources: [base.sources[0], { ...base.sources[0], directory: 'other' }] }), /SOURCE_MANIFEST_SOURCE_DUPLICATE_ID/);
});

test('rejects a ready deletion gate while external checks are not run', () => {
  const base = manifest();
  assert.throws(() => validateSourceManifest({ ...base, deletion_gate: { status: 'READY', blocking_reasons: [] } }), /SOURCE_MANIFEST_GATE_SOURCES/);
});

test('rejects a lock digest mismatch before any source is accepted', () => {
  assert.throws(() => validateSourceManifest(manifest(), { lockSha256: 'c'.repeat(64) }), /SOURCE_MANIFEST_LOCK_SHA_MISMATCH/);
});


test('tracked source manifest matches the composition lock selection', async () => {
  const root = new URL('../../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('config/shinemage-composition-pack-manifest.v1.json', root), 'utf8'));
  const lockBytes = await readFile(new URL('config/shinemage-composition-packs.lock.json', root));
  const lock = JSON.parse(lockBytes);
  const lockSha256 = createHash('sha256').update(lockBytes).digest('hex');
  const artifact = JSON.parse(await readFile(new URL('config/shinemage-composition-artifact.lock.json', root), 'utf8'));
  assert.equal(artifact.composition_lock_sha256, lockSha256);
  const selected = [];
  for (const row of lock.profiles) {
    const bytes = await readFile(new URL(row.path, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, row.path);
    selected.push(...JSON.parse(bytes).plugins.map(plugin => plugin.id));
  }
  assert.deepEqual(lock.plugins.map(row => row.id).sort(), [...selected].sort());
  validateSourceManifest(manifest, { lockSha256, expectedIds: selected });
  for (const row of lock.plugins) {
    const source = manifest.sources.find(source => source.id === row.id);
    assert.deepEqual(
      { id: source.id, directory: source.directory, sha: source.sha, manifest_sha256: source.manifest_sha256 },
      { id: row.id, directory: row.directory, sha: row.source_sha, manifest_sha256: row.manifest_sha256 },
      row.id,
    );
  }
  assert.equal(manifest.domains.length, 1);
  assert.equal(manifest.domains[0].package, '@shine-mage/board-components');
  assert.equal(manifest.deletion_gate.status, 'BLOCKED');
});

test('requires complete domain pack bindings and rejects duplicate domain identities', () => {
  const domain = { package: '@shine-mage/fixture-domain', directory: 'fixture-domain', repository: 'tyuanww/shinemage-board-components',
    ref: 'commit', sha: sha1, manifest: 'domain/fixture-pack.json', manifest_sha256: sha256, pack_sha256: sha256, status: 'PASS' };
  const base = manifest({ domains: [domain] });
  validateSourceManifest(base);
  validateSourceManifest(manifest({ domains: [{ ...domain, manifest_sha256: null, pack_sha256: null, status: 'NOT_RUN' }] }));
  assert.throws(() => validateSourceManifest({ ...base, domains: [{ ...domain, manifest_sha256: null }] }), /SOURCE_MANIFEST_DOMAIN_MANIFEST_REQUIRED/);
  assert.throws(() => validateSourceManifest({ ...base, domains: [domain, { ...domain, directory: 'other-domain' }] }), /SOURCE_MANIFEST_DOMAIN_DUPLICATE_PACKAGE/);
});

test('composition preparation rejects unready or mismatched source bindings before creating output', async t => {
  const { prepareCompositionPacks } = await import('../ci/composition-pack-inputs.mjs');
  const root = await mkdtemp(join(tmpdir(), 'plugin-source-manifest-test-'));
  const input = join(root, 'input');
  const output = join(root, 'output');
  const manifestPath = join(root, 'manifest.json');
  await mkdir(input);
  try {
    const current = JSON.parse(await readFile(new URL('../../config/shinemage-composition-pack-manifest.v1.json', import.meta.url), 'utf8'));
    const source = current.sources[0];
    const other = current.sources[1];
    const cases = [
      ['not-run', { sources: current.sources.map(row => ({ ...row, manifest_sha256: null, pack_sha256: null, status: 'NOT_RUN' })) }, /CI_COMPOSITION_SOURCE_NOT_READY/],
      ['selection', { sources: current.sources.slice(1) }, /SOURCE_MANIFEST_SOURCE_SELECTION/],
      ['directory', { sources: [{ ...source, directory: 'other-plugin' }, ...current.sources.slice(1)] }, /CI_COMPOSITION_SOURCE_MANIFEST_DIRECTORY/],
      ['source-sha', { sources: [{ ...source, sha: other.sha }, ...current.sources.slice(1)] }, /CI_COMPOSITION_SOURCE_MANIFEST_SHA/],
      ['manifest-digest', { sources: [{ ...source, manifest_sha256: other.manifest_sha256 }, ...current.sources.slice(1)] }, /CI_COMPOSITION_SOURCE_MANIFEST_DIGEST/],
      ['lock-digest', { lock: { ...current.lock, sha256: other.manifest_sha256 } }, /SOURCE_MANIFEST_LOCK_SHA_MISMATCH/],
    ];
    for (const [name, overrides, error] of cases) {
      await t.test(name, async () => {
        await writeFile(manifestPath, JSON.stringify({ ...current, ...overrides }, null, 2) + '\n');
        await assert.rejects(prepareCompositionPacks({ inputDirectory: input, output, manifestPath }), error);
        await assert.rejects(access(output), { code: 'ENOENT' });
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
