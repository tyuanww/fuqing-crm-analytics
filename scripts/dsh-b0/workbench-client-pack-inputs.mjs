/** Published Workbench client input; never loads its Host entry or private sources. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLeafPackInputs } from './leaf-pack-inputs.mjs';
import { installProfilePacks } from '../release/profile-packs.mjs';
import { readToolchain, verifyUpstream } from '../dsh-dev/pin.mjs';

const id = '@shine-mage/dsh-analytics-workbench-b0';
const root = fileURLToPath(new URL('../..', import.meta.url));
export const WORKBENCH_CLIENT_SCOPES = ['workbench-client', 'workbench-tool-cards', 'workbench-query-cancel',
  'workbench-query-save', 'workbench-asset-overlay', 'workbench-first-purchase-card',
  'workbench-first-purchase-save', 'workbench-query-fault', 'workbench-native-prompt'];

export async function readWorkbenchClientInputs(inputsPath) {
  const packs = await readLeafPackInputs(inputsPath);
  const manifest = packs.plugins.find(row => row.id === id).manifest;
  assert.equal(manifest.exports?.['./client'], './lib/client.js', 'WORKBENCH_PACK_CLIENT_EXPORT');
  assert.equal(manifest.dsh?.client?.platform, 'web', 'WORKBENCH_PACK_CLIENT_PLATFORM');
  assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-tools'], packs.profile.dsh.sdk_version, 'WORKBENCH_PACK_SDK_PIN');
  return packs;
}

/** Prepare the existing seven-package selection, evaluating only its client bundle. */
export async function loadWorkbenchClient({ scope = 'workbench-client' } = {}) {
  assert.ok(WORKBENCH_CLIENT_SCOPES.includes(scope), 'WORKBENCH_PACK_SCOPE');
  const packs = await readWorkbenchClientInputs(process.env.CRM_COMPOSITION_PAGE_INPUTS);
  const upstream = process.env.B0_BUILD_UPSTREAM, base = process.env.CRM_COMPOSITION_OUTPUT;
  assert.ok(isAbsolute(upstream ?? ''), 'WORKBENCH_PACK_UPSTREAM_REQUIRED');
  assert.ok(isAbsolute(base ?? ''), 'WORKBENCH_PACK_OUTPUT_REQUIRED');
  const pin = await readToolchain(root), verified = await verifyUpstream(upstream, pin);
  const webRequire = createRequire(join(upstream, 'apps/web/package.json'));
  assert.equal(webRequire('react/package.json').version, pin.react, 'WORKBENCH_PACK_REACT_PIN');
  assert.equal(webRequire('react-dom/package.json').version, pin.react, 'WORKBENCH_PACK_REACT_DOM_PIN');
  const storeRequire = createRequire(join(upstream, pin.sdk_bindings['@deepseek-ai/dsh-client-store'], 'package.json'));
  assert.equal(storeRequire('@deepseek-ai/dsh-client-store/package.json').version, pin.sdk_version, 'WORKBENCH_PACK_STORE_PIN');
  const storeEntry = storeRequire.resolve('@deepseek-ai/dsh-client-store');
  const domRequire = createRequire(join(upstream, 'node_modules/jsdom/package.json'));
  const { JSDOM } = domRequire('jsdom'), domVersion = domRequire('jsdom/package.json').version;
  const output = join(base, scope);
  await mkdir(output, { mode: 0o700 });
  const installed = await installProfilePacks({ packs, output: join(output, 'verified'), python: process.env.FQ_B0_PYTHON ?? 'python3' });
  const row = installed.plugins.find(item => item.id === id);
  const entry = createRequire(join(row.root, 'package.json')).resolve(`${id}/client`);
  const source = await readFile(entry, 'utf8');
  const stores = await import(pathToFileURL(storeEntry).href);
  const receipt = { schema_version: 'shinemage-workbench-client-consumer/v1', status: 'CLIENT_INPUTS_PREPARED', scope,
    verified, packages: installed, consumer_packages: [id], entry, store_entry: storeEntry,
    react: pin.react, react_dom: pin.react, store: pin.sdk_version, jsdom: domVersion,
    coverage: 'published client factory, synthetic slots, React SSR and JSDOM interaction',
    host_entry: 'NOT_RUN', full_host: 'NOT_RUN', native_settings: 'NOT_RUN', browser: 'NOT_RUN',
    candidate_admission: 'NOT_RUN', real_business: 'NOT_RUN', release_ready: false };
  await writeFile(join(output, 'runtime-inputs.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { source, stores, webRequire, JSDOM, receipt, output };
}
