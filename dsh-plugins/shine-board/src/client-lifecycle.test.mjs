import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = await readFile(join(root, 'lib/client.js'), 'utf8');

function loadClient() {
  let factoryRow;
  const sandbox = {
    window: { __ModuleLoader__: { load: row => { factoryRow = row; } } },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  const client = factoryRow.factory(spec => {
    throw new Error('BOARD_CLIENT_UNEXPECTED_REQUIRE:' + spec);
  });
  return { client, sandbox };
}

test('apply marks the board pack present without a host require', () => {
  assert.doesNotMatch(source, /require\(|\.context\/dsh-b0|COMPETITION_HTTP/);
  const { client, sandbox } = loadClient();
  client.apply({});
  assert.equal(sandbox.__SHINE_BOARD__, true);
});

test('build names a missing or relative upstream instead of searching the main repository', async () => {
  const build = await readFile(join(root, 'build.mjs'), 'utf8');
  assert.doesNotMatch(build, /\.context\/dsh-b0/);
  const env = { ...process.env };
  delete env.B0_BUILD_UPSTREAM;
  for (const args of [[], ['relative/upstream']]) {
    const child = spawn(process.execPath, [join(root, 'build.mjs'), ...args], { env, cwd: root });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    assert.equal(code, 2, stderr);
    assert.match(stderr, /UPSTREAM_NOT_CONFIGURED/);
  }
});
