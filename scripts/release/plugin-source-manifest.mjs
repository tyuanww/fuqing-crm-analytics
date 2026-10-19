import assert from 'node:assert/strict';

export const SOURCE_MANIFEST_SCHEMA = 'shinemage-composition-pack-manifest/v1';
export const SOURCE_STATUSES = new Set(['PASS', 'NOT_RUN']);
export const BUNDLE_STATUSES = new Set(['PASS', 'NOT_RUN']);
export const GATE_STATUSES = new Set(['READY', 'BLOCKED']);

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^tyuanww\/(?:fuqing-crm-analytics|dsh-[a-z][a-z0-9-]*|shinemage-[a-z][a-z0-9-]*)$/;
const REF = /^(?:main|commit|refs\/tags\/[A-Za-z0-9._/-]+)$/;
const PACKAGE_ID = /^@shine-mage\/[a-z0-9][a-z0-9-]+$/;
const DIRECTORY = /^[a-z][a-z0-9-]*$/;

function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

function nullable(value, pattern, code) {
  assert.ok(value === null || pattern.test(value), code);
}

function status(value, allowed, code) {
  assert.ok(allowed.has(value), code);
}

function validateConsumer(value) {
  exact(value, ['repository', 'branch', 'reviewed_sha'], 'SOURCE_MANIFEST_CONSUMER_SHAPE');
  assert.equal(value.repository, 'tyuanww/fuqing-crm-analytics', 'SOURCE_MANIFEST_CONSUMER_REPOSITORY');
  assert.equal(value.branch, 'main', 'SOURCE_MANIFEST_CONSUMER_BRANCH');
  assert.match(value.reviewed_sha ?? '', SHA1, 'SOURCE_MANIFEST_CONSUMER_SHA');
}

function validateBundle(value) {
  exact(value, ['repository', 'workflow', 'branch', 'run_id', 'artifact_id', 'artifact_sha256', 'artifact_head_sha', 'expires_at', 'status', 'remote_main'], 'SOURCE_MANIFEST_BUNDLE_SHAPE');
  assert.match(value.repository ?? '', REPOSITORY, 'SOURCE_MANIFEST_BUNDLE_REPOSITORY');
  assert.ok(typeof value.workflow === 'string' && value.workflow.length > 0, 'SOURCE_MANIFEST_BUNDLE_WORKFLOW');
  assert.equal(value.branch, 'main', 'SOURCE_MANIFEST_BUNDLE_BRANCH');
  status(value.status, BUNDLE_STATUSES, 'SOURCE_MANIFEST_BUNDLE_STATUS');
  status(value.remote_main, BUNDLE_STATUSES, 'SOURCE_MANIFEST_BUNDLE_REMOTE_MAIN');
  if (value.status === 'PASS') {
    assert.ok(Number.isSafeInteger(value.run_id) && value.run_id > 0, 'SOURCE_MANIFEST_BUNDLE_RUN_ID');
    assert.ok(Number.isSafeInteger(value.artifact_id) && value.artifact_id > 0, 'SOURCE_MANIFEST_BUNDLE_ARTIFACT_ID');
    assert.match(value.artifact_sha256 ?? '', SHA256, 'SOURCE_MANIFEST_BUNDLE_ARTIFACT_SHA');
    assert.match(value.artifact_head_sha ?? '', SHA1, 'SOURCE_MANIFEST_BUNDLE_HEAD_SHA');
    assert.ok(typeof value.expires_at === 'string' && value.expires_at.length > 0, 'SOURCE_MANIFEST_BUNDLE_EXPIRY');
  } else {
    assert.equal(value.run_id, null, 'SOURCE_MANIFEST_BUNDLE_RUN_ID_NOT_RUN');
    assert.equal(value.artifact_id, null, 'SOURCE_MANIFEST_BUNDLE_ARTIFACT_ID_NOT_RUN');
    assert.equal(value.artifact_sha256, null, 'SOURCE_MANIFEST_BUNDLE_ARTIFACT_SHA_NOT_RUN');
    assert.equal(value.artifact_head_sha, null, 'SOURCE_MANIFEST_BUNDLE_HEAD_SHA_NOT_RUN');
    assert.equal(value.expires_at, null, 'SOURCE_MANIFEST_BUNDLE_EXPIRY_NOT_RUN');
  }
}

function validateToolchain(value) {
  exact(value, ['sdk_version', 'pnpm', 'node_major', 'upstream_sha', 'upstream_lock_sha256'], 'SOURCE_MANIFEST_TOOLCHAIN_SHAPE');
  assert.ok(typeof value.sdk_version === 'string' && value.sdk_version.length > 0, 'SOURCE_MANIFEST_TOOLCHAIN_SDK');
  assert.match(value.pnpm ?? '', /^\d+\.\d+\.\d+$/, 'SOURCE_MANIFEST_TOOLCHAIN_PNPM');
  assert.equal(value.node_major, 24, 'SOURCE_MANIFEST_TOOLCHAIN_NODE');
  assert.match(value.upstream_sha ?? '', SHA1, 'SOURCE_MANIFEST_TOOLCHAIN_UPSTREAM');
  assert.match(value.upstream_lock_sha256 ?? '', SHA256, 'SOURCE_MANIFEST_TOOLCHAIN_LOCK');
}

