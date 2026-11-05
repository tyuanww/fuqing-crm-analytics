import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, globSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** Build-time switch. Unset or empty means "leave the pinned official bytes alone". */
export const CLIENT_TITLE_ENV = 'DSH_CLIENT_TITLE';
export const UPSTREAM_TITLE = 'DeepSeek Harness';
export const BUILD_RECORD = '.dsh-build/client-build-environment.json';

const RECORD_FORMAT = 1;
const RECORD_ENV_PREFIX = 'DSH_CLIENT_';
const CLIENT_ARTIFACT_PATTERNS = [
  'apps/web/dist/**/*',
  'packages/*/*/lib/client.js',
  'packages/*/*/lib/client.js.map',
  'packages/*/*/lib/client.*.js',
  'packages/*/*/lib/client.*.js.map',
];
const WEB_FRONTEND_PACKAGE = '@deepseek-ai/dsh-web-frontend';
const UI_LAYOUT_PACKAGE = '@deepseek-ai/dsh-client-ui-layout';
const WEB_APP_PACKAGE = '@deepseek-ai/dsh-web-app';

const slash = value => value.replaceAll('\\', '/');

function occurrences(bytes, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = bytes.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function replaceAll(bytes, before, after) {
  const chunks = [];
  let offset = 0;
  let next = 0;
  while ((next = bytes.indexOf(before, offset)) !== -1) {
    chunks.push(bytes.subarray(offset, next), after);
    offset = next + before.length;
  }
  chunks.push(bytes.subarray(offset));
  return Buffer.concat(chunks);
}

/**
 * Return the explicitly configured title, or null when the caller did not opt in.
 *
 * The pinned official build inlines "DeepSeek Harness" and its record. This
 * module must stay inert unless the release pipeline deliberately sets
 * DSH_CLIENT_TITLE, so absence is a supported no-op rather than an error.
 */
export function clientTitleFromEnvironment(environment = process.env) {
  const value = environment?.[CLIENT_TITLE_ENV];
  if (value === undefined || value === '') return null;
  assert.equal(typeof value, 'string', 'CLIENT_TITLE_INVALID');
  const title = value.trim();
  assert.ok(title.length > 0 && title.length <= 200, 'CLIENT_TITLE_INVALID');
  assert.ok(!/[\u0000-\u001f\u007f]/.test(title), 'CLIENT_TITLE_INVALID');
  assert.ok(!/[<>&]/.test(title), 'CLIENT_TITLE_HTML_UNSAFE');
  assert.ok(!title.includes(UPSTREAM_TITLE), 'CLIENT_TITLE_UPSTREAM_CONFLICT');
  return title;
}

export function clientArtifactPaths(root) {
  return [...new Set(globSync(CLIENT_ARTIFACT_PATTERNS, { cwd: root })
    .map(slash)
    .filter(path => !/\/lib\/client\.node(?:\.|$)/.test(path) && statSync(resolve(root, path)).isFile())
    .sort())];
}

export function clientArtifactDigest(root, files = clientArtifactPaths(root)) {
  const digest = createHash('sha256');
  for (const path of files) {
    const content = readFileSync(resolve(root, path));
    digest.update(`${Buffer.byteLength(path)}:`);
    digest.update(path);
    digest.update(`${content.byteLength}:`);
    digest.update(content);
  }
  return { fileCount: files.length, sha256: digest.digest('hex') };
}

function readBuildRecord(root, expectedEnvironment = null) {
  const path = resolve(root, BUILD_RECORD);
  assert.ok(existsSync(path), 'CLIENT_TITLE_BUILD_RECORD_MISSING');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(value?.formatVersion, RECORD_FORMAT, 'CLIENT_TITLE_RECORD_FORMAT');
  assert.ok(value.environment && typeof value.environment === 'object' && !Array.isArray(value.environment),
    'CLIENT_TITLE_RECORD_ENVIRONMENT');
  for (const [name, entry] of Object.entries(value.environment)) {
    assert.ok(name.startsWith(RECORD_ENV_PREFIX) && typeof entry === 'string', `CLIENT_TITLE_RECORD_ENTRY ${name}`);
  }
  const current = clientArtifactDigest(root);
  assert.equal(value.artifacts?.fileCount, current.fileCount, 'CLIENT_TITLE_RECORD_ARTIFACTS');
  assert.equal(value.artifacts?.sha256, current.sha256, 'CLIENT_TITLE_RECORD_ARTIFACTS');
  if (expectedEnvironment !== null) {
    assert.deepEqual(
      Object.fromEntries(Object.entries(value.environment).sort(([left], [right]) => left.localeCompare(right))),
      Object.fromEntries(Object.entries(expectedEnvironment).sort(([left], [right]) => left.localeCompare(right))),
      'CLIENT_TITLE_RECORD_ENVIRONMENT_MISMATCH',
    );
  }
  return value;
}

function writeBuildRecord(root, environment) {
  const record = {
    formatVersion: RECORD_FORMAT,
    environment: Object.fromEntries(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))),
    artifacts: clientArtifactDigest(root),
  };
  const path = resolve(root, BUILD_RECORD);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/**
 * Rewrite the pinned official client title in a staged workspace.
 *
 * The rewrite is deliberately fail-closed: it validates both exact upstream
 * literals and the post-rewrite bytes in memory before touching disk. A
 * mismatch throws a named error instead of silently shipping the default
 * title. The client build record is re-digested so it describes the new bytes.
 */
