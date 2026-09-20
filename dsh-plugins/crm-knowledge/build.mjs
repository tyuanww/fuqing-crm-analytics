/** Bind only this plugin to the existing pinned SDK; never install or edit upstream. */
import assert from 'node:assert/strict';
import { readFile, mkdir, symlink, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const upstream = resolve(process.argv[2] ?? process.env.B0_BUILD_UPSTREAM ?? join(root, '../../.context/dsh-b0/upstream'));
const pin = JSON.parse(await readFile(join(root, '../analytics-workbench/toolchain.json')));
assert.equal(Number(process.versions.node.split('.')[0]), pin.node_major);
assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin.upstream_sha);
assert.equal(execFileSync('git', ['-C', upstream, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), '');
assert.equal(createHash('sha256').update(await readFile(join(upstream, 'pnpm-lock.yaml'))).digest('hex'), pin.upstream_lock_sha256);
const req = createRequire(join(upstream, 'package.json'));
const web = createRequire(join(upstream, 'apps/web/package.json'));
const vite = createRequire(web.resolve('vite/package.json'));
const esbuild = vite('esbuild'); assert.equal(esbuild.version, pin.esbuild);
const ts = req('typescript'); assert.equal(ts.version, pin.typescript);
const buildTools = resolve(process.argv[3] ?? process.env.B0_BUILD_TOOLS ?? join(root, '../analytics-workbench/build-tools'));
for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches/antd@5.29.3.patch', 'patches/rc-picker@4.11.3.patch']) {
  assert.deepEqual(await readFile(join(buildTools, file)), await readFile(join(root, '../analytics-workbench/build-tools', file)));
}
const business = createRequire(join(buildTools, 'package.json'));
const businessManifest = JSON.parse(await readFile(join(buildTools, 'package.json')));
const conversation = createRequire(join(upstream, 'packages/client/ui-conversation/package.json'));
const dependencies = Object.entries(pin.sdk_bindings).map(([name, path]) => [name, join(upstream, path)]);
dependencies.push(['@deepseek-ai/dsh-api-workspace-controller', join(upstream, 'packages/api/workspace-controller')]);
dependencies.push(['@deepseek-ai/dsh-host-webserver', join(upstream, 'packages/host/webserver')]);
for (const [name, resolver, version] of [
  ['react', web, pin.react], ['react-dom', web, pin.react], ['@types/react', conversation, pin.react_types],
  ['@types/node', req, pin.node_types], ['antd', business, businessManifest.dependencies.antd],
  ['@types/react-dom', business, businessManifest.dependencies['@types/react-dom']],
]) {
  const path = resolver.resolve(`${name}/package.json`);
  assert.equal(JSON.parse(await readFile(path)).version, version);
  dependencies.push([name, dirname(path)]);
}
for (const [name, target] of dependencies) {
  if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(JSON.parse(await readFile(join(target, 'package.json'))).version, pin.sdk_version);
  const link = join(root, 'node_modules', name); await mkdir(dirname(link), { recursive: true });
  try { assert.equal(await realpath(link), await realpath(target)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await symlink(relative(dirname(link), target), link, 'dir'); }
}
for (const [entries, types] of [
  [['src/index.ts', 'src/host.ts', 'src/graph-tools.ts', 'test/contract.typecheck.ts'], ['node']],
  [['src/client/index.tsx'], ['react']],
]) {
const program = ts.createProgram(entries.map(file => join(root, file)), {
  strict: true, noEmit: true, allowJs: true, checkJs: false, skipLibCheck: false,
  target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX, allowImportingTsExtensions: true,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types, typeRoots: [join(root, 'node_modules/@types')],
  paths: { '@deepseek-ai/dsh-util-values': [join(root, 'node_modules/@deepseek-ai/dsh-util-values/lib/types/index.d.ts')],
    'react': [join(root, 'node_modules/@types/react/index.d.ts')], 'react/*': [join(root, 'node_modules/@types/react/*')] },
});
const errors = ts.getPreEmitDiagnostics(program);
assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
}
await esbuild.build({ absWorkingDir: root, entryPoints: ['src/index.ts', 'src/host.ts', 'src/graph-tools.ts'], outdir: 'lib', bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['@deepseek-ai/*'] });
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
const client = await esbuild.build({ absWorkingDir: root, entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js',
  bundle: true, platform: 'browser', target: 'es2022', format: 'cjs', jsx: 'automatic', minify: true, metafile: true,
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports;\n} });' },
});
assert.ok(Object.keys(client.metafile.inputs).every(path => !/node_modules\/(react|react-dom)\//.test(path)), 'Use platform React only');
assert.ok(Object.keys(client.metafile.inputs).every(path => !/dashboard-access|src\/host|src\/dashboard\.mjs/.test(path)), 'Host credentials must not enter the client bundle');
console.log('CRM candidate typecheck and pinned build passed');
