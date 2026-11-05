/**
 * Machine-checked receipt for the production-only closure rehearsal.
 *
 * The rehearsal proves that a clean main checkout can still validate profile
 * inputs, read the sealed packs, run composition checks and install/import the
 * production consumers after the ten plugin source trees are removed. This
 * module owns the receipt schema and the gate binding; the runner lives in
 * `production-only-closure.mjs` and the committed receipt is
 * `docs/operating/production-only-closure-receipt.md`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const PRODUCTION_ONLY_CLOSURE_SCHEMA = 'shinemage-production-only-closure-receipt/v1';

/**
 * The exact ten source trees that S1/S2/S3/S5 delete from main. Keep this list
 * sorted and keep it in sync with the runbook §1 "Moves out" table:
 * S1 deletes board-components, S2 the five shine shells, S3 knowledge and
 * crm-knowledge, S5 analytics-workbench. contracts and plugin-kit stay in main;
 * query-agent stays under the S4 retention decision (no author repository).
 */
export const SIMULATED_ABSENT_DIRECTORIES = Object.freeze([
  'analytics-workbench',
  'board-components',
  'crm-knowledge',
  'knowledge',
  'shine-board',
  'shine-brand',
  'shine-crowd-action',
  'shine-funnel',
  'shine-query',
  'shine-waterfall',
]);

export const RETAINED_PLUGIN_DIRECTORIES = Object.freeze([
  'contracts',
  'plugin-kit',
  'query-agent',
]);

export const REQUIRED_CHECKS = Object.freeze([
  'ref_materialized',
  'plugin_sources_removed',
  'retained_plugin_trees',
  'profile_inputs_from_lock',
  'composition_manifest_from_lock',
  'business_profile_rederived',
  'backend_source_paths',
  'kernel_manifest_files',
  'node_pack_reader_imports',
  'python_backend_imports',
  'artifact_lock_binding',
  'sealed_packs_validated',
  'main_production_install',
  'release_payload_installed',
  'consumer_pack_imports',
]);

export const RECEIPT_BEGIN = '<!-- production-only-closure-receipt:begin -->';
export const RECEIPT_END = '<!-- production-only-closure-receipt:end -->';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

function sha1(value, code) {
  assert.match(value ?? '', SHA1, code);
}

function sha256(value, code) {
  assert.match(value ?? '', SHA256, code);
}

function rows(value, code, fields, optional = []) {
  assert.ok(Array.isArray(value), code);
  for (const row of value) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row), code);
    const keys = Object.keys(row).sort();
    assert.deepEqual(keys, [...fields, ...optional].sort(), code);
    for (const field of fields) assert.ok(row[field] !== undefined, code);
  }
}

function sourceRow(row) {
  exact(row, ['id', 'directory', 'sha', 'manifest_sha256', 'pack_sha256'], 'PRODUCTION_ONLY_CLOSURE_SOURCE_SHAPE');
  assert.match(row.id ?? '', /^@shine-mage\/[a-z0-9][a-z0-9-]+$/, 'PRODUCTION_ONLY_CLOSURE_SOURCE_ID');
  assert.match(row.directory ?? '', /^[a-z][a-z0-9-]*$/, 'PRODUCTION_ONLY_CLOSURE_SOURCE_DIRECTORY');
  sha1(row.sha, 'PRODUCTION_ONLY_CLOSURE_SOURCE_SHA');
  sha256(row.manifest_sha256, 'PRODUCTION_ONLY_CLOSURE_SOURCE_MANIFEST_SHA');
  sha256(row.pack_sha256, 'PRODUCTION_ONLY_CLOSURE_SOURCE_PACK_SHA');
}

