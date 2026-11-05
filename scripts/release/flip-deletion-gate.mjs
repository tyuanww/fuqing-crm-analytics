#!/usr/bin/env node

/**
 * Fail-closed flip lever for the P4 `deletion_gate`.
 *
 * The gate is the last hand edit in the repo split: `validateGate` forces a
 * `READY` gate once `production_only_closure_not_recorded` is dropped, and the
 * runbook also requires G3 real-host ACP acceptance. This command encodes every
 * precondition and writes the gate exactly once:
 *
 *   1. every `sources[]`/`domains[]` status is PASS;
 *   2. `bundle.status`/`bundle.remote_main` are PASS and the bundle is bound to
 *      the checked-in composition artifact lock;
 *   3. `production-only-closure.mjs --check-receipt` prints
 *      `PRODUCTION_ONLY_CLOSURE_RECORDED`;
 *   4. `scripts/release/verify-acceptance.py --acceptance <dir>` (the
 *      production cutover gate) prints `ACCEPTANCE_OK`;
 *   5. only then writes `{status: READY, blocking_reasons: []}` and re-reads the
 *      file to run `validateSourceManifest` plus the runbook gate one-liner.
 *
 * `--dry-run` stops before the write and prints what would flip. Any failed
 * check throws a named `DELETION_GATE_*` error and leaves every file untouched.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateSourceManifest } from './plugin-source-manifest.mjs';
import { validateArtifactLock } from './production-only-closure.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MANIFEST_PATH = 'config/shinemage-composition-pack-manifest.v1.json';
const LOCK_PATH = 'config/shinemage-composition-packs.lock.json';
const ARTIFACT_LOCK_PATH = 'config/shinemage-composition-artifact.lock.json';
const RECEIPT_PATH = 'docs/operating/production-only-closure-receipt.md';
const ACCEPTANCE_VERIFIER = join(REPO_ROOT, 'scripts/release/verify-acceptance.py');
const CLOSURE_SCRIPT = join(REPO_ROOT, 'scripts/release/production-only-closure.mjs');
const CLOSURE_RECEIPT_MARKER = 'PRODUCTION_ONLY_CLOSURE_RECORDED';
const ACCEPTANCE_MARKER = 'ACCEPTANCE_OK';

class GateError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.name = 'GateError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new GateError(code, detail);
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function tail(value, limit = 800) {
  return String(value ?? '').trim().split('\n').slice(-6).join(' | ').slice(0, limit);
}

function readManifest(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail('DELETION_GATE_MANIFEST_MISSING', path);
  }
  try {
    return { text, manifest: JSON.parse(text) };
  } catch (error) {
    fail('DELETION_GATE_MANIFEST_INVALID', `${path}: ${error.message}`);
  }
}

function rows(value, code, emptyCode) {
  if (!Array.isArray(value)) fail('DELETION_GATE_MANIFEST_INVALID', code);
  if (value.length === 0) fail('DELETION_GATE_MANIFEST_INVALID', emptyCode);
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      fail('DELETION_GATE_MANIFEST_INVALID', `${code} must contain objects`);
    }
  }
  return value;
}

function assertGate(manifest, lockSha256, receiptPath, code) {
  try {
    validateSourceManifest(manifest, { lockSha256, productionOnlyClosurePath: receiptPath });
  } catch (error) {
    fail(code, error?.message ?? String(error));
  }
  if (manifest.deletion_gate?.status !== 'READY') {
    fail('DELETION_GATE_NOT_READY', `status=${manifest.deletion_gate?.status}`);
  }
}

/**
 * The release-preflight bundle and the sealed composition artifact are distinct
 * artifacts (the bundle proves remote main, the artifact lock pins the sealed
 * pack input). Their shared binding is the composition lock digest and the
 * repository; a bundle that explicitly names the locked artifact must also
 * match its run/id/sha/head so a half-edited bundle cannot borrow the lock.
 */
