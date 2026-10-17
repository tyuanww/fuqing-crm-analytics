/** Build this plugin with its own source and the dev-only fixed SDK kit. */
import assert from 'node:assert/strict';
import { dirname, isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBuildProvenance } from '../../scripts/release/generated-provenance.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const upstreamInput = process.argv[2] ?? process.env.B0_BUILD_UPSTREAM;
if (!upstreamInput || !isAbsolute(upstreamInput)) {
  console.error('UPSTREAM_NOT_CONFIGURED: pass the pinned DeepSeek Harness checkout as the first argument or B0_BUILD_UPSTREAM. This build does not search the main repository.');
  process.exit(2);
}
const upstream = resolve(upstreamInput);
const { bindToolchain } = await import('@shine-mage/dsh-plugin-kit/toolchain');
const toolsInput = process.argv[3] ?? process.env.B0_BUILD_TOOLS;
if (toolsInput && !isAbsolute(toolsInput)) {
  console.error('BUILD_TOOLS_NOT_CONFIGURED: pass an absolute build-tools directory as the third argument or B0_BUILD_TOOLS.');
  process.exit(2);
}
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
await writeBuildProvenance({ root });
