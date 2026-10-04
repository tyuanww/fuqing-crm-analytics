import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareProfile, renderProfile } from '../../../scripts/crm-calibration/prepare-profile.mjs';

test('profile uses explicit independent service bindings without Python', () => {
  const files = renderProfile({ output: '/output', plugin: '/fixture/CRM 有空格',
    metricsOrigin: 'http://127.0.0.1:10101', knowledgeOrigin: 'http://127.0.0.1:10102', graphSettingsFile: '/private/graph.json' });
  const patch = JSON.parse(files['host.patch.yml']);
  assert.equal(patch[1].insert[0].name, 'file:///fixture/CRM%20%E6%9C%89%E7%A9%BA%E6%A0%BC/lib/host.js');
  assert.match(files['preset/tools.mjs'], /"metricsOrigin":"http:\/\/127.0.0.1:10101"/);
  assert.match(files['preset/tools.mjs'], /"knowledgeOrigin":"http:\/\/127.0.0.1:10102"/);
  assert.doesNotMatch(files['preset/tools.mjs'], /python|CRM_METRICS_PYTHON/);
  assert.match(files['preset/tools.mjs'], /graph.apply/); assert.doesNotMatch(files['preset/tools.mjs'], /process.env/);
  assert.equal(JSON.parse(files['preset/preset.yml']).name, 'CRM 知识与指标');
  assert.ok(!renderProfile({ output: '/output', plugin: '/plugin' })['preset/tools.mjs'].includes('graph.apply'));
});

test('preparation writes only new private output, refuses overwrite, leaves existing assets intact', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-profile-')); t.after(() => rm(dir, { recursive: true }));
  const plugin = join(dir, 'plugin'); await mkdir(join(plugin, 'lib'), { recursive: true });
  for (const file of ['host.js', 'client.js', 'index.js']) await writeFile(join(plugin, 'lib', file), 'fixture');
  const output = join(dir, 'new-output'); const options = { plugin, output };
  const result = await prepareProfile(options); assert.equal(result.existing_profile_changed, false);
  assert.equal(result.page_delivery.status, 'NOT_AVAILABLE');
  assert.equal(result.schema, 'crm-profile-assets/v2');
  assert.equal(result.synthetic_services.metrics.reason, 'SERVICE_NOT_CONFIGURED');
  assert.equal(result.synthetic_services.knowledge.reason, 'SERVICE_NOT_CONFIGURED');
  const before = await readFile(join(output, 'preset/tools.mjs'), 'utf8');
  assert.ok(before.includes('?crm_build=' + result.revision));
  await assert.rejects(prepareProfile(options), /EEXIST/);
  assert.equal(await readFile(join(output, 'preset/tools.mjs'), 'utf8'), before);
  assert.equal(await readFile(join(plugin, 'lib/index.js'), 'utf8'), 'fixture');
});

test('profile composes the selected public page entry with a digest, without importing it into CRM', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-page-profile-')); t.after(() => rm(dir, { recursive: true }));
  const plugin = join(dir, 'crm'), pageToolsPlugin = join(dir, 'page provider');
  await mkdir(join(plugin, 'lib'), { recursive: true }); await mkdir(join(pageToolsPlugin, 'lib'), { recursive: true });
  for (const file of ['host.js', 'client.js', 'index.js']) await writeFile(join(plugin, 'lib', file), 'fixture');
  const manifest = { name: '@shine-mage/dsh-analytics-workbench-b0', version: '0.0.0-b0',
    peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' },
    exports: { './page-tools': './lib/page-tools.js' }, files: ['lib/page-tools.js'] };
  await writeFile(join(pageToolsPlugin, 'package.json'), JSON.stringify(manifest));
  const code = 'throw new Error("profile preparation must not execute modules");';
  await writeFile(join(pageToolsPlugin, 'lib/page-tools.js'), code);
  const output = join(dir, 'composed');
  const receipt = await prepareProfile({ output, plugin, pageToolsPlugin });
  const digest = createHash('sha256').update(code).digest('hex');
  assert.equal(receipt.page_delivery.sha256, digest);
  assert.equal(receipt.page_delivery.status, 'CONFIGURED_NOT_RUN');
  const patch = JSON.parse(await readFile(join(output, 'preset/agent.cordis.yml')));
  const page = patch.find(row => row.id === 'workbench-page-tools-v1');
  assert.ok(page.name.includes('page%20provider/lib/page-tools.js?page_build=' + digest));
  assert.doesNotMatch(await readFile(join(output, 'preset/tools.mjs'), 'utf8'), /page-tools|workbench/);
  for (const [reason, update] of [
    ['identity', m => { m.name = '@untrusted/fake'; }],
    ['pin', m => { m.peerDependencies['@deepseek-ai/dsh-tools'] = 'latest'; }],
    ['private', m => { m.exports['./page-tools'] = './src/page-tools.ts'; }],
    ['unpacked', m => { m.files = []; }],
  ]) {
    const bad = structuredClone(manifest); update(bad);
    await writeFile(join(pageToolsPlugin, 'package.json'), JSON.stringify(bad));
    const refused = join(dir, reason);
    await assert.rejects(() => prepareProfile({ output: refused, plugin, pageToolsPlugin }), /PAGE_PROVIDER_/);
    await assert.rejects(() => access(refused), /ENOENT/);
  }
});

test('legacy Python and unsafe service bindings fail before writing profile assets', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-service-profile-')); t.after(() => rm(dir, { recursive: true }));
  for (const [name, config, error] of [
    ['legacy', { python: '/not/executed/python' }, /CRM_PROFILE_PYTHON_REMOVED/],
    ['external', { metricsOrigin: 'https://example.invalid' }, /CRM_PROFILE_SERVICE_ORIGIN_INVALID/],
    ['credentials', { knowledgeOrigin: 'http://user:secret@127.0.0.1:10102' }, /CRM_PROFILE_SERVICE_ORIGIN_INVALID/],
    ['path', { metricsOrigin: 'http://127.0.0.1:10101/internal' }, /CRM_PROFILE_SERVICE_ORIGIN_INVALID/],
  ]) {
    const output = join(dir, name);
    await assert.rejects(() => prepareProfile({ output, plugin: '/not/read/plugin', ...config }), error);
    await assert.rejects(() => access(output), /ENOENT/);
  }
});
