/** Explicit local drill input. Never builds, activates or alters a candidate journal. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readdir, readlink, rename, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { insideArtifact, readArtifactFile } from '../release/service-artifact-evidence.mjs';
import { serviceDigest as hash, validateServiceGate } from '../release/service-compatibility.mjs';
import { validateProfile } from '../release/profile.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA, NODE_MAJOR } from '../release/toolchain.mjs';
import { assertClean, scanTree } from '../release/secret-scan.mjs';
import { materializePluginPeerLinks } from '../release/promotion.mjs';
import { readFirstPurchaseService, installFirstPurchaseService, verifyFirstPurchaseService } from './first-purchase-service-artifacts.mjs';
import { prepareFirstPurchaseKernel, verifyFirstPurchaseKernel } from './first-purchase-kernel-artifacts.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
const PRIVATE = { mode: 0o600, flag: 'wx' }, HEX = /^[a-f0-9]{64}$/;
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const json = value => JSON.stringify(value, null, 2) + '\n';
const domains = { workbench: '@shine-mage/dsh-analytics-workbench-b0', crm: '@shine-mage/dsh-crm-knowledge' };
export const FIRST_PURCHASE_SOURCE_CONTRACT = 'first-purchase-frozen-source/v1';
export function verifyFirstPurchaseSourceContract(serviceManifest, kernelManifest) {
  const contract = 'backend/contracts/analytics_first_purchase_source.py';
  const consumer = serviceManifest.files?.[contract], provider = kernelManifest.files?.[contract];
  assert.ok(consumer && provider
    && serviceManifest.files['backend/services/analytics/first_purchase/source_http.py']
    && kernelManifest.files['backend/analytics_first_purchase_source_app.py'], 'HOST_SOURCE_PACKAGE_REQUIRED');
  assert.match(consumer.sha256 ?? '', HEX, 'HOST_SOURCE_CONTRACT_DIGEST');
  assert.equal(consumer.sha256, provider.sha256, 'HOST_SOURCE_CONTRACT_MISMATCH');
}
function exact(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'HOST_ARTIFACT_SCHEMA');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'HOST_ARTIFACT_SCHEMA');
}
async function inventory(directory) {
  const files = {};
  async function walk(relative = '') {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      if (!relative && entry.name === 'node_modules') continue; // only our pinned SDK peer link
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await walk(name);
      else {
        assert.ok(entry.isFile(), 'HOST_ARTIFACT_SPECIAL_FILE');
        files[name] = hash(await insideArtifact(directory, name, 20 * 1024 * 1024, true));
      }
    }
  }
  await walk();
  return files;
}

export async function prepareFirstPurchaseArtifacts({ manifestPath, output, upstream, python, wheelhouse, kernelWheelhouse }) {
  assert.equal(Number(process.versions.node.split('.')[0]), NODE_MAJOR, 'HOST_ARTIFACT_NODE_VERSION');
  for (const path of [manifestPath, output, upstream]) assert.ok(typeof path === 'string' && isAbsolute(path), 'HOST_ARTIFACT_ABSOLUTE_PATH');
  const manifestBytes = await readArtifactFile(manifestPath, 16 * 1024), input = decode(manifestBytes);
  const withSourceHTTP = input.schema_version === 'dsh-first-purchase-host-artifacts/v4';
  const withKernel = withSourceHTTP || input.schema_version === 'dsh-first-purchase-host-artifacts/v3';
  const withService = withKernel || input.schema_version === 'dsh-first-purchase-host-artifacts/v2';
  exact(input, ['schema_version', 'candidate_path', 'candidate_sha256', 'crm_pack_path', 'crm_pack_sha256',
    ...withService ? ['service_evidence_path', 'service_evidence_sha256'] : [],
    ...withKernel ? ['kernel_receipt_path', 'kernel_receipt_sha256'] : []]);
  assert.ok(withService || input.schema_version === 'dsh-first-purchase-host-artifacts/v1', 'HOST_ARTIFACT_SCHEMA');
  if (withKernel) {
    assert.match(input.kernel_receipt_sha256 ?? '', HEX, 'HOST_KERNEL_RECEIPT_DIGEST');
    for (const path of [input.kernel_receipt_path, kernelWheelhouse]) {
      assert.ok(typeof path === 'string' && isAbsolute(path), 'HOST_KERNEL_ABSOLUTE_PATH');
    }
  }
  for (const key of ['candidate_path', 'crm_pack_path']) assert.ok(typeof input[key] === 'string' && isAbsolute(input[key]), 'HOST_ARTIFACT_ABSOLUTE_PATH');
  for (const key of ['candidate_sha256', 'crm_pack_sha256']) assert.match(input[key] ?? '', HEX, 'HOST_ARTIFACT_DIGEST');
  const candidateBytes = await readArtifactFile(input.candidate_path), crmBytes = await readArtifactFile(input.crm_pack_path);
  assert.equal(hash(candidateBytes), input.candidate_sha256, 'HOST_ARTIFACT_CANDIDATE_BYTES');
  assert.equal(hash(crmBytes), input.crm_pack_sha256, 'HOST_ARTIFACT_CRM_RECEIPT_BYTES');
  const candidate = decode(candidateBytes), crm = decode(crmBytes);
  assert.equal(candidate.schema_version, 'dsh-plugin-candidate/v1', 'HOST_ARTIFACT_CANDIDATE_SCHEMA');
  assert.equal(candidate.activation, 'NOT_RUN', 'HOST_ARTIFACT_ALREADY_ACTIVE');
  assert.equal(candidate.state_scope, 'local-explicit-journal', 'HOST_ARTIFACT_STATE_SCOPE');
  const { candidate_digest: digest, activation: _activation, state_scope: _scope, ...base } = candidate;
  assert.match(digest ?? '', HEX, 'HOST_ARTIFACT_CANDIDATE_DIGEST');
  assert.equal(digest, hash(JSON.stringify(base)), 'HOST_ARTIFACT_CANDIDATE_DIGEST');
  const directory = dirname(input.candidate_path);
  assert.deepEqual(candidate.profile_snapshot, { name: 'profile.json', sha256: candidate.profile_digest }, 'HOST_ARTIFACT_PROFILE_SNAPSHOT');
  const profileBytes = await insideArtifact(directory, 'profile.json', 256 * 1024), profile = decode(profileBytes);
  assert.equal(hash(profileBytes), candidate.profile_digest, 'HOST_ARTIFACT_PROFILE_DIGEST');
  validateProfile(profile);
  assert.equal(profile.profile_id, candidate.profile_id, 'HOST_ARTIFACT_PROFILE_ID');
  assert.deepEqual(profile.plugins.map(item => [item.id, item.path, item.enabled]),
    [[domains.workbench, 'dsh-plugins/analytics-workbench', true]], 'HOST_ARTIFACT_PROFILE_SCOPE');
  assert.ok(profile.service_binding, 'HOST_ARTIFACT_SERVICE_BINDING_REQUIRED');
  await validateServiceGate(candidate.service_compatibility, profile.service_binding);
  const workbench = decode(await insideArtifact(directory, 'plugin-pack.json'));
  assert.equal(candidate.plugin.id, domains.workbench, 'HOST_ARTIFACT_PLUGIN_ID');
  assert.equal(candidate.plugin.path, profile.plugins[0].path, 'HOST_ARTIFACT_PLUGIN_PATH');
  assert.equal(candidate.plugin.dsh_pin, DSH_SDK_VERSION, 'HOST_ARTIFACT_DSH_PIN');
  assert.equal(candidate.plugin.version, workbench.package_version, 'HOST_ARTIFACT_PLUGIN_VERSION');
  assert.equal(candidate.source_sha, workbench.source_sha, 'HOST_ARTIFACT_PLUGIN_SOURCE');
  assert.deepEqual(candidate.pack, workbench.tarball, 'HOST_ARTIFACT_PACK_MISMATCH');
  const packs = { workbench, crm }, archives = {};
  for (const [domain, receipt] of Object.entries(packs)) {
    assert.equal(receipt.schema_version, 'dsh-plugin-pack/v1', 'HOST_ARTIFACT_PACK_SCHEMA');
    assert.equal(receipt.package_name, domains[domain], 'HOST_ARTIFACT_PACK_ID');
    assert.match(receipt.source_sha ?? '', /^[a-f0-9]{40}$/, 'HOST_ARTIFACT_PACK_SOURCE');
    assert.equal(receipt.source_dirty, false, 'HOST_ARTIFACT_DIRTY_SOURCE');
    assert.equal(receipt.dsh_pin, DSH_SDK_VERSION, 'HOST_ARTIFACT_DSH_PIN');
    assert.match(receipt.tarball?.name ?? '', /^[a-zA-Z0-9_.-]+\.tgz$/, 'HOST_ARTIFACT_PACK_NAME');
    assert.match(receipt.tarball.sha256 ?? '', HEX, 'HOST_ARTIFACT_PACK_DIGEST');
    archives[domain] = await insideArtifact(domain === 'crm' ? dirname(input.crm_pack_path) : directory,
      receipt.tarball.name, 20 * 1024 * 1024);
    assert.equal(archives[domain].length, receipt.tarball.bytes, 'HOST_ARTIFACT_PACK_SIZE');
    assert.equal(hash(archives[domain]), receipt.tarball.sha256, 'HOST_ARTIFACT_PACK_DIGEST');
  }
  // Verify official identity before creating directories or allowing SDK imports.
  assert.equal((await exec('git', ['rev-parse', 'HEAD'], { cwd: upstream, timeout: 5000 })).stdout.trim(), DSH_UPSTREAM_SHA, 'HOST_ARTIFACT_UPSTREAM_SHA');
  assert.equal((await exec('git', ['status', '--porcelain', '-uno'], { cwd: upstream, timeout: 5000 })).stdout.trim(), '', 'HOST_ARTIFACT_UPSTREAM_DIRTY');
  assert.equal(decode(await readArtifactFile(join(upstream, 'apps/cli/package.json'))).version, DSH_SDK_VERSION, 'HOST_ARTIFACT_UPSTREAM_VERSION');
  const serviceSpec = withService ? await readFirstPurchaseService({ evidencePath: input.service_evidence_path,
    expectedSha: input.service_evidence_sha256, gate: candidate.service_compatibility, python, wheelhouse }) : null;
  await mkdir(output, { mode: 0o700 }); // exclusive: never overwrite an old drill
  await mkdir(join(output, 'dsh-plugins'), { mode: 0o700 });
  const installed = {}, packages = {};
  for (const [domain, receipt] of Object.entries(packs)) {
    const archive = join(output, domain + '.tgz'), extracted = join(output, domain);
    await writeFile(archive, archives[domain], PRIVATE);
    await exec('python3', [join(root, 'scripts/release/secure-unpack.py'), archive, extracted,
      '--max-entries', '1000', '--max-bytes', String(20 * 1024 * 1024)],
    { cwd: output, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHON_DOTENV_DISABLED: '1' }, timeout: 30000, maxBuffer: 256 * 1024 });
    assert.deepEqual(await readdir(extracted), ['package'], 'HOST_ARTIFACT_PACK_ROOT');
    installed[domain] = join(output, 'dsh-plugins', domain);
    await rename(join(extracted, 'package'), installed[domain]);
    // node_modules is never part of a plugin tarball.
    assert.ok(!(await readdir(installed[domain])).includes('node_modules'), 'HOST_ARTIFACT_BUNDLED_NODE_MODULES');
    const files = await inventory(installed[domain]);
    assert.deepEqual(Object.keys(files).sort(), [...receipt.entries].sort(), 'HOST_ARTIFACT_FILE_SET');
    const pkg = decode(await insideArtifact(installed[domain], 'package.json'));
    assert.equal(pkg.name, domains[domain], 'HOST_ARTIFACT_PACKAGE_ID');
    assert.equal(pkg.version, receipt.package_version, 'HOST_ARTIFACT_PACKAGE_VERSION');
    assert.equal(pkg.peerDependencies?.['@deepseek-ai/dsh-tools'], DSH_SDK_VERSION, 'HOST_ARTIFACT_PACKAGE_PEER');
    assertClean(await scanTree(installed[domain]));
    packages[domain] = { ...receipt, installed_files: files };
  }
  // Match the existing production receiver's peer closure. apps/cli/node_modules
  // alone omits transitive SDKs such as dsh-client-connection.
  await symlink(upstream, join(output, 'upstream'), 'dir');
  await materializePluginPeerLinks(output);
  const peerPath = join(output, 'upstream/node_modules/.pnpm/node_modules/@deepseek-ai');
  const service = serviceSpec ? await installFirstPurchaseService(serviceSpec, join(output, 'service')) : null;
  const kernel = withKernel ? await prepareFirstPurchaseKernel({ receiptPath: input.kernel_receipt_path,
    expectedSha: input.kernel_receipt_sha256, output: join(output, 'kernel'), python, wheelhouse: kernelWheelhouse }) : null;
  if (kernel) service.receipt.query_runtime = 'independent-offline-query-artifact';
  if (withSourceHTTP) {
    verifyFirstPurchaseSourceContract(decode(service.manifest), decode(kernel.manifest));
    service.receipt.source_contract = kernel.receipt.source_contract = FIRST_PURCHASE_SOURCE_CONTRACT;
  }
  let scope = service ? 'local-plugins-and-saved-analysis-artifact' : 'local-plugin-composition-only';
  if (kernel) scope = 'local-plugins-save-and-query-artifacts';
  if (withSourceHTTP) scope = 'local-artifacts-with-query-source-http';
  const evidence = { schema_version: 'dsh-first-purchase-host-artifacts-observed/v1', scope,
    input_sha256: hash(manifestBytes), candidate_digest: digest,
    upstream_sha: DSH_UPSTREAM_SHA, packages, service_runtime: service?.receipt.service_runtime ?? 'workspace-synthetic-service',
    ...service ? { service: service.receipt } : {},
    ...kernel ? { kernel: kernel.receipt } : {},
    activation: 'NOT_RUN', release_ready: false };
  await writeFile(join(output, 'packages.json'), json(evidence), PRIVATE);
  return { ...installed, candidateDigest: digest, evidence, output, upstream, peerPath, service, kernel };
}

export async function verifyFirstPurchaseInstalledArtifacts(prepared) {
  if (prepared.kernel) await verifyFirstPurchaseKernel(prepared.kernel);
  if (prepared.service) await verifyFirstPurchaseService(prepared.service);
  assert.equal(await readlink(join(prepared.output, 'upstream')), prepared.upstream, 'HOST_ARTIFACT_UPSTREAM_CHANGED');
  for (const domain of Object.keys(domains)) {
    const modules = join(prepared[domain], 'node_modules');
    assert.deepEqual(await readdir(modules), ['@deepseek-ai'], 'HOST_ARTIFACT_PEER_CHANGED');
    assert.equal(resolve(modules, await readlink(join(modules, '@deepseek-ai'))), prepared.peerPath, 'HOST_ARTIFACT_PEER_CHANGED');
    assert.deepEqual(await inventory(prepared[domain]), prepared.evidence.packages[domain].installed_files, 'HOST_ARTIFACT_INSTALLED_CHANGED');
  }
  return true;
}
