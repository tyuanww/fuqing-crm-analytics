import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
