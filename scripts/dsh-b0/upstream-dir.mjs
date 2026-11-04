/** Default local B0 upstream checkout directory, derived from the single version
 * source (dsh-plugins/plugin-kit/toolchain.json). Callers keep their explicit
 * DSH_UPSTREAM_CHECKOUT / B0_BUILD_UPSTREAM override; this only replaces the
 * hardcoded `upstream-<sdk_version>` literal that used to drift per release.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pin = JSON.parse(readFileSync(join(repoRoot, 'dsh-plugins/plugin-kit/toolchain.json'), 'utf8'));

/** `<repo>/.context/dsh-b0` */
export const B0_ROOT = join(repoRoot, '.context/dsh-b0');

/** `<repo>/.context/dsh-b0/upstream-<pinned sdk_version>` */
export const PINNED_UPSTREAM_DIR = join(B0_ROOT, `upstream-${pin.sdk_version}`);
