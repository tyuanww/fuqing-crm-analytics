import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { consumers, renderContract, sourcePath, syncContract } from './cockpit-slot-contract.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const bytes = await readFile(join(repository, sourcePath));

test('both actual consumers match the domain-owned slot contract', async () => {
  assert.equal((await syncContract()).consumers, 2);
  const module = await import('../../dsh-plugins/analytics-workbench/src/client/cockpit-slot-contract.generated.ts');
  assert.equal(module.CRM_COCKPIT_SLOT_NAME, 'cockpit.crm');
  assert.deepEqual(module.CRM_COCKPIT_SLOT, { kind: 'single', scope: 'root' });
});

test('slot name, cardinality, scope and optionality changes cannot silently reuse v1', () => {
  for (const update of [
    c => { c.name = 'conversation.input'; }, c => { c.slot.kind = 'multiple'; },
    c => { c.slot.scope = 'session'; }, c => { c.optional = false; },
    c => { c.hiddenOverride = true; },
  ]) {
    const contract = JSON.parse(bytes); update(contract);
    assert.throws(() => renderContract(JSON.stringify(contract)), /COCKPIT_SLOT_CONTRACT_INVALID/);
  }
});

test('drift check refuses a changed consumer copy without rewriting it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cockpit-slot-drift-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of [sourcePath, ...consumers]) await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, sourcePath), bytes);
  await syncContract({ root, write: true });
  const target = join(root, consumers[1]);
  await writeFile(target, 'export type CrmCockpitSlot = unknown;\n');
  await assert.rejects(() => syncContract({ root }), /COCKPIT_SLOT_CONTRACT_DRIFT/);
  assert.equal(await readFile(target, 'utf8'), 'export type CrmCockpitSlot = unknown;\n');
});

test('CRM types compile using only its shipped generated contract, with no workbench source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cockpit-slot-consumer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'contract.ts'), await readFile(join(repository, consumers[1])));
  const input = join(root, 'consumer.ts');
  await writeFile(input, `import { CRM_COCKPIT_SLOT, CRM_COCKPIT_SLOT_NAME, type CrmCockpitSlot } from './contract';
const value: CrmCockpitSlot = CRM_COCKPIT_SLOT;
const name: 'cockpit.crm' = CRM_COCKPIT_SLOT_NAME;
// @ts-expect-error v1 cardinality must remain single
const wrongKind: CrmCockpitSlot = { kind: 'multiple', scope: 'root' };
// @ts-expect-error v1 scope must remain root
const wrongScope: CrmCockpitSlot = { kind: 'single', scope: 'session' };
`);
  const ts = createRequire(join(repository, 'dsh-plugins/plugin-kit/build-tools/package.json'))('typescript');
  assert.equal(ts.version, '6.0.3');
  const program = ts.createProgram([input], { strict: true, noEmit: true, types: [],
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2023 });
  assert.equal(ts.getPreEmitDiagnostics(program).length, 0);
  assert.deepEqual(program.getSourceFiles().filter(f => !program.isSourceFileDefaultLibrary(f)).map(f => f.fileName).sort(),
    [input, join(root, 'contract.ts')].sort());
});
