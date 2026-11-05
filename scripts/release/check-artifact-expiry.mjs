#!/usr/bin/env node
/**
 * Fail early when a tracked GitHub Actions artifact approaches its retention
 * deadline. b0 and the release preflight download author evidence and the
 * sealed composition artifact by id, so once one of them expires the failure
 * surfaces later as an opaque 404 during artifact fetch.
 *
 * The checked-in locks are the source of truth for the ids and repositories:
 *
 *   config/shinemage-composition-packs.lock.json   pins source SHAs only
 *   config/workbench-author-evidence.lock.json     archive.{repository,artifact_id}
 *   config/domain-author-evidence.lock.json        archive.{repository,artifact_id}
 *   config/public-contract-inputs.lock.json        owners.<name>.archive
 *   config/shinemage-composition-artifact.lock.json {repository,id}
 *
 * The pack lock carries no artifact id: the nine author formal-pack artifacts
 * are not pinned there, and their bytes are sealed into the composition
 * artifact. The script therefore resolves the six archived artifacts that the
 * locks actually name (five author evidence archives plus the sealed artifact)
 * through the GitHub REST API.
 *
 * Usage:
 *   GH_TOKEN=... node scripts/release/check-artifact-expiry.mjs
 *   GH_TOKEN=... node scripts/release/check-artifact-expiry.mjs --json
 *   GH_TOKEN=... node scripts/release/check-artifact-expiry.mjs --warn-days 14
 *   node scripts/release/check-artifact-expiry.mjs --offline fixture.json
 *
 * Exit codes:
 *   0  every artifact is farther away than --warn-days
 *   1  at least one artifact expires within --warn-days or is already past
 *   2  the locks could not be read or an expiry could not be resolved
 *
 * The default output is a markdown table so the workflow can copy it into
 * $GITHUB_STEP_SUMMARY unchanged. `--json` is for machines. `--offline`
 * reads expiries from a fixture instead of the API and never needs a token.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DAY_MS = 24 * 60 * 60 * 1000;
const API = 'https://api.github.com';
const DEFAULT_WARN_DAYS = 7;
const SCHEMA = 'shinemage-artifact-expiry/v1';

export const LOCK_FILES = Object.freeze([
  'config/shinemage-composition-packs.lock.json',
  'config/workbench-author-evidence.lock.json',
  'config/domain-author-evidence.lock.json',
  'config/public-contract-inputs.lock.json',
  'config/shinemage-composition-artifact.lock.json',
]);

const USAGE = `Usage: node scripts/release/check-artifact-expiry.mjs [options]

Options:
  --json                Print one JSON object instead of the table.
  --warn-days <n>       Warn when an artifact expires in <= n days (default ${DEFAULT_WARN_DAYS}).
  --offline <fixture>   Resolve expiries from a local fixture instead of the GitHub API.
  --help                Show this text.

Offline fixture shape (artifact ids are globally unique):

  {"artifacts": {"13416602588": {"expires_at": "2026-11-19T13:01:12Z", "expired": false}}}

or an array keyed by repository and id:

  {"artifacts": [{"repository": "tyuanww/dsh-analytics-workbench", "id": 13416602588,
                  "expires_at": "2026-11-19T13:01:12Z", "expired": false}]}
`;

function fail(code, message = '') {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    fail('LOCK_JSON_INVALID', `${path}: ${error.message}`);
  }
}

function artifactEntry(source, repository, id) {
  assert.equal(typeof repository, 'string', `ARTIFACT_REPOSITORY_REQUIRED ${source}`);
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, `ARTIFACT_REPOSITORY_INVALID ${source}`);
  assert.ok(Number.isSafeInteger(id) && id > 0, `ARTIFACT_ID_INVALID ${source}`);
  return { id, repository, source };
}

/**
 * Read every tracked lock and return the archived artifacts they name. The
 * `locks` array keeps the pack lock visible with a zero count so callers can
 * report exactly which inputs were inspected.
 */
