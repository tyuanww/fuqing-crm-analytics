import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod, stat, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import test from 'node:test';
import { CLOSURE_SCHEMA, sha256, verifySdkClosure } from '../../dsh-plugins/plugin-kit/sdk-closure.mjs';
import { createClosure, declarationDependencies, discoverClosure, includePackageFile, publishedFile, sourceReader } from './sdk-closure.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sdk-closure-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pin = Buffer.from(JSON.stringify({ upstream_sha: 'a'.repeat(40), node_major: Number(process.versions.node.split('.')[0]), upstream_lock_sha256: sha256('fixed-lock') }));
  const manifest = { schema: CLOSURE_SCHEMA, scope: 'development-build-only', upstream_sha: 'a'.repeat(40), pin_sha256: sha256(pin),
    source_archive_sha256: 'b'.repeat(64), platform: process.platform, arch: process.arch, node_major: Number(process.versions.node.split('.')[0]), entries: {} };
  for (const part of ['upstream', 'build-tools', 'corepack']) { await mkdir(join(root, part)); manifest.entries[part] = { kind: 'dir' }; }
  for (const [name, data] of [['upstream/pnpm-lock.yaml', 'fixed-lock'], ['upstream/sdk.js', 'export const fixture = true;']]) {
    await writeFile(join(root, name), data); await chmod(join(root, name), 0o644);
    manifest.entries[name] = { kind: 'file', bytes: Buffer.byteLength(data), sha256: sha256(data), mode: 0o644 };
  }
  const save = async () => { const bytes = JSON.stringify(manifest); await writeFile(join(root, 'sdk-closure.json'), bytes); return sha256(bytes); };
  const verify = async () => verifySdkClosure(root, await save(), pin);
  return { root, pin, manifest, save, verify };
}

test('digest-pinned closure verification is read-only and checks all declared inputs', async t => {
  const f = await fixture(t), digest = await f.save(), before = await stat(join(f.root, 'sdk-closure.json'));
  const result = await verifySdkClosure(f.root, digest, f.pin);
  assert.equal(result.entries, 5); assert.equal(result.bytes, 38);
  assert.equal((await stat(join(f.root, 'sdk-closure.json'))).mtimeMs, before.mtimeMs);
});

test('wrong digest, platform, pin, schema and lock fail closed', async t => {
  const f = await fixture(t); await f.save();
  await assert.rejects(verifySdkClosure(f.root, 'c'.repeat(64), f.pin), /KIT_CLOSURE_DIGEST/);
  for (const field of ['platform', 'arch', 'pin_sha256', 'scope', 'schema', 'upstream_sha']) {
    const before = f.manifest[field]; f.manifest[field] = 'wrong'; await assert.rejects(f.verify()); f.manifest[field] = before;
  }
  f.manifest.unexpected = true; await assert.rejects(f.verify(), /KIT_CLOSURE_SCHEMA/); delete f.manifest.unexpected;
  const altered = 'wrong-lock'; await writeFile(join(f.root, 'upstream/pnpm-lock.yaml'), altered);
  Object.assign(f.manifest.entries['upstream/pnpm-lock.yaml'], { bytes: altered.length, sha256: sha256(altered) });
  await assert.rejects(f.verify(), /KIT_CLOSURE_LOCK/);
});

test('mutation, missing/undeclared files and permission drift are refused', async t => {
  const f = await fixture(t), target = join(f.root, 'upstream/sdk.js');
  await writeFile(join(f.root, 'upstream/extra.js'), 'unlisted'); await assert.rejects(f.verify(), /KIT_CLOSURE_UNDECLARED_PATH/);
  await rm(join(f.root, 'upstream/extra.js'));
  await chmod(target, 0o755); await assert.rejects(f.verify(), /KIT_CLOSURE_FILE/); await chmod(target, 0o644);
  await writeFile(target, 'changed'); await assert.rejects(f.verify(), /KIT_CLOSURE_FILE/);
  await rm(target); await assert.rejects(f.verify(), /KIT_CLOSURE_MISSING_ENTRY/);
});

