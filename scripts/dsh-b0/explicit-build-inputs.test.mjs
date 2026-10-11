import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pluginBuilds = [
  'analytics-workbench', 'crm-knowledge', 'shine-board', 'shine-brand',
  'shine-crowd-action', 'shine-funnel', 'shine-query', 'shine-waterfall',
].map(name => join(root, 'dsh-plugins', name, 'build.mjs'));
const cleanEnv = () => {
  const env = { ...process.env };
  for (const key of ['B0_BUILD_UPSTREAM', 'B0_BUILD_TOOLS', 'DSH_UPSTREAM_CHECKOUT', 'DSH_PACKAGE_INPUTS']) delete env[key];
  return env;
};

test('plugin builds reject missing or relative upstream inputs', () => {
  for (const script of pluginBuilds) {
    for (const args of [[], ['relative/upstream']]) {
      const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env: cleanEnv(), encoding: 'utf8' });
      assert.equal(result.status, 2, `${script} ${args.join(' ')}`);
      assert.match(`${result.stdout}${result.stderr}`, /UPSTREAM_NOT_CONFIGURED/);
    }
  }
});

test('plugin builds reject a relative build-tools override', () => {
  for (const script of pluginBuilds) {
    const env = cleanEnv();
    env.B0_BUILD_TOOLS = 'relative/build-tools';
    const result = spawnSync(process.execPath, [script, root], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 2, script);
    assert.match(`${result.stdout}${result.stderr}`, /BUILD_TOOLS_NOT_CONFIGURED/);
  }
});
