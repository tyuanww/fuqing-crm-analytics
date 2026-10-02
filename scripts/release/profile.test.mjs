import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { loadReleaseProfile } from './profile.mjs';

const root = resolve(import.meta.dirname, '../..');

test('release profile loads the pinned plugin order and digest', async () => {
  const result = await loadReleaseProfile({ root });
  assert.equal(result.profile.profile_id, 'dsh-rc2');
  assert.equal(result.plugins.length, 7);
  assert.equal(result.plugins[0].id, '@shine-mage/dsh-analytics-workbench-b0');
  assert.match(result.digest, /^[a-f0-9]{64}$/);
});

test('release profile fails closed on a path or DSH pin change', async t => {
  const rootDir = await mkdtemp(join(tmpdir(), 'dsh-profile-'));
  t.after(async () => { await import('node:fs/promises').then(fs => fs.rm(rootDir, { recursive: true, force: true })); });
  await mkdir(join(rootDir, 'config'), { recursive: true });
  await mkdir(join(rootDir, 'plugin'), { recursive: true });
  await writeFile(join(rootDir, 'plugin/package.json'), JSON.stringify({ name: '@shine-mage/plugin', version: '0.1.0', peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' } }));
  await writeFile(join(rootDir, 'plugin/build.mjs'), 'export {}\n');
  const base = { schema_version: 'dsh-profile/v1', profile_id: 'test', dsh: { sdk_version: '0.1.7-rc.2', upstream_sha: '0'.repeat(40) }, plugins: [{ path: 'plugin', id: '@shine-mage/plugin', build: 'build.mjs', enabled: true }] };
  await writeFile(join(rootDir, 'config/profile.json'), JSON.stringify(base));
  await assert.rejects(() => loadReleaseProfile({ root: rootDir, manifestPath: 'config/profile.json' }), /PROFILE_DSH_PIN_MISMATCH/);
  const copied = { ...base, dsh: { sdk_version: '0.1.7-rc.2', upstream_sha: '477b4f420553e8a52c2fbccc464d7561b239c443' } };
  await writeFile(join(rootDir, 'config/profile.json'), JSON.stringify(copied));
  assert.equal((await loadReleaseProfile({ root: rootDir, manifestPath: 'config/profile.json' })).plugins[0].id, '@shine-mage/plugin');
  await assert.rejects(() => loadReleaseProfile({ root: rootDir, manifestPath: '../outside.json' }), /PROFILE_MANIFEST_OUTSIDE_ROOT/);
});
