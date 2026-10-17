import { dirname, isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyFile, readFile } from 'node:fs/promises';
import { bindToolchain } from '@shine-mage/dsh-plugin-kit/toolchain';
import { writeBuildProvenance } from '../../scripts/release/generated-provenance.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const upstreamInput = process.argv[2] ?? process.env.B0_BUILD_UPSTREAM;
if (!upstreamInput || !isAbsolute(upstreamInput)) { console.error('UPSTREAM_NOT_CONFIGURED: pass an absolute pinned upstream checkout.'); process.exit(2); }
const upstream = resolve(upstreamInput);
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const buildToolsInput = process.argv[3] ?? process.env.B0_BUILD_TOOLS;
if (buildToolsInput && !isAbsolute(buildToolsInput)) { console.error('BUILD_TOOLS_NOT_CONFIGURED: pass an absolute build-tools directory.'); process.exit(2); }
const { build } = await bindToolchain(root, upstream, buildToolsInput && resolve(buildToolsInput));

const common = { absWorkingDir: root, bundle: true, sourcemap: true, logLevel: 'info', minifyWhitespace: true };
await build({
  ...common, entryPoints: ['src/index.ts'], outdir: 'lib', platform: 'node',
  target: 'node24', format: 'esm', external: ['@deepseek-ai/*'],
});
await build({
  ...common, entryPoints: ['src/client.tsx'], outfile: 'lib/client.js',
  platform: 'browser', target: 'es2022', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis'],
  minify: true,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports;\n} });' },
});
await build({ ...common, entryPoints: ['src/waterfall.mjs'], outfile: 'lib/waterfall.mjs', platform: 'neutral', target: 'es2022', format: 'esm', sourcemap: false });
// Keep the legacy public subpath and publish its actual standalone declaration.
await copyFile(join(root, 'node_modules/@shine-mage/board-components/lib/waterfall.d.mts'), join(root, 'lib/waterfall.d.mts'));
await writeBuildProvenance({ root });
console.log(`shine-waterfall built. Host entry: ${pathToFileURL(join(root, 'lib/index.js')).href}`);
