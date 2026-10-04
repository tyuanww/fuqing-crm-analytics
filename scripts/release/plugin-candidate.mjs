#!/usr/bin/env node

/**
 * Local plugin candidate adapter (T21, first slice).
 *
 * It owns only pack + receipt generation. Host activation, remote receive,
 * restart and rollback are deliberately represented as NOT_RUN/NOT_AVAILABLE
 * until their separate evidence gates are complete.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { capabilityMatrix } from './action-contract.mjs';
import { packPlugin } from './plugin-pack.mjs';
import { loadReleaseProfile } from './profile.mjs';
import { recordEvent } from './state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHA256 = /^[a-f0-9]{64}$/;

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function absolute(value, code) {
  assert.equal(typeof value, 'string', code);
  assert.ok(value.startsWith('/') && !value.includes('..'), code);
  return resolve(value);
}
function relativePath(from, to, code) {
  const value = relative(from, to).split(sep).join('/');
  assert.ok(value && !value.startsWith('../') && value !== '..' && !value.includes('\\'), code);
  return value;
}
async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  const { rename, rm } = await import('node:fs/promises');
  try { await rename(temp, path); } catch (error) { await rm(temp, { force: true }); throw error; }
}

function profileDiff(current, previous) {
  if (!previous) return { status: 'NOT_RUN', reason: 'no --previous-profile supplied', added: [], removed: [], reordered: false };
  const currentIds = current.plugins.map(item => item.id);
  const previousIds = previous.plugins.map(item => item.id);
  return {
    status: 'PASS',
    added: currentIds.filter(id => !previousIds.includes(id)),
    removed: previousIds.filter(id => !currentIds.includes(id)),
    reordered: currentIds.some((id, index) => previousIds[index] !== id),
  };
}

export async function createPluginCandidate({ root: candidateRoot = root, plugin, outputDir, statePath, profileManifest = null, previousProfile = null } = {}) {
  const repo = resolve(candidateRoot);
  const pluginRoot = absolute(plugin, 'PLUGIN_CANDIDATE_PLUGIN_REQUIRED');
  const destination = absolute(outputDir, 'PLUGIN_CANDIDATE_OUTPUT_REQUIRED');
  const journal = absolute(statePath, 'PLUGIN_CANDIDATE_STATE_PATH_REQUIRED');
  const pluginPath = relativePath(repo, pluginRoot, 'PLUGIN_CANDIDATE_PLUGIN_OUTSIDE_ROOT');
  const profile = await loadReleaseProfile({ root: repo, manifestPath: profileManifest });
  const selected = profile.plugins.find(item => item.path === pluginPath);
  assert.ok(selected, `PLUGIN_CANDIDATE_NOT_ALLOWLISTED ${pluginPath}`);
  assert.equal(selected.enabled, true, 'PLUGIN_CANDIDATE_DISABLED');
  // Bind the explicit CLI path to the profile's canonical path. A lexical
  // match alone could let a parent symlink redirect packing to an unreviewed
  // directory while still selecting an allowlisted profile entry.
  const pluginReal = await realpath(pluginRoot).catch(error => { throw new Error(`PLUGIN_CANDIDATE_PLUGIN_PATH_INVALID ${error.code ?? 'unavailable'}`); });
  const profilePluginReal = await realpath(resolve(repo, selected.path)).catch(error => { throw new Error(`PLUGIN_CANDIDATE_PROFILE_PATH_INVALID ${error.code ?? 'unavailable'}`); });
  assert.equal(pluginReal, profilePluginReal, 'PLUGIN_CANDIDATE_PLUGIN_PATH_MISMATCH');
  // Validate all read-only inputs before producing a package.
  const prior = previousProfile ? await loadReleaseProfile({ root: repo, manifestPath: previousProfile }) : null;
  await access(destination).catch(async error => { if (error.code !== 'ENOENT') throw error; await mkdir(destination, { recursive: true, mode: 0o700 }); });
  assert.equal((await readdir(destination)).length, 0, 'PLUGIN_CANDIDATE_OUTPUT_MUST_BE_EMPTY');
  const packReceipt = await packPlugin({ plugin: pluginReal, outputDir: destination, manifestPath: resolve(destination, 'plugin-pack.json') });
  assert.match(packReceipt.tarball.sha256, SHA256, 'PLUGIN_CANDIDATE_PACK_DIGEST_INVALID');
  // Carry the exact allowlist with the candidate. Host verification must not
  // re-read a mutable workspace profile or rewrite this immutable receipt.
  assert.equal(createHash('sha256').update(profile.contents).digest('hex'), profile.digest, 'PLUGIN_CANDIDATE_PROFILE_ENCODING');
  await writeFile(resolve(destination, 'profile.json'), profile.contents, { mode: 0o600, flag: 'wx' });
  const capabilities = capabilityMatrix();
  const candidateBase = {
    schema_version: 'dsh-plugin-candidate/v1',
    profile_id: profile.profile.profile_id,
    profile_digest: profile.digest,
    profile_snapshot: { name: 'profile.json', sha256: profile.digest },
    plugin: { id: selected.id, path: selected.path, version: packReceipt.package_version, dsh_pin: packReceipt.dsh_pin },
    source_sha: packReceipt.source_sha,
    pack: { name: packReceipt.tarball.name, sha256: packReceipt.tarball.sha256, bytes: packReceipt.tarball.bytes },
    capabilities,
    profile_diff: profileDiff(profile.profile, prior?.profile),
    canary: { status: 'NOT_RUN', reason: 'host activation is a separate gate' },
    rollback: { status: 'NOT_RUN', reason: 'host activation is a separate gate' },
    next_commands: {
      receive: { status: 'NOT_AVAILABLE', reason: 'plugin candidate receive adapter is not connected; do not pass this tarball to release receive' },
      verify: 'pnpm dsh verify --scope local',
    },
  };
  const candidate = { ...candidateBase, candidate_digest: digest(candidateBase), activation: 'NOT_RUN', state_scope: 'local-explicit-journal' };
  const releaseTag = `dsh-plugin-${selected.id.replace(/^@/, '').replaceAll('/', '-')}-${packReceipt.package_version}`;
  const candidateKey = digest([selected.id, packReceipt.package_version]);
  const receiptPath = resolve(destination, 'candidate.json');
  const pendingPath = resolve(destination, 'candidate.pending.json');
  // The intent is durable before any receipt file becomes visible. A later
  // prepared event is written only after the final receipt has been renamed
  // into place, so the journal cannot claim success before the file exists.
  await recordEvent(journal, {
    release_tag: releaseTag,
    status: 'CANDIDATE_INTENT',
    plugin_id: selected.id,
    candidate_digest: candidate.candidate_digest,
    profile_digest: profile.digest,
    pack_sha256: packReceipt.tarball.sha256,
  }, { idempotencyKey: `candidate-intent:${candidateKey}` });
  await writeAtomic(pendingPath, candidate);
  await rename(pendingPath, receiptPath);
  try {
    await recordEvent(journal, {
      release_tag: releaseTag,
      status: 'CANDIDATE_PREPARED',
      plugin_id: selected.id,
      candidate_digest: candidate.candidate_digest,
      profile_digest: profile.digest,
      pack_sha256: packReceipt.tarball.sha256,
    }, { idempotencyKey: `candidate:${candidateKey}` });
  } catch (error) {
    // Make an uncommitted receipt visibly pending so operators cannot mistake
    // it for a candidate accepted by the durable journal.
    await rename(receiptPath, pendingPath).catch(() => {});
    throw error;
  }
  return candidate;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log('Usage: pnpm dsh plugin candidate --plugin /absolute/plugin --output-dir /absolute/output --state-path /absolute/state.json [--profile /relative/profile.json] [--previous-profile /relative/profile.json]');
    } else {
      const candidate = await createPluginCandidate({ plugin: option('--plugin'), outputDir: option('--output-dir'), statePath: option('--state-path'), profileManifest: option('--profile'), previousProfile: option('--previous-profile') });
      console.log(JSON.stringify(candidate, null, 2));
    }
  } catch (error) {
    console.error(`DSH_PLUGIN_CANDIDATE_ERROR ${error?.message ?? String(error)}`);
    process.exitCode = 2;
  }
}
