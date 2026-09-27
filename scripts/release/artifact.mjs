import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertSchema, readSchema, validateSchema } from './schema.mjs';
import { assertClean, scanTree } from './secret-scan.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const scripts = join(root, 'scripts/release');
const schemaDir = join(scripts, 'schemas');
export const DEFAULT_ALLOWLIST = ['VERSION', 'package.json', 'pnpm-lock.yaml', 'scripts/dsh.mjs', 'README.md', 'CHANGELOG.md', 'AGENTS.md', 'DESIGN.md', 'Dockerfile', 'backend/', 'frontend-vue3/', 'config/', 'knowledge/', 'mcp_servers/', 'dsh-plugins/', 'scripts/dsh-b0/', 'scripts/dsh-dev/', 'scripts/release/', 'deploy/wsl/', 'docs/release/', 'docs/operating/'];
export const DENYLIST_VERSION = 'release-denylist/v1';
const DENY = /(^|\/)(?:\.env(?:\.|$)|\.npmrc(?:$|\/)|credentials?(?:[-_.]|$)|private[-_]?key(?:[-_.]|$)|cookie(?:[-_.]|$)|node_modules(?:\/|$)|__pycache__(?:\/|$)|\.pytest_cache(?:\/|$)|\.ruff_cache(?:\/|$)|\.git(?:\/|$)|.*\.duckdb(?:\.wal)?$|.*\.sqlite(?:-wal|-shm)?$|.*\.log$)/i;

export async function sha256(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

function allowed(rel, allowlist) {
  const normal = rel.split(sep).join('/');
  return allowlist.some(prefix => prefix.endsWith('/') ? normal.startsWith(prefix) : normal === prefix);
}

export async function collectAllowlist(rootDir, { allowlist = DEFAULT_ALLOWLIST, maxFiles = 200000 } = {}) {
  const result = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(rootDir, path).split(sep).join('/');
      if (DENY.test(rel)) continue;
      if (entry.isSymbolicLink()) throw new Error(`ALLOWLIST_SYMLINK ${rel}`);
      if (entry.isDirectory()) {
        const dirPrefix = `${rel}/`;
        if (allowlist.some(prefix => prefix.endsWith('/') ? (prefix.startsWith(dirPrefix) || dirPrefix.startsWith(prefix)) : prefix.startsWith(dirPrefix))) await walk(path);
        continue;
      }
      // Source maps and ignored test-build leftovers are development metadata,
      // not runtime entrypoints. They can expose local source paths or exceed
      // the bounded secret-scan file limit, so a release artifact must omit
      // them explicitly.
      const testBuildLeftover = /\/lib\/(?:test-[^/]+\.mjs|loader-fixture-[^/]+\/)/.test(`/${rel}`);
      if (!entry.isFile() || rel.endsWith('.map') || testBuildLeftover || !allowed(rel, allowlist)) continue;
      result.push(rel);
      if (result.length > maxFiles) throw new Error(`ALLOWLIST_FILE_LIMIT ${maxFiles}`);
    }
  }
  await walk(rootDir);
  result.sort();
  if (!result.includes('VERSION')) throw new Error('ALLOWLIST_MISSING_VERSION');
  return result;
}

export async function buildPreManifest({ rootDir = root, releaseTag, productVersion, sourceSha, dshUpstreamSha, output }) {
  if (!/^dsh-[A-Za-z0-9._-]+$/.test(releaseTag)) throw new Error('RELEASE_TAG_INVALID');
  const allowlist = await collectAllowlist(rootDir);
  const findings = await scanTree(rootDir, { maxBytes: 128 * 1024 * 1024, include: rel => allowlist.includes(rel) || allowlist.some(file => file.startsWith(`${rel}/`)) });
  assertClean(findings);
  const manifest = { schema_version: 'pre-manifest/v1', release_tag: releaseTag, product_version: productVersion, source_sha: sourceSha, dsh_upstream_sha: dshUpstreamSha, artifacts: [{ name: `${releaseTag}.tar.zst`, role: 'source-bundle', path: `${releaseTag}.tar.zst` }], archive_allowlist: allowlist, denylist_version: DENYLIST_VERSION };
  const schema = await readSchema(join(schemaDir, 'pre-manifest.v1.schema.json'));
  const schemaError = validateSchema(manifest, schema);
  if (schemaError) throw new Error(`SCHEMA_INVALID ${schemaError}`);
  if (output) { await mkdir(resolve(output, '..'), { recursive: true }); await writeFile(output, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 }); }
  return manifest;
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(`${command}_FAILED ${stderr.trim()}`)));
  });
}

