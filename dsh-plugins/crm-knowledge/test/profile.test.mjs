import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareProfile, renderProfile } from '../../../scripts/crm-calibration/prepare-profile.mjs';

test('profile uses concrete client-discoverable host and explicit per-preset Python', () => {
  const files = renderProfile({ output: '/output', plugin: '/fixture/CRM 有空格', python: '/fixture/python3.14', graphSettingsFile: '/private/graph.json' });
  const patch = JSON.parse(files['host.patch.yml']);
  assert.equal(patch[1].insert[0].name, 'file:///fixture/CRM%20%E6%9C%89%E7%A9%BA%E6%A0%BC/lib/host.js');
  assert.match(files['preset/tools.mjs'], /crm.apply\(ctx, \{ python:/);
  assert.match(files['preset/tools.mjs'], /graph.apply/); assert.doesNotMatch(files['preset/tools.mjs'], /process.env/);
  assert.equal(JSON.parse(files['preset/preset.yml']).name, 'CRM 知识与指标');
  assert.ok(!renderProfile({ output: '/output', plugin: '/plugin', python: '/python' })['preset/tools.mjs'].includes('graph.apply'));
});

test('preparation writes only new private output, refuses overwrite, leaves existing assets intact', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-profile-')); t.after(() => rm(dir, { recursive: true }));
  const plugin = join(dir, 'plugin'); await mkdir(join(plugin, 'lib'), { recursive: true });
  for (const file of ['host.js', 'client.js', 'index.js']) await writeFile(join(plugin, 'lib', file), 'fixture');
  const python = join(dir, 'python'); await writeFile(python, '#!/bin/sh\necho "Python 3.14.0"\n', { mode: 0o700 });
  const output = join(dir, 'new-output'); const options = { plugin, python, output };
  const result = await prepareProfile(options); assert.equal(result.existing_profile_changed, false);
  const before = await readFile(join(output, 'preset/tools.mjs'), 'utf8');
  assert.ok(before.includes('?crm_build=' + result.revision));
  await assert.rejects(prepareProfile(options), /EEXIST/);
  assert.equal(await readFile(join(output, 'preset/tools.mjs'), 'utf8'), before);
  assert.equal(await readFile(join(plugin, 'lib/index.js'), 'utf8'), 'fixture');
});
