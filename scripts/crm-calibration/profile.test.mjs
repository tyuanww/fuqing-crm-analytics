import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareProfile, renderProfile } from './prepare-profile.mjs';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'split-profile-')); t.after(() => rm(root, { recursive: true, force: true }));
  const make = async (domain, name, entries) => {
    const path = join(root, domain); await mkdir(join(path, 'lib'), { recursive: true });
    const manifest = { name, version: '0.0.0-fixture', shinemage: { plugin_domain: domain, composition_contract: 'crm-knowledge-split/v1' },
      peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.1-rc.3', ...(domain === 'page' ? {} : { '@deepseek-ai/cordis': '4.0.5' }) },
      exports: entries, files: Object.values(entries).map(value => value.slice(2)) };
    await writeFile(join(path, 'package.json'), JSON.stringify(manifest));
    for (const entry of manifest.files) await writeFile(join(path, entry), 'throw new Error("profile preparation must not execute this package");');
    return path;
  };
  return { root,
    plugin: await make('crm', '@shine-mage/dsh-crm-knowledge', { '.': './lib/index.js', './host': './lib/host.js', './client': './lib/client.js' }),
    knowledgePlugin: await make('knowledge', '@shine-mage/dsh-knowledge', { '.': './lib/index.js', './graph-tools': './lib/graph-tools.js' }),
    pageToolsPlugin: await make('page', '@shine-mage/dsh-analytics-workbench-b0', { './page-tools': './lib/page-tools.js' }) };
}
test('profile composes independent agent scopes instead of aggregating apply calls', () => {
  const files = renderProfile({ output: '/output', plugin: '/fixture/CRM 有空格', knowledgePlugin: '/fixture/knowledge',
    metricsOrigin: 'http://127.0.0.1:10101', knowledgeOrigin: 'http://127.0.0.1:10102',
    graphSettingsFile: '/private/graph.json',
    pageTools: { root: '/fixture/workbench', sha256: 'a'.repeat(64) } });
  const rows = JSON.parse(files['preset/agent.cordis.yml']);
  assert.equal(rows.find(x => x.id === 'crm-tools').config.metricsOrigin, 'http://127.0.0.1:10101');
  assert.equal(rows.find(x => x.id === 'crm-tools').config.knowledgeOrigin, undefined);
  assert.equal(rows.find(x => x.id === 'knowledge-tools-v1').config.knowledgeOrigin, 'http://127.0.0.1:10102');
  assert.match(rows.find(x => x.id === 'crm-tools').name, /CRM%20/);
  assert.match(rows.find(x => x.id === 'knowledge-graph-v1').name, /knowledge\/lib\/graph-tools.js/);
  assert.equal(files['preset/tools.mjs'], undefined);
  const declarations = JSON.parse(files['preset.patch.yml'])[0].insert;
  assert.equal(declarations.length, 1);
  assert.equal(declarations[0].name, '@deepseek-ai/dsh-agent-preset');
  assert.equal(declarations[0].config.id, 'crm-knowledge');
  assert.deepEqual(declarations[0].config.plugins, rows);
  assert.doesNotMatch(JSON.stringify(files), /python|CRM_METRICS_PYTHON|process.env/);
});
test('either domain can be selected alone and preparation cannot overwrite existing assets', async t => {
  const f = await fixture(t);
  for (const [domain, selection] of [['crm', { plugin: f.plugin }], ['knowledge', { knowledgePlugin: f.knowledgePlugin }]]) {
    const output = join(f.root, domain + '-only');
    const result = await prepareProfile({ output, ...selection });
    assert.equal(result.schema, 'crm-profile-assets/v3');
    assert.deepEqual(result.preset_loader, { contract: 'dsh-agent-preset-declaration/v1', id: 'crm-knowledge', patch: 'preset.patch.yml' });
    assert.deepEqual(result.presets, [{ id: 'crm-knowledge', name: domain === 'crm' ? 'CRM 指标与分析' : '知识与教材', order: 2 }]);
    assert.deepEqual(Object.keys(result.packages), [domain]);
    assert.equal(result.existing_profile_changed, false); assert.equal(result.service_started_or_restarted, false);
    const body = await readFile(join(output, 'preset/agent.cordis.yml'), 'utf8');
    const rows = JSON.parse(body);
    assert.equal(rows.length, 2);
    assert.ok(rows[1].name.includes('?build=' + result.packages[domain].sha256));
    if (domain === 'knowledge') {
      assert.deepEqual(JSON.parse(await readFile(join(output, 'host.patch.yml'))), []);
      assert.doesNotMatch(rows[0].config.prefix, /query_crm_dashboard_gsv|query_crm_metrics_v1/);
    } else assert.doesNotMatch(rows[0].config.prefix, /crm_knowledge_explain|query_crm_knowledge_graph/);
    await assert.rejects(prepareProfile({ output, ...selection }), /EEXIST/);
    assert.equal(await readFile(join(output, 'preset/agent.cordis.yml'), 'utf8'), body);
  }
});
test('a knowledge-only update changes its binding without changing the CRM binding', async t => {
  const f = await fixture(t);
  const before = await prepareProfile({ ...f, output: join(f.root, 'first') });
  await writeFile(join(f.knowledgePlugin, 'lib/index.js'), 'export const next = true;');
  const after = await prepareProfile({ ...f, output: join(f.root, 'second') });
  assert.equal(before.packages.crm.sha256, after.packages.crm.sha256);
  assert.notEqual(before.packages.knowledge.sha256, after.packages.knowledge.sha256);
  assert.notEqual(before.revision, after.revision);
  assert.equal(after.page_delivery.status, 'CONFIGURED_NOT_RUN');
});
test('old combined artifacts, wrong identities/peers, private exports and symlinked entries fail before output', async t => {
  const f = await fixture(t); const path = join(f.knowledgePlugin, 'package.json');
  const original = JSON.parse(await readFile(path));
  for (const [key, mutate, pattern] of [
    ['identity', m => { m.name = '@unknown/plugin'; }, /_IDENTITY/],
    ['pin', m => { m.peerDependencies['@deepseek-ai/dsh-tools'] = 'latest'; }, /_DSH_PIN/],
    ['cordis', m => { m.peerDependencies['@deepseek-ai/cordis'] = '*'; }, /_CORDIS_PIN/],
    ['legacy-cordis', m => { m.peerDependencies['@deepseek-ai/cordis'] = '4.0.2'; }, /_CORDIS_PIN/],
    ['cordis-range', m => { m.peerDependencies['@deepseek-ai/cordis'] = '~4.0.5'; }, /_CORDIS_PIN/],
    ['cordis-next-patch', m => { m.peerDependencies['@deepseek-ai/cordis'] = '4.0.6'; }, /_CORDIS_PIN/],
    ['legacy', m => { delete m.shinemage; }, /SPLIT_PACKAGE_REQUIRED/],
    ['contract', m => { m.shinemage.composition_contract = 'crm-knowledge-split/v2'; }, /COMPOSITION_CONTRACT_MISMATCH/],
    ['private', m => { m.exports['.'] = './src/index.ts'; }, /PUBLIC_EXPORT_REQUIRED/],
    ['not-packed', m => { m.files = []; }, /EXPORT_NOT_PACKED/],
  ]) {
    const bad = structuredClone(original); mutate(bad); await writeFile(path, JSON.stringify(bad));
    const output = join(f.root, key);
    await assert.rejects(prepareProfile({ output, knowledgePlugin: f.knowledgePlugin }), pattern);
    await assert.rejects(access(output), /ENOENT/);
  }
  await writeFile(path, JSON.stringify(original));
  const entry = join(f.knowledgePlugin, 'lib/index.js'); await rm(entry); await symlink(join(f.plugin, 'lib/index.js'), entry);
  await assert.rejects(prepareProfile({ output: join(f.root, 'linked'), knowledgePlugin: f.knowledgePlugin }), /PACKAGE_FILE_INVALID/);
});
test('legacy Python, invalid origins and silently missing domain selections are rejected', async t => {
  const root = await mkdtemp(join(tmpdir(), 'invalid-profile-')); t.after(() => rm(root, { recursive: true }));
  for (const [name, config, error] of [
    ['legacy', { plugin: '/not/read', python: '/not/executed/python' }, /PYTHON_REMOVED/],
    ['external', { plugin: '/not/read', metricsOrigin: 'https://example.invalid' }, /SERVICE_ORIGIN_INVALID/],
    ['credentials', { plugin: '/not/read', knowledgeOrigin: 'http://user:secret@127.0.0.1' }, /SERVICE_ORIGIN_INVALID/],
    ['knowledge', { plugin: '/not/read', knowledgeOrigin: 'http://127.0.0.1:1234' }, /KNOWLEDGE_PLUGIN_REQUIRED/],
    ['graph', { plugin: '/not/read', graphSettingsFile: '/not/read/config' }, /KNOWLEDGE_PLUGIN_REQUIRED/],
    ['empty', {}, /PLUGIN_REQUIRED/],
  ]) {
    const output = join(root, name); await assert.rejects(prepareProfile({ output, ...config }), error);
    await assert.rejects(access(output), /ENOENT/);
  }
});