test('links are checked without following directories or accepting external targets', async t => {
  const f = await fixture(t), link = join(f.root, 'upstream/alias');
  await symlink('sdk.js', link); f.manifest.entries['upstream/alias'] = { kind: 'link', target: 'sdk.js' };
  assert.equal((await f.verify()).entries, 6);
  await rm(link); await symlink('../../foreign', link); f.manifest.entries['upstream/alias'].target = '../../foreign';
  // A missing outside target still fails. Never create or read a sibling file.
  await assert.rejects(f.verify());
  await rm(link); await symlink('/etc/passwd', link); f.manifest.entries['upstream/alias'].target = '/etc/passwd';
  await assert.rejects(f.verify(), /KIT_CLOSURE_LINK/);
  delete f.manifest.entries['upstream/alias']; await rm(link);
  f.manifest.entries['../escape'] = { kind: 'dir' }; await assert.rejects(f.verify(), /KIT_CLOSURE_PATH/);
});

test('invalid rows and excess resource declarations reject before allocating file buffers', async t => {
  const f = await fixture(t), row = f.manifest.entries['upstream/sdk.js'];
  row.bytes = 65 * 1024 * 1024; await assert.rejects(f.verify(), /KIT_CLOSURE_FILE/);
  row.bytes = -1; await assert.rejects(f.verify(), /KIT_CLOSURE_FILE/);
});

