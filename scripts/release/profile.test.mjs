import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { loadReleaseProfile } from './profile.mjs';

const root = resolve(import.meta.dirname, '../..');

test('explicit default profile loads its pinned order independently of the caller environment', async () => {
  const result = await loadReleaseProfile({ root, manifestPath: 'config/dsh-profile.rc3.json' });
  assert.equal(result.profile.profile_id, 'dsh-rc3');
  assert.equal(result.plugins.length, 7);
  assert.equal(result.plugins[0].id, '@shine-mage/dsh-analytics-workbench-b0');
  assert.match(result.digest, /^[a-f0-9]{64}$/);
});

test('profile loader selects the default or CRM/knowledge profile from an isolated caller environment', () => {
  for (const [manifest, expectedId, count] of [
    [null, 'dsh-rc3', 7], ['config/dsh-profile.crm-knowledge.rc3.json', 'crm-knowledge-rc3', 2],
  ]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      "import {loadReleaseProfile} from './scripts/release/profile.mjs'; const r=await loadReleaseProfile({root:process.cwd()}); console.log(JSON.stringify({id:r.profile.profile_id,count:r.plugins.length}));"], {
      cwd: root, env: manifest ? { DSH_PROFILE_MANIFEST: manifest } : {}, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { id: expectedId, count });
  }
});

test('release profile fails closed on a path or DSH pin change', async t => {
  const rootDir = await mkdtemp(join(tmpdir(), 'dsh-profile-'));
  t.after(async () => { await import('node:fs/promises').then(fs => fs.rm(rootDir, { recursive: true, force: true })); });
  await mkdir(join(rootDir, 'config'), { recursive: true });
  await mkdir(join(rootDir, 'plugin'), { recursive: true });
  await writeFile(join(rootDir, 'plugin/package.json'), JSON.stringify({ name: '@shine-mage/plugin', version: '0.1.0', peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.1-rc.3' } }));
  await writeFile(join(rootDir, 'plugin/build.mjs'), 'export {}\n');
  const base = { schema_version: 'dsh-profile/v1', profile_id: 'test', dsh: { sdk_version: '0.2.1-rc.3', upstream_sha: '0'.repeat(40) }, plugins: [{ path: 'plugin', id: '@shine-mage/plugin', build: 'build.mjs', enabled: true }] };
  await writeFile(join(rootDir, 'config/profile.json'), JSON.stringify(base));
  await assert.rejects(() => loadReleaseProfile({ root: rootDir, manifestPath: 'config/profile.json' }), /PROFILE_DSH_PIN_MISMATCH/);
  const copied = { ...base, dsh: { sdk_version: '0.2.1-rc.3', upstream_sha: '1f81c047fc48fa190a683e469daa699857e9afe8' } };
  await writeFile(join(rootDir, 'config/profile.json'), JSON.stringify(copied));
  assert.equal((await loadReleaseProfile({ root: rootDir, manifestPath: 'config/profile.json' })).plugins[0].id, '@shine-mage/plugin');
  await assert.rejects(() => loadReleaseProfile({ root: rootDir, manifestPath: '../outside.json' }), /PROFILE_MANIFEST_OUTSIDE_ROOT/);
});
