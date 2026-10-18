/**
 * Assemble one immutable identity for the two-profile, nine-pack composition.
 *
 * This is a preparation contract only. It never starts a host or service and
 * never marks activation/release readiness. A service compatibility receipt is
 * mandatory so a composition candidate cannot silently become a legacy,
 * service-free candidate.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readArtifactFile } from './service-artifact-evidence.mjs';
import { recordEvent } from './state.mjs';
import { prepareServiceCompatibility, validateServiceBinding } from './service-compatibility.mjs';
import { loadProfilePacks } from './profile-packs.mjs';
import { resolveCompositionToolchain, validateCompositionPacks } from '../crm-calibration/composition-inputs.mjs';
import { readToolchainFile } from '../dsh-dev/pin.mjs';

export const COMPOSITION_CANDIDATE_SCHEMA = 'dsh-composition-candidate/v1';
const HEX = /^[a-f0-9]{64}$/;
const PACKAGE_ID = /^@shine-mage\/[a-z0-9][a-z0-9-]+$/;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytesDigest = value => createHash('sha256').update(value).digest('hex');

function absolute(value, code) {
  assert.equal(typeof value, 'string', code);
  assert.ok(isAbsolute(value) && !value.includes('..'), code);
  return resolve(value);
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const pending = `${path}.pending-${process.pid}`;
  await writeFile(pending, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try { await rename(pending, path); } catch (error) {
    const { rm } = await import('node:fs/promises');
    await rm(pending, { force: true });
    throw error;
  }
}

function packRows(packs, profileName) {
  return packs.plugins.map(item => ({
    id: item.id,
    path: item.path,
    profile: profileName,
    version: item.receipt.package_version,
    dsh_pin: item.receipt.dsh_pin,
    source_sha: item.receipt.source_sha,
    manifest_sha256: item.manifestSha256,
    pack: item.receipt.tarball,
  }));
}

function profileRow(packs, name, contents = packs.contents, sourceSha256 = packs.digest) {
  return {
    name,
    profile_id: packs.profile.profile_id,
    source_sha256: sourceSha256,
    sha256: bytesDigest(contents),
    plugins: packs.plugins.map(item => item.id),
  };
}

export function validateCompositionCandidate(candidate) {
  assert.equal(candidate?.schema_version, COMPOSITION_CANDIDATE_SCHEMA, 'COMPOSITION_CANDIDATE_SCHEMA');
  assert.match(candidate.candidate_digest ?? '', HEX, 'COMPOSITION_CANDIDATE_DIGEST');
  assert.ok(Array.isArray(candidate.profiles) && candidate.profiles.length === 2, 'COMPOSITION_CANDIDATE_PROFILES');
  assert.ok(Array.isArray(candidate.plugins) && candidate.plugins.length === 9, 'COMPOSITION_CANDIDATE_PLUGINS');
  assert.deepEqual(candidate.profiles.map(profile => profile.name), ['crm', 'page'], 'COMPOSITION_PROFILE_ORDER');
  for (const profile of candidate.profiles) {
    assert.match(profile.source_sha256 ?? '', HEX, 'COMPOSITION_PROFILE_SOURCE_DIGEST');
    assert.match(profile.sha256 ?? '', HEX, 'COMPOSITION_PROFILE_DIGEST');
    assert.ok(Array.isArray(profile.plugins), 'COMPOSITION_PROFILE_PLUGINS');
  }
  assert.ok(candidate.service_compatibility, 'COMPOSITION_SERVICE_GATE_REQUIRED');
  assert.equal(candidate.service_compatibility.schema_version, 'dsh-service-compatibility-gate/v1', 'COMPOSITION_SERVICE_GATE_SCHEMA');
  validateServiceBinding(candidate.service_compatibility.binding);
  assert.equal(candidate.activation, 'NOT_RUN', 'COMPOSITION_CANDIDATE_ACTIVATION');
  assert.equal(candidate.release_ready, false, 'COMPOSITION_CANDIDATE_RELEASE_READY');
  assert.deepEqual(Object.keys(candidate.capabilities).sort(), ['browser', 'recovery', 'source_http', 'terminal'], 'COMPOSITION_CAPABILITIES');
  for (const value of Object.values(candidate.capabilities)) assert.equal(value, 'NOT_RUN', 'COMPOSITION_CAPABILITY_NOT_RUN');
  const { candidate_digest: candidateDigest, ...base } = candidate;
  assert.equal(candidateDigest, digest(base), 'COMPOSITION_CANDIDATE_DIGEST_MISMATCH');
  const ids = candidate.plugins.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, 'COMPOSITION_PLUGIN_DUPLICATE');
  assert.deepEqual(candidate.profiles.flatMap(profile => profile.plugins), ids, 'COMPOSITION_PROFILE_PLUGIN_MISMATCH');
  for (const item of candidate.plugins) {
    assert.match(item.id ?? '', PACKAGE_ID, 'COMPOSITION_PLUGIN_ID');
    assert.ok(item.profile === 'crm' || item.profile === 'page', 'COMPOSITION_PLUGIN_PROFILE');
    assert.match(item.source_sha ?? '', /^[a-f0-9]{40}$/, 'COMPOSITION_PLUGIN_SOURCE');
    assert.match(item.manifest_sha256 ?? '', HEX, 'COMPOSITION_PLUGIN_MANIFEST');
    assert.match(item.pack?.sha256 ?? '', HEX, 'COMPOSITION_PLUGIN_PACK');
    assert.equal(item.pack.name, `${item.id.slice(1).replaceAll('/', '-')}-${item.version}.tgz`, 'COMPOSITION_PLUGIN_PACK_NAME');
    const profile = candidate.profiles.find(row => row.plugins.includes(item.id));
    assert.ok(profile, 'COMPOSITION_PLUGIN_PROFILE_MISSING');
    assert.equal(item.profile, profile.name, 'COMPOSITION_PLUGIN_PROFILE_MISMATCH');
  }
  return candidate;
}

/**
 * Build a composition candidate from two already verified profile-pack inputs.
 * The service evidence is required before any receipt or journal event is made.
 */
