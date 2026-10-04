import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { consumers, renderContract, sourcePath, syncContract } from './content-theme-contract.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const source = await readFile(join(root, sourcePath));
const contract = JSON.parse(source);
const load = file => import(pathToFileURL(join(root, file)).href);
const value = item => JSON.parse(JSON.stringify(item));

test('current workbench and CRM theme copies follow the brand contract', async () => {
  await syncContract();
  const workbench = await load('dsh-plugins/analytics-workbench/src/client/competition-shell/tokens.ts');
  const crm = await load(consumers[1]);
  assert.deepEqual(value(workbench.competitionThemeFor('dark').color), contract.color);
  assert.deepEqual(value(workbench.competitionThemeFor('light').color), { ...contract.color, ...contract.light.color });
  assert.deepEqual(value(workbench.competitionFont), contract.font);
  assert.deepEqual(value(workbench.antdSeedToken), value(crm.antdSeedToken));
  assert.deepEqual(value(workbench.competitionThemeFor('light').antd), value(crm.lightAntdTheme));
  assert.equal(crm.antdSeedToken.controlHeight, 44);
  assert.equal(crm.antdSeedToken.borderRadius, 12);
});

test('theme contract rejects unknown versions, fields and executable CSS values', () => {
  for (const update of [c => { c.version = '2.0.0'; }, c => { c.nativeOverride = true; },
    c => { c.color.ink = 'url(https://example.invalid)'; }, c => { delete c.font.body; }]) {
    const candidate = structuredClone(contract); update(candidate);
    assert.throws(() => renderContract(JSON.stringify(candidate)));
  }
});

test('consumer drift fails without overwriting the generated local copy', async t => {
  const isolated = await mkdtemp(join(tmpdir(), 'content-theme-drift-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  for (const file of [sourcePath, ...consumers]) await mkdir(dirname(join(isolated, file)), { recursive: true });
  await writeFile(join(isolated, sourcePath), source);
  await syncContract({ root: isolated, write: true });
  const target = join(isolated, consumers[1]);
  await writeFile(target, 'export const invalid = true;\n');
  await assert.rejects(() => syncContract({ root: isolated }), /CONTENT_THEME_DRIFT/);
  assert.equal(await readFile(target, 'utf8'), 'export const invalid = true;\n');
});
