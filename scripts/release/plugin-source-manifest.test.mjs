import assert from 'node:assert/strict';
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
    deletion_gate: { status: 'BLOCKED', blocking_reasons: ['formal pack not prepared'] },
    ...overrides,
  };
}

test('accepts an explicit not-run manifest without treating it as ready', () => {
  const value = validateSourceManifest(manifest(), { lockSha256: sha256, expectedIds: ['@shine-mage/dsh-shine-brand'] });
  assert.deepEqual(sourceManifestStatus(value), {
    schema_version: 'shinemage-composition-pack-manifest/v1',
    sources: [{ id: '@shine-mage/dsh-shine-brand', repository: 'tyuanww/dsh-shine-brand', ref: 'commit', sha: sha1, status: 'NOT_RUN' }],
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
