import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runContractCommand, runFixedContractChecks } from './fixed-contract-checks.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const lockPath = join(root, 'config/public-contract-inputs.lock.json');
const base = { inputsPath: process.env.PUBLIC_CONTRACT_INPUTS, python: process.env.FQ_B0_PYTHON,
  buildTools: process.env.B0_BUILD_TOOLS, sourceRoot: process.env.PUBLIC_CONTRACT_SOURCE_ROOT, lockPath };
async function fixture(t) {
  const path = await mkdtemp(join(tmpdir(), 'contract-stage-guard-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
test('stage requires explicit absolute inputs', async t => {
  const target = await fixture(t);
  await assert.rejects(() => runFixedContractChecks({ ...base, output: join(target, 'new'), buildTools: 'tools' }), /PUBLIC_CONTRACT_STAGE_ABSOLUTE_INPUT/);
  await assert.rejects(() => access(join(target, 'new')), /ENOENT/);
});
test('existing owned output is refused without changing its marker', async t => {
  const target = await fixture(t), output = join(target, 'existing'); await mkdir(output);
  await writeFile(join(output, 'marker'), 'keep');
  await assert.rejects(() => runFixedContractChecks({ ...base, output }), /PUBLIC_CONTRACT_STAGE_EXISTS/);
  assert.equal(await readFile(join(output, 'marker'), 'utf8'), 'keep');
});
test('missing canonical source fails before creating output instead of reading legacy source', async t => {
  const target = await fixture(t), sourceRoot = join(target, 'source'), output = join(target, 'new');
  await mkdir(sourceRoot);
  await assert.rejects(() => runFixedContractChecks({ ...base, sourceRoot, output }), /ENOENT/);
  await assert.rejects(() => access(output), /ENOENT/);
});
test('bad archive input fails before creating a contract stage', async t => {
  const target = await fixture(t), output = join(target, 'new');
  const path = join(target, 'inputs.json');
  await writeFile(path, JSON.stringify({ schema: 'shinemage-public-contract-inputs/v1', archives: {} }));
  await assert.rejects(() => runFixedContractChecks({ ...base, inputsPath: path, output }), /PUBLIC_CONTRACT_INPUT_OWNERS/);
  await assert.rejects(() => access(output), /ENOENT/);
});
test('compiler timeout terminates its owned process group and descendant', async t => {
  const target = await fixture(t);
  const result = await runContractCommand(['--input-type=module', '-e', `import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
console.log(child.pid); setInterval(()=>{},1000);`], { cwd: target, env: { PATH: process.env.PATH }, timeout: 300 });
  assert.match(result.error.message, /PUBLIC_CONTRACT_TIMEOUT/);
  const pid = Number(result.stdout.trim()); assert.ok(pid > 0);
  const ended = () => { try { process.kill(pid, 0); return false; } catch (e) { if (e.code !== 'ESRCH') throw e; return true; } };
  for (let n = 0; n < 20 && !ended(); n++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(ended(), 'OWNED_DESCENDANT_STILL_RUNNING');
});
test('compiler output limit stops its owned process without unbounded capture', async t => {
  const target = await fixture(t);
  const result = await runContractCommand(['-e', `const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
child.once('spawn',()=>{console.error(child.pid);setInterval(()=>process.stdout.write("x".repeat(4096)),1);});`],
    { cwd: target, env: { PATH: process.env.PATH }, maxBuffer: 1024, timeout: 1000 });
  assert.match(result.error.message, /PUBLIC_CONTRACT_OUTPUT_LIMIT/);
  assert.ok(result.stdout.length <= 1024);
  const pid = Number(result.stderr.trim()); assert.ok(pid > 0);
  const ended = () => { try { process.kill(pid, 0); return false; } catch (e) { if (e.code !== 'ESRCH') throw e; return true; } };
  for (let n = 0; n < 20 && !ended(); n++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(ended(), 'OWNED_OUTPUT_DESCENDANT_STILL_RUNNING');
});
test('compiler failure is returned with actual exit code and stderr', async t => {
  const target = await fixture(t);
  const result = await runContractCommand(['-e', 'console.error("synthetic compiler error");process.exit(7)'], { cwd: target, env: { PATH: process.env.PATH } });
  assert.equal(result.status, 7); assert.equal(result.error, undefined);
  assert.match(result.stderr, /synthetic compiler error/);
});
