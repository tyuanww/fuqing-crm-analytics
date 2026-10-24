#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { inspectToolchain } from '../../dsh-plugins/plugin-kit/toolchain.mjs';
import { readPluginPack } from './plugin-pack.mjs';

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

async function git(upstream, args) {
  return (await exec('git', ['--no-optional-locks', '-C', upstream, ...args], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  })).stdout.trim();
}

export async function inspectCockpitReleaseContract({ root = ROOT, upstream = null, buildTools = null,
  artifactManifest = null } = {}) {
  const lanePath = join(root, 'config/dsh-rc1-release-lane.json');
  const lane = await json(lanePath);
  const defaultPin = await json(join(root, 'dsh-plugins/plugin-kit/toolchain.json'));
  const manifest = await json(join(root, 'dsh-plugins/analytics-workbench/package.json'));
  const lock = await readFile(join(root, 'dsh-plugins/analytics-workbench/pnpm-lock.yaml'), 'utf8');
  const clientEntry = await readFile(join(root, 'dsh-plugins/analytics-workbench/src/client/index.tsx'), 'utf8');

  assert.equal(lane.schema_version, 'shinemage-rc1-release-lane/v1');
  assert.equal(lane.sdk, '0.2.1-rc.1');
  assert.equal(lane.upstream_sha, '1600d8a1e140dcde43a1a0941940a0480712c011');
  assert.equal(lane.upstream_lock_sha256, '952ca2f79998660dc690b739078a5d6052bc7c5c2193714b918b9d720baaeaba');
  assert.equal(defaultPin.sdk_version, '0.2.1-rc.3');
  assert.equal(defaultPin.upstream_sha, '1f81c047fc48fa190a683e469daa699857e9afe8');
  assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-tools'], defaultPin.sdk_version);
  assert.doesNotMatch(clientEntry, /cockpit-composition/);
  assert.equal((clientEntry.match(/name:\s*'main',\s*key:\s*COCKPIT_PANEL_ID/g) ?? []).length, 1);
  await assert.rejects(access(join(root, 'dsh-plugins/analytics-workbench/src/client/cockpit-composition.mjs')),
    error => error?.code === 'ENOENT');
  assert.match(lock, /['"]?@deepseek-ai\/dsh-tools['"]?:[\s\S]*specifier: 0\.2\.1-rc\.3/);
  assert.match(lock, /['"]?@shine-mage\/board-components['"]?:[\s\S]*version: link:\.\.\/board-components/);
  assert.match(lock, /['"]?@shine-mage\/dsh-plugin-kit['"]?:[\s\S]*version: link:\.\.\/plugin-kit/);

  let buildInput = { status: 'NOT_RUN', reason: 'explicit rc1 upstream and build tools not provided' };
  if (upstream || buildTools) {
    assert.ok(upstream && isAbsolute(upstream), 'RC1_CONTRACT_UPSTREAM_REQUIRED');
    assert.ok(buildTools && isAbsolute(buildTools), 'RC1_CONTRACT_BUILD_TOOLS_REQUIRED');
    assert.equal(await git(upstream, ['rev-parse', 'HEAD']), lane.upstream_sha);
    assert.equal(await git(upstream, ['status', '--porcelain', '--untracked-files=no']), '');
    const lockDigest = createHash('sha256').update(await readFile(join(upstream, 'pnpm-lock.yaml'))).digest('hex');
    assert.equal(lockDigest, lane.upstream_lock_sha256);
    assert.equal((await json(join(upstream, 'package.json'))).packageManager, `pnpm@${lane.upstream_pnpm}`);
    assert.equal((await json(join(upstream, 'packages/core/tools/package.json'))).version, lane.sdk);

    const previous = process.env.DSH_RELEASE_LANE_CONFIG;
    process.env.DSH_RELEASE_LANE_CONFIG = lanePath;
    try {
      const inspected = await inspectToolchain(upstream, buildTools, null);
      assert.equal(inspected.pin.sdk_version, lane.sdk);
      assert.equal(inspected.pin.upstream_sha, lane.upstream_sha);
      buildInput = {
        status: 'PASS',
        sdk: inspected.pin.sdk_version,
        upstream_sha: inspected.pin.upstream_sha,
        upstream_lock_sha256: inspected.pin.upstream_lock_sha256,
        node_major: inspected.pin.node_major,
        plugin_pnpm: inspected.pin.pnpm,
        upstream_pnpm: inspected.pin.upstream_pnpm,
        typescript: inspected.pin.typescript,
        esbuild: inspected.pin.esbuild,
        react: inspected.pin.react,
        react_types: inspected.pin.react_types,
        node_types: inspected.pin.node_types,
        cordis: inspected.pin.cordis,
      };
    } finally {
      if (previous === undefined) delete process.env.DSH_RELEASE_LANE_CONFIG;
      else process.env.DSH_RELEASE_LANE_CONFIG = previous;
    }
  }

  let artifact = { status: 'NOT_RUN', reason: 'no candidate manifest/tarball was supplied to this read-only check' };
  if (artifactManifest) {
    assert.ok(isAbsolute(artifactManifest), 'RC1_CONTRACT_ARTIFACT_PATH');
    const bytes = await readFile(artifactManifest);
    const manifestSha256 = createHash('sha256').update(bytes).digest('hex');
    const received = await readPluginPack({
      manifestPath: artifactManifest,
      expectedSha256: manifestSha256,
      expectedSdkVersion: lane.sdk,
      expectedPnpmVersion: lane.plugin_pnpm,
      requireGeneratedProvenance: true,
    });
    const receipt = received.receipt;
    assert.equal(receipt.source_dsh_pin, defaultPin.sdk_version);
    assert.equal(receipt.source_sha, await git(root, ['rev-parse', 'HEAD']));
    assert.equal(receipt.source_dirty, false);
    assert.equal(receipt.generated_bytes_provenance.toolchain.sdk_version, lane.sdk);
    assert.equal(receipt.generated_bytes_provenance.toolchain.upstream_sha, lane.upstream_sha);
    artifact = {
      status: 'PASS',
      package_name: receipt.package_name,
      package_version: receipt.package_version,
      target_peer: received.manifest.peerDependencies['@deepseek-ai/dsh-tools'],
      source_peer: receipt.source_dsh_pin,
      source_sha: receipt.source_sha,
      manifest_sha256: manifestSha256,
      tarball: receipt.tarball,
      entries: receipt.entries,
      provenance_status: receipt.generated_bytes_provenance.status,
    };
  }
  return {
    schema_version: 'shinemage-cockpit-rc1-contract/v1',
    status: buildInput.status === 'PASS' ? 'PASS_LOCAL_BUILD_INPUTS' : 'PARTIAL_STATIC_ONLY',
    checked_at: new Date().toISOString(),
    default_compatibility: {
      status: 'PASS',
      sdk: defaultPin.sdk_version,
      upstream_sha: defaultPin.upstream_sha,
      plugin_peer: manifest.peerDependencies['@deepseek-ai/dsh-tools'],
      shell_form: 'full_screen_main_panel',
      shell_entry: 'main:cockpit',
    },
    rc1_release_lane: {
      status: buildInput.status,
      sdk: lane.sdk,
      upstream_sha: lane.upstream_sha,
      upstream_lock_sha256: lane.upstream_lock_sha256,
      build_input: buildInput,
      pack_contract: {
        status: 'PASS',
        source_peer: manifest.peerDependencies['@deepseek-ai/dsh-tools'],
        target_peer: lane.sdk,
        mechanism: 'packPlugin sdkVersion + sourceSdkVersion',
      },
    },
    artifact,
    runtime_profile: { status: 'NOT_RUN', reason: 'runtime/profile are separate target inputs and were not supplied' },
    formal_status: lane.formal_status,
  };
}

async function main() {
  const upstream = option('--upstream');
  const buildTools = option('--build-tools');
  const artifact = option('--artifact');
  const output = option('--output');
  const result = await inspectCockpitReleaseContract({
    upstream: upstream && resolve(upstream),
    buildTools: buildTools && resolve(buildTools),
    artifactManifest: artifact && resolve(artifact),
  });
  if (output) await writeFile(resolve(output), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
