/** P3-3d preparation: the generated `analytics-acp` profile is tools-only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACP_PATHS, ACP_PROFILE, ACP_PROFILE_LOCK_SCHEMA,
  assertComposedDump, assertGeneratedPatch, assertLock, assertProfileContract,
  assertToolsOnlyEntry, buildLock, profileContract, readProfileSources,
  renderPatch, renderProfile, renderProfilePackage, writeProfile,
} from './acp-profile.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

async function sources() {
  return readProfileSources(ROOT);
}

test('the checked-in profile lock matches every generated input', async () => {
  const lock = JSON.parse(await readFile(join(ROOT, ACP_PATHS.lock), 'utf8'));
  assert.equal(lock.schema_version, ACP_PROFILE_LOCK_SCHEMA);
  assertLock(await buildLock(ROOT), lock);
  const contract = assertProfileContract(profileContract(await sources()));
  assert.equal(contract.tools_export, './lib/entry-tools.js');
  assert.deepEqual(contract.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app']);
});

test('the generated patch mounts exactly one tools subpath row and no bridge row', async () => {
  const { patch } = await sources();
  assertGeneratedPatch(patch);
  const rows = renderPatch().split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
  assert.deepEqual(rows, [
    '- insert:',
    `    - id: ${ACP_PROFILE.tools_row.id}`,
    `      name: '${ACP_PROFILE.tools_row.name}'`,
  ]);
});

test('the profile package is the shipped base+acp-app template', () => {
  const pkg = JSON.parse(renderProfilePackage());
  assert.equal(pkg.name, 'dsh-profile-analytics-acp');
  assert.deepEqual(pkg.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app']);
  assert.equal(pkg.dsh.profile.bundles.includes('@deepseek-ai/dsh-web-app'), false);
});

test('the tools-only entry never reaches the bridge, browser routes or a server', async () => {
  const { entry } = await sources();
  assertToolsOnlyEntry(entry);
  for (const forbidden of ['applyBridge', 'createServer', 'first-purchase-save-api', 'connection-fetch-ledger']) {
    assert.equal(entry.includes(forbidden), false, forbidden);
  }
});

test('a mutation that mounts the bridge entry or a connection row fails closed', async () => {
  const { entry, patch, package: pkg } = await sources();
  assert.throws(() => assertToolsOnlyEntry(`${entry}\nimport './bridge.ts';`), /ACP_ENTRY_FORBIDDEN/);
  assert.throws(() => assertGeneratedPatch(patch.replace(ACP_PROFILE.tools_row.name, ACP_PROFILE.plugin)),
    /ACP_PROFILE_PATCH/);
  const broken = structuredClone(pkg);
  delete broken.exports['./tools'];
  const contract = profileContract({ ...(await sources()), package: broken, patch });
  assert.throws(() => assertProfileContract(contract), /ACP_PROFILE_TOOLS_EXPORT/);
});

test('a composed dump must mount the tools row inside the acp application', async () => {
  const dump = [
    '# == @deepseek-ai/dsh-base',
    '- id: system-prompt',
    '  name: @deepseek-ai/dsh-system-prompt',
    '# == @deepseek-ai/dsh-acp-app',
    '- id: acp-app-startup',
    '  name: @deepseek-ai/dsh-acp-app',
    '- id: acp',
    '  name: @deepseek-ai/dsh-acp',
    '  inject: [acpAppStartup]',
    '# == /profiles/analytics-acp/cordis.patch.yml',
    '- id: analytics-workbench-tools',
    '  name: @shine-mage/dsh-analytics-workbench-b0/tools',
    '',
  ].join('\n');
  const result = assertComposedDump(dump);
  assert.match(result.row, /analytics-workbench-tools/);

  assert.throws(() => assertComposedDump(dump.replace('@shine-mage/dsh-analytics-workbench-b0/tools',
    '@shine-mage/dsh-analytics-workbench-b0')), /ACP_DUMP_BARE_BRIDGE_ROW/);
  assert.throws(() => assertComposedDump(dump.replace('  name: @shine-mage',
    '  inject: [connection, webServer]\n  name: @shine-mage')), /ACP_DUMP_FORBIDDEN_ROW/);
  assert.throws(() => assertComposedDump(dump.replace('- id: acp\n', '')), /ACP_DUMP_ACP_APP_MISSING/);
});

test('writeProfile produces the dsh profile triple and refuses to overwrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'acp-profile-'));
  try {
    const target = join(directory, 'profiles/analytics-acp');
    const written = await writeProfile(target);
    assert.equal(written.length, 3);
    for (const [name, contents] of Object.entries(renderProfile())) {
      assert.equal(await readFile(join(target, name), 'utf8'), contents, name);
    }
    await assert.rejects(writeProfile(target), /ACP_PROFILE_FILE_EXISTS/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a stale entry digest is rejected by the generation lock', async () => {
  const contract = await buildLock(ROOT);
  const stale = { ...contract, entry_sha256: '0'.repeat(64) };
  assert.throws(() => assertLock(contract, stale), /ACP_PROFILE_LOCK_entry_sha256/);
});