test('a link cannot leave the declared graph and return through an external backlink', async t => {
  const f = await fixture(t), outside = await mkdtemp(join(tmpdir(), 'sdk-external-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(join(f.root, 'upstream/sdk.js'), join(outside, 'back'));
  const target = relative(join(f.root, 'upstream'), join(outside, 'back'));
  await symlink(target, join(f.root, 'upstream/alias'));
  f.manifest.entries['upstream/alias'] = { kind: 'link', target };
  await assert.rejects(f.verify(), /KIT_CLOSURE_LINK_/);
});

test('links cannot depend on an undeclared intermediate path inside the SDK root', async t => {
  const f = await fixture(t);
  await symlink('upstream/sdk.js', join(f.root, 'unlisted-relay'));
  await symlink('../unlisted-relay', join(f.root, 'upstream/alias'));
  f.manifest.entries['upstream/alias'] = { kind: 'link', target: '../unlisted-relay' };
  await assert.rejects(f.verify(), /KIT_CLOSURE_LINK_/);
});

test('declared directory-link chains resolve dot-dot after the link and reject cycles', async t => {
  const f = await fixture(t);
  for (const name of ['upstream/real', 'upstream/real/nested']) {
    await mkdir(join(f.root, name)); f.manifest.entries[name] = { kind: 'dir' };
  }
  const bytes = 'export const linked = true;';
  await writeFile(join(f.root, 'upstream/real/file.js'), bytes, { mode: 0o644 });
  await chmod(join(f.root, 'upstream/real/file.js'), 0o644);
  f.manifest.entries['upstream/real/file.js'] = { kind: 'file', bytes: bytes.length, sha256: sha256(bytes), mode: 0o644 };
  for (const [name, target] of [['entry', 'real/nested'], ['alias', 'entry/../file.js']]) {
    await symlink(target, join(f.root, 'upstream', name));
    f.manifest.entries['upstream/' + name] = { kind: 'link', target };
  }
  assert.equal((await f.verify()).entries, 10);
  await rm(join(f.root, 'upstream/entry'));
  await symlink('alias', join(f.root, 'upstream/entry'));
  f.manifest.entries['upstream/entry'].target = 'alias';
  await assert.rejects(f.verify(), /KIT_CLOSURE_LINK_CYCLE/);
});

test('projection honors upstream published files, including directories and declaration globs', () => {
  const pkg = { files: ['lib/index.js', 'lib/types/**/*.d.ts', 'lib/styles', 'src'] };
  for (const file of ['package.json', 'LICENSE.md', 'lib/index.js', 'lib/types/core/index.d.ts', 'lib/styles/base.css', 'src/defs.ts']) assert.equal(publishedFile(file, pkg), true);
  for (const file of ['tests/credential.spec.ts', 'lib/types/test.js', 'other/index.js']) assert.equal(publishedFile(file, pkg), false);
  assert.throws(() => publishedFile('src/main.ts', { files: ['../*'] }), /KIT_CLOSURE_PUBLISHED_FILES_INVALID/);
});

test('published declarations contribute type-only dependencies without pulling all devDependencies', () => {
  const compiler = createRequire(new URL('../../dsh-plugins/plugin-kit/build-tools/package.json', import.meta.url))('typescript');
  assert.equal(compiler.version, '6.0.3');
  const source = `/// <reference types="node" />
import type { PeerId } from '@deepseek-ai/dsh-typert-protocol';
export type Ref = import('@deepseek-ai/dsh-attachment').FileAttachmentRef;
export { Branded } from '@deepseek-ai/dsh-brand';
import { x } from './local'; import { X } from 'node:fs';
import 'This conditional stub requires a newer TypeScript resolver';
// import { fake } from 'unrelated-test-dependency';
`;
  assert.deepEqual(declarationDependencies(compiler, source).sort(), ['@deepseek-ai/dsh-attachment', '@deepseek-ai/dsh-brand', '@deepseek-ai/dsh-typert-protocol', '@types/node'].sort());
});

test('type-only dependencies cannot bring their runtime programs into the SDK', () => {
  const pkg = { files: ['lib', 'bin', 'src'] }, scope = { workspace: true, typesOnly: true };
  for (const name of ['package.json', 'LICENSE', 'lib/types/index.d.ts', 'lib/index.d.mts']) assert.equal(includePackageFile(name, pkg, scope), true);
  for (const name of ['bin/native-tool', 'lib/index.js', 'src/tool.ts', 'node_modules/other/index.d.ts']) assert.equal(includePackageFile(name, pkg, scope), false);
  assert.equal(includePackageFile('bin/native-tool', pkg, { ...scope, typesOnly: false }), true);
});

test('source reader refuses changed files, link drift and undeclared dependencies', async t => {
  const f = await fixture(t), root = await realpath(f.root), reader = sourceReader(root, f.manifest);
  assert.equal(await reader.locate(join(root, 'upstream'), 'missing'), null);
  await assert.rejects(reader.locate(join(root, 'upstream'), '@scope/..'), /KIT_CLOSURE_DEPENDENCY_NAME/);
  await assert.rejects(reader.read('upstream/not-listed'), /KIT_CLOSURE_SOURCE_FILE/);
  await mkdir(join(f.root, 'upstream/node_modules'));
  await symlink('../sdk.js', join(f.root, 'upstream/node_modules/example'));
  f.manifest.entries['upstream/node_modules/example'] = { kind: 'link', target: '../different' };
  await assert.rejects(reader.locate(join(root, 'upstream'), 'example'), /KIT_CLOSURE_SOURCE_LINK/);
  await writeFile(join(f.root, 'upstream/sdk.js'), 'modified');
  await assert.rejects(reader.read('upstream/sdk.js'), /KIT_CLOSURE_FILE/);
});

test('existing destination is preserved before archive inspection', async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'sentinel'), 'preserve');
  await assert.rejects(createClosure({ source: f.root, destination: join(f.root, 'upstream'), archive: '/not-read.zip', sha: 'a'.repeat(64), python: '/not-run' }), /KIT_CLOSURE_DESTINATION_IN_SOURCE/);
  await assert.rejects(createClosure({ source: join(f.root, 'upstream'), destination: f.root, archive: '/not-read.zip', sha: 'a'.repeat(64), python: '/not-run' }), /KIT_CLOSURE_DESTINATION_EXISTS/);
  assert.equal(await readFile(join(f.root, 'sentinel'), 'utf8'), 'preserve');
});

