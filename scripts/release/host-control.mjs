#!/usr/bin/env node

/**
 * Shared host-side release adapter.
 *
 * The WSL wrappers only select a verb. All release inputs, including the
 * durable journal path, are resolved here so install/activate/rollback cannot
 * silently diverge in their state handling.
 */
import { installRelease, activateRelease, rollbackRelease } from './promotion.mjs';

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}_REQUIRED`);
  return value;
}

function optional(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value : null;
}

function usage() {
  console.log('Usage: node scripts/release/host-control.mjs <install|activate|rollback>');
  console.log('Inputs are read from RELEASE_* environment variables; RELEASE_STATE_PATH is required for every mutating verb.');
}

async function run(command) {
  if (command === 'install') {
    const result = await installRelease({
      artifact: required('RELEASE_ARTIFACT'),
      upstreamRuntimeArtifact: required('RELEASE_UPSTREAM_RUNTIME'),
      manifestPath: required('RELEASE_MANIFEST'),
      releaseRoot: required('RELEASE_ROOT'),
      tag: required('RELEASE_TAG'),
      statePath: required('RELEASE_STATE_PATH'),
      owner: required('RELEASE_OWNER'),
      restartDependency: required('RELEASE_RESTART_DEPENDENCY'),
      publicationPath: required('RELEASE_PUBLICATION'),
      sumsPath: required('RELEASE_SHA256SUMS'),
      evidenceIndexPath: required('RELEASE_EVIDENCE_INDEX'),
      attestationBundlePath: required('RELEASE_ATTESTATION_BUNDLE'),
      runtimeAttestationBundlePath: required('RELEASE_RUNTIME_ATTESTATION_BUNDLE'),
      repository: required('RELEASE_GITHUB_REPO'),
      sourceRef: required('RELEASE_SOURCE_REF'),
      signerWorkflow: optional('RELEASE_SIGNER_WORKFLOW'),
    });
    console.log(`PROMOTION ${result.status} tag=${result.tag} path=${result.path} state=${required('RELEASE_STATE_PATH')} owner=${required('RELEASE_OWNER')} restart_dependency=${required('RELEASE_RESTART_DEPENDENCY')}`);
    return;
  }
  if (command === 'activate') {
    const result = await activateRelease({
      releaseRoot: required('RELEASE_ROOT'),
      tag: required('RELEASE_TAG'),
      sourceSha: required('RELEASE_SOURCE_SHA'),
      statePath: required('RELEASE_STATE_PATH'),
      expectedOwner: required('RELEASE_OWNER'),
      expectedRestartDependency: required('RELEASE_RESTART_DEPENDENCY'),
    });
    console.log(`PROMOTION ${result.status} tag=${result.tag} previous=${result.previous ?? 'none'} state=${required('RELEASE_STATE_PATH')} owner=${required('RELEASE_OWNER')} restart_dependency=${required('RELEASE_RESTART_DEPENDENCY')}`);
    return;
  }
  if (command === 'rollback') {
    const result = await rollbackRelease({
      releaseRoot: required('RELEASE_ROOT'),
      statePath: required('RELEASE_STATE_PATH'),
      expectedOwner: required('RELEASE_OWNER'),
      expectedRestartDependency: required('RELEASE_RESTART_DEPENDENCY'),
    });
    console.log(`PROMOTION ${result.status} target=${result.target} state=${required('RELEASE_STATE_PATH')} owner=${required('RELEASE_OWNER')} restart_dependency=${required('RELEASE_RESTART_DEPENDENCY')}`);
    return;
  }
  throw new Error(`RELEASE_CONTROL_COMMAND_UNKNOWN ${command ?? ''}`.trim());
}

const [command] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  usage();
  if (!command) process.exitCode = 2;
} else {
  run(command).catch(error => {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  });
}
