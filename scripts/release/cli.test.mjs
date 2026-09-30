import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const cli = join(root, 'scripts/dsh.mjs');

test('dsh exposes stable help and version output', () => {
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Commands:.*release/);
  const version = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.match(version, /^DSH_VERSION \d+\.\d+\.\d+\.\d+ upstream=477b4f42/m);
  const releaseHelp = execFileSync(process.execPath, [cli, 'release', '--help'], { encoding: 'utf8' });
  assert.match(releaseHelp, /Precedence: --tag/);
});

test('dsh rejects unknown commands with exit code 2', () => {
  const result = spawnSync(process.execPath, [cli, 'unknown-command'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DSH_ERROR DSH_COMMAND_UNKNOWN unknown-command/);
});

test('dsh verify reports synthetic PASS scopes while retaining the release block', () => {
  const result = spawnSync(process.execPath, [cli, 'verify'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /DSH_VERIFY_COMPAT PASS scope=synthetic-json-only/);
  assert.match(result.stdout, /DSH_VERIFY_BACKPRESSURE PASS scope=synthetic-loopback-http/);
  assert.match(result.stdout, /DSH_VERIFY_SLI NOT_RUN/);
  assert.match(result.stdout, /DSH_VERIFY_STATUS RELEASE_BLOCKED/);
});

test('dsh verify local returns a local contract result without weakening release scope', () => {
  const local = spawnSync(process.execPath, [cli, 'verify', '--scope', 'local'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(local.status, 0);
  assert.match(local.stdout, /DSH_VERIFY_STATUS LOCAL_PASS scope=local/);
  assert.match(local.stdout, /DSH_VERIFY_SLI NOT_APPLICABLE scope=local/);
});

test('doctor release reports readiness blockers without writing an artifact', () => {
  const result = spawnSync(process.execPath, [cli, 'doctor', '--release'], { encoding: 'utf8', env: { ...process.env, DSH_UPSTREAM_RUNTIME_BUNDLE: '' } });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /DSH_DOCTOR_RELEASE FAIL runtime-bundle=/);
});

test('preflight check is read-only and fails before creating output on an unclean tree', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'dsh-preflight-check-'));
  const outputDir = join(rootDir, 'candidate');
  const python = execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim();
  try {
    const result = spawnSync(process.execPath, [join(root, 'scripts/release/preflight.mjs'), '--check', '--python', python, '--tag', 'dsh-check-test', '--output-dir', outputDir], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, DSH_UPSTREAM_RUNTIME_BUNDLE: '' },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /DSH_PREFLIGHT_CHECK_STATUS BLOCKED/);
    assert.match(`${result.stdout}${result.stderr}`, /RELEASE_BLOCKED_DIRTY_WORKTREE|RELEASE_UPSTREAM_RUNTIME_REQUIRED/);
    await assert.rejects(() => import('node:fs/promises').then(fs => fs.stat(outputDir)), { code: 'ENOENT' });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