function assertArtifactLockBinding(manifest, artifactLock, repository) {
  const bundle = manifest.bundle;
  if (bundle.repository !== repository) {
    fail('DELETION_GATE_BUNDLE_ARTIFACT_LOCK_MISMATCH',
      `repository bundle=${bundle.repository} artifact_lock=${repository}`);
  }
  if (manifest.lock?.sha256 !== artifactLock.composition_lock_sha256) {
    fail('DELETION_GATE_BUNDLE_ARTIFACT_LOCK_MISMATCH',
      `composition_lock_sha256 manifest=${manifest.lock?.sha256} `
      + `artifact_lock=${artifactLock.composition_lock_sha256}`);
  }
  if (bundle.artifact_id === artifactLock.id) {
    const bindings = [
      ['run_id', bundle.run_id, artifactLock.run_id],
      ['artifact_sha256', bundle.artifact_sha256, artifactLock.artifact_sha256],
      ['artifact_head_sha', bundle.artifact_head_sha, artifactLock.head_sha],
    ];
    for (const [field, actual, expected] of bindings) {
      if (actual !== expected) {
        fail('DELETION_GATE_BUNDLE_ARTIFACT_LOCK_MISMATCH',
          `${field} bundle=${actual} artifact_lock=${expected}`);
      }
    }
  }
}

