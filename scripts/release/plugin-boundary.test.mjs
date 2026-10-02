import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const leafBuilds = ['shine-brand', 'shine-board', 'shine-query', 'shine-funnel', 'shine-waterfall', 'shine-crowd-action'];

test('leaf plugin builds use the shared dev kit and do not import workbench toolchain source', async () => {
  for (const name of leafBuilds) {
    const source = await readFile(join(root, 'dsh-plugins', name, 'build.mjs'), 'utf8');
    assert.match(source, /\.\.\/plugin-kit\/toolchain\.mjs/, `${name} must use plugin-kit`);
    assert.doesNotMatch(source, /\.\.\/analytics-workbench\/toolchain\.mjs/, `${name} must not import workbench toolchain`);
  }
});

test('published leaf files do not expose source paths as runtime exports', async () => {
  for (const name of ['shine-funnel', 'shine-waterfall']) {
    const manifest = JSON.parse(await readFile(join(root, 'dsh-plugins', name, 'package.json'), 'utf8'));
    assert.ok(manifest.files.every(file => !/(^|\/)src(\/|$)/.test(file)), `${name} package must publish built runtime files`);
    assert.ok(Object.values(manifest.exports).every(value => typeof value === 'string' && !/(^|\/)src(\/|$)/.test(value)), `${name} exports must point to lib`);
    const source = await readFile(join(root, 'dsh-plugins', name, 'build.mjs'), 'utf8');
    assert.match(source, /copyFile\(join\(root, 'src\//, `${name} must materialize source helper in lib`);
  }
});
