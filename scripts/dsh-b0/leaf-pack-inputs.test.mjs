import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fixture } from '../crm-calibration/test-support/formal-packs.fixture.mjs';
import { readLeafPackInputs } from './leaf-pack-inputs.mjs';

const selected = ['page', 'brand', 'waterfall', 'crowd-action', 'query', 'board', 'funnel'];

test('leaf preflight binds all seven sealed packages without executing fixture code', async t => {
  const f = await fixture(t, selected), packs = await readLeafPackInputs(f.packInputs);
  assert.equal(packs.plugins.length, 7);
  assert.equal(packs.plugins.find(row => row.id.endsWith('shine-funnel')).manifest.exports['./funnel'].types, './lib/funnel.d.mts');
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

for (const [name, pick, mutate, code] of [
  ['missing leaf', selected.filter(name => name !== 'query'), () => {}, /LEAF_PACK_SELECTION/],
  ['missing page package', selected.filter(name => name !== 'page'), () => {}, /LEAF_PACK_SELECTION/],
  ['private client entry', selected, (m, domain) => { if (domain === 'board') { m.exports['./client'] = './lib/private.js'; m.files.push('lib/private.js'); } }, /LEAF_PACK_CLIENT_EXPORT/],
  ['private host entry', selected, (m, domain) => { if (domain === 'brand') { m.exports['.'] = './lib/private.js'; m.files.push('lib/private.js'); } }, /LEAF_PACK_HOST_EXPORT/],
  ['another client platform', selected, (m, domain) => { if (domain === 'query') m.dsh.client.platform = 'other'; }, /LEAF_PACK_CLIENT_PLATFORM/],
  ['missing geometry declaration', selected, (m, domain) => { if (domain === 'funnel') delete m.exports['./funnel'].types; }, /LEAF_PACK_GEOMETRY_EXPORT/],
]) {
  test(`${name} is rejected without source fallback or output`, async t => {
    const f = await fixture(t, pick, mutate);
    await assert.rejects(readLeafPackInputs(f.packInputs), code);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  });
}

test('digest drift, missing inputs and relative paths cannot use a main-repository copy', async t => {
  const f = await fixture(t, selected);
  f.inputs.plugins[1].sha256 = '0'.repeat(64);
  await writeFile(f.packInputs, JSON.stringify(f.inputs));
  await assert.rejects(readLeafPackInputs(f.packInputs), /PROFILE_PACK_MANIFEST_DIGEST/);
  await assert.rejects(readLeafPackInputs(join(f.root, 'missing.json')), /ENOENT/);
  await assert.rejects(readLeafPackInputs('relative.json'), /PROFILE_PACK_INPUTS_REQUIRED/);
});

test('service-bound leaf profile must enter its candidate gate', async t => {
  const f = await fixture(t, selected);
  f.profile.service_binding = { schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase',
    source_sha: '1'.repeat(40), api_version: '1.0.0', access: 'read-write', lifecycle: 'external',
    rollback: 'preserve-service-and-state', evidence_sha256: '2'.repeat(64),
    state: { owner: 'analysis-service', application_id: 1397572502, schema_version: 1, contract: 'analytics-first-purchase-saved-provenance/v1' } };
  const bytes = Buffer.from(JSON.stringify(f.profile));
  await writeFile(join(f.root, 'profile.json'), bytes);
  f.inputs.profile.sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(f.packInputs, JSON.stringify(f.inputs));
  await assert.rejects(readLeafPackInputs(f.packInputs), /LEAF_PACK_SERVICE_BINDING_REQUIRES_CANDIDATE/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('actual pipeline rejects an already used leaf output before any source build', async t => {
  const crm = await fixture(t, ['crm', 'knowledge']), leaves = await fixture(t, selected);
  await mkdir(leaves.output); await mkdir(join(leaves.output, 'leaf'));
  const pipeline = fileURLToPath(new URL('./pipeline.mjs', import.meta.url));
  await assert.rejects(promisify(execFile)(process.execPath, [pipeline, '--check', '--python', process.env.FQ_B0_PYTHON ?? '/usr/bin/python3'], {
    env: { ...process.env, B0_BUILD_UPSTREAM: join(leaves.root, 'missing-upstream'), DSH_UPSTREAM_CHECKOUT: '',
      CRM_COMPOSITION_PACK_INPUTS: crm.packInputs, CRM_COMPOSITION_PAGE_INPUTS: leaves.packInputs, CRM_COMPOSITION_OUTPUT: leaves.output },
    timeout: 15000,
  }), /CRM_COMPOSITION_OUTPUT_EXISTS/);
  await assert.rejects(access(join(leaves.output, 'geometry')), { code: 'ENOENT' });
});
