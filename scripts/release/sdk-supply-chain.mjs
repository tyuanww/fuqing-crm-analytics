/** Explicit development-SDK inventory/advisory check; never a release authorization. */
import assert from 'node:assert/strict';
import { open, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closurePath, readClosureFile, sha256, verifySdkClosure } from '../../dsh-plugins/plugin-kit/sdk-closure.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const schema = 'shinemage-sdk-supply-chain/v1';
const endpoint = 'https://api.osv.dev/v1/querybatch';
const need = (ok, code) => assert.ok(ok, `SDK_SUPPLY_${code}`);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const packageName = value => typeof value === 'string' && value.length <= 214
  && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
const packageVersion = value => typeof value === 'string' && value.length <= 128
  && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
const property = (name, value) => ({ name: `shinemage:${name}`, value: String(value) });

// Inventory package instances, not dependency edges. Bundled/minified code may
// contain components without package.json; composition must remain incomplete.
export async function inventoryTree(root, manifest) {
  const packages = [], gaps = [], moduleScopes = [];
  for (const [path, row] of Object.entries(manifest.entries).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (row.kind !== 'file' || !path.endsWith('/package.json')) continue;
    closurePath(path);
    need(row.bytes <= 2 * 1024 ** 2, 'PACKAGE_LIMIT');
    const pkg = JSON.parse(await readClosureFile(join(root, path), row));
    need(object(pkg) && (pkg.private === undefined || typeof pkg.private === 'boolean'), 'PACKAGE_SCHEMA');
    if (!packageName(pkg.name) || !packageVersion(pkg.version)) {
      // Node module-scope markers are not unidentified third-party packages.
      // Keep them in the inventory without making up a name/version or query.
      if (!Object.hasOwn(pkg, 'name') && !Object.hasOwn(pkg, 'version') && ['module', 'commonjs'].includes(pkg.type)
        && Object.keys(pkg).every(k => ['type', 'main', 'module', 'types', 'sideEffects'].includes(k))) {
        moduleScopes.push({ path, manifest_sha256: row.sha256 }); continue;
      }
      gaps.push({ path, manifest_sha256: row.sha256, code: 'UNIDENTIFIED_PACKAGE_MANIFEST' }); continue;
    }
    const source = path.includes('/node_modules/') ? 'installed-package'
      : /^corepack\/v1\/pnpm\/[^/]+\/package.json$/.test(path) ? 'package-manager' : 'workspace-source';
    // A workspace name/version is not evidence that it was published to npm.
    // Exclude private:true and workspace declarations. This is not a registry
    // visibility lookup: --osv explicitly opts in to sending the remaining names.
    const queryable = source !== 'workspace-source' && pkg.private !== true;
    packages.push({ path, manifest_sha256: row.sha256, name: pkg.name, version: pkg.version,
      private: pkg.private === true, source, advisory_query_eligible: queryable,
      declared_license: typeof pkg.license === 'string' && pkg.license.length <= 256 && !/[\x00-\x1f\x7f]/.test(pkg.license) ? pkg.license : 'UNDECLARED',
      registry_integrity: 'NOT_VERIFIED', publisher_identity: 'NOT_VERIFIED' });
  }
  const identities = new Map();
  for (const pkg of packages.filter(p => p.advisory_query_eligible)) {
    const key = `${pkg.name}@${pkg.version}`;
    if (!identities.has(key)) identities.set(key, { package: { ecosystem: 'npm', name: pkg.name }, version: pkg.version });
  }
  return { packages, module_scope_manifests: moduleScopes, unidentified_manifests: gaps,
    advisory_queries: [...identities.values()].sort((a, b) => `${a.package.name}@${a.version}`.localeCompare(`${b.package.name}@${b.version}`, 'en')) };
}

export function cycloneDx(inventory, manifest, closureSha, timestamp) {
  const root = `urn:shinemage:sdk:${closureSha}`;
  return { bomFormat: 'CycloneDX', specVersion: '1.6', version: 1,
    metadata: { timestamp, component: { type: 'application', 'bom-ref': root, name: 'shinemage-development-sdk',
      version: closureSha, properties: [property('closure-sha256', closureSha), property('upstream-sha', manifest.upstream_sha),
        property('source-archive-sha256', manifest.source_archive_sha256), property('release-ready', false)] } },
    components: inventory.packages.map(pkg => ({ type: 'library', 'bom-ref': `urn:shinemage:package:${sha256(pkg.path)}`,
      name: pkg.name, version: pkg.version,
      ...(pkg.advisory_query_eligible ? { purl: `pkg:npm/${pkg.name.replace('@', '%40')}@${pkg.version}` } : {}),
      // package.json's digest is not a digest of the installed package/tarball.
      properties: [property('manifest-path', pkg.path), property('manifest-sha256', pkg.manifest_sha256),
        property('source-kind', pkg.source), property('private', pkg.private), property('license-self-declared', pkg.declared_license)] })),
    compositions: [{ aggregate: 'incomplete', assemblies: [root] }],
  };
}