test('dependency graph keeps type-only edges and source gaps distinct from mandatory dependencies', async t => {
  const f = await fixture(t), root = await realpath(f.root);
  const put = async (name, data) => {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      const directory = parts.slice(0, i).join('/'); await mkdir(join(root, directory), { recursive: true });
      f.manifest.entries[directory] = { kind: 'dir' };
    }
    await writeFile(join(root, name), data); f.manifest.entries[name] = { kind: 'file', bytes: Buffer.byteLength(data), sha256: sha256(data), mode: 0o644 };
  };
  const pkg = async (path, name, extra = {}) => put(path + '/package.json', JSON.stringify({ name, version: '1.0.0', main: 'lib/index.js', types: 'lib/index.d.ts', files: ['lib'], ...extra }));
  for (const name of ['vite', 'typescript', 'esbuild', 'react', 'react-dom', '@types/react', '@types/node', 'jsdom', 'zustand', 'immer']) await pkg('upstream/node_modules/' + name, name);
  await pkg('upstream/packages/client/conversation', '@deepseek-ai/conversation');
  await pkg('upstream/packages/core/demo', '@deepseek-ai/demo');
  await pkg('upstream/packages/test-support/agent-loop-testkit', '@deepseek-ai/dsh-agent-loop-testkit');
  await pkg('upstream/packages/client/modules', '@deepseek-ai/dsh-client-modules');
  await pkg('upstream/vendor/known', '@deepseek-ai/known', { dependencies: { 'runtime-not-needed-for-types': '1.0.0' } });
  await put('upstream/packages/core/demo/lib/index.d.ts', "export type X = import('@deepseek-ai/known').X; export type Y = import('source-missing-type').Y;");
  await put('upstream/vendor/known/lib/index.d.ts', 'export type X = string;');
  await put('build-tools/package.json', '{"dependencies":{}}');
  const managerPath = 'corepack/v1/pnpm/11.28.2/package.json';
  const manager = JSON.stringify({ name: 'pnpm', version: '11.28.2' });
  await put(managerPath, manager);
  const pin = { schema_version: 'dsh-b0-toolchain/v2', upstream_pnpm: '11.7.0', pnpm: '11.28.2',
    sdk_version: '1.0.0', sdk_bindings: { '@deepseek-ai/demo': 'packages/core/demo', '@deepseek-ai/dsh-client-ui-conversation': 'packages/client/conversation' } };
  const compiler = createRequire(new URL('../../dsh-plugins/plugin-kit/build-tools/package.json', import.meta.url))('typescript');
  const result = await discoverClosure(root, f.manifest, pin, compiler);
  assert.equal(result.managerRoot, 'corepack/v1/pnpm/11.28.2');
  assert.ok(result.typesOnly.has('upstream/vendor/known'));
  assert.ok(result.packages.has('upstream/packages/test-support/agent-loop-testkit'));
  assert.ok(!result.typesOnly.has('upstream/packages/test-support/agent-loop-testkit'));
  assert.equal(result.unresolvedDeclarations.length, 1);
  assert.equal(result.unresolvedDeclarations[0].dependency, 'source-missing-type');
  assert.ok(result.edges.some(row => row.at === 'upstream/packages/core/demo/node_modules/@deepseek-ai/known'));
  // Neither an old cache nor a relabelled package can satisfy the plugin pin.
  await put(managerPath, JSON.stringify({ name: 'pnpm', version: '11.7.0' }));
  await assert.rejects(discoverClosure(root, f.manifest, pin, compiler), /KIT_CLOSURE_MANAGER_IDENTITY/);
  await put(managerPath, JSON.stringify({ name: 'other-tool', version: '11.28.2' }));
  await assert.rejects(discoverClosure(root, f.manifest, pin, compiler), /KIT_CLOSURE_MANAGER_IDENTITY/);
  await put(managerPath, manager);
  const managerRow = f.manifest.entries[managerPath]; delete f.manifest.entries[managerPath];
  await assert.rejects(discoverClosure(root, f.manifest, pin, compiler), /KIT_CLOSURE_SOURCE_FILE/);
  f.manifest.entries[managerPath] = managerRow;
  await pkg('upstream/packages/core/demo', '@deepseek-ai/demo', { dependencies: { 'required-missing': '1.0.0' } });
  await assert.rejects(discoverClosure(root, f.manifest, pin, compiler), /KIT_CLOSURE_DEPENDENCY_MISSING/);
  await assert.rejects(discoverClosure(root, f.manifest, { ...pin, sdk_version: 'wrong' }, compiler), /KIT_CLOSURE_TEST_INPUT_IDENTITY/);
});
