/** Read-only, archive-bound SDK content triage. Never changes release readiness. */
import assert from 'node:assert/strict';
import { isUtf8 } from 'node:buffer';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scanText } from './secret-scan.mjs';
import { verifySdkClosure } from '../../dsh-plugins/plugin-kit/sdk-closure.mjs';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));
const archiveHelper = join(repository, 'dsh-plugins/plugin-kit/sdk-archive.py');
const schema = 'shinemage-sdk-content-audit/v1';
const maxTextBytes = 16 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const code = (test, name) => assert.ok(test, `SDK_AUDIT_${name}`);

export async function inspectArchive(archive, sha, python) {
  const script = `import importlib.util,json,pathlib,sys
s=importlib.util.spec_from_file_location('sdk_archive',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
try:
 manifest=m.inspect_archive(pathlib.Path(sys.argv[2]),sys.argv[3],m.current_identity(pathlib.Path(sys.argv[4])))
 json.dump(manifest,sys.stdout,separators=(',',':'))
except Exception:
 sys.exit(2)
`;
  try {
    const { stdout } = await exec(python, ['-c', script, archiveHelper, archive, sha, process.execPath], {
      cwd: repository, env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, PYTHONDONTWRITEBYTECODE: '1' },
      timeout: 180000, maxBuffer: 70 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch { throw new Error('SDK_AUDIT_ARCHIVE_INVALID'); }
}

function opaqueKind(name, bytes) {
  if (name.startsWith('upstream/.git/objects/')) return 'git-object';
  if (/\.(?:zip|gz|tgz|xz|bz2|zst|7z|br|asar)$/i.test(name)) return 'nested-archive';
  if (/\.(?:node|dylib|so(?:\.\d+)*|dll|exe|wasm)$/i.test(name)) return 'native-or-wasm';
  if (bytes.includes(0)) return 'binary-or-nontext';
  return null;
}

/** Called only with an archive-validated manifest; still reject filesystem drift. */
export async function auditTree(manifest, root) {
  code((await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink(), 'ROOT');
  const counters = { files_hashed: 0, bytes_hashed: 0, files_pattern_checked: 0, bytes_pattern_checked: 0, links_checked: 0 };
  const findings = [], gaps = [];
  const verifiedDirs = new Set([root]);
  const cache = new Map();
  for (const [name, row] of Object.entries(manifest.entries)) {
    const parts = name.split('/');
    code(['upstream', 'build-tools', 'corepack'].includes(parts[0]) && parts.every(p => p && p !== '.' && p !== '..')
      && !/[\\:\x00-\x1f\x7f]/.test(name), 'PATH');
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part);
      if (verifiedDirs.has(parent)) continue;
      const info = await lstat(parent);
      code(info.isDirectory() && !info.isSymbolicLink(), 'PARENT'); verifiedDirs.add(parent);
    }
    const path = join(root, name), info = await lstat(path);
    if (row.kind === 'dir') { code(info.isDirectory() && !info.isSymbolicLink(), 'DIRECTORY'); continue; }
    if (row.kind === 'link') {
      code(info.isSymbolicLink() && await readlink(path) === row.target, 'LINK'); counters.links_checked++; continue;
    }
    code(row.kind === 'file' && info.isFile() && !info.isSymbolicLink() && info.size === row.bytes, 'FILE');
    const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const chunks = []; let size = 0; const digest = createHash('sha256');
    try {
      code((await fd.stat()).isFile(), 'FILE');
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      while (true) {
        const { bytesRead } = await fd.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        size += bytesRead; code(size <= row.bytes, 'FILE_CHANGED');
        const bytes = buffer.subarray(0, bytesRead); digest.update(bytes);
        if (row.bytes <= maxTextBytes && !cache.has(row.sha256)) chunks.push(Buffer.from(bytes));
      }
      code(size === row.bytes && digest.digest('hex') === row.sha256, 'DIGEST');
    } finally { await fd.close(); }
    counters.files_hashed++; counters.bytes_hashed += size;
    if (row.bytes > maxTextBytes) { gaps.push({ path: name, sha256: row.sha256, reason: 'file-size-limit' }); continue; }
    let result = cache.get(row.sha256);
    if (!result) {
      const bytes = Buffer.concat(chunks);
      // Reuse production pattern rules but never exempt a directory just for
      // being named test/fixture/vendor. Findings contain no matched values.
      result = { hit: scanText(bytes.toString('utf8'), '<sdk-content>', { allowSyntheticFixtures: false }).length > 0,
        binary: bytes.includes(0) || !isUtf8(bytes) };
      cache.set(row.sha256, result);
    }
    counters.files_pattern_checked++; counters.bytes_pattern_checked += size;
    if (result.hit) findings.push({ path: name, sha256: row.sha256, code: 'SECRET_PATTERN_REVIEW_REQUIRED' });
    const opaque = opaqueKind(name, result.binary ? Buffer.from([0]) : Buffer.alloc(0));
    if (opaque) gaps.push({ path: name, sha256: row.sha256, reason: opaque });
  }
  return { schema, status: findings.length ? 'BLOCKED' : gaps.length ? 'PARTIAL' : 'PATTERN_SCAN_PASS',
    scope: 'declared-archive-files-bounded-patterns-only', ...counters, findings, coverage_gaps: gaps,
    supply_chain: 'NOT_VERIFIED', release_ready: false };
}

export async function auditSdk({ archive, sha256, root, python }) {
  for (const value of [archive, root, python]) code(typeof value === 'string' && isAbsolute(value), 'ARGUMENTS');
  code(/^[a-f0-9]{64}$/.test(sha256), 'ARGUMENTS');
  root = await realpath(root);
  const receiptInfo = await lstat(join(root, 'receipt.json'));
  code(receiptInfo.isFile() && !receiptInfo.isSymbolicLink() && receiptInfo.size <= 1024 * 1024, 'RECEIPT');
  const receipt = JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'));
  code(receipt.schema === 'shinemage-development-sdk-archive/v1' && receipt.status === 'LOCAL_READY'
    && receipt.operation === 'receive' && receipt.archive_sha256 === sha256, 'RECEIPT');
  const manifest = await inspectArchive(archive, sha256, python);
  const result = await auditTree(manifest, root);
  return { ...result, archive_sha256: sha256, pin_sha256: manifest.pin_sha256, upstream_sha: manifest.upstream_sha,
    platform: manifest.platform, arch: manifest.arch,
    auditor_sha256: hash(await readFile(fileURLToPath(import.meta.url))), archive_validator_sha256: hash(await readFile(archiveHelper)),
    rules_sha256: hash(await readFile(new URL('./secret-scan.mjs', import.meta.url))) };
}

export async function auditSdkClosure({ root, sha256 }) {
  code(typeof root === 'string' && isAbsolute(root), 'ARGUMENTS');
  root = await realpath(root);
  const pin = await readFile(join(repository, 'dsh-plugins/plugin-kit/toolchain.json'));
  await verifySdkClosure(root, sha256, pin);
  const manifestBytes = await readFile(join(root, 'sdk-closure.json'));
  code(hash(manifestBytes) === sha256, 'CLOSURE_CHANGED');
  const manifest = JSON.parse(manifestBytes), result = await auditTree(manifest, root);
  return { ...result, scope: 'declared-closure-files-bounded-patterns-only', closure_sha256: sha256,
    source_archive_sha256: manifest.source_archive_sha256, pin_sha256: manifest.pin_sha256,
    upstream_sha: manifest.upstream_sha, platform: manifest.platform, arch: manifest.arch,
    auditor_sha256: hash(await readFile(fileURLToPath(import.meta.url))),
    closure_validator_sha256: hash(await readFile(join(repository, 'dsh-plugins/plugin-kit/sdk-closure.mjs'))),
    rules_sha256: hash(await readFile(new URL('./secret-scan.mjs', import.meta.url))) };
}

if (process.argv[1] && await realpath(resolve(process.argv[1])).catch(() => null) === fileURLToPath(import.meta.url)) {
  let output;
  try {
    const args = process.argv.slice(2), options = {};
    if (args.length === 1 && args[0] === '--help') {
      console.log('node sdk-content-audit.mjs --archive /abs/sdk.zip --sha256 SHA --root /abs/received --python /abs/python3.14 --output /abs/new-report.json');
      console.log('node sdk-content-audit.mjs --root /abs/closure --closure-sha256 SHA --output /abs/new-report.json');
    } else {
      code([6, 10].includes(args.length), 'ARGUMENTS');
      for (let i = 0; i < args.length; i += 2) {
        const name = args[i].slice(2);
        code(args[i].startsWith('--') && ['archive', 'sha256', 'root', 'python', 'output', 'closure-sha256'].includes(name) && !Object.hasOwn(options, name), 'ARGUMENTS');
        options[name] = args[i + 1];
      }
      const compact = Object.hasOwn(options, 'closure-sha256');
      code(Object.keys(options).sort().join(',') === (compact ? 'closure-sha256,output,root' : 'archive,output,python,root,sha256'), 'ARGUMENTS');
      code(isAbsolute(options.output), 'OUTPUT');
      const sdkRoot = await realpath(options.root), outputParent = await realpath(dirname(options.output));
      code(outputParent !== sdkRoot && !outputParent.startsWith(sdkRoot + sep), 'OUTPUT_IN_SDK');
      output = await open(options.output, 'wx', 0o600);
      const report = compact ? await auditSdkClosure({ root: options.root, sha256: options['closure-sha256'] }) : await auditSdk(options);
      await output.writeFile(`${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify({ status: report.status, files: report.files_hashed, findings: report.findings.length,
        coverage_gaps: report.coverage_gaps.length, release_ready: false }));
      if (report.status !== 'PATTERN_SCAN_PASS') process.exitCode = 2;
    }
  } catch (error) {
    const report = { schema, status: 'BLOCKED', code: /^SDK_AUDIT_[A-Z_]+$/.test(error.message) ? error.message : 'SDK_AUDIT_FAILED', release_ready: false };
    if (output) await output.writeFile(`${JSON.stringify(report)}\n`);
    console.log(JSON.stringify(report)); process.exitCode = 2;
  } finally { await output?.close(); }
}
