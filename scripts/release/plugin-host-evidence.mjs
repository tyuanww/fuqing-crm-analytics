/** Local host observations attach to the existing candidate journal, never activate it. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdtemp, open, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { validateProfile } from './profile.mjs';
import { readState, recordEvent } from './state.mjs';
import { validateServiceGate } from './service-compatibility.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA, NODE_MAJOR } from './toolchain.mjs';
import { BROWSER_HOST_SCHEMA, verifyBrowserHostEvidence } from './browser-host-evidence.mjs';
import { RUNTIME_HOST_SCHEMA, verifyRuntimeHostEvidence } from './runtime-host-evidence.mjs';
import { TERMINAL_HOST_SCHEMA, verifyTerminalHostEvidence } from './terminal-host-evidence.mjs';

export const HOST_EVIDENCE_SCHEMA = 'dsh-pinned-host-acceptance/v2';
export const HOST_SCOPE = 'owned-loopback-real-host-synthetic-model-and-session';
export const HOST_INPUTS = Object.freeze(['scripts/dsh-b0/pinned-host-acceptance.mjs', 'scripts/dsh-b0/pinned-host-observer.mjs',
  'scripts/crm-calibration/prepare-profile.mjs', 'scripts/release/secure-unpack.py', 'scripts/release/plugin-host-evidence.mjs']);
export const HOST_SCENARIOS = Object.freeze(['profile-load', 'loaded-composition-reconcile', 'domain-tools',
  'native-loop-and-durable-session', 'controlled-restart-session-replay', 'retired-preset-retains-live-session',
  'inflight-crash-durable-prefix-replay', 'blocking-plugin-requires-process-restart', 'native-fallback-restart',
  'restore-previous-pinned-profile']);
const root = fileURLToPath(new URL('../..', import.meta.url));
const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
const HEX = /^[a-f0-9]{64}$/;
const SOURCE = /^[a-f0-9]{40}$/;
const DOMAINS = Object.freeze([
  { key: 'crm-knowledge', asset: 'crm', id: '@shine-mage/dsh-crm-knowledge' },
  { key: 'knowledge', asset: 'knowledge', id: '@shine-mage/dsh-knowledge' },
]);

async function boundedFile(path, max = 1024 * 1024, allowEmpty = false) {
  // O_NOFOLLOW alone still waits forever when the input is a FIFO. Open
  // nonblocking, then require a regular file on the same descriptor.
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    assert.ok(info.isFile() && info.size >= (allowEmpty ? 0 : 1) && info.size <= max, 'PLUGIN_HOST_FILE_INVALID');
    // A growing file cannot turn a size-checked read into an unbounded read.
    const bytes = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    assert.equal(offset, info.size, 'PLUGIN_HOST_FILE_CHANGED');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}
async function inside(directory, name, max, allowEmpty = false) {
  assert.ok(typeof name === 'string' && name && !isAbsolute(name) && !name.split(/[\\/]/).some(p => !p || p === '.' || p === '..'), 'PLUGIN_HOST_FILE_PATH_INVALID');
  const physical = await realpath(directory), path = join(directory, name);
  const target = await realpath(path);
  assert.ok(target.startsWith(physical + sep), 'PLUGIN_HOST_FILE_OUTSIDE_ROOT');
  return boundedFile(path, max, allowEmpty);
}
const decode = bytes => JSON.parse(bytes.toString('utf8'));
function checkPack(pack) {
  assert.ok(pack && typeof pack.name === 'string' && pack.name === basename(pack.name) && pack.name.endsWith('.tgz'), 'PLUGIN_HOST_PACK_NAME_INVALID');
  assert.match(pack.sha256 ?? '', HEX, 'PLUGIN_HOST_PACK_DIGEST_INVALID');
  assert.ok(Number.isSafeInteger(pack.bytes) && pack.bytes > 0 && pack.bytes <= 20 * 1024 * 1024, 'PLUGIN_HOST_PACK_SIZE_INVALID');
}
async function packBytes(directory, pack, prefix = '') {
  checkPack(pack);
  const bytes = await inside(directory, prefix + pack.name, 20 * 1024 * 1024);
  assert.equal(bytes.length, pack.bytes, 'PLUGIN_HOST_PACK_SIZE_MISMATCH');
  assert.equal(hash(bytes), pack.sha256, 'PLUGIN_HOST_PACK_DIGEST_MISMATCH');
  return bytes;
}

async function verifyInstalledPack(evidenceRoot, domain, bytes) {
  const work = await mkdtemp(join(tmpdir(), 'plugin-host-unpack-'));
  try {
    // Verify the already hashed bytes, not a second read of a mutable archive.
    const archive = join(work, 'package.tgz'), extracted = join(work, 'extracted');
    await writeFile(archive, bytes, { mode: 0o600, flag: 'wx' });
    await exec('python3', [join(root, 'scripts/release/secure-unpack.py'), archive, extracted,
      '--max-entries', '100', '--max-bytes', '4194304'], { cwd: root, timeout: 30000, maxBuffer: 256 * 1024 });
    assert.deepEqual(await readdir(extracted), ['package'], 'PLUGIN_HOST_PACK_ROOT_INVALID');
    const installed = join(evidenceRoot, 'installed', domain, 'package');
    async function compare(relative = '') {
      const expected = await readdir(join(extracted, 'package', relative), { withFileTypes: true });
      const actual = (await readdir(join(installed, relative))).filter(name => relative || name !== 'node_modules');
      // The runner alone supplies the SDK peer link at package/node_modules.
      // All package-owned files, including non-entry assets, must match.
      assert.deepEqual(actual.sort(), expected.map(row => row.name).sort(), 'PLUGIN_HOST_INSTALLED_PACK_MISMATCH');
      for (const row of expected) {
        const name = relative ? relative + '/' + row.name : row.name;
        if (row.isDirectory()) await compare(name);
        else {
          const original = await boundedFile(join(extracted, 'package', name), 4 * 1024 * 1024, true);
          const observed = await inside(evidenceRoot, `installed/${domain}/package/${name}`, 4 * 1024 * 1024, true);
          assert.equal(hash(observed), hash(original), 'PLUGIN_HOST_INSTALLED_PACK_MISMATCH');
        }
      }
    }
    await compare();
  } finally { await rm(work, { recursive: true, force: true }); }
}

/** Reuses bounded unpacking in a private temporary directory. No host/HTTP/model is started. */
export async function verifyPluginHost({ candidatePath, evidencePath, statePath } = {}) {
  for (const path of [candidatePath, evidencePath, statePath]) assert.ok(typeof path === 'string' && isAbsolute(path), 'PLUGIN_HOST_ABSOLUTE_PATH_REQUIRED');
  const envelopeBytes = await boundedFile(evidencePath, 2 * 1024 * 1024);
  if (decode(envelopeBytes).schema_version === TERMINAL_HOST_SCHEMA) {
    return verifyTerminalHostEvidence({ candidatePath, evidencePath, statePath, envelopeBytes });
  }
  if (decode(envelopeBytes).schema_version === BROWSER_HOST_SCHEMA) {
    return verifyBrowserHostEvidence({ candidatePath, evidencePath, statePath, envelopeBytes });
  }
  if (decode(envelopeBytes).schema_version === RUNTIME_HOST_SCHEMA) {
    return verifyRuntimeHostEvidence({ candidatePath, evidencePath, statePath, envelopeBytes });
  }
  const candidate = decode(await boundedFile(candidatePath));
  assert.equal(candidate.schema_version, 'dsh-plugin-candidate/v1', 'PLUGIN_HOST_CANDIDATE_SCHEMA');
  assert.equal(candidate.activation, 'NOT_RUN', 'PLUGIN_HOST_CANDIDATE_ACTIVATION');
  assert.equal(candidate.state_scope, 'local-explicit-journal', 'PLUGIN_HOST_CANDIDATE_STATE_SCOPE');
  const { candidate_digest: candidateDigest, activation: _activation, state_scope: _scope, ...base } = candidate;
  assert.match(candidateDigest ?? '', HEX, 'PLUGIN_HOST_CANDIDATE_DIGEST_INVALID');
  assert.equal(candidateDigest, digest(base), 'PLUGIN_HOST_CANDIDATE_DIGEST_MISMATCH');
  assert.match(candidate.source_sha ?? '', SOURCE, 'PLUGIN_HOST_CANDIDATE_SOURCE_INVALID');
  assert.deepEqual(candidate.profile_snapshot, { name: 'profile.json', sha256: candidate.profile_digest }, 'PLUGIN_HOST_PROFILE_SNAPSHOT_REQUIRED');
  const directory = dirname(candidatePath);
  const profileBytes = await inside(directory, 'profile.json', 256 * 1024);
  assert.equal(hash(profileBytes), candidate.profile_digest, 'PLUGIN_HOST_PROFILE_DIGEST_MISMATCH');
  const profile = decode(profileBytes); validateProfile(profile);
  assert.equal(profile.profile_id, candidate.profile_id, 'PLUGIN_HOST_PROFILE_ID_MISMATCH');
  if (Object.hasOwn(profile, 'service_binding')) {
    await validateServiceGate(candidate.service_compatibility, profile.service_binding);
  } else {
    assert.equal(candidate.service_compatibility, undefined, 'SERVICE_PROFILE_BINDING_MISMATCH');
  }
  // This exact drill covers only the approved CRM + knowledge slice. It
  // cannot certify an entire seven-plugin profile from one package's PASS.
  assert.deepEqual(profile.plugins.map(p => p.id), DOMAINS.map(p => p.id), 'PLUGIN_HOST_PROFILE_SCOPE_MISMATCH');
  const selected = profile.plugins.find(p => p.id === candidate.plugin?.id);
  assert.ok(selected && selected.path === candidate.plugin.path, 'PLUGIN_HOST_PLUGIN_NOT_SELECTED');
  assert.equal(candidate.plugin.dsh_pin, DSH_SDK_VERSION, 'PLUGIN_HOST_CANDIDATE_DSH_MISMATCH');
  const pack = decode(await inside(directory, 'plugin-pack.json'));
  assert.equal(pack.schema_version, 'dsh-plugin-pack/v1', 'PLUGIN_HOST_PACK_SCHEMA');
  assert.equal(pack.package_name, candidate.plugin.id, 'PLUGIN_HOST_PACK_ID_MISMATCH');
  assert.equal(pack.package_version, candidate.plugin.version, 'PLUGIN_HOST_PACK_VERSION_MISMATCH');
  assert.equal(pack.dsh_pin, DSH_SDK_VERSION, 'PLUGIN_HOST_PACK_DSH_MISMATCH');
  assert.equal(pack.source_sha, candidate.source_sha, 'PLUGIN_HOST_PACK_SOURCE_MISMATCH');
  assert.equal(pack.source_dirty, false, 'PLUGIN_HOST_PACK_SOURCE_DIRTY');
  assert.deepEqual(pack.tarball, candidate.pack, 'PLUGIN_HOST_CANDIDATE_PACK_MISMATCH');
  await packBytes(directory, candidate.pack);

  const bytes = envelopeBytes, evidence = decode(bytes), evidenceRoot = dirname(evidencePath);
  assert.equal(evidence.schema, HOST_EVIDENCE_SCHEMA, 'PLUGIN_HOST_EVIDENCE_SCHEMA');
  assert.equal(evidence.overall, 'PASS', 'PLUGIN_HOST_EVIDENCE_NOT_PASS');
  assert.ok(!evidence.error && (!evidence.cleanup_errors || evidence.cleanup_errors.length === 0), 'PLUGIN_HOST_EVIDENCE_FAILED_CLEANUP');
  assert.equal(evidence.scope, HOST_SCOPE, 'PLUGIN_HOST_EVIDENCE_SCOPE');
  assert.equal(evidence.dsh?.version, DSH_SDK_VERSION, 'PLUGIN_HOST_DSH_VERSION_MISMATCH');
  assert.equal(evidence.dsh?.upstream_sha, DSH_UPSTREAM_SHA, 'PLUGIN_HOST_DSH_SHA_MISMATCH');
  assert.match(evidence.dsh?.cli_sha256 ?? '', HEX, 'PLUGIN_HOST_RUNTIME_DIGEST_REQUIRED');
  assert.ok(['darwin', 'linux'].includes(evidence.platform?.os) && ['arm64', 'x64'].includes(evidence.platform?.arch), 'PLUGIN_HOST_PLATFORM_INVALID');
  assert.equal(Number(evidence.platform.node?.split('.')[0]), NODE_MAJOR, 'PLUGIN_HOST_NODE_MISMATCH');
  assert.deepEqual(Object.keys(evidence.inputs ?? {}).sort(), [...HOST_INPUTS].sort(), 'PLUGIN_HOST_SOURCE_INPUTS_MISMATCH');
  for (const name of HOST_INPUTS) assert.equal(hash(await boundedFile(join(root, name))), evidence.inputs[name], 'PLUGIN_HOST_VERIFIER_SOURCE_DRIFT');
  assert.ok(Array.isArray(evidence.rows), 'PLUGIN_HOST_SCENARIOS_REQUIRED');
  assert.deepEqual(evidence.rows.map(row => row.id), HOST_SCENARIOS, 'PLUGIN_HOST_SCENARIOS_MISMATCH');
  for (const row of evidence.rows) assert.equal(row.status, 'PASS', 'PLUGIN_HOST_SCENARIO_NOT_PASS');
  for (const id of ['profile-load', 'restore-previous-pinned-profile']) {
    assert.equal(evidence.rows.find(row => row.id === id).crm_identity, 'shinemage-knowledge-access/v1', 'PLUGIN_HOST_IDENTITY_NOT_VERIFIED');
  }
  const assetsBytes = await inside(evidenceRoot, 'assets/manifest.json');
  assert.deepEqual(evidence.profile_assets, { name: 'assets/manifest.json', sha256: hash(assetsBytes) }, 'PLUGIN_HOST_PROFILE_ASSETS_MISMATCH');
  const assets = decode(assetsBytes);
  assert.equal(assets.schema, 'crm-profile-assets/v3', 'PLUGIN_HOST_ASSET_SCHEMA');
  assert.deepEqual(assets.preset_loader, { contract: 'dsh-agent-preset-declaration/v1', id: 'crm-knowledge', patch: 'preset.patch.yml' }, 'PLUGIN_HOST_PRESET_LOADER');
  const assetNames = ['host.patch.yml', 'preset.patch.yml', 'preset/preset.yml', 'preset/agent.cordis.yml'];
  assert.deepEqual(assets.writes, assetNames, 'PLUGIN_HOST_ASSET_ALLOWLIST_MISMATCH');
  assert.deepEqual(Object.keys(assets.sha256 ?? {}).sort(), [...assetNames].sort(), 'PLUGIN_HOST_ASSET_ALLOWLIST_MISMATCH');
  assert.equal(assets.graph_configured, false, 'PLUGIN_HOST_UNTESTED_GRAPH');
  assert.equal(assets.page_delivery?.status, 'NOT_AVAILABLE', 'PLUGIN_HOST_UNTESTED_PAGE_PROVIDER');
  assert.deepEqual(Object.keys(evidence.packages ?? {}).sort(), DOMAINS.map(d => d.key).sort(), 'PLUGIN_HOST_PACKAGE_SET_MISMATCH');
  assert.deepEqual(Object.keys(assets.packages ?? {}).sort(), DOMAINS.map(d => d.asset).sort(), 'PLUGIN_HOST_ASSET_PACKAGE_SET_MISMATCH');
  const composition = ['@deepseek-ai/dsh-persona'], tested = [];
  for (const domain of DOMAINS) {
    const testedPack = evidence.packages[domain.key], asset = assets.packages[domain.asset];
    assert.equal(testedPack.package_name, domain.id, 'PLUGIN_HOST_TESTED_PACKAGE_ID_MISMATCH');
    assert.equal(testedPack.package_version, asset.version, 'PLUGIN_HOST_TESTED_PACKAGE_VERSION_MISMATCH');
    assert.equal(asset.name, domain.id, 'PLUGIN_HOST_ASSET_PACKAGE_ID_MISMATCH');
    assert.ok(typeof asset.root === 'string' && isAbsolute(asset.root), 'PLUGIN_HOST_ASSET_ROOT_INVALID');
    assert.match(testedPack.source_sha ?? '', SOURCE, 'PLUGIN_HOST_TESTED_SOURCE_REQUIRED');
    assert.equal(hash(JSON.stringify(asset.entries)), asset.sha256, 'PLUGIN_HOST_ENTRY_SET_MISMATCH');
    const expectedEntries = domain.asset === 'crm' ? ['package.json', 'lib/index.js', 'lib/host.js', 'lib/client.js'] : ['package.json', 'lib/index.js', 'lib/graph-tools.js'];
    assert.deepEqual(Object.keys(asset.entries), expectedEntries, 'PLUGIN_HOST_ENTRY_ALLOWLIST_MISMATCH');
    for (const [name, sha256] of Object.entries(asset.entries)) {
      assert.equal(hash(await inside(evidenceRoot, `installed/${domain.key}/package/${name}`, 16 * 1024 * 1024)), sha256, 'PLUGIN_HOST_INSTALLED_ENTRY_CHANGED');
    }
    const archive = await packBytes(evidenceRoot, testedPack, `packs/${domain.key}/`);
    await verifyInstalledPack(evidenceRoot, domain.key, archive);
    const module = pathToFileURL(join(asset.root, 'lib/index.js')); module.searchParams.set('build', asset.sha256); composition.push(module.href);
    if (domain.id === candidate.plugin.id) {
      assert.equal(testedPack.source_sha, candidate.source_sha, 'PLUGIN_HOST_TESTED_SOURCE_MISMATCH');
      assert.equal(testedPack.package_version, candidate.plugin.version, 'PLUGIN_HOST_TESTED_VERSION_MISMATCH');
      assert.equal(testedPack.sha256, candidate.pack.sha256, 'PLUGIN_HOST_TESTED_PACK_MISMATCH');
      assert.equal(testedPack.bytes, candidate.pack.bytes, 'PLUGIN_HOST_TESTED_PACK_SIZE_MISMATCH');
    }
    tested.push({ id: domain.id, version: testedPack.package_version, source_sha: testedPack.source_sha, sha256: testedPack.sha256 });
  }
  const observed = evidence.rows.find(row => row.id === 'loaded-composition-reconcile');
  assert.deepEqual(observed.modules, composition, 'PLUGIN_HOST_COMPOSITION_MISMATCH');
  assert.equal(observed.digest, digest(composition), 'PLUGIN_HOST_COMPOSITION_DIGEST_MISMATCH');
  for (const [name, sha256] of Object.entries(assets.sha256)) assert.equal(hash(await inside(evidenceRoot, `assets/${name}`)), sha256, 'PLUGIN_HOST_PROFILE_FILE_CHANGED');
  assert.ok(Array.isArray(evidence.session_files) && evidence.session_files.length > 0 && evidence.session_files.length <= 100, 'PLUGIN_HOST_SESSION_REQUIRED');
  assert.deepEqual(Object.keys(evidence.session_sha256 ?? {}).sort(), [...evidence.session_files].sort(), 'PLUGIN_HOST_SESSION_DIGESTS_REQUIRED');
  for (const name of evidence.session_files) {
    assert.ok(typeof name === 'string' && /\.jsonl(?:\.zstd)?$/.test(name), 'PLUGIN_HOST_SESSION_FILE_INVALID');
    assert.equal(hash(await inside(evidenceRoot, `dsh-home/sessions/${name}`, 8 * 1024 * 1024)), evidence.session_sha256[name], 'PLUGIN_HOST_SESSION_CHANGED');
  }

  const journal = await readState(statePath);
  const key = digest([candidate.plugin.id, candidate.plugin.version]);
  const prepared = journal.idempotency[`candidate:${key}`];
  assert.ok(prepared?.status === 'COMMITTED' && prepared.result?.status === 'CANDIDATE_PREPARED', 'PLUGIN_HOST_CANDIDATE_NOT_PREPARED');
  for (const [field, value] of Object.entries({ candidate_digest: candidateDigest, profile_digest: candidate.profile_digest, pack_sha256: candidate.pack.sha256 })) {
    assert.equal(prepared.result[field], value, 'PLUGIN_HOST_JOURNAL_CANDIDATE_MISMATCH');
  }
  const evidenceDigest = hash(bytes);
  const event = await recordEvent(statePath, { release_tag: prepared.result.release_tag, status: 'CANDIDATE_HOST_VERIFIED',
    candidate_digest: candidateDigest, profile_digest: candidate.profile_digest, pack_sha256: candidate.pack.sha256,
    host_evidence_sha256: evidenceDigest, observation: { scope: HOST_SCOPE, platform: evidence.platform,
      dsh: evidence.dsh, tested_plugins: tested, scenario_count: HOST_SCENARIOS.length,
      tested_composition_digest: digest(tested), verified_plugin: candidate.plugin.id,
      activation: 'NOT_RUN', release_ready: false, service_state: 'NOT_RUN',
      limitations: ['Local synthetic model/session only; no browser or production UAT.',
        'Only the selected candidate is verified, within this exact companion-package composition.',
        'No signed runtime, production journal activation, service rollback or cross-platform certification.'] } },
  { idempotencyKey: `candidate-host:${candidateDigest}:${evidenceDigest}` });
  return { status: 'LOCAL_HOST_VERIFIED', candidate_digest: candidateDigest, host_evidence_sha256: evidenceDigest,
    journal_seq: event.seq, journal_digest: event.digest, ...event.observation };
}
