import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { createPluginCandidate } from './plugin-candidate.mjs';
import { recordEvent } from './state.mjs';

const exec = promisify(execFile);
const SHA = '477b4f420553e8a52c2fbccc464d7561b239c443';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'config'), { recursive: true });
  await mkdir(join(root, 'plugin/lib'), { recursive: true });
  await writeFile(join(root, 'plugin/package.json'), JSON.stringify({
    name: '@shine-mage/test-plugin', version: '0.1.0', private: true, type: 'module', packageManager: 'pnpm@11.7.0',
    peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' }, files: ['lib/', 'cordis.patch.yml'],
  }) + '\n');
  await writeFile(join(root, 'plugin/lib/index.js'), 'export const testPlugin = true;\n');
  await writeFile(join(root, 'plugin/cordis.patch.yml'), '[]\n');
  await writeFile(join(root, 'config/profile.json'), JSON.stringify({ schema_version: 'dsh-profile/v1', profile_id: 'test', dsh: { sdk_version: '0.1.7-rc.2', upstream_sha: SHA }, plugins: [{ path: 'plugin', id: '@shine-mage/test-plugin', build: 'build.mjs', enabled: true }] }));
  await writeFile(join(root, 'plugin/build.mjs'), 'export {}\n');
  await exec('git', ['-C', root, 'init', '-q']);
  await exec('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid']);
  await exec('git', ['-C', root, 'config', 'user.name', 'fixture']);
  await exec('git', ['-C', root, 'add', '.']);
  await exec('git', ['-C', root, 'commit', '-qm', 'fixture']);
  return { root, plugin: join(root, 'plugin'), profile: 'config/profile.json', outputDir: join(root, 'candidate'), statePath: join(root, 'state.json') };
}

test('plugin candidate binds pack, profile and durable journal receipt', async t => {
  const input = await fixture(t);
  const candidate = await createPluginCandidate({ ...input, profileManifest: input.profile });
  assert.equal(candidate.schema_version, 'dsh-plugin-candidate/v1');
  assert.match(candidate.candidate_digest, /^[a-f0-9]{64}$/);
  assert.equal(candidate.state_scope, 'local-explicit-journal');
  assert.ok(!JSON.stringify(candidate).includes(input.root));
  assert.equal(candidate.canary.status, 'NOT_RUN');
  assert.equal(candidate.next_commands.receive.status, 'NOT_AVAILABLE');
  assert.deepEqual(JSON.parse(await readFile(join(input.outputDir, 'candidate.json'), 'utf8')), candidate);
  const state = JSON.parse(await readFile(input.statePath, 'utf8'));
  assert.equal(state.journal.at(-1).status, 'CANDIDATE_PREPARED');
  assert.equal(state.journal.at(-1).candidate_digest, candidate.candidate_digest);
});

test('plugin candidate leaves only a pending receipt when final journal commit conflicts', async t => {
  const input = await fixture(t);
  const candidateKey = createHash('sha256').update(JSON.stringify(['@shine-mage/test-plugin', '0.1.0'])).digest('hex');
  await recordEvent(input.statePath, {
    release_tag: 'dsh-plugin-shine-mage-test-plugin-0.1.0',
    status: 'OTHER_CANDIDATE',
  }, { idempotencyKey: `candidate:${candidateKey}` });
  await assert.rejects(
    () => createPluginCandidate({ ...input, outputDir: join(input.root, 'conflicting-candidate'), profileManifest: input.profile }),
    /RELEASE_EVENT_CONFLICT/,
  );
  await assert.rejects(() => readFile(join(input.root, 'conflicting-candidate/candidate.json'), 'utf8'), { code: 'ENOENT' });
  assert.match(await readFile(join(input.root, 'conflicting-candidate/candidate.pending.json'), 'utf8'), /dsh-plugin-candidate\/v1/);
});

test('plugin candidate rejects missing state path and unallowlisted package', async t => {
  const input = await fixture(t);
  await assert.rejects(() => createPluginCandidate({ ...input, statePath: '', profileManifest: input.profile }), /PLUGIN_CANDIDATE_STATE_PATH_REQUIRED/);
  const other = join(input.root, 'other');
  await mkdir(join(other, 'lib'), { recursive: true });
  await writeFile(join(other, 'package.json'), JSON.stringify({ name: '@shine-mage/other', version: '0.1.0', packageManager: 'pnpm@11.7.0', type: 'module', peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' }, files: ['lib/'] }));
  await writeFile(join(other, 'lib/index.js'), 'export {};\n');
  await assert.rejects(() => createPluginCandidate({ ...input, plugin: other, outputDir: join(input.root, 'other-candidate'), profileManifest: input.profile }), /PLUGIN_CANDIDATE_NOT_ALLOWLISTED/);
});
