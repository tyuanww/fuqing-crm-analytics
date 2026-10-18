#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readlink, readdir, realpath, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, join, resolve } from 'node:path';

const exec = promisify(execFile);
const HEX = /^[a-f0-9]{64}$/;

function option(name, required = true) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (required) throw new Error(`OWNER_RECEIPT_${name.slice(2).toUpperCase()}_REQUIRED`);
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`OWNER_RECEIPT_${name.slice(2).toUpperCase()}_REQUIRED`);
  return value;
}

async function digestFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function hashTree(root, { maxFiles = 100000, maxBytes = 2 * 1024 * 1024 * 1024 } = {}) {
  const rows = [];
  let bytes = 0;
  async function walk(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        rows.push(`dir\t${rel}\n`);
        await walk(path, `${rel}/`);
        continue;
      }
      if (entry.isSymbolicLink()) {
        rows.push(`link\t${rel}\t${await readlink(path)}\n`);
        continue;
      }
      assert.ok(entry.isFile(), `OWNER_RECEIPT_SPECIAL_FILE ${rel}`);
      const info = await digestFile(path);
      bytes += info.bytes;
      assert.ok(++hashTree.fileCount <= maxFiles, 'OWNER_RECEIPT_FILE_LIMIT');
      assert.ok(bytes <= maxBytes, 'OWNER_RECEIPT_BYTE_LIMIT');
      rows.push(`file\t${rel}\t${info.bytes}\t${info.sha256}\n`);
    }
  }
  hashTree.fileCount = 0;
  await walk(root);
  const tree = createHash('sha256').update(rows.join('')).digest('hex');
  return { sha256: tree, files: hashTree.fileCount, bytes };
}

async function command(program, args, options = {}) {
  const result = await exec(program, args, { maxBuffer: 8 * 1024 * 1024, ...options });
  return result.stdout.trim();
}

async function targetState(root, tag, serviceName) {
  const current = join(root, 'current');
  const currentTarget = await realpath(current);
  const recorded = (await readFile(join(root, 'current-target'), 'utf8')).trim();
  const releaseRoot = resolve(root, 'releases');
  assert.ok(currentTarget.startsWith(`${releaseRoot}/`), 'OWNER_RECEIPT_CURRENT_OUTSIDE_RELEASES');
  assert.equal(resolve(recorded), currentTarget, 'OWNER_RECEIPT_CURRENT_TARGET_DRIFT');
  const target = resolve(releaseRoot, tag);
  const markerPath = join(target, 'release-marker.json');
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  const files = {};
  for (const name of ['release-manifest.v1.json', 'SHA256SUMS', 'source-attestation.jsonl', 'upstream-runtime-attestation.jsonl']) {
    const path = join(target, name);
    files[name] = await access(path).then(() => digestFile(path), error => ({ status: error.code === 'ENOENT' ? 'MISSING' : 'ERROR' }));
  }
  const service = {
    active: await command('systemctl', ['is-active', serviceName]),
    show: await command('systemctl', ['show', serviceName, '-p', 'MainPID', '-p', 'Environment', '-p', 'DropInPaths']),
    unit_sha256: await digestFile(`/etc/systemd/system/${serviceName}.service`).catch(() => ({ status: 'MISSING' })),
    env_sha256: await digestFile('/etc/shinemage/dsh.env').catch(() => ({ status: 'MISSING' })),
  };
  const mainPid = Number((service.show.match(/MainPID=(\d+)/) ?? [])[1] ?? 0);
  if (mainPid > 0) {
    service.cmdline = (await readFile(`/proc/${mainPid}/cmdline`)).toString('utf8').split('\0').filter(Boolean).join(' ');
    service.environment = (await readFile(`/proc/${mainPid}/environ`)).toString('utf8').split('\0')
      .filter(value => /^(DSH_|NODE_|PATH=|COREPACK_)/.test(value)).map(value => value.split('=', 2)[0]);
  }
  return { current: currentTarget, recorded, target, marker, files, service };
}

async function main() {
  const root = resolve(option('--root'));
  const tag = option('--tag');
  const runtime = resolve(option('--runtime'));
  const output = resolve(option('--output'));
  const serviceName = option('--service', false) ?? 'shinemage-dsh.service';
  assert.ok(isAbsolute(root) && isAbsolute(runtime) && isAbsolute(output), 'OWNER_RECEIPT_ABSOLUTE_PATH_REQUIRED');
  const state = await targetState(root, tag, serviceName);
  const runtimeTree = await hashTree(runtime);
  const marker = state.marker;
  const receipt = {
    schema_version: 'shinemage-owner-operated-target-receipt/v1',
    status: state.current === state.target && state.service.active === 'active' ? 'PASS_OWNER_OPERATED' : 'BLOCKED',
    observed_at: new Date().toISOString(),
    tag,
    release_root: state.target,
    current: { resolved: state.current, recorded: state.recorded },
    marker: {
      schema_version: marker.schema_version,
      tag: marker.tag,
      source_sha: marker.source_sha,
      merged_main_tree: marker.merged_main_tree ?? null,
      artifact_sha256: marker.artifact_sha256 ?? null,
      upstream_runtime: marker.upstream_runtime ?? null,
      owner: marker.owner ?? null,
      restart_dependency: marker.restart_dependency ?? null,
    },
    release_files: state.files,
    runtime: { path: runtime, tree: runtimeTree },
    service: state.service,
    formal_status: { m2_07: 'BLOCKED', m2_08: 'NOT_RUN', m2_09: 'NOT_RUN', release_ready: false },
    publication: 'OWNER_LOCAL_ONLY',
  };
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: receipt.status, output, current: state.current, runtime_sha256: runtimeTree.sha256, files: runtimeTree.files }, null, 2));
  if (receipt.status !== 'PASS_OWNER_OPERATED') process.exitCode = 2;
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
