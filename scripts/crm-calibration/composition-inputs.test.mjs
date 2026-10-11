import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './test-support/formal-packs.fixture.mjs';
import { loadComposition, readCompositionInputs } from './composition-inputs.mjs';

test('package scopes cannot request another composition or fall back to workspace input', async () => {
  for (const scope of ['crm-package', 'knowledge-package']) {
    await assert.rejects(loadComposition({ scope, page: true }), /CRM_COMPOSITION_SCOPE/);
  }
  await assert.rejects(loadComposition({ scope: 'crmPackage' }), /CRM_COMPOSITION_SCOPE/);
});

test('composition binds the two independent packs and a separately selected public page provider', async t => {
  const f = await fixture(t, ['crm', 'knowledge']), page = await fixture(t, ['page']);
  const loaded = await readCompositionInputs({ inputsPath: f.packInputs, pageInputsPath: page.packInputs });
  assert.equal(loaded.packs.plugins.length, 2);
  assert.equal(loaded.pages.plugins[0].manifest.exports['./page-tools'], './lib/page-tools.js');
  // These sealed fixture modules throw if evaluated; input validation must only read them.
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

for (const [name, selected, mutate, code] of [
  ['missing knowledge', ['crm'], () => {}, /CRM_COMPOSITION_SELECTION/],
  ['relaxed Cordis peer', ['crm', 'knowledge'], m => { m.peerDependencies['@deepseek-ai/cordis'] = '4.0.4'; }, /CRM_COMPOSITION_CORDIS_PIN/],
  ['missing SDK peer', ['crm', 'knowledge'], m => { delete m.peerDependencies['@deepseek-ai/dsh-tools']; }, /PLUGIN_PACK_DSH_PEER_INVALID/],
  ['private graph entry', ['crm', 'knowledge'], (m, domain) => { if (domain === 'knowledge') { m.exports['./graph-tools'] = './lib/private.js'; m.files.push('lib/private.js'); } }, /CRM_COMPOSITION_PUBLIC_EXPORT/],
  ['another domain under the CRM identity', ['crm', 'knowledge'], m => { m.shinemage.plugin_domain = 'other'; }, /CRM_PROFILE_SPLIT_PACKAGE_REQUIRED/],
]) {
  test(`${name} cannot replace the fixed public composition inputs`, async t => {
    const f = await fixture(t, selected, mutate);
    await assert.rejects(readCompositionInputs({ inputsPath: f.packInputs }), code);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  });
}

test('page selection and digests cannot silently fall back to source or another domain', async t => {
  const f = await fixture(t, ['crm', 'knowledge']);
  const wrongPage = await fixture(t, ['page'], m => { m.name = '@shine-mage/dsh-shine-board'; });
  await assert.rejects(readCompositionInputs({ inputsPath: f.packInputs, pageInputsPath: wrongPage.packInputs }), /CRM_COMPOSITION_PAGE_REQUIRED/);
  f.inputs.plugins[0].sha256 = '0'.repeat(64);
  await writeFile(f.packInputs, JSON.stringify(f.inputs));
  await assert.rejects(readCompositionInputs({ inputsPath: f.packInputs }), /PROFILE_PACK_MANIFEST_DIGEST/);
  await assert.rejects(readCompositionInputs({ inputsPath: 'relative.json' }), /PROFILE_PACK_INPUTS_REQUIRED/);
  await assert.rejects(readCompositionInputs({ inputsPath: join(f.root, 'missing.json') }), /ENOENT/);
});

test('another valid page profile cannot replace the already bound CRM package', async t => {
  const f = await fixture(t, ['crm', 'knowledge']), overlap = await fixture(t, ['crm', 'page']);
  await assert.rejects(readCompositionInputs({ inputsPath: f.packInputs, pageInputsPath: overlap.packInputs }), /CRM_COMPOSITION_PAGE_SELECTION_OVERLAP/);
});

test('a service-bound input remains subject to the candidate gate', async t => {
  const f = await fixture(t, ['crm', 'knowledge']);
  f.profile.service_binding = { schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase',
    source_sha: '1'.repeat(40), api_version: '1.0.0', access: 'read-write', lifecycle: 'external',
    rollback: 'preserve-service-and-state', evidence_sha256: '2'.repeat(64),
    state: { owner: 'analysis-service', application_id: 1397572502, schema_version: 1, contract: 'analytics-first-purchase-saved-provenance/v1' } };
  const bytes = Buffer.from(JSON.stringify(f.profile));
  await writeFile(join(f.root, 'profile.json'), bytes);
  f.inputs.profile.sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(f.packInputs, JSON.stringify(f.inputs));
  await assert.rejects(readCompositionInputs({ inputsPath: f.packInputs }), /CRM_COMPOSITION_SERVICE_BINDING_REQUIRES_CANDIDATE/);
});
