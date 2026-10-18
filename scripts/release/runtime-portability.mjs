import assert from 'node:assert/strict';
import { open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const HOST_PATH = /(?:\/private\/var\/|\/Users\/|\/home\/[^\s/]+\/|dsh-runtime-bundle-[A-Za-z0-9_-]+)/;
const GENERATED_HOST_PATH = /(?:\/private\/var\/|dsh-runtime-bundle-[A-Za-z0-9_-]+)/;
const GENERATED_RUNTIME_ROOT = /\/tmp\/dsh-runtime-bundle-[A-Za-z0-9_-]+\/dsh/g;
const METADATA_NAMES = new Set(['package.json', 'pnpm-lock.yaml', '.modules.yaml', '.pnpm-workspace-state-v1.json']);
const MACH_O = new Set(['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca']);
const PE = '4d5a';
const ELF = '7f454c46';
const X86_64 = 62;

function relativePath(root, path) { return relative(root, path).split('\\').join('/'); }

function hex(bytes) { return Buffer.from(bytes).toString('hex'); }

/** Rewrite pnpm shell shims so their generated staging root is discovered at runtime. */
export async function rewriteGeneratedPathShims(root) {
  let rewritten = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const bytes = await readFile(path);
      if (!bytes.includes(Buffer.from('/tmp/dsh-runtime-bundle-'))) continue;
      const text = bytes.toString('utf8');
      if (!text.startsWith('#!/bin/sh')) throw new Error(`RUNTIME_PORTABLE_PATH_UNSUPPORTED ${relativePath(root, path)}`);
      const marker = 'basedir="$basedir_abs"\n';
      assert.ok(text.includes(marker), `RUNTIME_PORTABLE_SHIM_MARKER_MISSING ${relativePath(root, path)}`);
      const rootDiscovery = [
        marker.trimEnd(),
        'dsh_runtime_root=${DSH_RUNTIME_ROOT-}',
        'if [ -z "$dsh_runtime_root" ]; then',
        '  dsh_runtime_root=$basedir_abs',
        '  while [ "$dsh_runtime_root" != / ]; do',
        '    if [ -f "$dsh_runtime_root/package.json" ] && [ -f "$dsh_runtime_root/lib/bin.js" ]; then break; fi',
        '    dsh_runtime_root=${dsh_runtime_root%/*}',
        '  done',
        'fi',
        '',
      ].join('\n');
      const next = text.replace(marker, rootDiscovery).replace(GENERATED_RUNTIME_ROOT, '$dsh_runtime_root');
      await writeFile(path, next);
      rewritten += 1;
    }
  }
  await walk(root);
  return rewritten;
}

async function nativeKind(path) {
  const handle = await open(path, 'r');
  const bytes = Buffer.alloc(20);
  try { await handle.read(bytes, 0, bytes.length, 0); } finally { await handle.close(); }
  const magic = hex(bytes.subarray(0, 4));
  if (MACH_O.has(magic)) return 'Mach-O';
  if (magic.startsWith(PE)) return 'PE';
  if (magic === ELF) {
    if (bytes.length < 20) return 'ELF-invalid';
    const machine = bytes[18] | (bytes[19] << 8);
    return machine === X86_64 ? 'ELF-x86_64' : `ELF-machine-${machine}`;
  }
  return null;
}

/** Remove platform-native bytes that cannot run in the Linux x64 artifact. */
export async function pruneUnsupportedLinuxNative(root) {
  const removed = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const rel = relativePath(root, path);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = await nativeKind(path);
      if (!kind || kind === 'ELF-x86_64') continue;
      if (!(rel.startsWith('node_modules/') || rel.includes('/node_modules/'))) throw new Error(`RUNTIME_PORTABLE_NATIVE_FORBIDDEN ${rel} ${kind}`);
      await rm(path, { force: true });
      removed.push({ path: rel, kind });
    }
  }
  await walk(root);
  return removed;
}

/** Reject host-specific metadata and native bytes after the deploy is shaped. */
export async function verifyPortableLinuxRuntime(root) {
  const findings = [];
  let files = 0;
  let metadataFiles = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const rel = relativePath(root, path);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      const kind = await nativeKind(path);
      if (kind && kind !== 'ELF-x86_64') findings.push(`${rel}:${kind}`);
      const bytes = await readFile(path);
      if (bytes.includes(0)) continue;
      const text = bytes.toString('utf8');
      if (METADATA_NAMES.has(entry.name) && HOST_PATH.test(text)) {
        metadataFiles += 1;
        findings.push(`${rel}:HOST_PATH`);
      } else if (!METADATA_NAMES.has(entry.name) && GENERATED_HOST_PATH.test(text)) {
        findings.push(`${rel}:HOST_PATH`);
      }
    }
  }
  await walk(root);
  assert.equal(findings.length, 0, `RUNTIME_PORTABLE_SCAN_FAILED ${findings.slice(0, 32).join(';')}`);
  return { status: 'PASS', files, metadata_files: metadataFiles, findings: [] };
}
