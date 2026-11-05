import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { validateSourceManifest } from './plugin-source-manifest.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/release/flip-deletion-gate.mjs');
const PYTHON = process.env.PYTHON || 'python3';
const MANIFEST = 'config/shinemage-composition-pack-manifest.v1.json';
const LOCK = 'config/shinemage-composition-packs.lock.json';
const ARTIFACT_LOCK = 'config/shinemage-composition-artifact.lock.json';
const RECEIPT = 'docs/operating/production-only-closure-receipt.md';
const ACCEPTANCE_BOOTSTRAP = [
  'import sys',
  'from pathlib import Path',
  'sys.path.insert(0, sys.argv[2])',
  'from backend.tests.cutover_evidence import write_acceptance_evidence',
  'write_acceptance_evidence(Path(sys.argv[1]))',
].join('; ');

async function writeManifest(path, manifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readManifest(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function editManifest(fixture, edit) {
  const manifest = await readManifest(fixture.manifestPath);
  edit(manifest);
  await writeManifest(fixture.manifestPath, manifest);
}

async function editArtifactLock(fixture, edit) {
  const path = join(fixture.dir, ARTIFACT_LOCK);
  const lock = JSON.parse(await readFile(path, 'utf8'));
  edit(lock);
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`);
}

/** Copy the tracked gate chain into a temp repo and pin a BLOCKED gate. */
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'flip-deletion-gate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'config'), { recursive: true });
  await mkdir(join(dir, 'docs/operating'), { recursive: true });
  for (const relative of [LOCK, ARTIFACT_LOCK, RECEIPT, MANIFEST]) {
    await cp(join(ROOT, relative), join(dir, relative));
  }
  const manifestPath = join(dir, MANIFEST);
  await editManifest({ manifestPath }, manifest => {
    manifest.deletion_gate = {
      status: 'BLOCKED',
      blocking_reasons: ['production_only_closure_not_recorded'],
    };
  });
  const acceptance = join(dir, 'acceptance');
  await exec(PYTHON, ['-c', ACCEPTANCE_BOOTSTRAP, acceptance, ROOT], { cwd: ROOT });
  return { dir, manifestPath, acceptance };
}

async function run(args) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: { ...process.env, PYTHON },
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return {
      status: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

function gateArgs(fixture) {
  return ['--repo', fixture.dir, '--acceptance', fixture.acceptance];
}

async function assertRefused(t, mutate, code) {
  const current = await fixture(t);
  await mutate(current);
  const before = await readFile(current.manifestPath);
  const result = await run(gateArgs(current));
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`DELETION_GATE_ERROR ${code}`));
  assert.deepEqual(await readFile(current.manifestPath), before);
  return result;
}

test('dry-run proves the flip and leaves the manifest byte-identical', async t => {
  const current = await fixture(t);
  const before = await readFile(current.manifestPath);
  const result = await run([...gateArgs(current), '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^DELETION_GATE_WOULD_FLIP previous=BLOCKED/m);
  assert.match(result.stdout, /target=\{"status":"READY","blocking_reasons":\[\]\}/);
  assert.match(result.stdout, /^ACCEPTANCE_OK /m);
  assert.deepEqual(await readFile(current.manifestPath), before);
});

test('flips the gate, validates the written manifest, and is idempotent', async t => {
  const current = await fixture(t);
  const before = await readManifest(current.manifestPath);
  const result = await run(gateArgs(current));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^DELETION_GATE_READY previous=BLOCKED/m);

  const after = await readManifest(current.manifestPath);
  assert.deepEqual(after.deletion_gate, { status: 'READY', blocking_reasons: [] });
  const { deletion_gate: _afterGate, ...afterRest } = after;
  const { deletion_gate: _beforeGate, ...beforeRest } = before;
  assert.deepEqual(afterRest, beforeRest);

  const lockSha256 = createHash('sha256')
    .update(await readFile(join(current.dir, LOCK)))
    .digest('hex');
  assert.doesNotThrow(() => validateSourceManifest(after, {
    lockSha256,
    productionOnlyClosurePath: join(current.dir, RECEIPT),
  }));
  assert.equal(after.deletion_gate.status, 'READY');

  const written = await readFile(current.manifestPath);
  const second = await run(gateArgs(current));
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /^DELETION_GATE_ALREADY_READY/m);
  assert.deepEqual(await readFile(current.manifestPath), written);
});

test('refuses a source that is not PASS', async t => {
  await assertRefused(t, current => editManifest(current, manifest => {
    manifest.sources[0].status = 'NOT_RUN';
    manifest.sources[0].manifest_sha256 = null;
    manifest.sources[0].pack_sha256 = null;
  }), 'DELETION_GATE_SOURCE_NOT_PASS');
});

test('refuses a domain that is not PASS', async t => {
  await assertRefused(t, current => editManifest(current, manifest => {
    manifest.domains[0].status = 'NOT_RUN';
    manifest.domains[0].manifest_sha256 = null;
    manifest.domains[0].pack_sha256 = null;
  }), 'DELETION_GATE_DOMAIN_NOT_PASS');
});

test('refuses a bundle that is not PASS', async t => {
  await assertRefused(t, current => editManifest(current, manifest => {
    manifest.bundle.status = 'NOT_RUN';
  }), 'DELETION_GATE_BUNDLE_NOT_PASS');
});

test('refuses a bundle whose remote_main is not PASS', async t => {
  await assertRefused(t, current => editManifest(current, manifest => {
    manifest.bundle.remote_main = 'NOT_RUN';
  }), 'DELETION_GATE_BUNDLE_NOT_PASS');
});

test('refuses a bundle that is not bound to the artifact lock composition', async t => {
  await assertRefused(t, current => editArtifactLock(current, lock => {
    lock.composition_lock_sha256 = 'c'.repeat(64);
  }), 'DELETION_GATE_BUNDLE_ARTIFACT_LOCK_MISMATCH');
});

test('refuses a bundle repository that diverges from the artifact lock', async t => {
  await assertRefused(t, current => editManifest(current, manifest => {
    manifest.bundle.repository = 'tyuanww/not-the-consumer';
  }), 'DELETION_GATE_BUNDLE_ARTIFACT_LOCK_MISMATCH');
});

test('refuses a half-edited bundle that names the locked artifact', async t => {
  await assertRefused(t, async current => {
    const artifactLock = JSON.parse(await readFile(join(current.dir, ARTIFACT_LOCK), 'utf8'));
    await editManifest(current, manifest => {
      manifest.bundle.artifact_id = artifactLock.id;
    });
  }, 'DELETION_GATE_BUNDLE_ARTIFACT_LOCK_MISMATCH');
});

test('refuses a missing artifact lock', async t => {
  await assertRefused(t, current => rm(join(current.dir, ARTIFACT_LOCK)), 'DELETION_GATE_ARTIFACT_LOCK_MISSING');
});

test('refuses a lock digest mismatch', async t => {
  await assertRefused(t, async current => {
    const text = await readFile(join(current.dir, LOCK), 'utf8');
    await writeFile(join(current.dir, LOCK), `${text}\n`);
  }, 'DELETION_GATE_LOCK_MISMATCH');
});

test('refuses a missing production-only closure receipt', async t => {
  await assertRefused(t, current => rm(join(current.dir, RECEIPT)),
    'DELETION_GATE_PRODUCTION_ONLY_CLOSURE_NOT_RECORDED');
});

test('refuses when the closure receipt does not bind the manifest sources', async t => {
  await assertRefused(t, current => editManifest(current, manifest => {
    manifest.sources[0].sha = 'f'.repeat(40);
  }), 'DELETION_GATE_PRODUCTION_ONLY_CLOSURE_NOT_RECORDED');
});

test('refuses tampered acceptance evidence', async t => {
  await assertRefused(t, current => writeFile(join(current.acceptance, 'README.md'),
    'tampered\n'), 'DELETION_GATE_ACCEPTANCE_FAILED');
});

test('refuses tampered acceptance evidence even in dry-run', async t => {
  const current = await fixture(t);
  await writeFile(join(current.acceptance, 'README.md'), 'tampered\n');
  const before = await readFile(current.manifestPath);
  const result = await run([...gateArgs(current), '--dry-run']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /DELETION_GATE_ERROR DELETION_GATE_ACCEPTANCE_FAILED/);
  assert.deepEqual(await readFile(current.manifestPath), before);
});

test('refuses a missing acceptance directory', async t => {
  const current = await fixture(t);
  const before = await readFile(current.manifestPath);
  const result = await run(['--repo', current.dir, '--acceptance', join(current.dir, 'missing')]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /DELETION_GATE_ERROR DELETION_GATE_ACCEPTANCE_FAILED CUTOVER_ACCEPTANCE_ROOT_MISSING/);
  assert.deepEqual(await readFile(current.manifestPath), before);
});

test('requires --acceptance before reading the manifest', async t => {
  const current = await fixture(t);
  const before = await readFile(current.manifestPath);
  const result = await run(['--repo', current.dir]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DELETION_GATE_ERROR DELETION_GATE_ACCEPTANCE_REQUIRED/);
  assert.deepEqual(await readFile(current.manifestPath), before);
});

test('refuses a missing manifest', async t => {
  const current = await fixture(t);
  await rm(current.manifestPath);
  const result = await run(gateArgs(current));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DELETION_GATE_ERROR DELETION_GATE_MANIFEST_MISSING/);
});

test('refuses an unparseable manifest', async t => {
  await assertRefused(t, current => writeFile(current.manifestPath, '{\n'),
    'DELETION_GATE_MANIFEST_INVALID');
});

test('refuses a missing composition lock', async t => {
  await assertRefused(t, current => rm(join(current.dir, LOCK)), 'DELETION_GATE_LOCK_MISSING');
});

test('refuses an unparseable artifact lock', async t => {
  await assertRefused(t, current => writeFile(join(current.dir, ARTIFACT_LOCK), '{\n'),
    'DELETION_GATE_ARTIFACT_LOCK_INVALID');
});

test('refuses an unknown argument', async () => {
  const result = await run(['--bogus']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DELETION_GATE_ERROR DELETION_GATE_USAGE/);
});

test('refuses when the flipped manifest fails validateSourceManifest', async t => {
  // All named preconditions pass; the final production validator is the only
  // thing that can reject the flipped object. Nothing may be written.
  await assertRefused(t, current => editManifest(current, manifest => {
    manifest.consumer.reviewed_sha = 'not-a-sha';
  }), 'DELETION_GATE_FLIPPED_MANIFEST_INVALID');
});