function domainRow(row) {
  exact(row, ['package', 'directory', 'sha', 'manifest_sha256', 'pack_sha256'], 'PRODUCTION_ONLY_CLOSURE_DOMAIN_SHAPE');
  assert.match(row.package ?? '', /^@shine-mage\/[a-z0-9][a-z0-9-]+$/, 'PRODUCTION_ONLY_CLOSURE_DOMAIN_PACKAGE');
  assert.match(row.directory ?? '', /^[a-z][a-z0-9-]*$/, 'PRODUCTION_ONLY_CLOSURE_DOMAIN_DIRECTORY');
  sha1(row.sha, 'PRODUCTION_ONLY_CLOSURE_DOMAIN_SHA');
  sha256(row.manifest_sha256, 'PRODUCTION_ONLY_CLOSURE_DOMAIN_MANIFEST_SHA');
  sha256(row.pack_sha256, 'PRODUCTION_ONLY_CLOSURE_DOMAIN_PACK_SHA');
}

function pluginRow(row, code) {
  exact(row, ['id', 'source_sha', 'version', 'manifest_sha256', 'pack_sha256'], code);
  assert.match(row.id ?? '', /^@shine-mage\/[a-z0-9][a-z0-9-]+$/, `${code}_ID`);
  sha1(row.source_sha, `${code}_SOURCE_SHA`);
  assert.match(row.version ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `${code}_VERSION`);
  sha256(row.manifest_sha256, `${code}_MANIFEST_SHA`);
  sha256(row.pack_sha256, `${code}_PACK_SHA`);
}

/** Markdown receipt documents wrap the deterministic JSON in explicit markers. */
export function extractReceiptJson(text) {
  assert.equal(typeof text, 'string', 'PRODUCTION_ONLY_CLOSURE_RECEIPT_TEXT');
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const begin = text.indexOf(RECEIPT_BEGIN);
  const end = text.indexOf(RECEIPT_END);
  assert.ok(begin >= 0 && end > begin, 'PRODUCTION_ONLY_CLOSURE_RECEIPT_MARKERS');
  const body = text.slice(begin + RECEIPT_BEGIN.length, end).trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  assert.ok(body.startsWith('{') && body.endsWith('}'), 'PRODUCTION_ONLY_CLOSURE_RECEIPT_JSON');
  return JSON.parse(body);
}

export function readProductionOnlyClosureReceipt(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error('PRODUCTION_ONLY_CLOSURE_RECEIPT_MISSING');
  }
  return { receipt: extractReceiptJson(text), sha256: createHash('sha256').update(text).digest('hex') };
}

/**
 * Validate a receipt and, when supplied, bind it to the tracked lock/manifest.
 * A PASS receipt is only meaningful for a real production-only run: installs
 * are required, every required check must PASS, and activation stays NOT_RUN.
 */
