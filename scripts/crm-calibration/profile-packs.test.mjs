/** Main-repository composition consumer: synthetic formal-pack fixtures, no SDK, host or service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareProfile } from './prepare-profile.mjs';
import { fixture, specs } from './test-support/formal-packs.fixture.mjs';
import { TOOLCHAIN } from '../release/toolchain.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

test('CRM, knowledge and page profile binds only the verified packages and never executes them', async t => {
  const f = await fixture(t);
  await assert.rejects(access(join(f.root, 'dsh-plugins')), { code: 'ENOENT' });
  const receipt = await prepareProfile({ output: f.output, packInputs: f.packInputs,
    metricsOrigin: 'http://127.0.0.1:4335', knowledgeOrigin: 'http://127.0.0.1:4336' });
  assert.equal(receipt.schema, 'crm-profile-assets/v3');
  assert.equal(receipt.package_inputs.profile_sha256, f.inputs.profile.sha256);
  assert.equal(receipt.package_inputs.inputs_sha256, hash(await readFile(f.packInputs)));
  assert.equal(receipt.package_inputs.host, 'NOT_RUN');
  assert.equal(receipt.package_inputs.release_ready, false);
  assert.deepEqual(receipt.toolchain, { sdk_version: TOOLCHAIN.sdk_version, upstream_sha: TOOLCHAIN.upstream_sha });
  assert.deepEqual(receipt.presets.map(row => row.id), ['crm-knowledge']);
  assert.equal(receipt.service_started_or_restarted, false);
  const rows = JSON.parse(await readFile(join(f.output, 'preset/agent.cordis.yml')));
  for (const [key, id, entry] of [['crm', 'crm-tools', 'lib/index.js'], ['knowledge', 'knowledge-tools-v1', 'lib/index.js'],
    ['page', 'workbench-page-tools-v1', 'lib/page-tools.js']]) {
    const domain = key === 'page' ? receipt.page_delivery : receipt.packages[key];
    const installed = receipt.package_inputs.plugins.find(row => row.id === specs[key].id);
    assert.equal(domain.root, installed.root);
    assert.equal(installed.manifest_sha256, f.inputs.plugins.find(row => row.id === specs[key].id).sha256);
    const url = new URL(rows.find(row => row.id === id).name);
    assert.equal(url.searchParams.get('build'), domain.sha256);
    assert.equal(hash(await readFile(join(domain.root, entry))), domain.entries[entry]);
  }
  assert.doesNotMatch(JSON.stringify(rows), /absent-|src\/|build\.mjs/);
  const before = await readFile(join(f.output, 'manifest.json'));
  await assert.rejects(prepareProfile({ output: f.output, packInputs: f.packInputs }), { code: 'EEXIST' });
  assert.deepEqual(await readFile(join(f.output, 'manifest.json')), before);
});

for (const domain of ['crm', 'knowledge']) {
  test(`${domain} can be prepared independently from its own pack`, async t => {
    const f = await fixture(t, [domain]);
    const receipt = await prepareProfile({ output: f.output, packInputs: f.packInputs });
    assert.deepEqual(Object.keys(receipt.packages), [domain]);
    assert.equal(receipt.package_inputs.plugins.length, 1);
    assert.deepEqual(receipt.presets.map(row => row.id), ['crm-knowledge']);
    assert.equal(receipt.page_delivery.status, 'NOT_AVAILABLE');
    assert.equal(receipt.private_knowledge_identity, 'NOT_REQUESTED');
  });
}

test('formal pack selection is explicit and cannot be mixed with an unverified root', async t => {
  const f = await fixture(t, ['crm']);
  for (const [name, selection, code] of [
    ['mixed', { packInputs: f.packInputs, plugin: '/must-not-read/main/plugin' }, /CRM_PROFILE_PACK_INPUTS_AMBIGUOUS/],
    ['relative', { packInputs: 'inputs.json' }, /PROFILE_PACK_INPUTS_REQUIRED/],
    ['missing', { packInputs: join(f.root, 'missing.json') }, /ENOENT/],
    ['empty', {}, /CRM_PROFILE_PLUGIN_REQUIRED/],
  ]) {
    const output = join(f.root, name);
    await assert.rejects(prepareProfile({ output, ...selection }), code);
    await assert.rejects(access(output), { code: 'ENOENT' });
  }
});

for (const [name, selected, mutate, code] of [
  ['wrong domain', ['crm'], m => { m.shinemage.plugin_domain = 'knowledge'; }, /CRM_PROFILE_SPLIT_PACKAGE_REQUIRED/],
  ['legacy Cordis', ['crm'], m => { m.peerDependencies['@deepseek-ai/cordis'] = '4.0.2'; }, /CRM_PROFILE_CORDIS_PIN/],
  ['Cordis range', ['knowledge'], m => { m.peerDependencies['@deepseek-ai/cordis'] = '~4.0.5'; }, /CRM_PROFILE_CORDIS_PIN/],
  ['another Cordis patch', ['knowledge'], m => { m.peerDependencies['@deepseek-ai/cordis'] = '4.0.6'; }, /CRM_PROFILE_CORDIS_PIN/],
  ['private export', ['knowledge'], m => { m.exports['./graph-tools'] = './lib/private.js'; m.files.push('lib/private.js'); }, /CRM_PROFILE_PUBLIC_EXPORT_REQUIRED/],
  ['missing export', ['knowledge'], m => { delete m.exports['./graph-tools']; }, /CRM_PROFILE_PUBLIC_EXPORT_REQUIRED/],
  ['unrelated package', ['crm'], m => { m.name = '@shine-mage/dsh-shine-brand'; }, /CRM_PROFILE_PACK_SELECTION_INVALID/],
  ['page provider alone', ['page'], () => {}, /CRM_PROFILE_PLUGIN_REQUIRED/],
]) {
  test(`${name} is refused before persistent output`, async t => {
    const f = await fixture(t, selected, mutate);
    await assert.rejects(prepareProfile({ output: f.output, packInputs: f.packInputs }), code);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  });
}

test('package and profile digest failures do not create output or fall back to sources', async t => {
  for (const target of ['profile', 'manifest', 'archive']) {
    const f = await fixture(t, ['crm']);
    if (target === 'profile') f.inputs.profile.sha256 = '0'.repeat(64);
    else if (target === 'manifest') f.inputs.plugins[0].sha256 = '0'.repeat(64);
    else {
      const directory = join(f.root, 'packs/crm');
      const receipt = JSON.parse(await readFile(join(directory, 'plugin-pack.json')));
      const archive = join(directory, receipt.tarball.name), bytes = await readFile(archive);
      bytes[bytes.length - 1] ^= 1;
      await writeFile(archive, bytes);
    }
    await writeFile(f.packInputs, json(f.inputs));
    await assert.rejects(prepareProfile({ output: f.output, packInputs: f.packInputs }), /DIGEST/);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  }
});

test('service and graph configuration remain fail-closed before pack installation', async t => {
  const f = await fixture(t, ['knowledge']);
  const settings = join(f.root, 'graph-settings.json');
  await writeFile(settings, '{}', { mode: 0o644 });
  await chmod(settings, 0o644);
  for (const [name, options, code] of [
    ['metrics', { metricsOrigin: 'http://127.0.0.1:4335' }, /METRICS_PLUGIN_REQUIRED/],
    ['external', { knowledgeOrigin: 'https://example.invalid' }, /SERVICE_ORIGIN_INVALID/],
    ['graph', { graphSettingsFile: settings }, /GRAPH_SETTINGS_PRIVATE_REQUIRED/],
    ['relative graph', { graphSettingsFile: 'must-not-read/private.json' }, /absolute/],
    ['legacy Python', { python: '/must-not-execute/python' }, /PYTHON_REMOVED/],
  ]) {
    const output = join(f.root, name.replaceAll(' ', '-'));
    await assert.rejects(prepareProfile({ output, packInputs: f.packInputs, ...options }), code);
    await assert.rejects(access(output), { code: 'ENOENT' });
  }
});

test('a service-bound profile cannot bypass its candidate gate through profile preparation', async t => {
  const f = await fixture(t, ['crm']);
  f.profile.service_binding = { schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase',
    source_sha: '1'.repeat(40), api_version: '1.0.0', access: 'read-write', lifecycle: 'external',
    rollback: 'preserve-service-and-state', evidence_sha256: '2'.repeat(64),
    state: { owner: 'analysis-service', application_id: 1397572502, schema_version: 1,
      contract: 'analytics-first-purchase-saved-provenance/v1' } };
  const bytes = Buffer.from(json(f.profile));
  await writeFile(join(f.root, 'profile.json'), bytes);
  f.inputs.profile.sha256 = hash(bytes);
  await writeFile(f.packInputs, json(f.inputs));
  await assert.rejects(prepareProfile({ output: f.output, packInputs: f.packInputs }), /CRM_PROFILE_PACK_SERVICE_BINDING_REQUIRES_CANDIDATE/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});
