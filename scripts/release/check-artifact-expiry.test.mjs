import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

import { LOCK_FILES, loadArtifacts } from './check-artifact-expiry.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = fileURLToPath(new URL('./check-artifact-expiry.mjs', import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;

function run(args, env = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      env: { ...process.env, GH_TOKEN: '', ...env },
      timeout: 20_000,
    }, (error, stdout, stderr) => {
      resolve({ code: typeof error?.code === 'number' ? error.code : error ? 1 : 0, stdout, stderr });
    });
  });
}

async function fixtureFile(t, overrides = {}) {
  const { artifacts, locks } = await loadArtifacts();
  const now = Date.now();
  const rows = {};
  for (const artifact of artifacts) {
    rows[artifact.id] = { expires_at: new Date(now + 30 * DAY_MS).toISOString(), expired: false };
  }
  for (const [id, row] of Object.entries(overrides)) rows[id] = row;
  const directory = await mkdtemp(join(tmpdir(), 'artifact-expiry-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'fixture.json');
  await writeFile(path, `${JSON.stringify({ artifacts: rows }, null, 2)}\n`);
  return { path, artifacts, locks, now };
}

test('all tracked artifacts fresh: exits 0 and covers every locked artifact', async t => {
  const { path, artifacts, locks } = await fixtureFile(t);
  assert.equal(locks.length, 5, 'all five tracked locks are inspected');
  assert.deepEqual(locks.map(lock => lock.artifacts), [0, 1, 1, 3, 1],
    'packs lock carries no artifact id; the other locks carry six archives together');
  assert.equal(artifacts.length, 6);

  const result = await run(['--offline', path]);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^\| Artifact \| Source \| Expires \(UTC\) \| Days remaining \|/m);
  assert.match(result.stdout, /ARTIFACT_EXPIRY_OK artifacts=6 warn_days=7/);
  for (const artifact of artifacts) assert.match(result.stdout, new RegExp(`\\b${artifact.id}\\b`));
});

test('one artifact inside the warn window exits non-zero and names its id', async t => {
  const { artifacts } = await fixtureFile(t);
  const target = artifacts[0];
  const fixture = await fixtureFile(t, {
    [target.id]: { expires_at: new Date(Date.now() + 3 * DAY_MS).toISOString(), expired: false },
  });
  const result = await run(['--offline', fixture.path]);
  assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`\\| ${target.id} \\|`));
  assert.match(result.stdout, /ARTIFACT_EXPIRY_ATTENTION artifacts=6 at_risk=1 warn_days=7/);
});

test('an expired artifact exits non-zero', async t => {
  const { artifacts } = await fixtureFile(t);
  const target = artifacts[1];
  const fixture = await fixtureFile(t, {
    [target.id]: { expires_at: new Date(Date.now() - 2 * DAY_MS).toISOString(), expired: true },
  });
  const result = await run(['--offline', fixture.path]);
  assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`\\| ${target.id} \\|`));
  assert.match(result.stdout, /ARTIFACT_EXPIRY_ATTENTION artifacts=6 at_risk=1 warn_days=7/);
});

test('--warn-days moves the boundary', async t => {
  const { artifacts } = await fixtureFile(t);
  const target = artifacts[2];
  const fixture = await fixtureFile(t, {
    [target.id]: { expires_at: new Date(Date.now() + 10 * DAY_MS).toISOString(), expired: false },
  });
  assert.equal((await run(['--offline', fixture.path])).code, 0, '10 days is outside the default 7-day window');
  const strict = await run(['--offline', fixture.path, '--warn-days', '14']);
  assert.equal(strict.code, 1);
  assert.match(strict.stdout, /at_risk=1 warn_days=14/);
});

test('--json emits the machine-readable report shape', async t => {
  const { path, artifacts, locks } = await fixtureFile(t);
  const result = await run(['--offline', path, '--json']);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, 'shinemage-artifact-expiry/v1');
  assert.match(report.checked_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(report.warn_days, 7);
  assert.equal(report.threshold_exceeded, false);
  assert.equal(report.unresolved, 0);
  assert.equal(report.exit_code, 0);
  assert.deepEqual(report.locks.map(lock => lock.path), [...LOCK_FILES]);
  assert.equal(report.artifacts.length, artifacts.length);
  for (const row of report.artifacts) {
    assert.equal(typeof row.id, 'number');
    assert.equal(typeof row.repository, 'string');
    assert.equal(typeof row.source, 'string');
    assert.match(row.expires_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof row.days_remaining, 'number');
    assert.equal(row.status, 'ok');
  }
});

test('--offline never requires GH_TOKEN or reaches the API', async t => {
  const { path } = await fixtureFile(t);
  const offline = await run(['--offline', path]);
  assert.equal(offline.code, 0);
  assert.doesNotMatch(`${offline.stdout}${offline.stderr}`, /GH_TOKEN_REQUIRED|ARTIFACT_API_/);

  const live = await run([]);
  assert.equal(live.code, 2, 'the live path is CI-only; without a token it fails closed');
  assert.match(live.stderr, /GH_TOKEN_REQUIRED/);
});

test('a fixture entry without an expiry is reported as unresolved', async t => {
  const { artifacts } = await fixtureFile(t);
  const target = artifacts[3];
  const fixture = await fixtureFile(t, { [target.id]: { expired: false } });
  const result = await run(['--offline', fixture.path, '--json']);
  assert.equal(result.code, 2);
  const report = JSON.parse(result.stdout);
  const row = report.artifacts.find(artifact => artifact.id === target.id);
  assert.equal(row.status, 'unknown');
  assert.equal(row.error, 'OFFLINE_FIXTURE_EXPIRY');
  assert.equal(report.unresolved, 1);
});
