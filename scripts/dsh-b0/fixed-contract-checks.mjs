/** Generate main-owned schemas against sealed author compiler inputs in an owned stage. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boundedContractFile, readPublicContractInputs } from '../ci/public-contract-inputs.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
/** Each compiler owns one POSIX process group, including its Python descendants. */
export async function runContractCommand(args, { cwd, env, timeout = 60000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  assert.notEqual(process.platform, 'win32', 'PUBLIC_CONTRACT_POSIX_REQUIRED');
  return new Promise(resolveResult => {
    const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', bytes = 0, failure, groupTerminationRequested = false;
    const terminateGroup = () => {
      if (!child.pid || groupTerminationRequested) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
        groupTerminationRequested = true;
      } catch (error) {
        if (error.code === 'ESRCH') groupTerminationRequested = true;
        else failure = error;
      }
    };
    const stop = error => {
      failure ??= error;
      terminateGroup();
    };
    const interrupt = () => stop(Error('PUBLIC_CONTRACT_INTERRUPTED'));
    const timer = setTimeout(() => stop(Error('PUBLIC_CONTRACT_TIMEOUT')), timeout);
    for (const name of ['SIGINT', 'SIGTERM']) process.once(name, interrupt);
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > maxBuffer) { stop(Error('PUBLIC_CONTRACT_OUTPUT_LIMIT')); return; }
        if (name === 'stdout') stdout += chunk; else stderr += chunk;
      });
    }
    child.once('error', error => { failure ??= error; });
    child.once('exit', terminateGroup);
    child.once('close', status => {
      clearTimeout(timer);
      for (const name of ['SIGINT', 'SIGTERM']) process.removeListener(name, interrupt);
      resolveResult({ status, error: failure, stdout, stderr });
    });
  });
}
export async function runFixedContractChecks({ inputsPath, output, python, buildTools, sourceRoot = repository,
  lockPath = join(repository, 'config/public-contract-inputs.lock.json') } = {}) {
  for (const path of [output, python, buildTools, sourceRoot]) assert.ok(isAbsolute(path ?? ''), 'PUBLIC_CONTRACT_STAGE_ABSOLUTE_INPUT');
  assert.ok(!/[\x00-\x1f\x7f]/.test(output), 'PUBLIC_CONTRACT_STAGE_OUTPUT');
  const source = await realpath(sourceRoot), tools = await realpath(buildTools);
  assert.ok((await lstat(tools)).isDirectory(), 'PUBLIC_CONTRACT_STAGE_TOOLS');
  const physical = join(await realpath(dirname(output)), resolve(output).split(sep).at(-1));
  for (const root of [source, await realpath(repository)]) {
    const rest = relative(root, physical);
    assert.ok(rest && (rest === '..' || rest.startsWith(`..${sep}`) || isAbsolute(rest)), 'PUBLIC_CONTRACT_STAGE_OUTSIDE_SOURCE');
  }
  const existing = await lstat(physical).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  assert.ok(!existing, 'PUBLIC_CONTRACT_STAGE_EXISTS');
  // Validate all three exact archives before creating any output directory.
  const evidence = await readPublicContractInputs({ inputsPath, python, lockPath });
  const canonical = new Map(), generatorHashes = new Map(evidence.lock.generators.map(row => [row.path, row.sha256]));
  for (const path of evidence.lock.canonical_sources) {
    const data = await boundedContractFile(join(source, path), 2 * 1024 * 1024);
    if (generatorHashes.has(path)) assert.equal(hash(data), generatorHashes.get(path), 'PUBLIC_CONTRACT_ORIGINAL_GENERATOR_BYTES');
    canonical.set(path, data);
  }
  assert.ok([...canonical.values()].reduce((sum, data) => sum + data.length, 0) <= 8 * 1024 * 1024, 'PUBLIC_CONTRACT_CANONICAL_SIZE');
  await mkdir(physical, { mode: 0o700 });
  const stage = join(physical, 'stage'), logs = join(physical, 'logs');
  await mkdir(stage, { mode: 0o700 }); await mkdir(logs, { mode: 0o700 });
  for (const [path, bytes] of [...canonical, ...evidence.materials]) {
    const destination = join(stage, path);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
  }
  const toolsPath = join(stage, 'dsh-plugins/plugin-kit/build-tools');
  await mkdir(dirname(toolsPath), { recursive: true, mode: 0o700 });
  await symlink(tools, toolsPath, 'dir');
  const receipt = { schema: 'shinemage-fixed-contract-checks/v1', author_inputs: evidence,
    canonical_sources: [...canonical].map(([path, data]) => ({ path, sha256: hash(data), bytes: data.length })),
    generators: evidence.lock.generators, groups: [], original_generator_bytes_preserved: true,
    private_theme_behavior: 'AUTHOR_CI_OWNED', scope: 'main schemas and compiler contracts only',
    runtime_host_service: 'NOT_RUN', release_ready: false };
  const env = { PATH: `${dirname(process.execPath)}:${dirname(python)}:/usr/bin:/bin`,
    PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHON_DOTENV_DISABLED: '1',
    B0_PLUGIN_BUILD_TOOLS: join(tools, 'package.json'), B0_OPENAPI_TOOLS: join(tools, 'package.json') };
  async function run(name, args, expectedTests) {
    const result = await runContractCommand(args, { cwd: stage, env });
    const stdout = result.stdout ?? '', stderr = result.stderr ?? '';
    await writeFile(join(logs, `${name}.stdout`), stdout, { flag: 'wx', mode: 0o600 });
    await writeFile(join(logs, `${name}.stderr`), stderr, { flag: 'wx', mode: 0o600 });
    const row = { name, arguments: args, exit_code: result.status, error: result.error?.message ?? null,
      stdout_sha256: hash(stdout), stderr_sha256: hash(stderr) };
    receipt.groups.push(row);
    await writeFile(join(physical, 'checks.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    process.stdout.write(stdout); process.stderr.write(stderr);
    assert.ok(!result.error && result.status === 0, `PUBLIC_CONTRACT_CHECK_FAILED: ${name}`);
    if (expectedTests !== undefined) {
      const counts = {};
      for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
        const found = [...stdout.matchAll(new RegExp(`^# ${field} (\\d+)\\r?$`, 'gm'))];
        assert.equal(found.length, 1, 'PUBLIC_CONTRACT_TEST_SUMMARY'); counts[field] = Number(found[0][1]);
      }
      assert.deepEqual(counts, { tests: expectedTests, pass: expectedTests, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, 'PUBLIC_CONTRACT_TEST_COUNTS');
      row.counts = counts;
    }
  }
  for (const { path } of receipt.generators) await run(path.split('/').at(-1), [path, '--check',
    ...(['content-theme-contract.mjs', 'cockpit-slot-contract.mjs'].includes(path.split('/').at(-1)) ? [] : ['--python', python])]);
  await run('public-slot-contract', ['--test', '--test-reporter=tap', '--test-concurrency=1', 'scripts/dsh-b0/cockpit-slot-contract.test.mjs'], 4);
  await run('public-theme-rejection-and-drift', ['--test', '--test-reporter=tap', '--test-concurrency=1',
    '--test-name-pattern=theme contract rejects|consumer drift fails', 'scripts/dsh-b0/content-theme-contract.test.mjs'], 2);
  const unchanged = new Map([...canonical, ...evidence.materials].map(([path, bytes]) => [path, hash(bytes)]));
  async function inspect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (path === 'dsh-plugins/plugin-kit/build-tools') {
        assert.equal(await realpath(join(stage, path)), tools, 'PUBLIC_CONTRACT_TOOLS_CHANGED'); continue;
      }
      assert.ok(!entry.isSymbolicLink(), 'PUBLIC_CONTRACT_UNEXPECTED_LINK');
      if (entry.isDirectory()) await inspect(join(directory, entry.name), path);
      else {
        assert.ok(entry.isFile() && unchanged.has(path), 'PUBLIC_CONTRACT_UNEXPECTED_FILE');
        assert.equal(hash(await boundedContractFile(join(stage, path), 2 * 1024 * 1024)), unchanged.get(path), 'PUBLIC_CONTRACT_CHECK_WROTE_INPUT');
        unchanged.delete(path);
      }
    }
  }
  await inspect(stage);
  assert.equal(unchanged.size, 0, 'PUBLIC_CONTRACT_CHECK_REMOVED_INPUT');
  receipt.stage_unchanged = true;
  await writeFile(join(physical, 'checks.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 8 && args[0] === '--inputs' && args[2] === '--output' && args[4] === '--python' && args[6] === '--build-tools', 'PUBLIC_CONTRACT_STAGE_ARGUMENTS');
  console.log(JSON.stringify(await runFixedContractChecks({ inputsPath: args[1], output: args[3], python: args[5], buildTools: args[7] }), null, 2));
}
