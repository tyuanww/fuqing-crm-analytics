/** Explicit, read-only build-input preflight; no network, install or plugin mutation. */
import { isAbsolute } from 'node:path';
import { inspectToolchain } from './toolchain.mjs';

const usage = 'node check.mjs --upstream /absolute/pinned-dsh [--build-tools /absolute/locked-build-tools]';
const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(usage);
} else {
  let result;
  try {
    if (![2, 4].includes(args.length) || args[0] !== '--upstream' || !isAbsolute(args[1])
      || (args.length === 4 && (args[2] !== '--build-tools' || !isAbsolute(args[3])))) throw new Error('KIT_ARGUMENTS_INVALID');
    const { pin, bindings } = await inspectToolchain(args[1], args[3]);
    result = { schema_version: 'shinemage-kit-inputs/v1', status: 'READY',
      scope: 'local-build-inputs-only', dsh_pin: pin.sdk_version, upstream_sha: pin.upstream_sha,
      sdk_packages: Object.keys(pin.sdk_bindings).length, bindings: bindings.size,
      compilation: 'NOT_RUN', supply_chain: 'NOT_VERIFIED', release_ready: false };
  } catch (error) {
    // Do not echo execFile errors, package paths or caller credentials.
    const code = /^KIT_[A-Z_]+$/.test(error.message) ? error.message : 'KIT_INPUTS_UNAVAILABLE';
    result = { schema_version: 'shinemage-kit-inputs/v1', status: 'BLOCKED', code,
      remedy: 'Check the pinned source SHA/lock, compiled SDK main/types, and identical installed build-tools; see README.md.',
      release_ready: false };
    process.exitCode = 2;
  }
  console.log(JSON.stringify(result));
}
