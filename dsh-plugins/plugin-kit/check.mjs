/** Explicit, read-only build-input preflight; no network, install or plugin mutation. */
import { isAbsolute } from 'node:path';
import { inspectToolchain } from './toolchain.mjs';

const usage = 'node check.mjs --upstream /absolute/pinned-dsh [--build-tools /absolute/locked-build-tools] [--closure-sha256 SHA]';
const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(usage);
} else {
  let result;
  try {
    const options = {};
    if (!args.length || args.length % 2) throw new Error('KIT_ARGUMENTS_INVALID');
    for (let i = 0; i < args.length; i += 2) {
      if (!['--upstream', '--build-tools', '--closure-sha256'].includes(args[i]) || Object.hasOwn(options, args[i])) throw new Error('KIT_ARGUMENTS_INVALID');
      options[args[i]] = args[i + 1];
    }
    if (!options['--upstream'] || !isAbsolute(options['--upstream'])
      || (options['--build-tools'] && !isAbsolute(options['--build-tools']))) throw new Error('KIT_ARGUMENTS_INVALID');
    const { pin, bindings } = await inspectToolchain(options['--upstream'], options['--build-tools'], options['--closure-sha256']);
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
