import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindToolchain as bind, checkTypes } from '../plugin-kit/toolchain.mjs';

const toolchainRoot = dirname(fileURLToPath(import.meta.url));

export function bindToolchain(plugin, upstream, buildTools = join(toolchainRoot, 'build-tools')) {
  return bind(plugin, upstream, buildTools, toolchainRoot);
}

export { checkTypes };
