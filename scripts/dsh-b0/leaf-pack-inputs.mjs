/** Main-repository consumers of sealed leaf packages. Never builds plugin sources. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadProfilePacks, installProfilePacks } from '../release/profile-packs.mjs';
import { readToolchain, verifyUpstream } from '../dsh-dev/pin.mjs';

export const LEAF_NAMES = ['shine-brand', 'shine-waterfall', 'shine-crowd-action', 'shine-query', 'shine-board', 'shine-funnel'];
const pageId = '@shine-mage/dsh-analytics-workbench-b0';
const id = name => `@shine-mage/dsh-${name}`;
const root = fileURLToPath(new URL('../..', import.meta.url));
const load = path => import(pathToFileURL(path).href);

/** Validate the existing seven-package profile before outputs or module evaluation. */
export async function readLeafPackInputs(inputsPath) {
  const packs = await loadProfilePacks({ inputsPath });
  assert.equal(packs.profile.service_binding, undefined, 'LEAF_PACK_SERVICE_BINDING_REQUIRES_CANDIDATE');
  assert.deepEqual(packs.plugins.map(row => row.id).sort(), [pageId, ...LEAF_NAMES.map(id)].sort(), 'LEAF_PACK_SELECTION');
  for (const name of LEAF_NAMES) {
    const manifest = packs.plugins.find(row => row.id === id(name)).manifest;
    assert.equal(manifest.exports?.['.'], './lib/index.js', 'LEAF_PACK_HOST_EXPORT');
    assert.equal(manifest.exports?.['./client'], './lib/client.js', 'LEAF_PACK_CLIENT_EXPORT');
    assert.equal(manifest.dsh?.client?.platform, 'web', 'LEAF_PACK_CLIENT_PLATFORM');
    assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-tools'], packs.profile.dsh.sdk_version, 'LEAF_PACK_SDK_PIN');
    if (['shine-funnel', 'shine-waterfall'].includes(name)) {
      const subpath = name.slice('shine-'.length);
      assert.deepEqual(manifest.exports?.[`./${subpath}`], {
        types: `./lib/${subpath}.d.mts`, import: `./lib/${subpath}.mjs`, default: `./lib/${subpath}.mjs`,
      }, 'LEAF_PACK_GEOMETRY_EXPORT');
    }
  }
  return packs;
}

/** Official package resolver and published files only; no complete DSH host boot. */
export async function loadLeafComposition({ scope, types = false } = {}) {
  assert.ok(['leaf', 'geometry'].includes(scope), 'LEAF_PACK_SCOPE');
  const packs = await readLeafPackInputs(process.env.CRM_COMPOSITION_PAGE_INPUTS);
  const upstream = process.env.B0_BUILD_UPSTREAM, base = process.env.CRM_COMPOSITION_OUTPUT;
  assert.ok(isAbsolute(upstream ?? ''), 'LEAF_PACK_UPSTREAM_REQUIRED');
  assert.ok(isAbsolute(base ?? ''), 'LEAF_PACK_OUTPUT_REQUIRED');
  const pin = await readToolchain(root), verified = await verifyUpstream(upstream, pin);
  let ts;
  if (types) {
    const tools = process.env.B0_BUILD_TOOLS;
    assert.ok(isAbsolute(tools ?? ''), 'LEAF_PACK_TYPE_TOOLS_REQUIRED');
    ts = createRequire(join(tools, 'package.json'))('typescript');
    assert.equal(ts.version, pin.typescript, 'LEAF_PACK_TYPESCRIPT_PIN');
  }
  const webRequire = createRequire(join(upstream, 'apps/web/package.json'));
  assert.equal(webRequire('react/package.json').version, pin.react, 'LEAF_PACK_REACT_PIN');
  const react = new Map([['react', webRequire('react')], ['react/jsx-runtime', webRequire('react/jsx-runtime')]]);
  const output = join(base, scope), home = join(output, 'home');
  await mkdir(output, { mode: 0o700 });
  await mkdir(join(home, 'profiles/web'), { recursive: true, mode: 0o700 });
  // Preserve the existing profile selection, but evaluate only the six leaf modules.
  const installed = await installProfilePacks({ packs, output: join(home, 'profiles/web/verified'), python: process.env.FQ_B0_PYTHON ?? 'python3' });
  const app = await load(join(upstream, 'packages/boot/app-boot/lib/index.js'));
  const { Context } = await load(join(upstream, 'vendor/cordis/lib/index.js'));
  const resolver = new Context();
  try {
    const anchor = join(upstream, 'apps/cli/package.json');
    const resolution = await app.createRuntimeResolution({ installAnchor: anchor, profile: app.loadProfile('dsh', 'web', anchor, home), home });
    new app.PluginPackages(resolver, { resolution });
    const packages = new Map(installed.plugins.filter(row => LEAF_NAMES.some(name => id(name) === row.id)).map(row => [row.id, row]));
    const bindings = [];
    for (const row of packages.values()) {
      const tools = resolver.pluginPackages.packageOf('@deepseek-ai/dsh-tools', pathToFileURL(join(row.root, 'lib/index.js')).href);
      assert.equal(tools?.version, pin.sdk_version, 'LEAF_PACK_TOOLS_RUNTIME');
      bindings.push({ id: row.id, version: tools.version, dir: tools.dir });
    }
    const receipt = { schema_version: 'shinemage-leaf-pack-consumer/v1', scope, verified, packages: installed,
      consumer_packages: [...packages.keys()], bindings, typescript: ts?.version ?? 'NOT_RUN',
      coverage: 'published host entries, browser factories and public geometry; synthetic consumer fixtures',
      workbench_module: 'NOT_RUN', native_settings: 'NOT_RUN', browser: 'NOT_RUN', full_host: 'NOT_RUN',
      candidate_admission: 'NOT_RUN', real_business: 'NOT_RUN', release_ready: false };
    await writeFile(join(output, 'runtime-inputs.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const resolveExport = (name, subpath = '') => {
      const row = packages.get(id(name));
      assert.ok(row, 'LEAF_PACK_PACKAGE_REQUIRED');
      return createRequire(join(row.root, 'package.json')).resolve(row.id + (subpath ? `/${subpath}` : ''));
    };
    return { Context, packages, react, ts, receipt, output, resolveExport,
      loadExport: (name, subpath = '') => load(resolveExport(name, subpath)), dispose: () => resolver.fiber.dispose() };
  } catch (error) {
    await resolver.fiber.dispose();
    throw error;
  }
}