export async function rewriteClientRuntimeTitle(root, { title, upstreamTitle = UPSTREAM_TITLE } = {}) {
  assert.equal(typeof title, 'string', 'CLIENT_TITLE_INVALID');
  assert.ok(title.length > 0 && title.length <= 200, 'CLIENT_TITLE_INVALID');
  assert.ok(!/[\u0000-\u001f\u007f]/.test(title), 'CLIENT_TITLE_INVALID');
  assert.ok(!/[<>&]/.test(title), 'CLIENT_TITLE_HTML_UNSAFE');
  assert.equal(typeof upstreamTitle, 'string', 'CLIENT_TITLE_UPSTREAM_INVALID');
  assert.ok(upstreamTitle.length > 0 && !upstreamTitle.includes('\0'), 'CLIENT_TITLE_UPSTREAM_INVALID');
  assert.ok(!title.includes(upstreamTitle), 'CLIENT_TITLE_UPSTREAM_CONFLICT');
  assert.notEqual(title, upstreamTitle, 'CLIENT_TITLE_EQUALS_UPSTREAM');

  const before = readBuildRecord(root);
  const files = clientArtifactPaths(root);
  assert.ok(files.length > 0, 'CLIENT_TITLE_ARTIFACTS_EMPTY');

  const index = 'apps/web/dist/index.html';
  const layout = 'packages/client/ui-layout/lib/client.js';
  assert.ok(files.includes(index), 'CLIENT_TITLE_INDEX_MISSING');
  assert.ok(files.includes(layout), 'CLIENT_TITLE_PRODUCT_MISSING');

  const upstream = Buffer.from(upstreamTitle);
  const htmlUpstream = Buffer.from(`<title>${upstreamTitle}</title>`);
  const productUpstream = Buffer.from(`const productTitle = ${JSON.stringify(upstreamTitle)};`);
  const htmlShipped = Buffer.from(`<title>${title}</title>`);
  const productShipped = Buffer.from(`const productTitle = ${JSON.stringify(title)};`);

  const contents = new Map(files.map(path => [path, readFileSync(resolve(root, path))]));
  const totalUpstream = [...contents.values()]
    .reduce((sum, bytes) => sum + occurrences(bytes, upstream), 0);

  if (before.environment[CLIENT_TITLE_ENV] === title && totalUpstream === 0) {
    assert.equal(occurrences(contents.get(index), htmlShipped), 1, 'CLIENT_TITLE_INDEX');
    assert.equal(occurrences(contents.get(layout), productShipped), 1, 'CLIENT_TITLE_PRODUCT');
    const record = readBuildRecord(root, { ...before.environment, [CLIENT_TITLE_ENV]: title });
    return {
      status: 'ALREADY_APPLIED',
      title,
      files: 0,
      occurrences: 0,
      changed: [],
      build_record: { environment: record.environment, artifacts: record.artifacts },
    };
  }

  assert.equal(occurrences(contents.get(index), htmlUpstream), 1, 'CLIENT_TITLE_INDEX_UPSTREAM');
  assert.equal(occurrences(contents.get(layout), productUpstream), 1, 'CLIENT_TITLE_PRODUCT_UPSTREAM');

  const rewritten = new Map();
  const changed = [];
  let total = 0;
  for (const [path, bytes] of contents) {
    const count = occurrences(bytes, upstream);
    if (count === 0) continue;
    const next = replaceAll(bytes, upstream, Buffer.from(title));
    assert.equal(occurrences(next, upstream), 0, `CLIENT_TITLE_RESIDUAL ${path}`);
    rewritten.set(path, next);
    changed.push({ path, occurrences: count });
    total += count;
  }
  assert.ok(changed.length > 0, 'CLIENT_TITLE_NO_ARTIFACTS_CHANGED');
  assert.equal(occurrences(rewritten.get(index) ?? contents.get(index), htmlShipped), 1, 'CLIENT_TITLE_INDEX_SHIPPED');
  assert.equal(occurrences(rewritten.get(layout) ?? contents.get(layout), productShipped), 1, 'CLIENT_TITLE_PRODUCT_SHIPPED');
  for (const path of files) {
    assert.equal(occurrences(rewritten.get(path) ?? contents.get(path), upstream), 0, `CLIENT_TITLE_RESIDUAL ${path}`);
  }

  // Only now, after every byte in memory has been proven consistent, mutate disk.
  for (const [path, bytes] of rewritten) writeFileSync(resolve(root, path), bytes);
  const environment = { ...before.environment, [CLIENT_TITLE_ENV]: title };
  const record = writeBuildRecord(root, environment);
  readBuildRecord(root, environment);
  return {
    status: 'REWRITTEN',
    title,
    files: changed.length,
    occurrences: total,
    changed,
    build_record: { environment: record.environment, artifacts: record.artifacts },
  };
}

