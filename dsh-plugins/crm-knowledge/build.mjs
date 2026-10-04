/** Bind this plugin through the dev-only kit; never install or edit upstream. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindToolchain } from '../plugin-kit/toolchain.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const upstream = resolve(process.argv[2] ?? process.env.B0_BUILD_UPSTREAM ?? join(root, '../../.context/dsh-b0/upstream-0.1.7-rc.2'));
const toolsInput = process.argv[3] ?? process.env.B0_BUILD_TOOLS;
const { compiler: ts, build } = await bindToolchain(root, upstream, toolsInput ? resolve(toolsInput) : undefined);
for (const [entries, types] of [
  [['src/index.ts', 'src/host.ts', 'test/contract.typecheck.ts'], ['node']],
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
await build({ absWorkingDir: root, entryPoints: ['src/index.ts', 'src/host.ts'], outdir: 'lib', bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['@deepseek-ai/*'] });
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
const client = await build({ absWorkingDir: root, entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js',
  bundle: true, platform: 'browser', target: 'es2022', format: 'cjs', jsx: 'automatic', minify: true, metafile: true,
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports;\n} });' },
});
assert.ok(Object.keys(client.metafile.inputs).every(path => !/node_modules\/(react|react-dom)\//.test(path)), 'Use platform React only');
assert.ok(Object.keys(client.metafile.inputs).every(path => !/dashboard-access|src\/host|src\/dashboard\.mjs/.test(path)), 'Host credentials must not enter the client bundle');
console.log('CRM candidate typecheck and pinned build passed');
