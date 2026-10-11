import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fixture } from '../crm-calibration/test-support/formal-packs.fixture.mjs';
import { WORKBENCH_CLIENT_SCOPES, loadWorkbenchClient, readWorkbenchClientInputs } from './workbench-client-pack-inputs.mjs';

const selected = ['page', 'brand', 'waterfall', 'crowd-action', 'query', 'board', 'funnel'];
const exec = promisify(execFile);

test('client preflight binds the sealed public entry without evaluating package code', async t => {
  const f = await fixture(t, selected), packs = await readWorkbenchClientInputs(f.packInputs);
  assert.equal(packs.plugins.length, 7);
  assert.equal(packs.plugins[0].manifest.exports['./client'], './lib/client.js');
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

for (const [name, mutate, code] of [
  ['missing client', m => { delete m.exports['./client']; }, /WORKBENCH_PACK_CLIENT_EXPORT/],
  ['private client', m => { m.exports['./client'] = './lib/private.js'; m.files.push('lib/private.js'); }, /WORKBENCH_PACK_CLIENT_EXPORT/],
  ['another platform', m => { m.dsh.client.platform = 'other'; }, /WORKBENCH_PACK_CLIENT_PLATFORM/],
  ['SDK drift', m => { m.peerDependencies['@deepseek-ai/dsh-tools'] = '0.1.7-rc.1'; }, /PLUGIN_PACK_DSH_PEER_INVALID/],
]) {
  test(`${name} fails before client evaluation or output`, async t => {
    const f = await fixture(t, selected, (m, domain) => { if (domain === 'page') mutate(m); });
    await assert.rejects(readWorkbenchClientInputs(f.packInputs), code);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  });
}

test('bad manifest digest, missing and relative inputs cannot fall back to a source copy', async t => {
  const f = await fixture(t, selected);
  f.inputs.plugins[0].sha256 = '0'.repeat(64);
  await writeFile(f.packInputs, JSON.stringify(f.inputs));
  await assert.rejects(readWorkbenchClientInputs(f.packInputs), /PROFILE_PACK_MANIFEST_DIGEST/);
  await assert.rejects(readWorkbenchClientInputs(join(f.root, 'missing.json')), /ENOENT/);
  await assert.rejects(readWorkbenchClientInputs('relative.json'), /PROFILE_PACK_INPUTS_REQUIRED/);
});

for (const variable of ['B0_BUILD_UPSTREAM', 'CRM_COMPOSITION_OUTPUT']) {
  test(`missing absolute ${variable} stops before runtime preparation`, async t => {
    const f = await fixture(t, selected);
    await assert.rejects(exec(process.execPath, ['--input-type=module', '-e',
      `import { loadWorkbenchClient } from ${JSON.stringify(new URL('./workbench-client-pack-inputs.mjs', import.meta.url).href)}; await loadWorkbenchClient();`], {
      env: { ...process.env, CRM_COMPOSITION_PAGE_INPUTS: f.packInputs,
        B0_BUILD_UPSTREAM: join(f.root, 'missing-upstream'), CRM_COMPOSITION_OUTPUT: f.output, [variable]: 'relative' },
      cwd: fileURLToPath(new URL('../..', import.meta.url)), timeout: 15000,
    }), /WORKBENCH_PACK_(UPSTREAM|OUTPUT)_REQUIRED/);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  });
}

test('unknown and escaping consumer scopes fail before even reading inputs', async () => {
  for (const scope of ['unknown', '../other', '/absolute/other']) {
    await assert.rejects(loadWorkbenchClient({ scope }), /WORKBENCH_PACK_SCOPE/);
  }
});

for (const scope of WORKBENCH_CLIENT_SCOPES) test(`pipeline refuses used ${scope} before building Workbench source`, async t => {
  const crm = await fixture(t, ['crm', 'knowledge']), f = await fixture(t, selected);
  await mkdir(f.output); await mkdir(join(f.output, scope));
  await assert.rejects(exec(process.execPath, [fileURLToPath(new URL('./pipeline.mjs', import.meta.url)), '--check',
    '--python', process.env.FQ_B0_PYTHON ?? '/usr/bin/python3'], {
    env: { ...process.env, B0_BUILD_UPSTREAM: join(f.root, 'missing-upstream'), DSH_UPSTREAM_CHECKOUT: '',
      CRM_COMPOSITION_PACK_INPUTS: crm.packInputs, CRM_COMPOSITION_PAGE_INPUTS: f.packInputs, CRM_COMPOSITION_OUTPUT: f.output },
    timeout: 15000,
  }), /CRM_COMPOSITION_OUTPUT_EXISTS/);
  await assert.rejects(access(join(f.output, 'leaf')), { code: 'ENOENT' });
});
