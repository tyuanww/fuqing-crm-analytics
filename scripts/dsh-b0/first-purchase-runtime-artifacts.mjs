/** Explicit immutable-runtime input for a disposable Host drill, never activation. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, open, readdir, readlink, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { type, machine } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readArtifactFile } from '../release/service-artifact-evidence.mjs';
import { serviceDigest as hash } from '../release/service-compatibility.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA, NODE_MAJOR } from '../release/toolchain.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
const HEX = /^[a-f0-9]{64}$/, MAX = 512 * 1024 * 1024;
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const absolute = path => assert.ok(typeof path === 'string' && isAbsolute(path), 'HOST_RUNTIME_ABSOLUTE_PATH');

export async function readFirstPurchaseRuntime({ manifestPath, manifestSha256, archivePath }) {
  absolute(manifestPath); absolute(archivePath);
  assert.match(manifestSha256 ?? '', HEX, 'HOST_RUNTIME_MANIFEST_DIGEST');
  const bytes = await readArtifactFile(manifestPath), manifest = decode(bytes);
  assert.equal(hash(bytes), manifestSha256, 'HOST_RUNTIME_MANIFEST_DIGEST');
  assert.equal(manifest.schema_version, 'release-manifest/v1', 'HOST_RUNTIME_MANIFEST_SCHEMA');
  assert.equal(manifest.dsh_upstream_sha, DSH_UPSTREAM_SHA, 'HOST_RUNTIME_UPSTREAM_SHA');
  const artifact = manifest.upstream_runtime;
  assert.deepEqual(Object.keys(artifact ?? {}).sort(), ['bytes', 'name', 'role', 'sha256', 'upstream_sha'], 'HOST_RUNTIME_SHAPE');
  assert.equal(artifact.role, 'upstream-runtime-bundle', 'HOST_RUNTIME_ROLE');
  assert.equal(artifact.upstream_sha, DSH_UPSTREAM_SHA, 'HOST_RUNTIME_UPSTREAM_SHA');
  assert.equal(artifact.name, `shinemage-dsh-upstream-runtime-${DSH_UPSTREAM_SHA}.tar.zst`, 'HOST_RUNTIME_NAME');
  assert.match(artifact.sha256 ?? '', HEX, 'HOST_RUNTIME_DIGEST');
  assert.ok(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && artifact.bytes <= MAX, 'HOST_RUNTIME_SIZE');
  return { archivePath, artifact, manifestSha256 };
}

/** Copy and hash one open file; extraction never reopens the mutable input. */
export async function copyFirstPurchaseRuntime(spec, destination) {
  const source = await open(spec.archivePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let output;
  try {
    const stat = await source.stat();
    assert.ok(stat.isFile() && stat.size === spec.artifact.bytes && stat.size <= MAX, 'HOST_RUNTIME_SIZE');
    output = await open(destination, 'wx', 0o600);
    const digest = createHash('sha256'); let size = 0;
    for await (const bytes of source.createReadStream({ autoClose: false })) {
      size += bytes.length;
      assert.ok(size <= spec.artifact.bytes, 'HOST_RUNTIME_CHANGED');
      digest.update(bytes); await output.writeFile(bytes);
    }
    assert.equal(size, spec.artifact.bytes, 'HOST_RUNTIME_CHANGED');
    assert.equal(digest.digest('hex'), spec.artifact.sha256, 'HOST_RUNTIME_DIGEST');
    await output.sync();
  } finally { await output?.close(); await source.close(); }
}

/** Includes every file and link, without traversing links or following devices. */
export async function runtimeTreeDigest(directory) {
  const digest = createHash('sha256'), base = await realpath(directory);
  let count = 0, total = 0;
  async function walk(path, name = '') {
    assert.ok(++count <= 150000, 'HOST_RUNTIME_ENTRY_LIMIT');
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      const link = await readlink(path), target = relative(base, await realpath(path));
      assert.ok(!isAbsolute(link) && target !== '..' && !target.startsWith('../') && !isAbsolute(target), 'HOST_RUNTIME_LINK_ESCAPE');
      digest.update(JSON.stringify([name, 'link', link]) + '\n');
    } else if (stat.isDirectory()) {
      digest.update(JSON.stringify([name, 'directory', stat.mode & 0o777]) + '\n');
      for (const entry of (await readdir(path)).sort()) await walk(join(path, entry), name ? name + '/' + entry : entry);
    } else {
      assert.ok(stat.isFile() && (total += stat.size) <= 1024 * 1024 * 1024, 'HOST_RUNTIME_FILE_LIMIT');
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const fileHash = createHash('sha256'); let size = 0;
        for await (const bytes of file.createReadStream({ autoClose: false })) {
          size += bytes.length; assert.ok(size <= stat.size, 'HOST_RUNTIME_CHANGED'); fileHash.update(bytes);
        }
        assert.equal(size, stat.size, 'HOST_RUNTIME_CHANGED');
        digest.update(JSON.stringify([name, 'file', stat.mode & 0o777, size, fileHash.digest('hex')]) + '\n');
      } finally { await file.close(); }
    }
  }
  await walk(directory);
  return { sha256: digest.digest('hex'), entries: count, bytes: total };
}