export function validateProductionOnlyClosureReceipt(receipt, { lockSha256 = null, sources = null, domains = null } = {}) {
  exact(receipt, ['schema_version', 'verdict', 'ref', 'commit', 'tree', 'absence', 'inputs', 'environment', 'checks',
    'composition', 'release_payload', 'consumer', 'unproven'], 'PRODUCTION_ONLY_CLOSURE_RECEIPT_SHAPE');
  assert.equal(receipt.schema_version, PRODUCTION_ONLY_CLOSURE_SCHEMA, 'PRODUCTION_ONLY_CLOSURE_RECEIPT_SCHEMA');
  assert.equal(receipt.verdict, 'PASS', 'PRODUCTION_ONLY_CLOSURE_RECEIPT_VERDICT');
  assert.ok(typeof receipt.ref === 'string' && receipt.ref.length > 0, 'PRODUCTION_ONLY_CLOSURE_RECEIPT_REF');
  sha1(receipt.commit, 'PRODUCTION_ONLY_CLOSURE_RECEIPT_COMMIT');
  sha1(receipt.tree, 'PRODUCTION_ONLY_CLOSURE_RECEIPT_TREE');

  exact(receipt.absence, ['simulated_absent', 'retained', 'boundary'], 'PRODUCTION_ONLY_CLOSURE_ABSENCE_SHAPE');
  assert.ok(Array.isArray(receipt.absence.simulated_absent), 'PRODUCTION_ONLY_CLOSURE_ABSENCE_LIST');
  assert.deepEqual([...receipt.absence.simulated_absent].sort(), [...SIMULATED_ABSENT_DIRECTORIES],
    'PRODUCTION_ONLY_CLOSURE_ABSENCE_BOUNDARY');
  assert.ok(Array.isArray(receipt.absence.retained), 'PRODUCTION_ONLY_CLOSURE_RETAINED_LIST');
  assert.deepEqual([...receipt.absence.retained].sort(), [...RETAINED_PLUGIN_DIRECTORIES],
    'PRODUCTION_ONLY_CLOSURE_RETAINED_BOUNDARY');
  assert.ok(typeof receipt.absence.boundary === 'string' && receipt.absence.boundary.length > 0,
    'PRODUCTION_ONLY_CLOSURE_ABSENCE_RATIONALE');

  exact(receipt.inputs, ['lock', 'manifest', 'artifact_lock', 'artifact_zip_sha256', 'profiles', 'sources', 'domains'],
    'PRODUCTION_ONLY_CLOSURE_INPUTS_SHAPE');
  exact(receipt.inputs.lock, ['path', 'sha256'], 'PRODUCTION_ONLY_CLOSURE_INPUT_LOCK_SHAPE');
  assert.equal(receipt.inputs.lock.path, 'config/shinemage-composition-packs.lock.json',
    'PRODUCTION_ONLY_CLOSURE_INPUT_LOCK_PATH');
  sha256(receipt.inputs.lock.sha256, 'PRODUCTION_ONLY_CLOSURE_INPUT_LOCK_SHA');
  exact(receipt.inputs.manifest, ['path', 'sha256'], 'PRODUCTION_ONLY_CLOSURE_INPUT_MANIFEST_SHAPE');
  assert.equal(receipt.inputs.manifest.path, 'config/shinemage-composition-pack-manifest.v1.json',
    'PRODUCTION_ONLY_CLOSURE_INPUT_MANIFEST_PATH');
  sha256(receipt.inputs.manifest.sha256, 'PRODUCTION_ONLY_CLOSURE_INPUT_MANIFEST_SHA');
  exact(receipt.inputs.artifact_lock, ['path', 'sha256', 'id', 'run_id', 'head_sha', 'artifact_sha256',
    'composition_lock_sha256'], 'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_SHAPE');
  assert.equal(receipt.inputs.artifact_lock.path, 'config/shinemage-composition-artifact.lock.json',
    'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_PATH');
  sha256(receipt.inputs.artifact_lock.sha256, 'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_LOCK_SHA');
  assert.ok(Number.isSafeInteger(receipt.inputs.artifact_lock.id) && receipt.inputs.artifact_lock.id > 0,
    'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_ID');
  assert.ok(Number.isSafeInteger(receipt.inputs.artifact_lock.run_id) && receipt.inputs.artifact_lock.run_id > 0,
    'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_RUN');
  sha1(receipt.inputs.artifact_lock.head_sha, 'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_HEAD');
  sha256(receipt.inputs.artifact_lock.artifact_sha256, 'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_DIGEST');
  sha256(receipt.inputs.artifact_lock.composition_lock_sha256, 'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_COMPOSITION');
  assert.equal(receipt.inputs.artifact_lock.composition_lock_sha256, receipt.inputs.lock.sha256,
    'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_LOCK_BINDING');
  assert.equal(receipt.inputs.artifact_zip_sha256, receipt.inputs.artifact_lock.artifact_sha256,
    'PRODUCTION_ONLY_CLOSURE_INPUT_ARTIFACT_ZIP');
  rows(receipt.inputs.profiles, 'PRODUCTION_ONLY_CLOSURE_INPUT_PROFILES', ['name', 'path', 'sha256']);
  for (const row of receipt.inputs.profiles) {
    assert.match(row.name ?? '', /^[a-z][a-z0-9-]*$/, 'PRODUCTION_ONLY_CLOSURE_INPUT_PROFILE_NAME');
    assert.ok(typeof row.path === 'string' && row.path.length > 0, 'PRODUCTION_ONLY_CLOSURE_INPUT_PROFILE_PATH');
    sha256(row.sha256, 'PRODUCTION_ONLY_CLOSURE_INPUT_PROFILE_SHA');
  }
  rows(receipt.inputs.sources, 'PRODUCTION_ONLY_CLOSURE_INPUT_SOURCES', ['id', 'directory', 'sha', 'manifest_sha256',
    'pack_sha256']);
  receipt.inputs.sources.forEach(sourceRow);
  assert.ok(receipt.inputs.sources.length > 0, 'PRODUCTION_ONLY_CLOSURE_INPUT_SOURCES_REQUIRED');
  rows(receipt.inputs.domains, 'PRODUCTION_ONLY_CLOSURE_INPUT_DOMAINS', ['package', 'directory', 'sha',
    'manifest_sha256', 'pack_sha256']);
  receipt.inputs.domains.forEach(domainRow);
  if (lockSha256 !== null) {
    assert.equal(receipt.inputs.lock.sha256, lockSha256, 'PRODUCTION_ONLY_CLOSURE_LOCK_MISMATCH');
  }

  exact(receipt.environment, ['node', 'pnpm', 'python', 'platform', 'arch', 'install_mode', 'commit_date'],
    'PRODUCTION_ONLY_CLOSURE_ENVIRONMENT_SHAPE');
  for (const key of Object.keys(receipt.environment)) {
    assert.ok(typeof receipt.environment[key] === 'string' && receipt.environment[key].length > 0,
      `PRODUCTION_ONLY_CLOSURE_ENVIRONMENT_${key.toUpperCase()}`);
  }
  assert.match(receipt.environment.commit_date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    'PRODUCTION_ONLY_CLOSURE_ENVIRONMENT_COMMIT_DATE');
  assert.equal(receipt.environment.install_mode, 'PRODUCTION_ONLY', 'PRODUCTION_ONLY_CLOSURE_INSTALL_MODE');

  assert.ok(Array.isArray(receipt.checks), 'PRODUCTION_ONLY_CLOSURE_CHECKS');
  const checks = new Map();
  for (const check of receipt.checks) {
    assert.ok(check && typeof check === 'object' && !Array.isArray(check), 'PRODUCTION_ONLY_CLOSURE_CHECK_SHAPE');
    assert.deepEqual(Object.keys(check).sort(), ['id', 'status'], 'PRODUCTION_ONLY_CLOSURE_CHECK_SHAPE');
    assert.ok(!checks.has(check.id), 'PRODUCTION_ONLY_CLOSURE_CHECK_DUPLICATE');
    assert.equal(check.status, 'PASS', `PRODUCTION_ONLY_CLOSURE_CHECK_FAILED ${check.id}`);
    checks.set(check.id, check);
  }
  for (const id of REQUIRED_CHECKS) {
    assert.ok(checks.has(id), `PRODUCTION_ONLY_CLOSURE_CHECK_MISSING ${id}`);
  }

  exact(receipt.composition, ['lock_sha256', 'source_manifest_sha256', 'profiles', 'plugins', 'domains',
    'business_profile'], 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_SHAPE');
  sha256(receipt.composition.lock_sha256, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_LOCK');
  assert.equal(receipt.composition.lock_sha256, receipt.inputs.lock.sha256,
    'PRODUCTION_ONLY_CLOSURE_COMPOSITION_LOCK_BINDING');
  sha256(receipt.composition.source_manifest_sha256, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_MANIFEST');
  assert.equal(receipt.composition.source_manifest_sha256, receipt.inputs.manifest.sha256,
    'PRODUCTION_ONLY_CLOSURE_COMPOSITION_MANIFEST_BINDING');
  rows(receipt.composition.profiles, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_PROFILES', ['name', 'path', 'sha256']);
  assert.deepEqual(receipt.composition.profiles, receipt.inputs.profiles,
    'PRODUCTION_ONLY_CLOSURE_COMPOSITION_PROFILE_BINDING');
  rows(receipt.composition.plugins, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_PLUGINS', ['id', 'source_sha', 'version',
    'manifest_sha256', 'pack_sha256']);
  receipt.composition.plugins.forEach(row => pluginRow(row, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_PLUGIN'));
  assert.equal(receipt.composition.plugins.length, receipt.inputs.sources.length,
    'PRODUCTION_ONLY_CLOSURE_COMPOSITION_PLUGIN_COUNT');
  for (const source of receipt.inputs.sources) {
    const plugin = receipt.composition.plugins.find(row => row.id === source.id);
    assert.ok(plugin, `PRODUCTION_ONLY_CLOSURE_COMPOSITION_PLUGIN_MISSING ${source.id}`);
    assert.equal(plugin.source_sha, source.sha, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_SOURCE_SHA');
    assert.equal(plugin.manifest_sha256, source.manifest_sha256, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_MANIFEST_SHA');
    assert.equal(plugin.pack_sha256, source.pack_sha256, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_PACK_SHA');
  }
  rows(receipt.composition.domains, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_DOMAINS', ['package', 'source_sha',
    'manifest', 'manifest_sha256', 'pack_sha256']);
  for (const domain of receipt.composition.domains) {
    const input = receipt.inputs.domains.find(row => row.package === domain.package);
    assert.ok(input, `PRODUCTION_ONLY_CLOSURE_COMPOSITION_DOMAIN_MISSING ${domain.package}`);
    assert.equal(domain.source_sha, input.sha, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_DOMAIN_SHA');
    assert.equal(domain.manifest_sha256, input.manifest_sha256, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_DOMAIN_MANIFEST');
    assert.equal(domain.pack_sha256, input.pack_sha256, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_DOMAIN_PACK');
  }
  exact(receipt.composition.business_profile, ['path', 'sha256'], 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_BUSINESS_SHAPE');
  assert.ok(typeof receipt.composition.business_profile.path === 'string' && receipt.composition.business_profile.path.length > 0,
    'PRODUCTION_ONLY_CLOSURE_COMPOSITION_BUSINESS_PATH');
  sha256(receipt.composition.business_profile.sha256, 'PRODUCTION_ONLY_CLOSURE_COMPOSITION_BUSINESS_SHA');

  exact(receipt.release_payload, ['files', 'bytes', 'profile_pack_snapshot', 'plugins', 'activation'],
    'PRODUCTION_ONLY_CLOSURE_PAYLOAD_SHAPE');
  assert.ok(Number.isSafeInteger(receipt.release_payload.files) && receipt.release_payload.files > 0,
    'PRODUCTION_ONLY_CLOSURE_PAYLOAD_FILES');
  assert.ok(Number.isSafeInteger(receipt.release_payload.bytes) && receipt.release_payload.bytes > 0,
    'PRODUCTION_ONLY_CLOSURE_PAYLOAD_BYTES');
  exact(receipt.release_payload.profile_pack_snapshot, ['path', 'sha256'],
    'PRODUCTION_ONLY_CLOSURE_PAYLOAD_SNAPSHOT_SHAPE');
  assert.equal(receipt.release_payload.profile_pack_snapshot.path, 'shinemage-release-pack-inputs.json',
    'PRODUCTION_ONLY_CLOSURE_PAYLOAD_SNAPSHOT_PATH');
  sha256(receipt.release_payload.profile_pack_snapshot.sha256, 'PRODUCTION_ONLY_CLOSURE_PAYLOAD_SNAPSHOT_SHA');
  rows(receipt.release_payload.plugins, 'PRODUCTION_ONLY_CLOSURE_PAYLOAD_PLUGINS', ['id', 'source_sha', 'version',
    'manifest_sha256', 'pack_sha256']);
  receipt.release_payload.plugins.forEach(row => pluginRow(row, 'PRODUCTION_ONLY_CLOSURE_PAYLOAD_PLUGIN'));
  assert.equal(receipt.release_payload.plugins.length, receipt.composition.plugins.length,
    'PRODUCTION_ONLY_CLOSURE_PAYLOAD_PLUGIN_COUNT');
  for (const plugin of receipt.composition.plugins) {
    const payload = receipt.release_payload.plugins.find(row => row.id === plugin.id);
    assert.ok(payload, `PRODUCTION_ONLY_CLOSURE_PAYLOAD_PLUGIN_MISSING ${plugin.id}`);
    assert.equal(payload.pack_sha256, plugin.pack_sha256, 'PRODUCTION_ONLY_CLOSURE_PAYLOAD_PACK_SHA');
    assert.equal(payload.manifest_sha256, plugin.manifest_sha256, 'PRODUCTION_ONLY_CLOSURE_PAYLOAD_MANIFEST_SHA');
  }
  assert.equal(receipt.release_payload.activation, 'NOT_RUN', 'PRODUCTION_ONLY_CLOSURE_PAYLOAD_ACTIVATION');

  exact(receipt.consumer, ['packages', 'install', 'imports', 'dev_dependencies', 'peer_dependencies', 'client_bundles'],
    'PRODUCTION_ONLY_CLOSURE_CONSUMER_SHAPE');
  assert.equal(receipt.consumer.packages, receipt.composition.plugins.length, 'PRODUCTION_ONLY_CLOSURE_CONSUMER_PACKAGES');
  assert.equal(receipt.consumer.install, 'PASS', 'PRODUCTION_ONLY_CLOSURE_CONSUMER_INSTALL');
  assert.equal(receipt.consumer.dev_dependencies, 'excluded', 'PRODUCTION_ONLY_CLOSURE_CONSUMER_DEV');
  assert.equal(receipt.consumer.peer_dependencies, 'installed', 'PRODUCTION_ONLY_CLOSURE_CONSUMER_PEERS');
  assert.equal(receipt.consumer.client_bundles, 'NOT_RUN_BROWSER_TARGET', 'PRODUCTION_ONLY_CLOSURE_CONSUMER_CLIENT');
  assert.ok(Array.isArray(receipt.consumer.imports) && receipt.consumer.imports.length >= receipt.consumer.packages,
    'PRODUCTION_ONLY_CLOSURE_CONSUMER_IMPORTS');
  for (const item of receipt.consumer.imports) {
    exact(item, ['specifier', 'status'], 'PRODUCTION_ONLY_CLOSURE_CONSUMER_IMPORT_SHAPE');
    assert.ok(typeof item.specifier === 'string' && item.specifier.length > 0,
      'PRODUCTION_ONLY_CLOSURE_CONSUMER_IMPORT_SPECIFIER');
    assert.equal(item.status, 'PASS', `PRODUCTION_ONLY_CLOSURE_CONSUMER_IMPORT_FAILED ${item.specifier}`);
  }

  assert.ok(Array.isArray(receipt.unproven) && receipt.unproven.length > 0, 'PRODUCTION_ONLY_CLOSURE_UNPROVEN');
  for (const item of receipt.unproven) {
    assert.ok(typeof item === 'string' && item.length > 0, 'PRODUCTION_ONLY_CLOSURE_UNPROVEN_ITEM');
  }

  if (sources !== null) {
    const expected = sources.map(row => ({ id: row.id, directory: row.directory, sha: row.sha,
      manifest_sha256: row.manifest_sha256, pack_sha256: row.pack_sha256 })).sort((a, b) => a.id.localeCompare(b.id));
    const actual = receipt.inputs.sources.map(row => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(actual, expected, 'PRODUCTION_ONLY_CLOSURE_SOURCE_MISMATCH');
  }
  if (domains !== null) {
    const expected = domains.map(row => ({ package: row.package, directory: row.directory, sha: row.sha,
      manifest_sha256: row.manifest_sha256, pack_sha256: row.pack_sha256 })).sort((a, b) => a.package.localeCompare(b.package));
    const actual = receipt.inputs.domains.map(row => ({ ...row })).sort((a, b) => a.package.localeCompare(b.package));
    assert.deepEqual(actual, expected, 'PRODUCTION_ONLY_CLOSURE_DOMAIN_MISMATCH');
  }
  return receipt;
}
