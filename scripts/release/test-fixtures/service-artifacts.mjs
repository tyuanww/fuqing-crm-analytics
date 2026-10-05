/** Validator-only fixtures, never evidence of a service or host run. */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { serviceFixture } from './service-compatibility.mjs';
import { SERVICE_CASES, serviceDigest as hash } from '../service-compatibility.mjs';
import { SERVICE_ARTIFACT_INPUTS, SERVICE_ARTIFACT_SCOPE } from '../service-artifact-evidence.mjs';
import { createPluginCandidate } from '../plugin-candidate.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA, PNPM_VERSION } from '../toolchain.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url)), exec = promisify(execFile);
export const json = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
export const parse = async path => JSON.parse(await readFile(path));
export async function repackServiceFixture(directory, label) {
  const stage = join(directory, 'stages', label), target = join(directory, 'pair', label);
  const manifestBytes = await readFile(join(stage, 'service-manifest.json')), manifest = JSON.parse(manifestBytes);
  const receipt = await parse(join(target, 'candidate-receipt.json'));
  const allow = join(directory, 'stages', label + '-allow.json');
  await json(allow, [...Object.keys(manifest.files), 'service-manifest.json']);
  await exec('python3', [join(root, 'scripts/release/pack.py'), stage, allow, join(target, receipt.artifact)], { cwd: directory, timeout: 30000 });
  const archive = await readFile(join(target, receipt.artifact));
  receipt.sha256 = hash(archive); receipt.bytes = archive.length; receipt.manifest_sha256 = hash(manifestBytes);
  await writeFile(join(target, 'service-manifest.json'), manifestBytes);
  await json(join(target, 'candidate-receipt.json'), receipt);
  const evidencePath = join(directory, 'pair/receipt.json'), evidence = await parse(evidencePath);
  evidence.artifacts[label] = { ...receipt, installed: evidence.artifacts[label].installed };
  await json(evidencePath, evidence);
}