export async function installFirstPurchaseRuntime(spec, output, python) {
  absolute(output); absolute(python);
  assert.equal(Number(process.versions.node.split('.')[0]), NODE_MAJOR, 'HOST_RUNTIME_NODE_VERSION');
  const archive = join(output, 'runtime.tar.zst'), upstream = join(output, 'upstream');
  await copyFirstPurchaseRuntime(spec, archive);
  await exec(python, ['-I', join(root, 'scripts/release/secure-runtime-unpack.py'), archive, upstream,
    '--max-entries', '150000', '--max-bytes', '1073741824'], { cwd: output, timeout: 180000, maxBuffer: 256 * 1024,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: output, TMPDIR: output, PYTHON_DOTENV_DISABLED: '1' } });
  const pkg = decode(await readArtifactFile(join(upstream, 'package.json')));
  assert.equal(pkg.name, '@deepseek-ai/dsh', 'HOST_RUNTIME_PACKAGE');
  assert.equal(pkg.version, DSH_SDK_VERSION, 'HOST_RUNTIME_VERSION');
  const peer = join(upstream, 'node_modules/.pnpm/node_modules/@deepseek-ai');
  const modules = { cliEntry: join(upstream, 'lib/bin.js'), llmModule: join(peer, 'dsh-llm/lib/index.js'),
    mockModule: join(peer, 'dsh-llm-mock-server/lib/index.js') };
  for (const path of Object.values(modules)) {
    const resolved = await realpath(path), rel = relative(upstream, resolved);
    assert.ok(rel && !rel.startsWith('../') && !isAbsolute(rel), 'HOST_RUNTIME_MODULE_ESCAPE');
    await readArtifactFile(resolved, 16 * 1024 * 1024);
  }
  const tree = await runtimeTreeDigest(upstream);
  return { upstream, ...modules, tree, observation: { artifact: spec.artifact,
    release_manifest_sha256: spec.manifestSha256, installed_tree: tree,
    platform: { system: type(), machine: machine(), node: process.versions.node },
    scope: 'isolated-runtime-artifact', supply_chain: 'NOT_VERIFIED', release_ready: false } };
}

/** Reuse the explicit target's wheel bytes, never rewrite the Mac pack receipts.
 * This reads dependency provenance; it does not confer a release/host gate. */
export async function readFirstPurchasePlatform({ path, sha256, candidate }) {
  absolute(path); assert.match(sha256 ?? '', HEX, 'HOST_PLATFORM_DIGEST');
  const bytes = await readArtifactFile(path), report = decode(bytes);
  assert.equal(hash(bytes), sha256, 'HOST_PLATFORM_DIGEST');
  assert.equal(report.schema_version, 'source-http-target-observation/v1', 'HOST_PLATFORM_SCHEMA');
  assert.equal(report.scope, 'actual-wsl2-synthetic-package-http', 'HOST_PLATFORM_SCOPE');
  assert.equal(report.status, 'PASS', 'HOST_PLATFORM_STATUS');
  assert.equal(report.release_ready, false, 'HOST_PLATFORM_NOT_RELEASE');
  assert.equal(report.candidate_digest, candidate.candidate_digest, 'HOST_PLATFORM_CANDIDATE');
  assert.equal(report.source_sha, candidate.source_sha, 'HOST_PLATFORM_SOURCE');
  assert.equal(report.platform?.system, 'Linux', 'HOST_PLATFORM_SYSTEM');
  assert.equal(report.platform?.machine, 'x86_64', 'HOST_PLATFORM_MACHINE');
  assert.equal(report.platform?.system, type(), 'HOST_PLATFORM_SYSTEM');
  assert.equal(report.platform?.machine, machine(), 'HOST_PLATFORM_MACHINE');
  assert.match(report.platform?.python ?? '', /^3\.14\.\d+$/, 'HOST_PLATFORM_PYTHON');
  assert.deepEqual(Object.keys(report.artifacts ?? {}).sort(), ['query', 'save'], 'HOST_PLATFORM_ARTIFACTS');
  return { ...report.artifacts, evidence_sha256: sha256, platform: report.platform };
}

export function platformWheels(observation, archiveSha256, manifestSha256, dependencies) {
  assert.equal(observation.archive_sha256, archiveSha256, 'HOST_PLATFORM_ARCHIVE');
  assert.equal(observation.manifest_sha256, manifestSha256, 'HOST_PLATFORM_MANIFEST');
  assert.deepEqual(observation.installed, dependencies, 'HOST_PLATFORM_DEPENDENCIES');
  assert.deepEqual(Object.keys(observation.wheels ?? {}).sort(), Object.keys(dependencies).sort(), 'HOST_PLATFORM_WHEELS');
  for (const [name, version] of Object.entries(dependencies)) {
    const row = observation.wheels[name];
    assert.deepEqual(Object.keys(row).sort(), ['file', 'sha256', 'version'], 'HOST_PLATFORM_WHEEL_SHAPE');
    assert.equal(row.version, version, 'HOST_PLATFORM_WHEEL_VERSION');
    assert.match(row.sha256 ?? '', HEX, 'HOST_PLATFORM_WHEEL_DIGEST');
    assert.match(row.file ?? '', /^[a-zA-Z0-9_.]+-[a-zA-Z0-9_.+]+-[a-zA-Z0-9_.]+-[a-zA-Z0-9_.]+-[a-zA-Z0-9_.]+\.whl$/, 'HOST_PLATFORM_WHEEL_NAME');
    assert.equal(row.file.split('-')[0].toLowerCase().replaceAll('_', '-'), name, 'HOST_PLATFORM_WHEEL_NAME');
    assert.equal(row.file.split('-')[1], version, 'HOST_PLATFORM_WHEEL_VERSION');
    assert.match(row.file.split('-').at(-1), /^(?:any|manylinux[0-9_]+_x86_64)(?:\.manylinux[0-9_]+_x86_64)*\.whl$/, 'HOST_PLATFORM_WHEEL_ABI');
  }
  return observation.wheels;
}
