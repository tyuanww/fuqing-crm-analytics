import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sha256 } from '../../dsh-plugins/plugin-kit/sdk-closure.mjs';
import { inventoryTree, cycloneDx, queryOsv, fetchOsv, auditSupplyChain } from './sdk-supply-chain.mjs';

const q = (name = 'react') => ({ package: { ecosystem: 'npm', name }, version: '18.3.1' });
const vulnerability = { id: 'GHSA-1234-abcd-5678', modified: '2026-09-01T00:00:00Z' };
async function fixture(t, packages) {
  const root = await mkdtemp(join(tmpdir(), 'sdk-supply-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entries = {};
  for (const [path, pkg] of Object.entries(packages)) {
    const bytes = JSON.stringify(pkg); await mkdir(join(root, dirnameOf(path)), { recursive: true });
    await writeFile(join(root, path), bytes); entries[path] = { kind: 'file', bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
  }
  return { root, manifest: { entries } };
}
const dirnameOf = path => path.slice(0, path.lastIndexOf('/'));

test('inventory preserves instances, excludes private/workspace queries and reports unidentified manifests', async t => {
  const { root, manifest } = await fixture(t, {
    'upstream/node_modules/react/package.json': { name: 'react', version: '18.3.1', license: 'MIT' },
    'build-tools/node_modules/react/package.json': { name: 'react', version: '18.3.1' },
    'upstream/packages/local/package.json': { name: '@private/workspace', version: '1.0.0' },
    'upstream/node_modules/private/package.json': { name: '@private/service', version: '1.0.0', private: true },
    'corepack/v1/pnpm/11.7.0/package.json': { name: 'pnpm', version: '11.7.0' },
    'upstream/node_modules/react/cjs/package.json': { type: 'commonjs' },
    'build-tools/package.json': { name: '@private/build-tools', private: true },
  });
  const report = await inventoryTree(root, manifest);
  assert.equal(report.packages.length, 5); assert.equal(report.unidentified_manifests.length, 1);
  assert.equal(report.module_scope_manifests.length, 1);
  assert.deepEqual(report.advisory_queries.map(r => r.package.name), ['pnpm', 'react']);
  assert.ok(!JSON.stringify(report.advisory_queries).includes('@private'));
  const bom = cycloneDx(report, { upstream_sha: 'a'.repeat(40), source_archive_sha256: 'b'.repeat(64) }, 'c'.repeat(64), '2026-10-07T00:00:00Z');
  assert.equal(bom.compositions[0].aggregate, 'incomplete');
  assert.equal(new Set(bom.components.map(c => c['bom-ref'])).size, 5);
  assert.equal(bom.components.filter(c => c.purl).length, 3);
  assert.ok(bom.components.every(c => !c.hashes)); // manifest digest cannot masquerade as package digest
});

test('changed package contents, private schema and oversized manifest fail closed', async t => {
  const path = 'upstream/node_modules/react/package.json';
  const { root, manifest } = await fixture(t, { [path]: { name: 'react', version: '18.3.1' } });
  await writeFile(join(root, path), '{}');
  await assert.rejects(inventoryTree(root, manifest), /KIT_CLOSURE_FILE/);
  const bytes = JSON.stringify({ name: 'react', version: '18.3.1', private: 'yes' });
  await writeFile(join(root, path), bytes); manifest.entries[path] = { kind: 'file', bytes: bytes.length, sha256: sha256(bytes) };
  await assert.rejects(inventoryTree(root, manifest), /SDK_SUPPLY_PACKAGE_SCHEMA/);
  manifest.entries[path].bytes = 2 * 1024 ** 2 + 1;
  await assert.rejects(inventoryTree(root, manifest), /SDK_SUPPLY_PACKAGE_LIMIT/);
});

test('query batching and per-result pagination retain package association and deduplicate advisories', async () => {
  const calls = [];
  const result = await queryOsv([q(), q('react-dom')], async body => {
    calls.push(body);
    return calls.length === 1 ? { results: [{ vulns: [vulnerability], next_page_token: 'next' }, {}] }
      : { results: [{ vulns: [vulnerability] }] };
  });
  assert.equal(calls[1].queries.length, 1); assert.equal(calls[1].queries[0].package.name, 'react');
  assert.equal(calls[1].queries[0].page_token, 'next');
  assert.equal(result.status, 'ADVISORIES_FOUND'); assert.equal(result.results[0].vulnerabilities.length, 1);
  assert.deepEqual(result.results[1].vulnerabilities, []);
  assert.equal(result.requests[0].canonical_response_sha256, sha256(JSON.stringify(result.requests[0].response)));
  const sizes = [];
  const clear = await queryOsv(Array.from({ length: 51 }, (_, i) => q(`pkg-${i}`)), async body => {
    sizes.push(body.queries.length); return { results: body.queries.map(() => ({})) };
  });
  assert.deepEqual(sizes, [50, 1]); assert.equal(clear.status, 'NO_KNOWN_ADVISORIES');
});

test('partial network failures retain prior findings but cannot produce a clear result or leak errors', async () => {
  let count = 0;
  const result = await queryOsv([q()], async () => {
    if (++count === 1) return { results: [{ vulns: [vulnerability], next_page_token: 'more' }] };
    throw new Error('private-network-detail');
  });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.partial_results[0].vulnerabilities.length, 1);
  assert.equal(result.requests.length, 1); assert.ok(!JSON.stringify(result).includes('private-network-detail'));
});

test('TLS trust and timeout failures get actionable stable codes', async () => {
  for (const [error, code] of [[new TypeError('fetch failed', { cause: { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' } }), 'SDK_SUPPLY_OSV_TLS_TRUST'],
    [new DOMException('timed out', 'TimeoutError'), 'SDK_SUPPLY_OSV_TIMEOUT']]) {
    const result = await queryOsv([q()], async () => { throw error; });
    assert.equal(result.status, 'UNKNOWN'); assert.equal(result.code, code);
  }
});

test('request budget stops before the 81st request, including independent pages', async () => {
  let calls = 0;
  const report = await queryOsv(Array.from({ length: 2000 }, (_, i) => q(`pkg-${i}`)), async body => {
    calls++;
    return { results: body.queries.map(() => ({ next_page_token: `page-${calls}` })) };
  });
  assert.equal(calls, 80); assert.equal(report.code, 'SDK_SUPPLY_OSV_REQUEST_LIMIT');
});

test('failed queries distinguish requested, attempted, completed and untouched package identities', async () => {
  const queries = Array.from({ length: 51 }, (_, i) => q(`pkg-${i}`));
  const failed = await queryOsv(queries, async () => { throw new Error('network unavailable'); });
  assert.equal(failed.requested, 51); assert.equal(failed.queried, 50); assert.equal(failed.completed, 0);
  assert.equal(failed.requests_sent, 1);
  assert.equal(failed.partial_results[0].status, 'INCOMPLETE');
  assert.equal(failed.partial_results[50].status, 'NOT_QUERIED');
  let calls = 0;
  const partial = await queryOsv(queries, async body => {
    if (++calls === 2) throw new Error('second batch failed');
    return { results: body.queries.map(() => ({})) };
  });
  assert.equal(partial.queried, 51); assert.equal(partial.completed, 50); assert.equal(partial.requests_sent, 2);
  assert.equal(partial.partial_results[49].status, 'COMPLETE');
  assert.equal(partial.partial_results[50].status, 'INCOMPLETE');
});

test('HTTP rejection cancels its body instead of leaving the socket to time out', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 }));
  await assert.rejects(fetchOsv({ queries: [q()] }), /SDK_SUPPLY_OSV_HTTP/);
  assert.equal(cancelled, true);
});

test('malformed responses, count mismatch and repeated/invalid pagination tokens remain UNKNOWN', async t => {
  for (const response of [null, {}, { results: [] }, { results: [null] }, { results: [{ error: 'oops' }] },
    { results: [{}], next_page_token: 'unexpected-top-level-token' },
    { results: [{ vulns: null }] }, { results: [{ vulns: [{ id: 'bad id', modified: 'now' }] }] },
    { results: [{ next_page_token: null }] }, { results: [{ next_page_token: 'repeat' }] }]) {
    await t.test(JSON.stringify(response), async () => assert.equal((await queryOsv([q()], async () => response)).status, 'UNKNOWN'));
  }
  let calls = 0;
  const result = await queryOsv([q()], async () => ({ results: [{ next_page_token: `page-${++calls}` }] }));
  assert.equal(calls, 10); assert.equal(result.code, 'SDK_SUPPLY_OSV_PAGE_LIMIT');
  await assert.rejects(queryOsv([{ ...q(), secret: 'not-sent' }], async () => assert.fail('must not call')), /SDK_SUPPLY_OSV_QUERIES/);
});

test('HTTP adapter pins endpoint, credentials/redirect policy and rejects oversized or unsuccessful responses', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ results: [{}] }), { status: 200 });
  });
  assert.deepEqual(await fetchOsv({ queries: [q()] }), { results: [{}] });
  assert.equal(calls[0].url, 'https://api.osv.dev/v1/querybatch');
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.credentials, 'omit');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  globalThis.fetch.mock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(fetchOsv({ queries: [q()] }), /SDK_SUPPLY_OSV_HTTP/);
  globalThis.fetch.mock.mockImplementation(async () => new Response(Buffer.alloc(4 * 1024 ** 2 + 1)));
  await assert.rejects(fetchOsv({ queries: [q()] }), /SDK_SUPPLY_OSV_RESPONSE_LIMIT/);
});

