import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const leafBuilds = ['shine-brand', 'shine-board', 'shine-query', 'shine-funnel', 'shine-waterfall', 'shine-crowd-action', 'crm-knowledge', 'knowledge'];

test('leaf plugin builds use the shared dev kit and do not import workbench toolchain source', async () => {
  for (const name of leafBuilds) {
    const source = await readFile(join(root, 'dsh-plugins', name, 'build.mjs'), 'utf8');
    assert.match(source, /@shine-mage\/dsh-plugin-kit\/toolchain/, `${name} must use plugin-kit`);
    assert.doesNotMatch(source, /analytics-workbench/, `${name} build must not depend on workbench`);
  }
});

test('the dev kit owns pin and build locks without business typecheck targets', async () => {
  const kit = join(root, 'dsh-plugins/plugin-kit');
  const source = await readFile(join(kit, 'toolchain.mjs'), 'utf8');
  assert.doesNotMatch(source, /analytics-workbench|checkTypes|saved-analysis-view/);
  assert.equal(JSON.parse(await readFile(join(kit, 'toolchain.json'), 'utf8')).sdk_version, '0.1.7-rc.2');
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    assert.ok((await lstat(join(kit, 'build-tools', file))).isFile());
    await assert.rejects(() => lstat(join(root, 'dsh-plugins/analytics-workbench/build-tools', file)), { code: 'ENOENT' });
  }
  await assert.rejects(() => lstat(join(root, 'dsh-plugins/analytics-workbench/toolchain.json')), { code: 'ENOENT' });
});

test('published leaf files do not expose source paths as runtime exports', async () => {
  for (const name of ['shine-funnel', 'shine-waterfall']) {
    const manifest = JSON.parse(await readFile(join(root, 'dsh-plugins', name, 'package.json'), 'utf8'));
    assert.ok(manifest.files.every(file => !/(^|\/)src(\/|$)/.test(file)), `${name} package must publish built runtime files`);
    assert.ok(Object.values(manifest.exports).flatMap(value => typeof value === 'string' ? [value] : Object.values(value)).every(value => !/(^|\/)src(\/|$)/.test(value)), `${name} exports must point to lib`);
    const source = await readFile(join(root, 'dsh-plugins', name, 'build.mjs'), 'utf8');
    assert.match(source, /node_modules\/@shine-mage\/board-components\/lib\//, `${name} must publish types from the locked package`);
    assert.ok(manifest.files.includes('bundled-dependencies.json'));
  }
});

test('CRM and Knowledge docs match their declared local peer pins', async () => {
  for (const name of ['crm-knowledge', 'knowledge']) {
    const manifest = JSON.parse(await readFile(join(root, 'dsh-plugins', name, 'package.json'), 'utf8'));
    const readme = await readFile(join(root, 'dsh-plugins', name, 'README.md'), 'utf8');
    const peers = manifest.peerDependencies ?? {};
    if (peers['@deepseek-ai/dsh-tools']) assert.ok(readme.includes(`DSH \`${peers['@deepseek-ai/dsh-tools']}\``), `${name} README DSH pin drift`);
    if (peers['@deepseek-ai/cordis']) assert.ok(readme.includes(`Cordis \`${peers['@deepseek-ai/cordis']}\``), `${name} README Cordis pin drift`);
  }
});
