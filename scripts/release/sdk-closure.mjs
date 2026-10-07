/** Explicit local SDK projection. No install, network, source edits or release admission. */
import assert from 'node:assert/strict';
import { builtinModules, createRequire } from 'node:module';
import { lstat, mkdir, readFile, readlink, realpath, symlink, writeFile, chmod } from 'node:fs/promises';
import { dirname, isAbsolute, join, matchesGlob, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectArchive } from './sdk-content-audit.mjs';
import { inspectToolchain } from '../../dsh-plugins/plugin-kit/toolchain.mjs';
import { CLOSURE_SCHEMA, CLOSURE_LIMITS, closurePath, readClosureFile, sha256, verifySdkClosure } from '../../dsh-plugins/plugin-kit/sdk-closure.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const need = (ok, code) => assert.ok(ok, `KIT_CLOSURE_${code}`);
const pinPath = join(repository, 'dsh-plugins/plugin-kit/toolchain.json');
// Development acceptance inputs, owned here rather than widening the plugin's
// runtime bindings. Every byte still comes from the reviewed, fixed archive.
export const TEST_RUNTIME_INPUTS = Object.freeze({
  '@deepseek-ai/dsh-agent-loop-testkit': 'packages/test-support/agent-loop-testkit',
  '@deepseek-ai/dsh-client-modules': 'packages/client/modules',
});
export const TEST_EXTERNAL_INPUTS = Object.freeze([
  { owner: '', name: 'jsdom' },
  // Store's emitted JS imports these despite upstream listing them as dev deps.
  { owner: 'packages/client/store', name: 'zustand' },
  { owner: 'packages/client/store', name: 'immer' },
]);
export const TEST_SOURCE_INPUTS = Object.freeze([
  'packages/client/ui-layout/lib/types/client/service.js',
  'packages/client/ui-layout/src/client/service.ts',
  'packages/client/ui-sidebar/src/client/SidebarRoot.tsx',
  'packages/client/ui-sidebar/src/client/index.ts',
  'packages/client/ui-renderer/src/client/scoped-slots.tsx',
  'packages/client/ui-conversation/src/client/apply.ts',
  'packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx',
  'packages/client/ui-conversation/src/client/skeleton/ConversationMainPanel.tsx',
]);
const slash = path => path.split(sep).join('/');
const packageName = name => /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)
  && name.split('/').every(part => part !== '.' && part !== '..');

export function declarationDependencies(compiler, text) {
  const refs = compiler.preProcessFile(text, true, true), names = new Set();
  for (const { fileName } of refs.importedFiles) {
    if (fileName.startsWith('.') || fileName.startsWith('node:') || builtinModules.includes(fileName) || fileName.includes('*')) continue;
    const name = fileName.split('/').slice(0, fileName.startsWith('@') ? 2 : 1).join('/');
    // Conditional declaration stubs can contain diagnostic sentences as
    // module specifiers. They are not installable package names; the real
    // consumer typecheck, with the pinned compiler, remains mandatory.
    if (packageName(name)) names.add(name);
  }
  for (const { fileName } of refs.typeReferenceDirectives) {
    const name = fileName.startsWith('@types/') ? fileName : '@types/' + fileName.replace(/^@/, '').replace('/', '__');
    if (packageName(name)) names.add(name);
  }
  return [...names];
}