export async function loadArtifacts({ root = ROOT } = {}) {
  const [packsPath, workbenchPath, domainPath, publicPath, compositionPath] = LOCK_FILES;
  const artifacts = [];
  const locks = [];
  const seen = new Set();

  const add = (entry, lockPath) => {
    const key = `${entry.repository}#${entry.id}`;
    if (seen.has(key)) fail('ARTIFACT_DUPLICATE', key);
    seen.add(key);
    artifacts.push(entry);
    const lock = locks.find(row => row.path === lockPath);
    lock.artifacts += 1;
  };
  const lock = path => {
    const row = { path, artifacts: 0 };
    locks.push(row);
    return row;
  };

  // The pack lock pins 9 plugin source SHAs plus the derived profiles. It has
  // no artifact id; the formal pack bytes travel inside the sealed artifact
  // below. Validate the shape so a schema change cannot silently empty the
  // check, then record the file as inspected with zero artifacts.
  const packs = await readJson(resolve(root, packsPath));
  assert.equal(packs.schema_version, 'shinemage-composition-pack-lock/v1', 'PACK_LOCK_SCHEMA');
  assert.ok(Array.isArray(packs.profiles) && packs.profiles.length > 0, 'PACK_LOCK_PROFILES');
  assert.ok(Array.isArray(packs.plugins) && packs.plugins.length > 0, 'PACK_LOCK_PLUGINS');
  lock(packsPath);

  const workbench = await readJson(resolve(root, workbenchPath));
  assert.equal(workbench.schema, 'shinemage-workbench-author-evidence/v1', 'WORKBENCH_LOCK_SCHEMA');
  lock(workbenchPath);
  add(artifactEntry(`${workbenchPath}#archive`, workbench.archive?.repository, workbench.archive?.artifact_id), workbenchPath);

  const domain = await readJson(resolve(root, domainPath));
  assert.equal(domain.schema, 'shinemage-domain-author-evidence/v1', 'DOMAIN_LOCK_SCHEMA');
  lock(domainPath);
  add(artifactEntry(`${domainPath}#archive`, domain.archive?.repository, domain.archive?.artifact_id), domainPath);

  const publicContracts = await readJson(resolve(root, publicPath));
  assert.equal(publicContracts.schema, 'shinemage-public-contract-inputs-lock/v1', 'PUBLIC_CONTRACT_LOCK_SCHEMA');
  assert.ok(publicContracts.owners && typeof publicContracts.owners === 'object', 'PUBLIC_CONTRACT_OWNERS');
  lock(publicPath);
  for (const [name, owner] of Object.entries(publicContracts.owners)) {
    add(artifactEntry(`${publicPath}#owners.${name}.archive`, owner.archive?.repository, owner.archive?.artifact_id), publicPath);
  }

  const composition = await readJson(resolve(root, compositionPath));
  assert.equal(composition.schema_version, 'dsh-composition-artifact/v1', 'COMPOSITION_LOCK_SCHEMA');
  lock(compositionPath);
  add(artifactEntry(`${compositionPath}#id`, composition.repository, composition.id), compositionPath);

  return { artifacts, locks };
}

