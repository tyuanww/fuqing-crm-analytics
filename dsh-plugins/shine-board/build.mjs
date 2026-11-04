import { dirname, isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { writeBuildProvenance } from '@shine-mage/dsh-plugin-kit/provenance';
import { clientModuleBanner } from '@shine-mage/dsh-plugin-kit/client-banner';

const root = dirname(fileURLToPath(import.meta.url));
const upstreamInput = process.argv[2] ?? process.env.B0_BUILD_UPSTREAM;
if (!upstreamInput || !isAbsolute(upstreamInput)) {
  console.error('UPSTREAM_NOT_CONFIGURED: pass the pinned DeepSeek Harness checkout as the first argument or B0_BUILD_UPSTREAM. This build does not search the main repository.');
  process.exit(2);
}
const upstream = resolve(upstreamInput);
const { bindToolchain, checkClientTypes } = await import('@shine-mage/dsh-plugin-kit/toolchain');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const buildToolsInput = process.argv[3] ?? process.env.B0_BUILD_TOOLS;
if (buildToolsInput && !isAbsolute(buildToolsInput)) {
  console.error('BUILD_TOOLS_NOT_CONFIGURED: pass an absolute build-tools directory as the third argument or B0_BUILD_TOOLS.');
  process.exit(2);
}
const { build, compiler } = await bindToolchain(root, upstream, buildToolsInput && resolve(buildToolsInput));
checkClientTypes(root, compiler);

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
  ...clientModuleBanner(manifest.name),
});
await writeBuildProvenance({ root });
console.log(`shine-board built. Host entry: ${pathToFileURL(join(root, 'lib/index.js')).href}`);
