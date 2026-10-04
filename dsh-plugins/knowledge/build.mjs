/** Build this plugin with its own source and the dev-only fixed SDK kit. */
import assert from 'node:assert/strict';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindToolchain } from '../plugin-kit/toolchain.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const upstream = resolve(process.argv[2] ?? process.env.B0_BUILD_UPSTREAM ?? join(root, '../../.context/dsh-b0/upstream-0.1.7-rc.2'));
const toolsInput = process.argv[3] ?? process.env.B0_BUILD_TOOLS;
const { compiler: ts, build } = await bindToolchain(root, upstream, toolsInput ? resolve(toolsInput) : undefined);
const entries = ['src/index.ts', 'src/graph-tools.ts', 'test/contract.typecheck.ts'];
const program = ts.createProgram(entries.map(file => join(root, file)), {
  strict: true, noEmit: true, allowJs: true, checkJs: false, skipLibCheck: false,
  target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true, lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  types: ['node'], typeRoots: [join(root, 'node_modules/@types')],
});
const errors = ts.getPreEmitDiagnostics(program);
assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
  getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => '\n',
}));
await build({ absWorkingDir: root, entryPoints: ['src/index.ts', 'src/graph-tools.ts'], outdir: 'lib',
  bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['@deepseek-ai/*'] });
console.log('Knowledge candidate typecheck and pinned build passed');