export async function createCompositionCandidate({ crmInputsPath, pageInputsPath, serviceBindingPath,
  serviceEvidencePath, outputDir, statePath, toolchain, toolchainPath, cordisPeerVersion } = {}) {
  const crmPath = absolute(crmInputsPath, 'COMPOSITION_CRM_INPUTS_REQUIRED');
  const pagePath = absolute(pageInputsPath, 'COMPOSITION_PAGE_INPUTS_REQUIRED');
  const bindingPath = absolute(serviceBindingPath, 'COMPOSITION_SERVICE_BINDING_REQUIRED');
  const evidencePath = absolute(serviceEvidencePath, 'COMPOSITION_SERVICE_EVIDENCE_REQUIRED');
  const destination = absolute(outputDir, 'COMPOSITION_OUTPUT_REQUIRED');
  const journal = absolute(statePath, 'COMPOSITION_STATE_PATH_REQUIRED');
  assert.ok(!(toolchain !== undefined && toolchainPath !== undefined), 'COMPOSITION_TOOLCHAIN_AMBIGUOUS');
  const selectedToolchain = toolchainPath
    ? await readToolchainFile(toolchainPath)
    : await resolveCompositionToolchain(toolchain);
  const selectedCordisPeer = cordisPeerVersion ?? process.env.CRM_COMPOSITION_CORDIS_PEER ?? '4.0.4';
  const [crm, page] = await Promise.all([loadProfilePacks({ inputsPath: crmPath, toolchain: selectedToolchain, requireGeneratedProvenance: true }),
    loadProfilePacks({ inputsPath: pagePath, toolchain: selectedToolchain, requireGeneratedProvenance: true })]);
  validateCompositionPacks({ packs: crm, pages: page, toolchain: selectedToolchain, cordisPeerVersion: selectedCordisPeer });
  const binding = JSON.parse((await readArtifactFile(bindingPath, 128 * 1024)).toString('utf8'));
  validateServiceBinding(binding);
  const serviceGate = await prepareServiceCompatibility(binding, evidencePath);
  assert.ok(serviceGate, 'COMPOSITION_SERVICE_GATE_REQUIRED');
  const pageProfile = JSON.parse(page.contents);
  assert.equal(pageProfile.service_binding, undefined, 'COMPOSITION_PAGE_PROFILE_ALREADY_BOUND');
  pageProfile.service_binding = binding;
  const boundPageContents = `${JSON.stringify(pageProfile, null, 2)}\n`;
  await access(destination).catch(async error => {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(destination, { recursive: true, mode: 0o700 });
  });
  assert.equal((await readdir(destination)).length, 0, 'COMPOSITION_OUTPUT_MUST_BE_EMPTY');
  const profiles = [profileRow(crm, 'crm'), profileRow(page, 'page', boundPageContents, page.digest)];
  const plugins = [...packRows(crm, 'crm'), ...packRows(page, 'page')];
  const base = {
    schema_version: COMPOSITION_CANDIDATE_SCHEMA,
    profiles,
    plugins,
    service_compatibility: serviceGate,
    capabilities: { source_http: 'NOT_RUN', terminal: 'NOT_RUN', browser: 'NOT_RUN', recovery: 'NOT_RUN' },
    activation: 'NOT_RUN',
    canary: 'NOT_RUN',
    rollback: 'NOT_RUN',
    release_ready: false,
    state_scope: 'local-explicit-journal',
  };
  const candidate = { ...base, candidate_digest: digest(base) };
  validateCompositionCandidate(candidate);
  const candidateKey = digest({ profiles, plugins: plugins.map(item => ({ id: item.id, pack: item.pack.sha256 })), binding });
  const releaseTag = `dsh-composition-${candidateKey.slice(0, 24)}`;
  await recordEvent(journal, {
    release_tag: releaseTag,
    status: 'COMPOSITION_CANDIDATE_INTENT',
    candidate_digest: candidate.candidate_digest,
    profile_digests: profiles.map(item => item.sha256),
    pack_sha256: plugins.map(item => item.pack.sha256),
    service_binding: binding,
  }, { idempotencyKey: `composition-intent:${candidateKey}` });
  await writeAtomic(join(destination, 'composition-candidate.json'), candidate);
  await mkdir(join(destination, 'profiles'), { mode: 0o700 });
  await writeFile(join(destination, 'profiles/crm.json'), crm.contents, { mode: 0o600, flag: 'wx' });
  await writeFile(join(destination, 'profiles/page.json'), boundPageContents, { mode: 0o600, flag: 'wx' });
  await mkdir(join(destination, 'packs'), { mode: 0o700 });
  for (const item of [...crm.plugins, ...page.plugins]) {
    const directory = item.id.slice(1).replaceAll('/', '-');
    const target = join(destination, 'packs', directory);
    await mkdir(target, { mode: 0o700 });
    await writeFile(join(target, 'plugin-pack.json'), item.manifestBytes, { mode: 0o600, flag: 'wx' });
    await writeFile(join(target, item.receipt.tarball.name), item.archive, { mode: 0o600, flag: 'wx' });
  }
  await recordEvent(journal, {
    release_tag: releaseTag,
    status: 'COMPOSITION_CANDIDATE_PREPARED',
    candidate_digest: candidate.candidate_digest,
    profile_digests: profiles.map(item => item.sha256),
    pack_sha256: plugins.map(item => item.pack.sha256),
    service_binding: binding,
  }, { idempotencyKey: `composition:${candidateKey}` });
  return candidate;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log('Usage: pnpm dsh plugin composition-candidate --crm-inputs /absolute/crm-inputs.json --page-inputs /absolute/page-inputs.json --service-binding /absolute/service-binding.json --service-evidence /absolute/service-evidence.json --output-dir /absolute/output --state-path /absolute/state.json [--toolchain /absolute/toolchain.json --cordis-peer VERSION]');
    } else {
      const candidate = await createCompositionCandidate({ crmInputsPath: option('--crm-inputs'), pageInputsPath: option('--page-inputs'), serviceBindingPath: option('--service-binding'), serviceEvidencePath: option('--service-evidence'), outputDir: option('--output-dir'), statePath: option('--state-path'), toolchainPath: option('--toolchain'), cordisPeerVersion: option('--cordis-peer') });
      console.log(JSON.stringify(candidate, null, 2));
    }
  } catch (error) {
    console.error(`DSH_COMPOSITION_CANDIDATE_ERROR ${error?.message ?? String(error)}`);
    process.exitCode = 2;
  }
}
