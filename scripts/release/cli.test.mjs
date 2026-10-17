import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { transition } from './state.mjs';
import { serviceFixture } from './test-fixtures/service-compatibility.mjs';

const root = join(import.meta.dirname, '..', '..');
const cli = join(root, 'scripts/dsh.mjs');

test('candidate CLI exposes pinned pack input and rejects ambiguous or missing pins', () => {
  const help = spawnSync(process.execPath, [cli, 'plugin', 'candidate', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--pack-manifest .*--pack-sha256 SHA256/);
  const common = ['plugin', 'candidate', '--output-dir', '/unused-candidate', '--state-path', '/unused-journal'];
  for (const [args, error] of [
    [['--plugin', '/plugin', '--pack-manifest', '/pack.json'], /PLUGIN_CANDIDATE_INPUT_CONFLICT/],
    [['--pack-manifest', '/pack.json'], /PLUGIN_PACK_MANIFEST_DIGEST_REQUIRED/],
    [['--plugin', '/plugin', '--pack-sha256', '0'.repeat(64)], /PLUGIN_CANDIDATE_INPUT_CONFLICT/],
    [['--pack-manifest', '/pack.json', '--pack-manifest', '/other.json'], /PLUGIN_OPTION_DUPLICATE/],
  ]) {
    const child = spawnSync(process.execPath, [cli, ...common, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(child.status, 2, child.stderr);
    assert.match(child.stderr, error);
  }
});

test('dsh exposes stable help and version output', () => {
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Commands:.*release/);
  const version = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.match(version, /^DSH_VERSION \d+\.\d+\.\d+\.\d+ upstream=477b4f42/m);
  const releaseHelp = execFileSync(process.execPath, [cli, 'release', '--help'], { encoding: 'utf8' });
  assert.match(releaseHelp, /Precedence: --tag/);
  const pluginHelp = execFileSync(process.execPath, [cli, 'plugin', 'candidate', '--help'], { encoding: 'utf8' });
  assert.match(pluginHelp, /--state-path/);
  const hostHelp = execFileSync(process.execPath, [cli, 'plugin', 'verify-host', '--help'], { encoding: 'utf8' });
  assert.match(hostHelp, /--candidate.*--evidence.*--state-path/);
  assert.match(hostHelp, /does not start or activate a host/);
  const verifyHelp = execFileSync(process.execPath, [cli, 'verify', '--help'], { encoding: 'utf8' });
  assert.match(verifyHelp, /Usage: pnpm dsh verify \[--scope local\|release\]/);
  const statusHelp = execFileSync(process.execPath, [cli, 'status', '--help'], { encoding: 'utf8' });
  assert.match(statusHelp, /Usage: pnpm dsh status/);
  const resumeHelp = execFileSync(process.execPath, [cli, 'resume', '--help'], { encoding: 'utf8' });
  assert.match(resumeHelp, /Usage: pnpm dsh resume/);
});

test('plugin evidence CLI rejects ambiguous, missing and unsupported options before IO', () => {
  for (const [args, code] of [
    [['--candidate', '/candidate', '--candidate', '/other'], 'PLUGIN_OPTION_DUPLICATE'],
    [['--candidate', '--evidence', '/evidence'], 'PLUGIN_OPTION_VALUE_REQUIRED'],
    [['--activate', '/host'], 'PLUGIN_OPTION_UNKNOWN'],
  ]) {
    const result = spawnSync(process.execPath, [cli, 'plugin', 'verify-host', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes(code), result.stderr);
  }
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
  assert.match(result.stdout, /DSH_DOCTOR_RELEASE_BLOCKERS count=/);
  assert.match(result.stdout, /docs\/operating\/dsh-rc2-quickstart\.md#dsh-quickstart-runtime/);
});

test('doctor release rejects an uncompressed or misnamed runtime bundle', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'dsh-runtime-check-'));
  const runtime = join(rootDir, 'shinemage-dsh-upstream-runtime-477b4f420553e8a52c2fbccc464d7561b239c443.tar.zst');
  await writeFile(runtime, 'not-a-zstd-stream');
  try {
    const result = spawnSync(process.execPath, [cli, 'doctor', '--release'], {
      encoding: 'utf8',
      env: { ...process.env, DSH_UPSTREAM_RUNTIME_BUNDLE: runtime },
    });
    assert.equal(result.status, 2);
    assert.match(result.stdout, /runtime-bundle=.*zstd-invalid/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('release and status fail closed without an explicit durable state path', () => {
  const release = spawnSync(process.execPath, [cli, 'release', '--offline', '--tag', 'dsh-state-required'], { encoding: 'utf8', env: { ...process.env, RELEASE_STATE_PATH: '' } });
  assert.equal(release.status, 2);
  assert.match(release.stderr, /RELEASE_STATE_PATH_REQUIRED/);
  const status = spawnSync(process.execPath, [cli, 'status'], { encoding: 'utf8', env: { ...process.env, RELEASE_STATE_PATH: '' } });
  assert.equal(status.status, 2);
  assert.match(status.stderr, /RELEASE_STATE_PATH_REQUIRED/);
});

test('state commands read the explicit absolute journal using flag, positional or environment input', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-cli-state-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json');
  await transition(path, 'BUILD', { release_tag: 'dsh-explicit-state' });
  for (const command of ['status', 'resume']) {
    for (const args of [['--state-path', path], [path], []]) {
      const result = spawnSync(process.execPath, [cli, command, ...args], {
        encoding: 'utf8', env: { ...process.env, RELEASE_STATE_PATH: path },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).release_tag, 'dsh-explicit-state');
      assert.equal(JSON.parse(result.stdout).phase, 'BUILD');
    }
    const invalid = spawnSync(process.execPath, [cli, command, 'relative.json'], { encoding: 'utf8' });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /RELEASE_STATE_PATH_ABSOLUTE_REQUIRED/);
    const ambiguous = spawnSync(process.execPath, [cli, command, '--state-path', path, '--state-path', path], { encoding: 'utf8' });
    assert.equal(ambiguous.status, 2);
    assert.match(ambiguous.stderr, /RELEASE_STATE_PATH_AMBIGUOUS/);
  }
  const receipt = join(dir, 'remote.json');
  await writeFile(receipt, JSON.stringify({ release_tag: 'dsh-explicit-state', phase: 'BUILD', status: 'DRAFT' }));
  for (const args of [[path, receipt], ['--state-path', path, receipt], [receipt]]) {
    const result = spawnSync(process.execPath, [cli, 'reconcile', ...args], {
      encoding: 'utf8', env: { ...process.env, RELEASE_STATE_PATH: path },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'RECONCILED');
  }
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

test('preflight check rejects a source SHA that is not the current checkout', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'dsh-preflight-sha-'));
  try {
    const python = execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim();
    const result = spawnSync(process.execPath, [join(root, 'scripts/release/preflight.mjs'), '--check', '--python', python, '--tag', 'dsh-sha-test', '--source-sha', '0'.repeat(40), '--output-dir', join(rootDir, 'candidate')], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /PREFLIGHT_SOURCE_SHA_MISMATCH/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('preflight checks declared service evidence before build and preserves its read-only boundary', async t => {
  await mkdir(join(root, '.context'), { recursive: true });
  const trial = await mkdtemp(join(root, '.context/preflight-service-'));
  t.after(() => rm(trial, { recursive: true, force: true }));
  const { binding, evidenceJson } = await serviceFixture();
  const profile = JSON.parse(await readFile(join(root, 'config/dsh-profile.rc2.json')));
  const profilePath = join(trial, 'profile.json'), evidencePath = join(trial, 'receipt.json');
  await writeFile(profilePath, JSON.stringify({ ...profile, service_binding: binding }));
  await writeFile(evidencePath, evidenceJson);
  const python = execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim();
  const output = join(trial, 'output');
  const run = extra => spawnSync(process.execPath, [join(root, 'scripts/release/preflight.mjs'), '--check', '--python', python, '--tag', 'dsh-service-precheck', '--output-dir', output, ...extra], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, DSH_PROFILE_MANIFEST: profilePath, DSH_UPSTREAM_RUNTIME_BUNDLE: '' },
  });
  const missing = run([]);
  assert.equal(missing.status, 2);
  assert.match(missing.stdout + missing.stderr, /SERVICE_EVIDENCE_REQUIRED/);
  const valid = run(['--service-evidence', evidencePath]);
  assert.match(valid.stdout, /PASS service-compatibility=LOCAL_COMPATIBLE/);
  // No runtime bundle: valid service evidence must not override other gates.
  assert.equal(valid.status, 2);
  assert.match(valid.stdout, /RELEASE_UPSTREAM_RUNTIME_REQUIRED/);
  await writeFile(evidencePath, evidenceJson + ' ');
  const tampered = run(['--service-evidence', evidencePath]);
  assert.equal(tampered.status, 2);
  assert.match(tampered.stdout + tampered.stderr, /SERVICE_EVIDENCE_DIGEST_MISMATCH/);
  const duplicate = run(['--service-evidence', evidencePath, '--service-evidence', evidencePath]);
  assert.equal(duplicate.status, 2);
  assert.match(duplicate.stderr, /SERVICE_EVIDENCE_AMBIGUOUS/);
  const missingValue = run(['--service-evidence']);
  assert.equal(missingValue.status, 2);
  assert.match(missingValue.stderr, /SERVICE_EVIDENCE_REQUIRED/);
  for (const result of [missing, valid, tampered, duplicate, missingValue]) assert.doesNotMatch(result.stdout, /DSH_PREFLIGHT_STAGE /);
  await assert.rejects(() => readFile(join(output, 'release-preflight.json')), { code: 'ENOENT' });
});
