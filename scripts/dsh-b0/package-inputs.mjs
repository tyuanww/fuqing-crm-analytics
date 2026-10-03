/** Bind declared immutable library inputs for source tests; never build a sibling. */
import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindPackagedDependencies } from '../../dsh-plugins/plugin-kit/packaged-dependencies.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const inputs = resolve(process.argv[2] ?? process.env.DSH_PACKAGE_INPUTS ?? join(root, '.context/dsh-b0/package-inputs'));
for (const entry of await readdir(join(root, 'dsh-plugins'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const bound = await bindPackagedDependencies(join(root, 'dsh-plugins', entry.name), inputs);
  if (bound.length) console.log(JSON.stringify({ consumer: entry.name, scope: 'packed-build-input', packages: bound }));
}
