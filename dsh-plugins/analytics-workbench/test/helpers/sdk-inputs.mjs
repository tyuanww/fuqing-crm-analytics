/** Verify fixed SDK inputs before executing host seams. Supports both input formats. */
import { inspectToolchain } from '@shine-mage/dsh-plugin-kit/toolchain';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const plugin = fileURLToPath(new URL('../..', import.meta.url));
export const upstream = resolve(process.env.B0_BUILD_UPSTREAM ?? join(plugin, '../../.context/dsh-b0/upstream-0.1.7-rc.2'));
export const sdk = await inspectToolchain(upstream, process.env.B0_BUILD_TOOLS);