/** Fixed public endpoint, no credentials/config discovery, no redirects or unbounded bodies. */
export async function fetchOsv(body) {
  need(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS_DISABLED');
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    need(false, 'OSV_HTTP');
  }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; need(size <= 4 * 1024 ** 2, 'OSV_RESPONSE_LIMIT'); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function queryOsv(queries, request = fetchOsv) {
  need(Array.isArray(queries) && queries.length > 0 && queries.length <= 2000, 'OSV_QUERIES');
  for (const q of queries) need(object(q) && object(q.package) && q.package.ecosystem === 'npm'
    && packageName(q.package.name) && packageVersion(q.version) && Object.keys(q).sort().join(',') === 'package,version'
    && Object.keys(q.package).sort().join(',') === 'ecosystem,name', 'OSV_QUERIES');
  const results = queries.map(query => ({ ...query, status: 'NOT_QUERIED', vulnerabilities: [] })), requests = [];
  const attempted = new Set(); let requestsSent = 0;
  const progress = () => ({ requested: queries.length, queried: attempted.size,
    completed: results.filter(row => row.status === 'COMPLETE').length, requests_sent: requestsSent });
  let pending = queries.map((query, index) => ({ query, index, seen: new Set() })), responseBytes = 0;
  // OSV paginates each result independently; omitted pages cannot become PASS.
  try {
    for (let page = 0; pending.length; page++) {
      need(page < 10, 'OSV_PAGE_LIMIT'); const next = [];
      for (let offset = 0; offset < pending.length; offset += 50) {
        const batch = pending.slice(offset, offset + 50), body = { queries: batch.map(row => row.query) };
        need(requestsSent < 80, 'OSV_REQUEST_LIMIT');
        for (const row of batch) { attempted.add(row.index); results[row.index].status = 'INCOMPLETE'; }
        requestsSent++;
        const response = await request(body);
        need(object(response) && Object.keys(response).join(',') === 'results'
          && Array.isArray(response.results) && response.results.length === batch.length, 'OSV_RESPONSE');
        responseBytes += Buffer.byteLength(JSON.stringify(response));
        need(responseBytes <= 32 * 1024 ** 2, 'OSV_TOTAL_LIMIT');
        requests.push({ request: body, response, canonical_response_sha256: sha256(JSON.stringify(response)) });
        for (const [index, row] of batch.entries()) {
          const result = response.results[index];
          need(object(result) && Object.keys(result).every(k => ['vulns', 'next_page_token'].includes(k)), 'OSV_RESULT');
          need(result.vulns === undefined || (Array.isArray(result.vulns) && result.vulns.length <= 3000), 'OSV_RESULT');
          for (const vuln of result.vulns || []) {
            need(object(vuln) && typeof vuln.id === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(vuln.id)
              && typeof vuln.modified === 'string' && vuln.modified.length <= 64 && Number.isFinite(Date.parse(vuln.modified)), 'OSV_VULNERABILITY');
            results[row.index].vulnerabilities.push({ id: vuln.id, modified: vuln.modified });
          }
          const token = result.next_page_token;
          if (token !== undefined && token !== '') {
            need(typeof token === 'string' && token.length <= 4096 && !row.seen.has(token), 'OSV_PAGE_TOKEN'); row.seen.add(token);
            next.push({ ...row, query: { ...row.query, page_token: token } });
          } else results[row.index].status = 'COMPLETE';
        }
      }
      pending = next;
    }
    for (const result of results) result.vulnerabilities = [...new Map(result.vulnerabilities.map(v => [v.id, v])).values()].sort((a, b) => a.id.localeCompare(b.id));
    return { status: results.some(r => r.vulnerabilities.length) ? 'ADVISORIES_FOUND' : 'NO_KNOWN_ADVISORIES',
      scope: 'declared-installed-npm-name-version-only', endpoint, ...progress(), results, requests };
  } catch (error) {
    const cause = error.cause?.code;
    return { status: 'UNKNOWN', scope: 'declared-installed-npm-name-version-only', endpoint, ...progress(),
      code: /^SDK_SUPPLY_[A-Z_]+$/.test(error.message) ? error.message
        : ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED'].includes(cause) ? 'SDK_SUPPLY_OSV_TLS_TRUST'
        : error.name === 'TimeoutError' ? 'SDK_SUPPLY_OSV_TIMEOUT' : 'SDK_SUPPLY_OSV_UNAVAILABLE',
      partial_results: results, requests };
  }
}

export async function auditSupplyChain({ root, closureSha, online = false }) {
  need(typeof root === 'string' && isAbsolute(root), 'ROOT');
  const pin = await readFile(join(repository, 'dsh-plugins/plugin-kit/toolchain.json'));
  await verifySdkClosure(root, closureSha, pin);
  const bytes = await readFile(join(root, 'sdk-closure.json')); need(sha256(bytes) === closureSha, 'CLOSURE_CHANGED');
  const manifest = JSON.parse(bytes), timestamp = new Date().toISOString();
  const inventory = await inventoryTree(root, manifest);
  const advisories = online ? await queryOsv(inventory.advisory_queries) : { status: 'NOT_RUN', reason: 'Explicit --osv required' };
  const found = (advisories.results || advisories.partial_results || []).some(r => r.vulnerabilities.length);
  return { schema, status: found ? 'BLOCKED' : 'PARTIAL', timestamp,
    scope: 'development-sdk-package-manifests', closure_sha256: closureSha,
    source_archive_sha256: manifest.source_archive_sha256, upstream_sha: manifest.upstream_sha, pin_sha256: manifest.pin_sha256,
    controller_sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    validator_sha256: sha256(await readFile(join(repository, 'dsh-plugins/plugin-kit/sdk-closure.mjs'))),
    inventory, bom: cycloneDx(inventory, manifest, closureSha, timestamp), advisories,
    coverage: { dependency_graph: 'NOT_RESOLVED', embedded_components: 'NOT_VERIFIED',
      registry_integrity: 'NOT_VERIFIED', publisher_identity: 'NOT_VERIFIED', opaque_content: 'NOT_REVIEWED', revocation: 'NOT_VERIFIED' },
    release_ready: false };
}

if (process.argv[1] && await realpath(resolve(process.argv[1])).catch(() => null) === fileURLToPath(import.meta.url)) {
  let output;
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      console.log('node sdk-supply-chain.mjs --root /abs/sdk --closure-sha256 SHA --output /abs/new-report.json [--osv]');
      console.log('Default offline. --osv sends installed npm names/versions (excluding workspace/private:true declarations) to api.osv.dev; inspect the offline inventory first. No packages are installed/executed. PARTIAL/BLOCKED exit 2; never grants release readiness.');
    } else {
      const options = {}; let online = false;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--osv') { need(!online, 'ARGUMENTS'); online = true; continue; }
        const key = args[i]; need(['--root', '--closure-sha256', '--output'].includes(key) && !Object.hasOwn(options, key), 'ARGUMENTS');
        options[key] = args[++i]; need(typeof options[key] === 'string', 'ARGUMENTS');
      }
      need(Object.keys(options).length === 3 && isAbsolute(options['--root']) && isAbsolute(options['--output'])
        && /^[a-f0-9]{64}$/.test(options['--closure-sha256']), 'ARGUMENTS');
      const root = await realpath(options['--root']), parent = await realpath(dirname(options['--output']));
      need(parent !== root && !parent.startsWith(root + sep), 'OUTPUT_IN_SDK');
      output = await open(options['--output'], 'wx', 0o600);
      const report = await auditSupplyChain({ root, closureSha: options['--closure-sha256'], online });
      await output.writeFile(`${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify({ status: report.status, packages: report.inventory.packages.length,
        unidentified: report.inventory.unidentified_manifests.length, advisories: report.advisories.status, release_ready: false }));
      process.exitCode = 2;
    }
  } catch (error) {
    const result = { schema, status: 'BLOCKED', code: /^(SDK_SUPPLY|KIT_CLOSURE)_[A-Z_]+$/.test(error.message) ? error.message : 'SDK_SUPPLY_FAILED', release_ready: false };
    if (output) await output.writeFile(`${JSON.stringify(result)}\n`);
    console.log(JSON.stringify(result)); process.exitCode = 2;
  } finally { await output?.close(); }
}
