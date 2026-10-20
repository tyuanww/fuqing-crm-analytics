import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { dirname, isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bindToolchain, checkTypes } from './toolchain.mjs';
import { packSkills } from './pack-skills.mjs';
import { writeBuildProvenance } from '../../scripts/release/generated-provenance.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const upstreamInput = process.argv[2] ?? process.env.B0_BUILD_UPSTREAM;
if (!upstreamInput || !isAbsolute(upstreamInput)) {
  console.error('UPSTREAM_NOT_CONFIGURED: pass the pinned DeepSeek Harness checkout as an absolute first argument or B0_BUILD_UPSTREAM. This build does not search the main repository.');
  process.exit(2);
}
const upstream = resolve(upstreamInput);
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const buildToolsInput = process.argv[3] ?? process.env.B0_BUILD_TOOLS;
if (buildToolsInput && !isAbsolute(buildToolsInput)) {
  console.error('BUILD_TOOLS_NOT_CONFIGURED: pass an absolute build-tools directory as the third argument or B0_BUILD_TOOLS.');
  process.exit(2);
}
const { build, compiler, pin } = await bindToolchain(root, upstream, buildToolsInput && resolve(buildToolsInput));
const skillPackage = await packSkills(root);
const querySkillPackage = await packSkills(root, 'channel_followup');
const firstPurchaseSkillPackage = await packSkills(root, 'first_purchase');
const competitionSkillPackage = await packSkills(root, 'competition_growth');
checkTypes(root, compiler);

const external = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
];
const common = { absWorkingDir: root, bundle: true, sourcemap: true, logLevel: 'info', minifyWhitespace: true };
await build({
  ...common, entryPoints: ['src/index.ts', 'src/tool.ts', 'src/skills.ts', 'src/page-tools.ts'], outdir: 'lib', platform: 'node',
  target: 'node24', format: 'esm',
  define: {
    __B0_SKILL_PACKAGE__: JSON.stringify(skillPackage),
    __QUERY_SKILL_PACKAGE__: JSON.stringify(querySkillPackage),
    __FIRST_PURCHASE_SKILL_PACKAGE__: JSON.stringify(firstPurchaseSkillPackage),
    __COMPETITION_SKILL_PACKAGE__: JSON.stringify(competitionSkillPackage),
  },
  external: ['@deepseek-ai/*'],
});
const clientBuild = await build({
  ...common, entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js',
  platform: 'browser', target: 'es2022', format: 'cjs', jsx: 'automatic', external, minify: true, metafile: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    // Service configuration is Host-owned. Never bake a bearer token into public JS.
    'process.env.COMPETITION_HTTP_BASE': JSON.stringify(''),
    'process.env.COMPETITION_HTTP_TOKEN': JSON.stringify(''),
  },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports;\n} });' },
});
assert.ok(Object.keys(clientBuild.metafile.inputs).every(path => !/node_modules\/(react|react-dom)\//.test(path)), 'The browser must use the single platform React runtime');
// These offline views are built and checked independently until native/HTTP
// registration is implemented. Do not silently exclude them from verification.
await build({
  ...common, entryPoints: ['src/saved-analysis-view.tsx', 'src/cockpit-view.tsx', 'src/first-purchase-saved-analysis-view.tsx', 'src/first-purchase-cockpit-view.tsx'],
  outdir: 'lib/views', platform: 'browser', target: 'es2022',
  format: 'esm', jsx: 'automatic', external, minify: true,
});
await writeBuildProvenance({ root, toolchain: pin, releaseLane: process.env.DSH_RELEASE_LANE_CONFIG ?? null });
console.log(`B0 plugin built. Host entry: ${pathToFileURL(join(root, 'lib/index.js')).href}`);