async function fetchArtifact(entry, { token, fetchImpl = fetch, timeoutMs = 30_000 }) {
  if (!token) fail('GH_TOKEN_REQUIRED', 'set GH_TOKEN to a token with actions:read on the locked repositories');
  let response;
  try {
    response = await fetchImpl(`${API}/repos/${entry.repository}/actions/artifacts/${entry.id}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'fuqing-crm-analytics-artifact-expiry',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    fail('ARTIFACT_API_UNREACHABLE', `${entry.repository}#${entry.id}: ${error.message}`);
  }
  if (!response.ok) {
    fail(`ARTIFACT_HTTP_${response.status}`, `${entry.repository}#${entry.id} returned HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.id !== entry.id) fail('ARTIFACT_ID_MISMATCH', `${entry.repository}#${entry.id}: API returned ${body.id}`);
  if (typeof body.expires_at !== 'string') fail('ARTIFACT_EXPIRY_MISSING', `${entry.repository}#${entry.id}`);
  return { expires_at: body.expires_at, expired: body.expired === true };
}

async function loadOfflineFixture(path) {
  const fixture = await readJson(resolve(path));
  const rows = fixture?.artifacts ?? fixture;
  const map = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') fail('OFFLINE_FIXTURE_INVALID');
      map.set(`${row.repository ?? ''}#${row.id}`, row);
      if (row.id !== undefined) map.set(String(row.id), row);
    }
    return map;
  }
  if (rows && typeof rows === 'object') {
    for (const [key, row] of Object.entries(rows)) {
      if (!row || typeof row !== 'object') fail('OFFLINE_FIXTURE_INVALID', key);
      map.set(key, row);
    }
    return map;
  }
  fail('OFFLINE_FIXTURE_INVALID', `${path}: expected an object or array under "artifacts"`);
}

function offlineRow(entry, fixture) {
  const row = fixture.get(`${entry.repository}#${entry.id}`) ?? fixture.get(String(entry.id));
  if (!row) fail('OFFLINE_FIXTURE_MISSING', `${entry.repository}#${entry.id}`);
  if (typeof row.expires_at !== 'string') fail('OFFLINE_FIXTURE_EXPIRY', `${entry.repository}#${entry.id}`);
  return { ...entry, expires_at: row.expires_at, expired: row.expired === true };
}

/**
 * Turn resolved rows into the report shape. `days_remaining` is whole calendar
 * days: rounded up while the artifact is live so a 7.2-day expiry reports 8,
 * and floored once it is past so an expired artifact reports a negative day.
 */
export function evaluateArtifacts(rows, { warnDays = DEFAULT_WARN_DAYS, now = Date.now() } = {}) {
  return rows.map(row => {
    if (row.error) return { ...row, days_remaining: null, status: 'unknown' };
    const expiresAt = Date.parse(row.expires_at);
    const remaining = expiresAt - now;
    if (!Number.isFinite(remaining)) return { ...row, days_remaining: null, status: 'unknown', error: 'EXPIRY_INVALID' };
    const daysTelemetry = remaining <= 0 ? Math.floor(remaining / DAY_MS) : Math.ceil(remaining / DAY_MS);
    const status = row.expired === true || remaining <= 0
      ? 'expired'
      : remaining <= warnDays * DAY_MS ? 'warning' : 'ok';
    return { ...row, days_remaining: daysTelemetry, status };
  });
}

export function exitCodeFor(rows) {
  if (rows.some(row => row.status === 'unknown')) return 2;
  if (rows.some(row => row.status === 'warning' || row.status === 'expired')) return 1;
  return 0;
}

export function formatTable(rows) {
  const lines = [
    '| Artifact | Source | Expires (UTC) | Days remaining |',
    '| --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.id} | ${row.source} | ${row.expires_at ?? row.error ?? 'unknown'} | ${row.days_remaining ?? 'unknown'} |`),
  ];
  return lines.join('\n');
}

function footer(rows, code, warnDays) {
  const atRisk = rows.filter(row => row.status === 'warning' || row.status === 'expired').length;
  const unresolved = rows.filter(row => row.status === 'unknown').length;
  if (code === 2) return `ARTIFACT_EXPIRY_ERROR artifacts=${rows.length} unresolved=${unresolved} warn_days=${warnDays}`;
  if (code === 1) return `ARTIFACT_EXPIRY_ATTENTION artifacts=${rows.length} at_risk=${atRisk} warn_days=${warnDays}`;
  return `ARTIFACT_EXPIRY_OK artifacts=${rows.length} warn_days=${warnDays}`;
}

function parseArguments(argv) {
  const options = { json: false, warnDays: DEFAULT_WARN_DAYS, offline: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
    } else if (argument === '--warn-days') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--') || !/^\d+$/.test(value)) fail('WARN_DAYS_REQUIRED');
      options.warnDays = Number(value);
      index += 1;
    } else if (argument === '--offline') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail('OFFLINE_FIXTURE_REQUIRED');
      options.offline = value;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      fail('ARGUMENT_UNKNOWN', argument);
    }
  }
  return options;
}

async function resolveRows(entries, { offline, token, fetchImpl, now }) {
  if (offline) {
    const fixture = await loadOfflineFixture(offline);
    return entries.map(entry => {
      try {
        return offlineRow(entry, fixture);
      } catch (error) {
        return { ...entry, expires_at: null, expired: false, error: error.code ?? 'OFFLINE_FIXTURE_INVALID', detail: error.message };
      }
    });
  }
  const rows = [];
  for (const entry of entries) {
    try {
      rows.push({ ...entry, ...(await fetchArtifact(entry, { token, fetchImpl })) });
    } catch (error) {
      rows.push({ ...entry, expires_at: null, expired: false, error: error.code ?? 'ARTIFACT_API_FAILED', detail: error.message });
    }
  }
  return rows;
}

export async function main(argv = process.argv.slice(2), { fetchImpl = fetch, now = Date.now(), env = process.env } = {}) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (!options.offline && !env.GH_TOKEN) fail('GH_TOKEN_REQUIRED', 'set GH_TOKEN to a token with actions:read on the locked repositories');
  const { artifacts, locks } = await loadArtifacts();
  const rows = evaluateArtifacts(await resolveRows(artifacts, {
    offline: options.offline,
    token: env.GH_TOKEN,
    fetchImpl,
    now,
  }), { warnDays: options.warnDays, now });
  const code = exitCodeFor(rows);

  if (options.json) {
    console.log(JSON.stringify({
      schema: SCHEMA,
      checked_at: new Date(now).toISOString(),
      warn_days: options.warnDays,
      threshold_exceeded: rows.some(row => row.status === 'warning' || row.status === 'expired'),
      unresolved: rows.filter(row => row.status === 'unknown').length,
      exit_code: code,
      locks,
      artifacts: rows,
    }, null, 2));
  } else {
    console.log(formatTable(rows));
    console.log();
    console.log(footer(rows, code, options.warnDays));
  }
  return code;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(`${error.code ?? 'ARTIFACT_EXPIRY_FAILED'}${error.message && error.message !== error.code ? `: ${error.message}` : ''}`);
    process.exitCode = 2;
  });
}