async function flip(options) {
  const root = resolve(options.repo);
  const manifestPath = join(root, MANIFEST_PATH);
  const { text: before, manifest } = readManifest(manifestPath);

  const sources = rows(manifest.sources, 'sources[]', 'sources must not be empty');
  const domains = rows(manifest.domains, 'domains[]', 'domains must not be empty');
  for (const source of sources) {
    if (source.status !== 'PASS') {
      fail('DELETION_GATE_SOURCE_NOT_PASS', `${source.id ?? '<unknown>'} status=${source.status}`);
    }
  }
  for (const domain of domains) {
    if (domain.status !== 'PASS') {
      fail('DELETION_GATE_DOMAIN_NOT_PASS', `${domain.package ?? '<unknown>'} status=${domain.status}`);
    }
  }
  console.log(`DELETION_GATE_SOURCES_PASS ${sources.length}`);
  console.log(`DELETION_GATE_DOMAINS_PASS ${domains.length}`);

  const bundle = manifest.bundle;
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
      || bundle.status !== 'PASS' || bundle.remote_main !== 'PASS') {
    fail('DELETION_GATE_BUNDLE_NOT_PASS',
      `status=${bundle?.status} remote_main=${bundle?.remote_main}`);
  }
  console.log(`DELETION_GATE_BUNDLE_PASS run_id=${bundle.run_id} artifact_id=${bundle.artifact_id}`);

  let lockBytes;
  try {
    lockBytes = readFileSync(join(root, LOCK_PATH));
  } catch {
    fail('DELETION_GATE_LOCK_MISSING', LOCK_PATH);
  }
  const lockSha256 = hash(lockBytes);
  if (manifest.lock?.sha256 !== lockSha256) {
    fail('DELETION_GATE_LOCK_MISMATCH',
      `manifest=${manifest.lock?.sha256} checked_in=${lockSha256}`);
  }

  const artifactLockPath = join(root, ARTIFACT_LOCK_PATH);
  if (!existsSync(artifactLockPath)) fail('DELETION_GATE_ARTIFACT_LOCK_MISSING', artifactLockPath);
  let artifactLock;
  try {
    artifactLock = await validateArtifactLock({ root });
  } catch (error) {
    fail('DELETION_GATE_ARTIFACT_LOCK_INVALID', error?.message ?? String(error));
  }
  let artifactLockDocument;
  try {
    artifactLockDocument = JSON.parse(readFileSync(artifactLockPath, 'utf8'));
  } catch (error) {
    fail('DELETION_GATE_ARTIFACT_LOCK_INVALID', error?.message ?? String(error));
  }
  assertArtifactLockBinding(manifest, artifactLock, artifactLockDocument.repository);
  console.log(`DELETION_GATE_ARTIFACT_LOCK_PASS composition_lock_sha256=${artifactLock.composition_lock_sha256}`);

  const receiptPath = join(root, RECEIPT_PATH);
  let closure;
  try {
    closure = execFileSync(process.execPath, [
      CLOSURE_SCRIPT, '--check-receipt', '--repo', root, '--receipt', receiptPath,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = [error?.stdout, error?.stderr].filter(Boolean).join('\n');
    fail('DELETION_GATE_PRODUCTION_ONLY_CLOSURE_NOT_RECORDED', tail(detail || error?.message));
  }
  if (!closure.includes(CLOSURE_RECEIPT_MARKER)) {
    fail('DELETION_GATE_PRODUCTION_ONLY_CLOSURE_NOT_RECORDED', `missing ${CLOSURE_RECEIPT_MARKER}`);
  }
  console.log(`DELETION_GATE_CLOSURE_RECORDED ${tail(closure, 300)}`);

  let acceptanceOutput;
  try {
    acceptanceOutput = execFileSync(options.python, [
      ACCEPTANCE_VERIFIER, '--acceptance', resolve(options.acceptance),
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  } catch (error) {
    const detail = [error?.stdout, error?.stderr].filter(Boolean).join('\n');
    const match = detail.match(/ACCEPTANCE_FAILED\s+([A-Z][A-Z0-9_]*)(?::\s*([^\n]*))?/);
    fail('DELETION_GATE_ACCEPTANCE_FAILED',
      match ? `${match[1]}${match[2] ? `: ${match[2].trim()}` : ''}` : tail(detail || error?.message));
  }
  if (!new RegExp(`^${ACCEPTANCE_MARKER}(?:\\s|$)`, 'm').test(acceptanceOutput)) {
    fail('DELETION_GATE_ACCEPTANCE_FAILED', `${ACCEPTANCE_MARKER} missing`);
  }
  process.stdout.write(acceptanceOutput);

  if (manifest.deletion_gate?.status === 'READY') {
    assertGate(manifest, lockSha256, receiptPath, 'DELETION_GATE_MANIFEST_INVALID');
    console.log('DELETION_GATE_ALREADY_READY');
    return;
  }

  const flipped = { ...manifest, deletion_gate: { status: 'READY', blocking_reasons: [] } };
  assertGate(flipped, lockSha256, receiptPath, 'DELETION_GATE_FLIPPED_MANIFEST_INVALID');

  const previous = `${manifest.deletion_gate?.status} `
    + `[${(manifest.deletion_gate?.blocking_reasons ?? []).join(',')}]`;
  if (options.dryRun) {
    console.log(`DELETION_GATE_WOULD_FLIP previous=${previous} target=${JSON.stringify(flipped.deletion_gate)}`);
    return;
  }

  const bytes = `${JSON.stringify(flipped, null, 2)}\n`;
  const mode = statSync(manifestPath).mode & 0o777;
  const temporary = `${manifestPath}.tmp-${process.pid}`;
  writeFileSync(temporary, bytes, { mode });
  try {
    renameSync(temporary, manifestPath);
  } catch (error) {
    rmSync(temporary, { force: true });
    fail('DELETION_GATE_WRITE_FAILED', error.message);
  }
  try {
    const written = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assertGate(written, lockSha256, receiptPath, 'DELETION_GATE_POST_WRITE_VALIDATION_FAILED');
  } catch (error) {
    writeFileSync(manifestPath, before, { mode });
    fail('DELETION_GATE_POST_WRITE_VALIDATION_FAILED', error?.message ?? String(error));
  }
  console.log(`DELETION_GATE_READY previous=${previous} manifest=${MANIFEST_PATH}`);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/release/flip-deletion-gate.mjs --acceptance <evidence-dir> [--dry-run]',
    '    [--repo <path>] [--python <interpreter>]',
    '',
    'The command refuses with a named DELETION_GATE_* error unless every source',
    'and domain is PASS, the bundle is PASS/remote_main PASS and bound to the',
    'checked-in composition artifact lock, the production-only closure receipt',
    'prints PRODUCTION_ONLY_CLOSURE_RECORDED, and the G3 acceptance root prints',
    'ACCEPTANCE_OK. --dry-run prints the flip and leaves the manifest byte-identical.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    acceptance: null,
    dryRun: false,
    repo: REPO_ROOT,
    python: process.env.PYTHON || 'python3',
    help: false,
  };
  const values = new Set(['--acceptance', '--repo', '--python']);
  const args = [...argv];
  while (args.length) {
    const key = args.shift();
    if (key === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (key === '--help' || key === '-h') {
      options.help = true;
      continue;
    }
    if (!values.has(key)) fail('DELETION_GATE_USAGE', key);
    const value = args.shift();
    if (!value || value.startsWith('--')) fail('DELETION_GATE_USAGE', `${key} requires a value`);
    if (key === '--acceptance') options.acceptance = value;
    else if (key === '--repo') options.repo = resolve(value);
    else options.python = value;
  }
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.acceptance) fail('DELETION_GATE_ACCEPTANCE_REQUIRED', '--acceptance <evidence-dir>');
  if (!options.python) fail('DELETION_GATE_USAGE', '--python requires a value');
  await flip(options);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof GateError) {
      console.error(`DELETION_GATE_ERROR ${error.code}${error.detail ? ` ${error.detail}` : ''}`);
    } else {
      console.error(`DELETION_GATE_ERROR DELETION_GATE_INTERNAL ${error?.stack ?? error}`);
    }
    process.exitCode = 1;
  }
}

export { GateError, assertArtifactLockBinding, flip, parseArgs };