export async function applyClientTitle(workspace, { environment = process.env, deployed = null } = {}) {
  const title = clientTitleFromEnvironment(environment);
  if (title === null) {
    return { status: 'DISABLED', files: 0, occurrences: 0, changed: [], runtime_paths: [] };
  }
  const build = await rewriteClientRuntimeTitle(workspace, { title });
  const runtimePaths = deployed === null ? [] : installClientRuntimeTitle(workspace, deployed, build);
  return { ...build, runtime_paths: runtimePaths };
}

/**
 * Ordered bases the deployed tree can hold a package under.
 *
 * `pnpm deploy` only links the deploy target's own production dependencies at
 * the top level. The client packages are peer aliases of the web bundle, so a
 * real rc.5 deploy keeps them elsewhere: `runtime-bundle.mjs` seeds
 * `@deepseek-ai/dsh-client-ui-layout` and its siblings into
 * `node_modules/.pnpm/node_modules`, and `@deepseek-ai/dsh-web-frontend` is
 * reachable through `@deepseek-ai/dsh-web-app`'s own `node_modules`. Resolving
 * only from the deployed `lib/bin.js` therefore misses both packages; each
 * base below is searched through that same require so the entry's resolution
 * semantics and the in-tree boundary check are preserved.
 */
function deployedResolutionBases(deployed) {
  return [
    deployed, // top-level `node_modules`, still the layout of an npm-style deploy
    join(deployed, 'node_modules', '.pnpm'), // pnpm virtual store: `<base>/node_modules/<name>`
    join(deployed, 'node_modules', '.pnpm', 'node_modules', WEB_APP_PACKAGE), // `dsh-web-app/node_modules`
    join(deployed, 'node_modules', WEB_APP_PACKAGE), // top-level `dsh-web-app` symlink, same nested lookup
  ];
}

function deployedPackageRoot(deployed, name) {
  const requireFromDeployed = createRequire(join(deployed, 'lib', 'bin.js'));
  const boundary = realpathSync(deployed);
  const attempted = [];
  for (const base of deployedResolutionBases(deployed)) {
    let resolved;
    try {
      resolved = realpathSync(dirname(requireFromDeployed.resolve(`${name}/package.json`, { paths: [base] })));
    } catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND') {
        const label = relative(deployed, base) || '.';
        attempted.push(label.split('\\').join('/'));
        continue;
      }
      throw new Error(`CLIENT_TITLE_RUNTIME_PACKAGE_MISSING ${name}: ${error.message}`);
    }
    assert.ok(resolved === boundary || resolved.startsWith(`${boundary}/`), 'CLIENT_TITLE_RUNTIME_PACKAGE_OUTSIDE');
    return resolved;
  }
  throw new Error(`CLIENT_TITLE_RUNTIME_PACKAGE_MISSING ${name}: not found under ${attempted.join(', ')}`);
}

