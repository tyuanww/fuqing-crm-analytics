/** Public contract tests of fixed independent packs, using the official resolver. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installProfilePacks, loadProfilePacks } from '../release/profile-packs.mjs';
import { readToolchain, verifyUpstream } from '../dsh-dev/pin.mjs';
import { inspectDeclaredPlugin } from './prepare-profile.mjs';

const CRM = '@shine-mage/dsh-crm-knowledge', KNOWLEDGE = '@shine-mage/dsh-knowledge';
const PAGE = '@shine-mage/dsh-analytics-workbench-b0';
export const CRM_COMPOSITION_SCOPES = Object.freeze(['knowledge', 'page', 'crm-package', 'knowledge-package']);
const repo = new URL('../..', import.meta.url);
const load = path => import(pathToFileURL(path).href);

/** Validate all package inputs before creating a runtime or listening on a port. */
export async function readCompositionInputs({ inputsPath, pageInputsPath } = {}) {
  const packs = await loadProfilePacks({ inputsPath });
  const pages = pageInputsPath === undefined ? undefined : await loadProfilePacks({ inputsPath: pageInputsPath });
  return validateCompositionPacks({ packs, pages });
}

/** Shared preflight for already verified packages; no writes or runtime import. */
export function validateCompositionPacks({ packs, pages }) {
  assert.equal(packs.profile.service_binding, undefined, 'CRM_COMPOSITION_SERVICE_BINDING_REQUIRES_CANDIDATE');
  assert.deepEqual(packs.plugins.map(row => row.id).sort(), [CRM, KNOWLEDGE].sort(), 'CRM_COMPOSITION_SELECTION');
  const crm = packs.plugins.find(row => row.id === CRM), knowledge = packs.plugins.find(row => row.id === KNOWLEDGE);
  inspectDeclaredPlugin(crm.manifest, CRM, { '.': 'lib/index.js', './host': 'lib/host.js', './client': 'lib/client.js' }, 'crm', 'CRM_COMPOSITION');
  inspectDeclaredPlugin(knowledge.manifest, KNOWLEDGE, { '.': 'lib/index.js', './graph-tools': 'lib/graph-tools.js' }, 'knowledge', 'CRM_COMPOSITION');
  if (pages !== undefined) {
    assert.equal(pages.profile.service_binding, undefined, 'CRM_COMPOSITION_SERVICE_BINDING_REQUIRES_CANDIDATE');
    assert.equal(pages.profile.dsh.sdk_version, packs.profile.dsh.sdk_version, 'CRM_COMPOSITION_PAGE_SDK');
    assert.ok(pages.plugins.every(row => !packs.plugins.some(main => main.id === row.id)), 'CRM_COMPOSITION_PAGE_SELECTION_OVERLAP');
    const page = pages.plugins.find(row => row.id === PAGE);
    assert.ok(page, 'CRM_COMPOSITION_PAGE_REQUIRED');
    inspectDeclaredPlugin(page.manifest, PAGE, { './page-tools': 'lib/page-tools.js' }, undefined, 'CRM_COMPOSITION_PAGE');
  }
  return { packs, pages };
}

