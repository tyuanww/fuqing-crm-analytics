import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyFile, readFile } from 'node:fs/promises';
import { bindToolchain } from '@shine-mage/dsh-plugin-kit/toolchain';

const root = dirname(fileURLToPath(import.meta.url));
const upstream = resolve(process.argv[2] ?? join(root, '../../.context/dsh-b0/upstream-0.1.7-rc.2'));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const buildTools = process.argv[3] ? resolve(process.argv[3]) : undefined;
const { build } = await bindToolchain(root, upstream, buildTools);

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
console.log(`shine-waterfall built. Host entry: ${pathToFileURL(join(root, 'lib/index.js')).href}`);
