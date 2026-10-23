#!/usr/bin/env node

/** Verify the two immutable IM plugin archives already selected by the live profile lock. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const DEFAULT_LOCK = fileURLToPath(new URL('../../config/dsh-im-plugin-inputs.v1.json', import.meta.url));
const INSPECTOR = fileURLToPath(new URL('./inspect-im-plugin-archive.py', import.meta.url));

function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

export function validateImPluginInputs(value) {
  exact(value, ['schema_version', 'release_ready', 'runtime', 'inputs'], 'IM_INPUT_SCHEMA');
  assert.equal(value.schema_version, 'shinemage-im-plugin-inputs/v1', 'IM_INPUT_SCHEMA');
  assert.equal(value.release_ready, false, 'IM_INPUT_RELEASE_BOUNDARY');
  exact(value.runtime, ['dsh', 'cordis'], 'IM_INPUT_RUNTIME_SCHEMA');
  assert.equal(value.runtime.dsh, '0.2.1-rc.3', 'IM_INPUT_DSH');
  assert.equal(value.runtime.cordis, '4.0.5', 'IM_INPUT_CORDIS');
  assert.ok(Array.isArray(value.inputs) && value.inputs.length === 2, 'IM_INPUT_SELECTION');
  const names = new Set();
  for (const input of value.inputs) {
    exact(input, ['package', 'version', 'repository', 'commit', 'source_url', 'tarball', 'bytes', 'sha256', 'integrity'], 'IM_INPUT_ENTRY_SCHEMA');
    assert.match(input.package, PACKAGE, 'IM_INPUT_PACKAGE');
    assert.match(input.version, VERSION, 'IM_INPUT_VERSION');
    assert.match(input.commit, COMMIT, 'IM_INPUT_COMMIT');
    assert.equal(input.repository, `https://github.com/${input.package === '@xmanrui/dsh-im' ? 'xmanrui/dsh-im' : 'dshplugin/dsh-plugin-hub'}`, 'IM_INPUT_REPOSITORY');
    assert.equal(input.source_url, `${input.repository.replace('https://github.com/', 'https://codeload.github.com/')}/tar.gz/${input.commit}`, 'IM_INPUT_URL');
    assert.match(input.tarball, SAFE_FILE, 'IM_INPUT_TARBALL');
    assert.ok(Number.isSafeInteger(input.bytes) && input.bytes > 0 && input.bytes <= MAX_ARCHIVE_BYTES, 'IM_INPUT_BYTES');
    assert.match(input.sha256, SHA256, 'IM_INPUT_SHA256');
    assert.match(input.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/, 'IM_INPUT_INTEGRITY');
    assert.equal(basename(input.tarball), input.tarball, 'IM_INPUT_TARBALL_PATH');
    assert.equal(names.has(input.package), false, 'IM_INPUT_DUPLICATE');
    names.add(input.package);
  }
  assert.deepEqual([...names].sort(), ['@xmanrui/dsh-im', 'dsh-plugin'], 'IM_INPUT_PACKAGES');
  return value;
}

function digest(buffer, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(buffer).digest(encoding);
}

async function verifyPython(python) {
  const { stdout } = await exec(python, ['-I', '-B', '-c',
    'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 1024,
  });
  assert.equal(stdout.trim(), '3.14', 'IM_INPUT_PYTHON_VERSION');
}

async function verifyArchive(input, inputDir, python) {
  const path = join(inputDir, input.tarball);
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `IM_INPUT_FILE_INVALID ${input.tarball}`);
  assert.equal(info.size, input.bytes, `IM_INPUT_SIZE_MISMATCH ${input.tarball}`);
  const bytes = await readFile(path);
  assert.equal(digest(bytes, 'sha256'), input.sha256, `IM_INPUT_SHA256_MISMATCH ${input.tarball}`);
  assert.equal(`sha512-${digest(bytes, 'sha512', 'base64')}`, input.integrity, `IM_INPUT_INTEGRITY_MISMATCH ${input.tarball}`);
  const heldRoot = await mkdtemp(join(tmpdir(), 'im-plugin-held-'));
  try {
    const held = join(heldRoot, input.tarball);
    await writeFile(held, bytes, { flag: 'wx', mode: 0o600 });
    const inspected = JSON.parse((await exec(python, ['-I', '-B', INSPECTOR, held, input.commit,
      '--max-entries', '20000', '--max-bytes', String(MAX_ARCHIVE_BYTES)], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024,
    })).stdout);
    assert.equal(inspected.package?.name, input.package, `IM_INPUT_PACKAGE_MISMATCH ${input.tarball}`);
    assert.equal(inspected.package?.version, input.version, `IM_INPUT_VERSION_MISMATCH ${input.tarball}`);
  } finally {
    await rm(heldRoot, { recursive: true, force: true });
  }
  return {
    package: input.package,
    version: input.version,
    commit: input.commit,
    tarball: input.tarball,
    bytes: input.bytes,
    sha256: input.sha256,
    integrity: input.integrity,
  };
}

export async function verifyImPluginInputs({ lockPath = DEFAULT_LOCK, inputDir,
  python = process.env.IM_PLUGIN_PYTHON ?? process.env.FQ_B0_PYTHON ?? 'python3' } = {}) {
  assert.equal(typeof inputDir, 'string', 'IM_INPUT_DIRECTORY_REQUIRED');
  await verifyPython(python);
  const lock = validateImPluginInputs(JSON.parse(await readFile(lockPath, 'utf8')));
  const packages = [];
  for (const input of lock.inputs) packages.push(await verifyArchive(input, inputDir, python));
  return {
    schema_version: 'shinemage-im-plugin-inputs-receipt/v1',
    status: 'PASS',
    release_ready: false,
    runtime: lock.runtime,
    packages,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const inputDir = option('--input-dir');
    const lockPath = option('--lock') ?? DEFAULT_LOCK;
    const python = option('--python') ?? undefined;
    assert.ok(inputDir, 'Usage: node scripts/release/im-plugin-inputs.mjs --input-dir /absolute/input-dir [--lock /absolute/lock.json]');
    console.log(JSON.stringify(await verifyImPluginInputs({ lockPath, inputDir, python }), null, 2));
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
