import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, lstat, symlink, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { bootstrapEnvironment, prepareSdk, runPreparationCommand } from '../../dsh-plugins/plugin-kit/prepare.mjs';

const exec = promisify(execFile);
const kit = fileURLToPath(new URL('../../dsh-plugins/plugin-kit/', import.meta.url));

test('prepare CLI executes through an installed package symlink and imports without side effects', async t => {
  const root = await owned(t), installed = join(root, 'node_modules/@shine-mage/dsh-plugin-kit');
  await mkdir(dirname(installed), { recursive: true }); await symlink(kit, installed, 'dir');
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root };
  const help = await exec(process.execPath, [join(installed, 'prepare.mjs'), '--help'], { cwd: root, env });
  assert.match(help.stdout, /--destination/);
  await assert.rejects(exec(process.execPath, [join(installed, 'prepare.mjs'), '--destination', root], { cwd: root, env }), error => {
    assert.equal(error.code, 2); assert.equal(JSON.parse(error.stdout).code, 'KIT_PREPARE_DESTINATION_EXISTS'); return true;
  });
  const imported = await exec(process.execPath, ['--input-type=module', '-e', "await import('@shine-mage/dsh-plugin-kit/prepare');"], { cwd: root, env });
  assert.equal(imported.stdout, ''); assert.equal(imported.stderr, '');
});

test('SDK preflight Git child cannot inherit application secrets or caller Git configuration', async t => {
  const root = await owned(t), bin = join(root, 'bin'), capture = join(root, 'environment.json'); await mkdir(bin);
  const git = join(bin, 'git');
  await writeFile(git, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(capture)},JSON.stringify(process.env));console.log('synthetic-wrong-sha');\n`);
  await chmod(git, 0o700);
  const source = `import {inspectToolchain} from ${JSON.stringify(new URL('../../dsh-plugins/plugin-kit/toolchain.mjs', import.meta.url).href)}; try {await inspectToolchain(process.cwd());} catch {}`;
  await exec(process.execPath, ['--input-type=module', '-e', source], { cwd: root, env: {
    PATH: `${bin}:/usr/bin:/bin`, HOME: root, DEEPSEEK_API_KEY: 'synthetic-sentinel', GIT_CONFIG_GLOBAL: join(root, 'caller-gitconfig') } });
  const actual = JSON.parse(await readFile(capture, 'utf8'));
  assert.equal(actual.DEEPSEEK_API_KEY, undefined);
  assert.equal(actual.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(actual.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(actual.GIT_NO_REPLACE_OBJECTS, '1');
});

async function owned(t) {
  const root = await mkdtemp(join(tmpdir(), 'kit-bootstrap-guard-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('bootstrap child has an isolated HOME/store context without caller secrets or Git configuration', async t => {
  const root = await owned(t), env = bootstrapEnvironment(root);
  await mkdir(env.HOME);
  const output = await runPreparationCommand(process.execPath, ['-e', 'console.log(JSON.stringify(process.env))'], { cwd: root, env });
  const actual = JSON.parse(output);
  assert.equal(actual.HOME, join(root, 'home'));
  assert.equal(actual.COREPACK_HOME, join(root, 'corepack'));
  assert.equal(actual.GIT_CONFIG_GLOBAL, '/dev/null');
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'DEEPSEEK_API_KEY', 'DUCKDB_PATH', 'GIT_SSH_COMMAND', 'npm_config_userconfig']) assert.equal(actual[name], undefined);
});

test('bootstrap refuses relative or existing destinations before any subprocess or overwrite', async t => {
  const root = await owned(t), events = [];
  await writeFile(join(root, 'sentinel'), 'keep');
  await assert.rejects(prepareSdk('relative'), /KIT_PREPARE_DESTINATION_ABSOLUTE/);
  await assert.rejects(prepareSdk(root, { onStage: e => events.push(e) }), /KIT_PREPARE_DESTINATION_EXISTS/);
  assert.equal(await readFile(join(root, 'sentinel'), 'utf8'), 'keep');
  assert.deepEqual(events, []);
  await assert.rejects(lstat(join(root, 'upstream')), { code: 'ENOENT' });
});

test('preparation runner rejects missing programs, nonzero exit and oversized output with stable codes', async t => {
  const cwd = await owned(t), env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` };
  await assert.rejects(runPreparationCommand('/missing-synthetic-kit-command', [], { cwd, env }), /KIT_PREPARE_EXECUTABLE_UNAVAILABLE/);
  await assert.rejects(runPreparationCommand(process.execPath, ['-e', 'console.log("fixture"); process.exit(7)'], { cwd, env }), error => {
    assert.equal(error.message, 'KIT_PREPARE_STAGE_FAILED'); assert.match(error.output, /fixture/); return true;
  });
  await assert.rejects(runPreparationCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], { cwd, env, maxBytes: 100 }), /KIT_PREPARE_LOG_LIMIT/);
});

test('timeout kills only the owned child process group, including descendants', { skip: process.platform === 'win32' }, async t => {
  const cwd = await owned(t), pidFile = join(cwd, 'child.pid');
  const code = `const {spawn}=require('node:child_process'); const fs=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});
fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000);`;
  await assert.rejects(runPreparationCommand(process.execPath, ['-e', code, pidFile], { cwd, env: {}, timeout: 700 }), /KIT_PREPARE_TIMEOUT/);
  const pid = Number(await readFile(pidFile, 'utf8'));
  let exited = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { exited = true; break; } throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(exited, true, 'owned descendant survived timeout');
});

test('a pre-aborted preparation command creates no process', async t => {
  const cwd = await owned(t), marker = join(cwd, 'should-not-exist');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runPreparationCommand(process.execPath, ['-e', `require('node:fs').writeFileSync(process.argv[1],'unexpected')`, marker],
    { cwd, env: {}, signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(lstat(marker), { code: 'ENOENT' });
});


test('custom transport trust rejects non-certificate input without creating the destination', async t => {
  const root = await owned(t), caFile = join(root, 'not-a-certificate.pem'), destination = join(root, 'prepared');
  await writeFile(caFile, 'synthetic-invalid-ca');
  await assert.rejects(prepareSdk(destination, { caFile }), /KIT_PREPARE_CA_INVALID/);
  await assert.rejects(lstat(destination), { code: 'ENOENT' });
  await assert.rejects(prepareSdk(destination, { caFile: 'relative.pem' }), /KIT_PREPARE_CA_INVALID/);
});