test('invalid closure is rejected before package discovery or network activity', async t => {
  const { root } = await fixture(t, {}); await writeFile(join(root, 'sdk-closure.json'), '{}');
  t.mock.method(globalThis, 'fetch', async () => assert.fail('must not query'));
  await assert.rejects(auditSupplyChain({ root, closureSha: '0'.repeat(64), online: true }), /KIT_CLOSURE_DIGEST/);
});

test('online check refuses disabled TLS verification before making a request', async t => {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  t.mock.method(globalThis, 'fetch', async () => assert.fail('must not query'));
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    await assert.rejects(fetchOsv({ queries: [q()] }), /SDK_SUPPLY_TLS_DISABLED/);
  } finally {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  }
});

test('CLI refuses SDK outputs, aliases and evidence overwrite before doing work', async t => {
  const { root } = await fixture(t, { 'upstream/package.json': {} });
  const outside = await mkdtemp(join(tmpdir(), 'sdk-supply-output-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(join(root, 'upstream'), join(outside, 'alias'));
  const script = fileURLToPath(new URL('./sdk-supply-chain.mjs', import.meta.url));
  const run = output => spawnSync(process.execPath, [script, '--root', root, '--closure-sha256', '0'.repeat(64), '--output', output], { encoding: 'utf8' });
  for (const output of [join(root, 'result.json'), join(outside, 'alias/result.json')]) {
    const child = run(output); assert.equal(child.status, 2); assert.equal(JSON.parse(child.stdout).code, 'SDK_SUPPLY_OUTPUT_IN_SDK');
  }
  assert.deepEqual(await readdir(root), ['upstream']); assert.deepEqual(await readdir(join(root, 'upstream')), ['package.json']);
  const old = join(outside, 'old.json'); await writeFile(old, 'old evidence');
  assert.equal(run(old).status, 2); assert.equal(await readFile(old, 'utf8'), 'old evidence');
  const next = join(outside, 'new.json'); assert.equal(run(next).status, 2);
  assert.equal(JSON.parse(await readFile(next, 'utf8')).release_ready, false);
});
