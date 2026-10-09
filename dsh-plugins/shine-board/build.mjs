import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const upstreamInput = process.argv[2] ?? process.env.B0_BUILD_UPSTREAM;
if (!upstreamInput) {
  console.error('UPSTREAM_NOT_CONFIGURED: pass the pinned DeepSeek Harness checkout as the first argument or B0_BUILD_UPSTREAM. This build does not search the main repository.');
  process.exit(2);
}
const upstream = resolve(upstreamInput);
const { bindToolchain } = await import('@shine-mage/dsh-plugin-kit/toolchain');
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
console.log(`shine-board built. Host entry: ${pathToFileURL(join(root, 'lib/index.js')).href}`);