function validateSource(value) {
  exact(value, ['id', 'directory', 'repository', 'ref', 'sha', 'manifest_sha256', 'pack_sha256', 'status'], 'SOURCE_MANIFEST_SOURCE_SHAPE');
  assert.match(value.id ?? '', PACKAGE_ID, 'SOURCE_MANIFEST_SOURCE_ID');
  assert.match(value.directory ?? '', DIRECTORY, 'SOURCE_MANIFEST_SOURCE_DIRECTORY');
  assert.match(value.repository ?? '', REPOSITORY, 'SOURCE_MANIFEST_SOURCE_REPOSITORY');
  assert.match(value.ref ?? '', REF, 'SOURCE_MANIFEST_SOURCE_REF');
  assert.match(value.sha ?? '', SHA1, 'SOURCE_MANIFEST_SOURCE_SHA');
  status(value.status, SOURCE_STATUSES, 'SOURCE_MANIFEST_SOURCE_STATUS');
  nullable(value.manifest_sha256, SHA256, 'SOURCE_MANIFEST_SOURCE_MANIFEST_SHA');
  nullable(value.pack_sha256, SHA256, 'SOURCE_MANIFEST_SOURCE_PACK_SHA');
  if (value.status === 'PASS') {
    assert.match(value.manifest_sha256 ?? '', SHA256, 'SOURCE_MANIFEST_SOURCE_MANIFEST_REQUIRED');
    assert.match(value.pack_sha256 ?? '', SHA256, 'SOURCE_MANIFEST_SOURCE_PACK_REQUIRED');
  }
}

function validateGate(value, sources, bundle) {
  exact(value, ['status', 'blocking_reasons'], 'SOURCE_MANIFEST_GATE_SHAPE');
  status(value.status, GATE_STATUSES, 'SOURCE_MANIFEST_GATE_STATUS');
  assert.ok(Array.isArray(value.blocking_reasons) && value.blocking_reasons.every(item => typeof item === 'string'), 'SOURCE_MANIFEST_GATE_REASONS');
  const allSourcesReady = sources.every(item => item.status === 'PASS');
  const bundleReady = bundle.status === 'PASS' && bundle.remote_main === 'PASS';
  if (value.status === 'READY') {
    assert.equal(allSourcesReady, true, 'SOURCE_MANIFEST_GATE_SOURCES');
    assert.equal(bundleReady, true, 'SOURCE_MANIFEST_GATE_BUNDLE');
    assert.equal(value.blocking_reasons.length, 0, 'SOURCE_MANIFEST_GATE_EMPTY');
  } else {
    assert.ok(value.blocking_reasons.length > 0, 'SOURCE_MANIFEST_GATE_BLOCK_REASON');
  }
}

export function validateSourceManifest(manifest, { lockSha256 = null, expectedIds = null } = {}) {
  exact(manifest, ['schema_version', 'lock', 'consumer', 'bundle', 'toolchain', 'sources', 'deletion_gate'], 'SOURCE_MANIFEST_SHAPE');
  assert.equal(manifest.schema_version, SOURCE_MANIFEST_SCHEMA, 'SOURCE_MANIFEST_SCHEMA');
  exact(manifest.lock, ['path', 'sha256'], 'SOURCE_MANIFEST_LOCK_SHAPE');
  assert.equal(manifest.lock.path, 'config/shinemage-composition-packs.lock.json', 'SOURCE_MANIFEST_LOCK_PATH');
  assert.match(manifest.lock.sha256 ?? '', SHA256, 'SOURCE_MANIFEST_LOCK_SHA');
  if (lockSha256 !== null) assert.equal(manifest.lock.sha256, lockSha256, 'SOURCE_MANIFEST_LOCK_SHA_MISMATCH');
  validateConsumer(manifest.consumer);
  validateBundle(manifest.bundle);
  validateToolchain(manifest.toolchain);
  assert.ok(Array.isArray(manifest.sources) && manifest.sources.length > 0, 'SOURCE_MANIFEST_SOURCES_REQUIRED');
  const ids = new Set();
  const directories = new Set();
  for (const source of manifest.sources) {
    validateSource(source);
    assert.equal(ids.has(source.id), false, 'SOURCE_MANIFEST_SOURCE_DUPLICATE_ID');
    assert.equal(directories.has(source.directory), false, 'SOURCE_MANIFEST_SOURCE_DUPLICATE_DIRECTORY');
    ids.add(source.id);
    directories.add(source.directory);
  }
  if (expectedIds) assert.deepEqual([...ids].sort(), [...expectedIds].sort(), 'SOURCE_MANIFEST_SOURCE_SELECTION');
  validateGate(manifest.deletion_gate, manifest.sources, manifest.bundle);
  return manifest;
}

export function sourceManifestStatus(manifest) {
  validateSourceManifest(manifest);
  return {
    schema_version: SOURCE_MANIFEST_SCHEMA,
    sources: manifest.sources.map(({ id, repository, ref, sha, status }) => ({ id, repository, ref, sha, status })),
    bundle: { status: manifest.bundle.status, remote_main: manifest.bundle.remote_main },
    deletion_gate: manifest.deletion_gate.status,
    release_ready: false,
  };
}