/** No source fallback, SDK links, peer installation, host boot or model call. */
export async function loadComposition({ scope, page = false } = {}) {
  assert.ok(CRM_COMPOSITION_SCOPES.includes(scope), 'CRM_COMPOSITION_SCOPE');
  assert.equal(page, scope === 'page', 'CRM_COMPOSITION_SCOPE');
  const inputsPath = process.env.CRM_COMPOSITION_PACK_INPUTS;
  const pageInputsPath = page ? process.env.CRM_COMPOSITION_PAGE_INPUTS : undefined;
  if (page) assert.ok(pageInputsPath && isAbsolute(pageInputsPath), 'CRM_COMPOSITION_PAGE_INPUTS_REQUIRED: NOT_RUN without fixed page packs');
  const { packs, pages } = await readCompositionInputs({ inputsPath, pageInputsPath });
  const upstream = process.env.B0_BUILD_UPSTREAM, base = process.env.CRM_COMPOSITION_OUTPUT;
  assert.ok(upstream && isAbsolute(upstream), 'CRM_COMPOSITION_UPSTREAM_REQUIRED');
  assert.ok(base && isAbsolute(base), 'CRM_COMPOSITION_OUTPUT_REQUIRED');
  const pin = await readToolchain(fileURLToPath(repo));
  const verified = await verifyUpstream(upstream, pin);
  const anchor = join(upstream, 'apps/cli/package.json');
  const cordis = JSON.parse(await readFile(join(upstream, 'vendor/cordis/package.json'), 'utf8'));
  assert.equal(cordis.version, '4.0.4', 'CRM_COMPOSITION_CORDIS_RUNTIME');
  assert.equal(packs.profile.dsh.sdk_version, pin.sdk_version, 'CRM_COMPOSITION_PIN');
  const output = join(base, scope), home = join(output, 'home');
  await mkdir(output, { mode: 0o700 });
  await mkdir(join(home, 'profiles/web'), { recursive: true, mode: 0o700 });
  const installed = await installProfilePacks({ packs, output: join(home, 'profiles/web/verified'), python: process.env.FQ_B0_PYTHON ?? 'python3' });
  const installedPages = pages ? await installProfilePacks({ packs: pages, output: join(home, 'profiles/web/pages'), python: process.env.FQ_B0_PYTHON ?? 'python3' }) : undefined;
  const app = await load(join(upstream, 'packages/boot/app-boot/lib/index.js'));
  const { Context } = await load(join(upstream, 'vendor/cordis/lib/index.js'));
  const resolver = new Context();
  try {
    const profile = app.loadProfile('dsh', 'web', anchor, home);
    const resolution = await app.createRuntimeResolution({ installAnchor: anchor, profile, home });
    new app.PluginPackages(resolver, { resolution });
    const byId = new Map(installed.plugins.map(row => [row.id, row]));
    if (page) byId.set(PAGE, installedPages.plugins.find(row => row.id === PAGE));
    const entry = (id, path) => join(byId.get(id).root, path);
    const { mountAgentLoopTestDependencies } = await load(join(upstream, 'packages/test-support/agent-loop-testkit/lib/index.js'));
    const { defineTool } = await load(join(upstream, 'packages/core/tools/lib/index.js'));
    const connection = await load(join(upstream, 'packages/client/connection/lib/index.js'));
    const crm = await load(entry(CRM, 'lib/index.js')), crmHost = await load(entry(CRM, 'lib/host.js'));
    const knowledge = await load(entry(KNOWLEDGE, 'lib/index.js')), graph = await load(entry(KNOWLEDGE, 'lib/graph-tools.js'));
    const pageTools = page ? await load(entry(PAGE, 'lib/page-tools.js')) : undefined;
    const bindings = [CRM, KNOWLEDGE, ...(page ? [PAGE] : [])].map(id => {
      const parent = pathToFileURL(entry(id, id === PAGE ? 'lib/page-tools.js' : 'lib/index.js')).href;
      const tools = resolver.pluginPackages.packageOf('@deepseek-ai/dsh-tools', parent);
      const runtimeCordis = resolver.pluginPackages.packageOf('@deepseek-ai/cordis', parent);
      assert.equal(tools?.version, pin.sdk_version, 'CRM_COMPOSITION_TOOLS_RUNTIME');
      if (id !== PAGE) assert.equal(runtimeCordis?.version, cordis.version, 'CRM_COMPOSITION_CORDIS_RESOLUTION');
      return { id, tools: { version: tools.version, dir: tools.dir }, cordis: runtimeCordis ? { version: runtimeCordis.version, dir: runtimeCordis.dir } : null };
    });
    const receipt = { schema: 'shinemage-pack-composition-inputs/v1', scope, verified, cordis: { declared: '4.0.4', runtime: cordis.version },
      packages: installed, page_packages: installedPages ?? null, bindings,
      coverage: 'public contract composition with official resolver and synthetic HTTP fixtures',
      official_plugin_add: 'NOT_RUN', full_host: 'NOT_RUN', candidate_admission: 'NOT_RUN', real_business: 'NOT_RUN', release_ready: false };
    await writeFile(join(output, 'runtime-inputs.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { Context, mountAgentLoopTestDependencies, defineTool, connection, crm, crmHost, knowledge, graph, page: pageTools, receipt,
      dispose: () => resolver.fiber.dispose() };
  } catch (error) {
    await resolver.fiber.dispose();
    throw error;
  }
}
