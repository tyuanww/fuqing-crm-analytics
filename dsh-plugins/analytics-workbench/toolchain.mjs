import { join } from 'node:path';
export { bindToolchain } from '@shine-mage/dsh-plugin-kit/toolchain';

export function checkTypes(plugin, compiler) {
  const ts = compiler;
  for (const [face, entries, types] of [
    ['host', ['src/index.ts', 'src/tool.ts', 'src/skills.ts', 'src/page-tools.ts'], ['node']],
    ['client', ['src/client/index.tsx', 'src/client/platform.d.ts', 'src/saved-analysis-view.tsx', 'src/cockpit-view.tsx', 'src/first-purchase-saved-analysis-view.tsx', 'src/first-purchase-cockpit-view.tsx', 'test/run-contract.typecheck.ts'], ['react']],
  ]) {
    const program = ts.createProgram(entries.map(entry => join(plugin, entry)), {
      strict: true, noEmit: true, skipLibCheck: false, target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX, allowImportingTsExtensions: true,
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types, typeRoots: [join(plugin, 'node_modules/@types')],
      // The pinned session-controller declaration imports this SDK type but
      // omits its direct dependency. Supply it in our consumer type closure;
      // keep the upstream pristine and still check every declaration.
      paths: {
        '@deepseek-ai/dsh-util-values': [join(plugin, 'node_modules/@deepseek-ai/dsh-util-values/lib/types/index.d.ts')],
        'react': [join(plugin, 'node_modules/@types/react/index.d.ts')],
        'react/*': [join(plugin, 'node_modules/@types/react/*')],
        'react-dom': [join(plugin, 'node_modules/@types/react-dom/index.d.ts')],
        'react-dom/*': [join(plugin, 'node_modules/@types/react-dom/*')],
      },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw new Error(`${face} typecheck failed:\n` + ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: name => name, getCurrentDirectory: () => plugin, getNewLine: () => '\n',
    }));
    console.log(`B0 ${face} full typecheck passed`);
  }
}