function titleSurface(bytes, expected, code) {
  assert.equal(occurrences(bytes, expected), 1, code);
}

/**
 * Install rewritten build bytes into the deployed runtime.
 *
 * Client artifacts are rewritten before `pnpm deploy`, so every deployed copy
 * is already derived from the rewritten workspace. This function proves that
 * the shipped title surfaces match and installs the rewritten build record,
 * which `pnpm deploy` does not carry on its own.
 */
export function installClientRuntimeTitle(workspace, deployed, build) {
  assert.ok(build?.status === 'REWRITTEN' || build?.status === 'ALREADY_APPLIED', 'CLIENT_TITLE_INSTALL_STATUS');
  const title = build.title;
  const upstream = Buffer.from(UPSTREAM_TITLE);
  const shipped = [];

  const frontendRoot = deployedPackageRoot(deployed, WEB_FRONTEND_PACKAGE);
  const frontendIndex = join(frontendRoot, 'dist', 'index.html');
  assert.ok(existsSync(frontendIndex), 'CLIENT_TITLE_RUNTIME_INDEX_MISSING');
  const indexBytes = readFileSync(frontendIndex);
  assert.equal(occurrences(indexBytes, upstream), 0, 'CLIENT_TITLE_RUNTIME_RESIDUAL index.html');
  titleSurface(indexBytes, Buffer.from(`<title>${title}</title>`), 'CLIENT_TITLE_RUNTIME_INDEX');
  shipped.push(`${WEB_FRONTEND_PACKAGE}/dist/index.html`);

  const layoutRoot = deployedPackageRoot(deployed, UI_LAYOUT_PACKAGE);
  const layoutClient = join(layoutRoot, 'lib', 'client.js');
  assert.ok(existsSync(layoutClient), 'CLIENT_TITLE_RUNTIME_PRODUCT_MISSING');
  const layoutBytes = readFileSync(layoutClient);
  assert.equal(occurrences(layoutBytes, upstream), 0, 'CLIENT_TITLE_RUNTIME_RESIDUAL client.js');
  titleSurface(layoutBytes, Buffer.from(`const productTitle = ${JSON.stringify(title)};`), 'CLIENT_TITLE_RUNTIME_PRODUCT');
  shipped.push(`${UI_LAYOUT_PACKAGE}/lib/client.js`);

  const recordBytes = readFileSync(resolve(workspace, BUILD_RECORD));
  const recordTarget = resolve(deployed, BUILD_RECORD);
  mkdirSync(dirname(recordTarget), { recursive: true });
  writeFileSync(recordTarget, recordBytes);
  assert.deepEqual(readFileSync(recordTarget), recordBytes, 'CLIENT_TITLE_RUNTIME_RECORD');
  shipped.push(BUILD_RECORD);

  return shipped;
}

function treeSummary(tree) {
  assert.ok(Number.isSafeInteger(tree?.entries) && tree.entries > 0, 'CLIENT_TITLE_TREE_ENTRIES');
  assert.ok(Number.isSafeInteger(tree?.bytes) && tree.bytes >= 0, 'CLIENT_TITLE_TREE_BYTES');
  assert.match(tree?.sha256 ?? '', /^[a-f0-9]{64}$/, 'CLIENT_TITLE_TREE_SHA256');
  return { sha256: tree.sha256, entries: tree.entries, bytes: tree.bytes };
}

/** Name both the staged input tree and the post-rewrite tree that shipped. */
export function clientTitleProvenance({ build, preparedSourceTree, shippedSourceTree, runtimePaths }) {
  assert.ok(build?.status === 'REWRITTEN' || build?.status === 'ALREADY_APPLIED', 'CLIENT_TITLE_PROVENANCE_STATUS');
  const prepared = treeSummary(preparedSourceTree);
  const shipped = treeSummary(shippedSourceTree);
  return {
    status: build.status,
    title: build.title,
    files: build.files,
    occurrences: build.occurrences,
    prepared_source_tree: prepared,
    shipped_source_tree: shipped,
    build_record: build.build_record,
    runtime_paths: runtimePaths,
  };
}
