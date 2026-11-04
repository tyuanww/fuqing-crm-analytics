/** Explicit source-check adapter for the owned generated-contract package.
 *
 * Independent author repositories install @shine-mage/dsh-contracts from a
 * tarball; this repository builds its source trees in place, so the same link
 * the B0 pipeline creates is made explicitly here for callers that execute
 * plugin sources without a package-manager install (for example the Python
 * integration probes).
 *
 * `--upstream <pinned-dsh-checkout>` additionally binds the pinned SDK packages
 * the generated outputs reference next to the contract package
 * (`@deepseek-ai/dsh-tools` for the service transport, `@deepseek-ai/cordis`
 * for the access-contract type augmentation). Node and TypeScript resolve bare
 * specifiers from the importing package's real path, never from the consuming
 * plugin's `node_modules`, so those bindings belong to the package itself.
 * Calls without `--upstream` (the probe that does not load the transport) keep
 * their previous behavior.
 */
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkWorkspaceContract, linkWorkspaceContractSdk } from './plugin-kit-link.mjs';

// Every SDK package a generated file imports must be listed here; the guard in
// scripts/dsh-b0/contracts-package.test.mjs rejects an unlisted specifier.
const CONTRACT_SDK_BINDINGS = [
  { name: '@deepseek-ai/cordis', version: pin => pin.cordis },
  { name: '@deepseek-ai/dsh-tools', version: pin => pin.sdk_version },
];
const repository = fileURLToPath(new URL('../..', import.meta.url));
const contracts = join(repository, 'dsh-plugins/contracts');
const argv = process.argv.slice(2);
assert.ok(argv.length === 0 || (argv.length === 2 && argv[0] === '--upstream' && isAbsolute(argv[1])),
  'CONTRACT_LINK_USAGE');
const upstream = argv.length === 0 ? null : argv[1];
const results = [];
for (const entry of await readdir(join(repository, 'dsh-plugins'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'contracts') continue;
  const plugin = join(repository, 'dsh-plugins', entry.name);
  try {
    await access(join(plugin, 'package.json'));
  } catch {
    continue;
  }
  results.push({ plugin: entry.name, ...(await linkWorkspaceContract(plugin, contracts)) });
}
assert.ok(results.some(result => result.status !== 'NOT_DECLARED'), 'CONTRACT_LINK_NO_CONSUMER');
let sdk = null;
if (upstream) {
  const pin = JSON.parse(await readFile(join(repository, 'dsh-plugins/plugin-kit/toolchain.json'), 'utf8'));
  const bindings = CONTRACT_SDK_BINDINGS.map(({ name, version }) => {
    const target = pin.sdk_bindings?.[name];
    assert.ok(typeof target === 'string' && !target.startsWith('/'), `CONTRACT_LINK_BINDING ${name}`);
    return { name, directory: join(upstream, target), version: version(pin) };
  });
  sdk = { upstream, results: await linkWorkspaceContractSdk(contracts, bindings) };
}
console.log(JSON.stringify({ schema: 'shinemage-contract-workspace-links/v1', package: '@shine-mage/dsh-contracts',
  results, sdk }, null, 2) + '\n');