export function publishedFile(name, manifest) {
  if (name === 'package.json' || /^(?:licen[cs]e|notice|copying)(?:\.|$)/i.test(name)) return true;
  need(Array.isArray(manifest.files) && manifest.files.length > 0, 'PUBLISHED_FILES_REQUIRED');
  return manifest.files.some(pattern => {
    need(typeof pattern === 'string' && pattern && !isAbsolute(pattern) && !pattern.startsWith('!')
      && !pattern.includes('\\') && !pattern.split('/').includes('..'), 'PUBLISHED_FILES_INVALID');
    pattern = pattern.replace(/^\.\//, '').replace(/\/$/, '');
    return matchesGlob(name, pattern) || name.startsWith(pattern + '/');
  });
}

export function includePackageFile(name, manifest, { workspace, typesOnly }) {
  if (name.split('/').includes('node_modules')) return false;
  if (typesOnly && name !== 'package.json' && !/\.d\.[cm]?ts(?:\.map)?$/.test(name)
    && !/^(?:licen[cs]e|notice|copying)(?:\.|$)/i.test(name)) return false;
  return !workspace || publishedFile(name, manifest);
}

/** Resolve installed package relationships, bounded to archive-declared inputs. */
export function sourceReader(source, manifest) {
  const relativePath = path => closurePath(slash(relative(source, path)));
  async function read(name) {
    const row = manifest.entries[closurePath(name)]; need(row?.kind === 'file', 'SOURCE_FILE');
    const path = join(source, name);
    need(await realpath(path) === path, 'SOURCE_ALIAS');
    return readClosureFile(path, row);
  }
  async function locate(owner, name) {
    if (!packageName(name)) throw new Error('KIT_CLOSURE_DEPENDENCY_NAME', { cause: { dependency: name } });
    for (let path = owner; path.startsWith(source + sep); path = dirname(path)) {
      const at = join(path, 'node_modules', name), row = manifest.entries[relativePath(at)];
      if (!row) continue;
      if (row.kind === 'link') need(await readlink(at) === row.target, 'SOURCE_LINK');
      else need(row.kind === 'dir', 'SOURCE_DEPENDENCY');
      const target = await realpath(at); relativePath(target);
      need(manifest.entries[relativePath(target)]?.kind === 'dir', 'SOURCE_DEPENDENCY');
      return { at: relativePath(at), target: relativePath(target) };
    }
    return null;
  }
  return { read, locate };
}

export async function discoverClosure(source, manifest, pin, compiler) {
  const reader = sourceReader(source, manifest), up = join(source, 'upstream');
  const roots = Object.values(pin.sdk_bindings).map(path => `upstream/${path}`), aliases = [], missingOptional = [];
  for (const [name, path] of Object.entries(TEST_RUNTIME_INPUTS)) {
    const pkg = JSON.parse(await reader.read(`upstream/${path}/package.json`));
    need(pkg.name === name && pkg.version === pin.sdk_version, 'TEST_INPUT_IDENTITY');
    roots.push(`upstream/${path}`);
  }
  const seed = async (owner, name, at) => {
    const found = await reader.locate(owner, name); need(found, 'DEPENDENCY_MISSING');
    roots.push(found.target); aliases.push({ at: at ?? found.at, target: found.target }); return found;
  };
  for (const { owner, name } of TEST_EXTERNAL_INPUTS) await seed(join(up, owner), name);
  const web = join(up, 'apps/web'), vite = await reader.locate(web, 'vite'); need(vite, 'DEPENDENCY_MISSING');
  for (const [owner, name] of [[up, 'typescript'], [join(source, vite.target), 'esbuild'], [web, 'react'], [web, 'react-dom'],
    [join(up, pin.sdk_bindings['@deepseek-ai/dsh-client-ui-conversation']), '@types/react'], [up, '@types/node']]) {
    await seed(owner, name, `upstream/node_modules/${name}`);
  }
  const supplied = new Map(Object.entries(pin.sdk_bindings).map(([name, path]) => [name, `upstream/${path}`]));
  for (const row of aliases) supplied.set(row.at.slice('upstream/node_modules/'.length), row.target);
  // A few public DSH declarations omit their direct workspace edge entirely.
  // Resolve only unique published packages from this exact fixed source tree.
  const workspaceTypes = new Map();
  for (const name of Object.keys(manifest.entries).filter(name => /^upstream\/(?:packages\/[^/]+\/[^/]+|vendor\/[^/]+)\/package\.json$/.test(name))) {
    const pkg = JSON.parse(await reader.read(name));
    if (!pkg.name?.startsWith('@deepseek-ai/') || !pkg.types || !pkg.main || !Array.isArray(pkg.files)) continue;
    need(!workspaceTypes.has(pkg.name), 'AMBIGUOUS_WORKSPACE'); workspaceTypes.set(pkg.name, dirname(name));
  }
  const business = JSON.parse(await reader.read('build-tools/package.json'));
  for (const name of Object.keys(business.dependencies)) await seed(join(source, 'build-tools'), name);
  const packages = new Map(), edges = [...aliases], declarationEdges = [], unresolvedDeclarations = [], typeQueue = [], typesOnly = new Set();
  const declarations = Object.keys(manifest.entries).filter(name => /\.d\.[cm]?ts$/.test(name));
  while (roots.length || typeQueue.length) {
    const runtime = roots.length > 0, path = runtime ? roots.shift() : typeQueue.shift();
    if (packages.has(path) && (!runtime || !typesOnly.has(path))) continue;
    if (runtime) typesOnly.delete(path); else typesOnly.add(path);
    need(packages.size < 2000, 'PACKAGE_LIMIT');
    const pkg = JSON.parse(await reader.read(`${path}/package.json`)); packages.set(path, pkg);
    for (const field of runtime ? ['dependencies', 'peerDependencies', 'optionalDependencies'] : []) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        const found = await reader.locate(join(source, path), name);
        if (!found) {
          need(field === 'optionalDependencies' || (field === 'peerDependencies' && pkg.peerDependenciesMeta?.[name]?.optional), 'DEPENDENCY_MISSING');
          missingOptional.push({ owner: pkg.name, dependency: name, field }); continue;
        }
        roots.push(found.target); edges.push(found);
      }
    }
    // Published declarations can depend on packages listed only in upstream's
    // devDependencies. Follow actual type references, never the whole dev graph.
    const workspace = /^upstream\/(packages|vendor)\//.test(path);
    for (const name of declarations.filter(name => name.startsWith(path + '/')
      && !name.slice(path.length + 1).split('/').includes('node_modules') && (!workspace || publishedFile(name.slice(path.length + 1), pkg)))) {
      const text = (await reader.read(name)).toString('utf8');
      for (const dependency of declarationDependencies(compiler, text)) {
        if (dependency === pkg.name) continue; // package self-reference
        let found = await reader.locate(join(source, path), dependency);
        if (!found && !dependency.startsWith('@types/')) {
          const typesName = '@types/' + dependency.replace(/^@/, '').replace('/', '__');
          found = await reader.locate(join(source, path), typesName);
        }
        if (!found && supplied.has(dependency)) found = { at: `${path}/node_modules/${dependency}`, target: supplied.get(dependency) };
        if (!found && workspaceTypes.has(dependency)) found = { at: `${path}/node_modules/${dependency}`, target: workspaceTypes.get(dependency) };
        if (!found) {
          // Preserve upstream's unresolved/conditional declaration surface as
          // an explicit gap; never install a guessed package. The exact
          // consumer's full typecheck is still required before use.
          unresolvedDeclarations.push({ source: name, dependency, reason: 'NOT_RESOLVABLE_IN_SOURCE' }); continue;
        }
        typeQueue.push(found.target); edges.push(found); declarationEdges.push({ source: name, dependency, target: found.target });
      }
    }
  }
  return { reader, packages, edges, missingOptional, declarationEdges, unresolvedDeclarations, typesOnly };
}