export async function createServiceArtifactFixture(directory) {
  const { evidence: source, binding } = await serviceFixture();
  const artifacts = {};
  for (const label of ['baseline', 'candidate']) {
    const recipePath = `services/analytics-first-purchase/${label === 'baseline' ? 'compatibility-baseline.json' : 'package.json'}`;
    const recipeBytes = await readFile(join(root, recipePath)), recipe = JSON.parse(recipeBytes);
    const stage = join(directory, 'stages', label), target = join(directory, 'pair', label);
    await mkdir(stage, { recursive: true }); await mkdir(target, { recursive: true });
    const files = {}, sourceFiles = source.sources.find(row => row.commit === source[label]).files;
    async function add(name, bytes, spec) {
      await mkdir(dirname(join(stage, name)), { recursive: true });
      await writeFile(join(stage, name), bytes);
      files[name] = { ...spec, sha256: hash(bytes), bytes: bytes.length };
    }
    for (const [name, spec] of Object.entries(recipe.files)) {
      const bytes = spec.role === 'code' ? Buffer.from(`# validator fixture ${label} ${name}\n`) : await readFile(join(root, spec.source));
      if (spec.role === 'code') sourceFiles[spec.source] = hash(bytes);
      await add(name, bytes, spec);
    }
    await add('openapi.json', Buffer.from(JSON.stringify({ openapi: '3.1.0', info: {
      title: 'Verifier fixture', version: 'analytics-first-purchase-saved-analysis/v1' }, paths: {} })),
    { source: 'backend/analytics_first_purchase_analysis_app.py', role: 'contract' });
    await add('requirements.lock', Buffer.from(Object.entries(recipe.dependencies).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, pin]) => `${name}==${pin}\n`).join('')), { source: recipePath, role: 'lock' });
    const packaging = { commit: 'c'.repeat(40), worktree_dirty: true, inputs_manifest: recipePath, inputs_sha256: hash(recipeBytes) };
    const serviceSource = { commit: source[label], requirements_sha256: 'e'.repeat(64), scope: 'exact-git-code-current-packaging' };
    const manifest = { ...recipe, schema_version: 'shinemage-service-package/v1', files,
      source: packaging, service_source: serviceSource, release_ready: false };
    await json(join(stage, 'service-manifest.json'), manifest);
    const receipt = { schema_version: 'shinemage-service-candidate/v1', domain: recipe.domain, name: recipe.name,
      version: recipe.version, artifact: `${recipe.name}-${recipe.version}.tar.zst`, sha256: '0'.repeat(64), bytes: 1,
      manifest_sha256: '0'.repeat(64), source: packaging, service_source: serviceSource,
      release_ready: false, supply_chain: 'NOT_RUN', installation: 'NOT_RUN', activation: 'NOT_RUN' };
    await json(join(target, 'candidate-receipt.json'), receipt);
    artifacts[label] = { ...receipt, installed: { python: '3.14.4', dependencies: recipe.dependencies,
      mode: 'offline-hashed-wheel-install', wheels: Object.fromEntries(Object.entries(recipe.dependencies)
        .map(([name, version]) => [name, { version, file: `${name.replaceAll('-', '_')}-${version}-py3-none-any.whl`, sha256: 'd'.repeat(64) }])) } };
  }
  const sourceJson = JSON.stringify(source) + '\n'; binding.evidence_sha256 = hash(sourceJson);
  await writeFile(join(directory, 'source-evidence.json'), sourceJson);
  const pair = { schema_version: 'shinemage-service-artifact-compatibility/v1', status: 'PASS', scope: SERVICE_ARTIFACT_SCOPE,
    release_ready: false, activation: 'BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED', platform: { system: 'Darwin', machine: 'arm64' },
    baseline: source.baseline, candidate: source.candidate, runtime_mode: 'separate-offline-hashed-wheel-install', artifacts,
    observations: SERVICE_CASES.map(name => ({ case: name, status: 'PASS',
      ...(name === 'old-readonly' || name.endsWith('unknown-schema') ? { database_unchanged: true } : {}),
      ...(name.endsWith('unknown-schema') ? { rejected: true } : {}) })),
    verifiers: Object.fromEntries(await Promise.all(SERVICE_ARTIFACT_INPUTS.map(async path => [path, hash(await readFile(join(root, path)))]))),
    seed: { source: source.baseline, scope: 'exact-source-synthetic-worker-outside-service-packages' }, compatibility: source.compatibility };
  await json(join(directory, 'pair/receipt.json'), pair);
  for (const label of ['baseline', 'candidate']) await repackServiceFixture(directory, label);
  await mkdir(join(directory, 'plugin/lib'), { recursive: true });
  await json(join(directory, 'plugin/package.json'), { name: '@shine-mage/test-plugin', version: '0.1.0',
    type: 'module', packageManager: `pnpm@${PNPM_VERSION}`, files: ['lib/'], peerDependencies: { '@deepseek-ai/dsh-tools': DSH_SDK_VERSION } });
  await writeFile(join(directory, 'plugin/lib/index.js'), 'export {};\n');
  await writeFile(join(directory, 'plugin/build.mjs'), 'export {};\n');
  await json(join(directory, 'profile.json'), { schema_version: 'dsh-profile/v1', profile_id: 'service-test',
    dsh: { sdk_version: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA }, service_binding: binding,
    plugins: [{ id: '@shine-mage/test-plugin', path: 'plugin', enabled: true, build: 'build.mjs' }] });
  for (const args of [['init', '-q'], ['config', 'user.email', 'fixture@example.invalid'], ['config', 'user.name', 'fixture'],
    ['add', 'plugin', 'profile.json'], ['commit', '-qm', 'isolated service verifier fixture']]) await exec('git', args, { cwd: directory });
  await createPluginCandidate({ root: directory, plugin: join(directory, 'plugin'), outputDir: join(directory, 'candidate'),
    statePath: join(directory, 'state.json'), profileManifest: 'profile.json', serviceEvidencePath: join(directory, 'source-evidence.json') });
}