export async function packArtifact({ rootDir = root, allowlist, output }) {
  if (!Array.isArray(allowlist) || !output) throw new Error('PACK_ARGUMENTS_INVALID');
  const listPath = `${output}.allowlist-${process.pid}.json`;
  await writeFile(listPath, JSON.stringify(allowlist), { mode: 0o600 });
  try { await run('python3', [join(scripts, 'pack.py'), rootDir, listPath, output]); }
  finally { await import('node:fs/promises').then(fs => fs.rm(listPath, { force: true })); }
  return { path: output, bytes: (await stat(output)).size, sha256: await sha256(output) };
}

export async function receiveArtifact({ artifact, manifestPath, destination, maxEntries = 10000, maxBytes = 512 * 1024 * 1024 }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await assertSchema(manifest, join(schemaDir, 'release-manifest.v1.schema.json'));
  if (!Array.isArray(manifest.archive_allowlist) || manifest.archive_allowlist.length === 0) throw new Error('ALLOWLIST_EMPTY');
  const safeManifestPath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(part => part === '' || part === '.' || part === '..');
  if (new Set(manifest.archive_allowlist).size !== manifest.archive_allowlist.length || manifest.archive_allowlist.some(value => !safeManifestPath(value))) throw new Error('ALLOWLIST_PATH_INVALID');
  if (!Array.isArray(manifest.payload) || manifest.payload.length === 0 || new Set(manifest.payload.map(item => item.path)).size !== manifest.payload.length || manifest.payload.some(item => !safeManifestPath(item.path))) throw new Error('PAYLOAD_EMPTY_OR_PATH_INVALID');
  const artifactInfo = await stat(artifact);
  if (artifactInfo.size !== manifest.artifact_bytes || await sha256(artifact) !== manifest.artifact_sha256) throw new Error('ARTIFACT_DIGEST_MISMATCH');
  if (await access(destination).then(() => true, () => false)) throw new Error('DESTINATION_MUST_NOT_EXIST');
  await run('python3', [join(scripts, 'secure-unpack.py'), artifact, destination, '--max-entries', String(maxEntries), '--max-bytes', String(maxBytes)]);
  const files = await collectAllowlist(destination, { allowlist: manifest.archive_allowlist });
  const all = await listFiles(destination);
  const unexpected = all.filter(path => !allowed(path, manifest.archive_allowlist));
  if (unexpected.length) throw new Error(`ALLOWLIST_VIOLATION ${unexpected.join(',')}`);
  const payloadPaths = manifest.payload.map(item => item.path).sort();
  const actualPaths = all.filter(path => !path.endsWith('/')).sort();
  if (payloadPaths.length !== actualPaths.length || payloadPaths.some((p, i) => p !== actualPaths[i])) throw new Error('PAYLOAD_PATHS_MISMATCH');
  for (const item of manifest.payload) {
    const path = join(destination, item.path);
    const info = await stat(path);
    if (info.size !== item.bytes || await sha256(path) !== item.sha256) throw new Error(`PAYLOAD_DIGEST_MISMATCH ${item.path}`);
  }
  const findings = await scanTree(destination, { maxBytes });
  assertClean(findings);
  if (manifest.toolchain) {
    for (const required of ['package.json', 'pnpm-lock.yaml', 'scripts/dsh.mjs', 'deploy/wsl/install-release.sh']) {
      if (!actualPaths.includes(required)) throw new Error(`RUNTIME_ENTRYPOINT_MISSING ${required}`);
    }
  }
  return { manifest, entries: files.length, sha256: manifest.artifact_sha256 };
}

async function listFiles(dir) {
  const output = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const rel = relative(dir, path).split(sep).join('/');
      if (entry.isDirectory()) await walk(path);
      else output.push(rel);
    }
  }
  await walk(dir);
  return output.sort();
}

export async function verifyPayload(manifestPath, payloadDir) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await assertSchema(manifest, join(schemaDir, 'release-manifest.v1.schema.json'));
  for (const item of manifest.payload) {
    if (!item.path || item.path.startsWith('/') || item.path.split('/').includes('..') || item.path.includes('\\')) throw new Error(`PAYLOAD_PATH_INVALID ${item.path}`);
    const path = join(payloadDir, item.path);
    await access(path);
    const info = await stat(path);
    if (info.size !== item.bytes) throw new Error(`PAYLOAD_SIZE_MISMATCH ${item.path}`);
    if (await sha256(path) !== item.sha256) throw new Error(`PAYLOAD_SHA256_MISMATCH ${item.path}`);
  }
  return true;
}
