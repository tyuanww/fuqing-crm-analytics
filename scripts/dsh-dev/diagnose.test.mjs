import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { diagnose, inspectListener } from './diagnose.mjs';
import { COMPETITION_VITE_PORT, FOREIGN_PORTS, PORTS } from './constants.mjs';
import { repoRoot } from './paths.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

test('diagnose source never signals PIDs or binds a listen socket', async () => {
  const source = await readFile(new URL('./diagnose.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /process\.kill/);
  assert.doesNotMatch(source, /SIGTERM|SIGKILL/);
  assert.doesNotMatch(source, /createServer\(/);
  assert.doesNotMatch(source, /listen\(/);
  assert.match(source, /Never binds, never signals PIDs/);
});

test('inspectListener reports a bound owned-range port without killing it', { concurrency: false }, async () => {
  let probePort;
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  try {
    probePort = server.address().port;
    let snapshot;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      snapshot = await inspectListener(probePort);
      if (snapshot.state === 'listening') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(snapshot.state, 'listening');
    assert.equal(snapshot.listeners[0].pid, process.pid);
  } finally {
    await new Promise((ok, fail) => server.close(e => e ? fail(e) : ok()));
  }
  const freed = await inspectListener(probePort);
  assert.equal(freed.state, 'free');
});

test('diagnose classifies foreign and user-demo ports without probing them over HTTP', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('cold-state diagnosis must not send HTTP'));
  const report = await diagnose({}, async () => null);
  assert.equal(report.kind, 'DSH_DEV_DIAGNOSE');
  assert.equal(report.repo, repoRoot);
  assert.deepEqual(report.actions_not_taken, [
    'did_not_signal_any_pid',
    'did_not_bind_ports',
    'did_not_http_probe_4327',
    'did_not_http_probe_8000_or_5173',
    'did_not_start_dsh',
  ]);
  const byPort = new Map(report.ports.map(row => [row.port, row]));
  for (const port of FOREIGN_PORTS) {
    assert.equal(byPort.get(port).classification.stop, 'refuse');
    assert.equal(byPort.get(port).classification.reuse, 'refuse');
  }
  const demo = byPort.get(PORTS.web);
  if (demo.state === 'listening') {
    assert.equal(demo.classification.owner, 'user_demo');
    assert.equal(demo.classification.reuse, 'refuse');
    assert.equal(demo.classification.stop, 'refuse');
  }
  assert.equal(byPort.get(COMPETITION_VITE_PORT).classification.reuse, 'refuse_as_dsh_web');
  assert.equal(report.auth.live.status, 'NOT_RUN');
  assert.ok(['ok', 'lfs_pointer'].includes(report.brand.logo.status));
  assert.equal(report.brand.mark.status, 'ok');
  assert.equal(report.brand.outfit.status, 'ok');
  assert.equal(typeof report.shineBrand.status, 'string');
  assert.equal(typeof report.shineBrand.path, 'string');
  assert.equal(typeof report.shineWaterfall.status, 'string');
  assert.equal(typeof report.shineWaterfall.path, 'string');
  assert.equal(typeof report.shineCrowdAction.status, 'string');
  assert.equal(typeof report.shineCrowdAction.path, 'string');
  assert.equal(typeof report.shineQuery.status, 'string');
  assert.equal(typeof report.shineQuery.path, 'string');
  assert.equal(typeof report.shineBoard.status, 'string');
  assert.equal(typeof report.shineBoard.path, 'string');
  assert.equal(typeof report.shineFunnel.status, 'string');
  assert.equal(typeof report.shineFunnel.path, 'string');
  assert.equal(report.auth.mechanism.never_print_token, true);
  assert.equal(report.auth.mechanism.never_disable_auth, true);
  assert.doesNotMatch(JSON.stringify(report), /[?&](?:token|b0)=(?!\[REDACTED\])[A-Za-z0-9_-]+/);
});

test('diagnose resolves the active release lane before comparing an upstream checkout', async t => {
  const upstream = join(repoRoot, '.context/dsh-b0/upstream-0.1.7-rc.2');
  try {
    await readFile(join(upstream, 'apps/cli/lib/bin.js'));
  } catch {
    t.skip('historical upstream checkout is unavailable');
    return;
  }
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', [
    "import { diagnose } from './scripts/dsh-dev/diagnose.mjs';",
    `const report = await diagnose({ upstream: ${JSON.stringify(upstream)} }, async () => null);`,
    'console.log(JSON.stringify({ pin: report.upstream.pin_sha, actual: report.upstream.actual_sha, stale: report.upstream.stale_reasons }));',
  ].join(' ')], {
    cwd: repoRoot,
    env: { ...process.env, DSH_RELEASE_LANE_CONFIG: join(repoRoot, 'config/dsh-rc1-release-lane.json') },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout.trim());
  assert.equal(report.pin, '1600d8a1e140dcde43a1a0941940a0480712c011');
  assert.equal(report.actual, '477b4f420553e8a52c2fbccc464d7561b239c443');
  assert.ok(report.stale.includes('upstream_sha_drift'));
});