export async function createClosure({ source, destination, archive, sha: archiveSha, python }) {
  for (const path of [source, destination, archive, python]) need(typeof path === 'string' && isAbsolute(path), 'ARGUMENTS');
  source = await realpath(source);
  const parent = await realpath(dirname(destination)); destination = join(parent, destination.slice(destination.lastIndexOf(sep) + 1));
  need(destination !== source && !destination.startsWith(source + sep), 'DESTINATION_IN_SOURCE');
  try { await lstat(destination); throw new Error('KIT_CLOSURE_DESTINATION_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const pinBytes = await readFile(pinPath), pin = JSON.parse(pinBytes);
  const manifest = await inspectArchive(archive, archiveSha, python);
  // Never accept a compact source or weaken the existing full-checkout check.
  await inspectToolchain(join(source, 'upstream'), join(source, 'build-tools'), null);
  const compiler = createRequire(join(repository, 'dsh-plugins/plugin-kit/build-tools/package.json'))('typescript');
  need(compiler.version === pin.typescript, 'PARSER_VERSION');
  const graph = await discoverClosure(source, manifest, pin, compiler);
  const selected = new Map();
  for (const [name, row] of Object.entries(manifest.entries)) {
    if (row.kind === 'dir') continue;
    if (name.startsWith('corepack/')) { selected.set(name, row); continue; }
    let owner = dirname(name);
    while (owner !== '.' && !graph.packages.has(owner)) owner = dirname(owner);
    if (owner === '.') continue;
    const inside = name.slice(owner.length + 1);
    const workspace = /^upstream\/(packages|vendor)\//.test(owner);
    if (includePackageFile(inside, graph.packages.get(owner), { workspace, typesOnly: graph.typesOnly.has(owner) })) selected.set(name, row);
  }
  for (const name of [...TEST_SOURCE_INPUTS.map(path => `upstream/${path}`),
    'upstream/package.json', 'upstream/pnpm-lock.yaml', 'upstream/LICENSE', 'build-tools/package.json',
    'build-tools/pnpm-lock.yaml', 'build-tools/pnpm-workspace.yaml', 'build-tools/patches/antd@5.29.3.patch', 'build-tools/patches/rc-picker@4.11.3.patch']) {
    need(manifest.entries[name]?.kind === 'file', 'SOURCE_FILE'); selected.set(name, manifest.entries[name]);
  }
  for (const { at, target } of graph.edges) {
    if (at === target) continue;
    const row = { kind: 'link', target: slash(relative(dirname(at), target)) };
    const old = selected.get(at); need(!old || (old.kind === 'link' && old.target === row.target), 'LINK_CONFLICT');
    selected.set(at, row);
  }
  for (const name of [...selected.keys()]) {
    for (let parent = dirname(name); parent !== '.'; parent = dirname(parent)) {
      const old = selected.get(parent); need(!old || old.kind === 'dir', 'PARENT_CONFLICT');
      selected.set(parent, { kind: 'dir' });
    }
  }
  need(selected.size <= CLOSURE_LIMITS.entries, 'ENTRY_LIMIT');
  const entries = Object.fromEntries([...selected].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  let total = 0;
  for (const [name, row] of Object.entries(entries)) {
    closurePath(name);
    if (row.kind === 'file') { need(row.bytes <= CLOSURE_LIMITS.file, 'FILE_LIMIT'); total += row.bytes; }
  }
  need(total <= CLOSURE_LIMITS.bytes, 'BYTE_LIMIT');
  const projection = { schema: CLOSURE_SCHEMA, scope: 'development-build-only', upstream_sha: pin.upstream_sha,
    pin_sha256: sha256(pinBytes), source_archive_sha256: archiveSha, platform: process.platform, arch: process.arch,
    node_major: pin.node_major, entries };
  const bytes = Buffer.from(JSON.stringify(projection)); need(bytes.length <= CLOSURE_LIMITS.manifest, 'MANIFEST_LIMIT');
  await mkdir(destination, { mode: 0o700 });
  try {
    for (const [name, row] of Object.entries(entries)) {
      const target = join(destination, name);
      if (row.kind === 'dir') await mkdir(target, { mode: 0o700 });
      else if (row.kind === 'file') {
        await writeFile(target, await graph.reader.read(name), { flag: 'wx', mode: row.mode }); await chmod(target, row.mode);
      }
    }
    for (const [name, row] of Object.entries(entries)) if (row.kind === 'link') await symlink(row.target, join(destination, name));
    await writeFile(join(destination, 'sdk-closure.json'), bytes, { flag: 'wx', mode: 0o600 });
    const digest = sha256(bytes), verified = await verifySdkClosure(destination, digest, pinBytes);
    const receipt = { schema: CLOSURE_SCHEMA, status: 'LOCAL_PROJECTED', closure_sha256: digest, ...verified,
      packages: [...graph.packages].map(([path, pkg]) => ({ path, name: pkg.name, version: pkg.version, mode: graph.typesOnly.has(path) ? 'types' : 'runtime' })),
      declaration_edges: graph.declarationEdges,
      unresolved_declarations: graph.unresolvedDeclarations,
      test_runtime_inputs: TEST_RUNTIME_INPUTS, test_external_inputs: TEST_EXTERNAL_INPUTS, test_source_inputs: TEST_SOURCE_INPUTS,
      omitted_optional: graph.missingOptional, consumers: 'NOT_RUN', content_audit: 'NOT_RUN', supply_chain: 'NOT_VERIFIED', release_ready: false };
    await writeFile(join(destination, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return receipt;
  } catch (error) {
    await writeFile(join(destination, 'failure.json'), JSON.stringify({ status: 'BLOCKED', release_ready: false }), { flag: 'wx', mode: 0o600 });
    throw error;
  }
}

if (process.argv[1] && await realpath(resolve(process.argv[1])).catch(() => null) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    if (args.length === 1 && args[0] === '--help') console.log('node sdk-closure.mjs --source /abs/received --destination /abs/new-closure --archive /abs/sdk.zip --sha SHA --python /abs/python3.14');
    else {
      need(args.length === 10, 'ARGUMENTS');
      for (let i = 0; i < args.length; i += 2) {
        const name = args[i].slice(2); need(args[i].startsWith('--') && ['source', 'destination', 'archive', 'sha', 'python'].includes(name) && !Object.hasOwn(options, name), 'ARGUMENTS');
        options[name] = args[i + 1];
      }
      const result = await createClosure(options);
      console.log(JSON.stringify({ status: result.status, closure_sha256: result.closure_sha256, entries: result.entries, bytes: result.bytes, packages: result.packages.length, release_ready: false }));
    }
  } catch (error) {
    console.log(JSON.stringify({ status: 'BLOCKED', code: /^KIT_CLOSURE_[A-Z_]+$/.test(error.message) ? error.message : 'KIT_CLOSURE_FAILED', release_ready: false }));
    process.exitCode = 2;
  }
}
