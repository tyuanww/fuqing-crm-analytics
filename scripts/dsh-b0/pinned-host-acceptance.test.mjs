import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access, symlink, cp, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runPinnedHostAcceptance } from './pinned-host-acceptance.mjs';
import { runFirstPurchaseBrowser, launchFirstPurchaseBrowser } from './first-purchase-browser.probe.mjs';
import { prepareFirstPurchaseArtifacts, verifyFirstPurchaseInstalledArtifacts, verifyFirstPurchaseSourceContract } from './first-purchase-artifacts.mjs';
import { serviceFixture } from '../release/test-fixtures/service-compatibility.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA } from '../release/toolchain.mjs';
import { readFirstPurchaseService, installFirstPurchaseService, verifyFirstPurchaseService } from './first-purchase-service-artifacts.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const upstream = process.env.B0_BUILD_UPSTREAM;
const exact = { skip: !upstream && 'Set B0_BUILD_UPSTREAM to the unchanged built 0.1.7-rc.2 checkout.' };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'owned-pinned-host-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('host drill rejects a different Git pin before creating output or starting processes', async t => {
  const output = join(await fixture(t), 'not-created');
  await assert.rejects(runPinnedHostAcceptance({ upstream: repository, output }), /PINNED_HOST_SHA_MISMATCH/);
  await assert.rejects(access(output), /ENOENT/);
});

test('host drill rejects relative ownership and package paths before writing', async t => {
  const output = join(await fixture(t), 'not-created');
  await assert.rejects(runPinnedHostAcceptance({ upstream: '.', output }), /PINNED_HOST_ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(runPinnedHostAcceptance({ upstream: repository, output, packagesFrom: '.' }), /PINNED_HOST_ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(access(output), /ENOENT/);
});

test('host drill never overwrites an existing evidence directory', exact, async t => {
  const output = await fixture(t);
  await writeFile(join(output, 'keep.txt'), 'prior evidence');
  await assert.rejects(runPinnedHostAcceptance({ upstream, output }), /EEXIST/);
  assert.deepEqual(await readdir(output), ['keep.txt']);
  assert.equal(await readFile(join(output, 'keep.txt'), 'utf8'), 'prior evidence');
});

test('tampered immutable package fails before extraction or host startup and leaves a BLOCKED receipt', exact, async t => {
  const root = await fixture(t), packagesFrom = join(root, 'prior'), output = join(root, 'result');
  await mkdir(join(packagesFrom, 'packs/crm-knowledge'), { recursive: true });
  const name = 'tampered.tgz';
  await writeFile(join(packagesFrom, 'packs/crm-knowledge', name), 'tampered archive');
  await writeFile(join(packagesFrom, 'evidence.json'), JSON.stringify({
    schema: 'dsh-pinned-host-acceptance/v1', packages: { 'crm-knowledge': {
      name, sha256: '0'.repeat(64), source_sha: '0'.repeat(40), bytes: 16,
    } },
  }));
  await assert.rejects(runPinnedHostAcceptance({ upstream, output, packagesFrom }), /PINNED_HOST_PACKAGE_DIGEST_MISMATCH/);
  const receipt = JSON.parse(await readFile(join(output, 'evidence.json')));
  assert.equal(receipt.overall, 'BLOCKED');
  assert.equal(receipt.rows.length, 0);
  assert.match(receipt.error, /PINNED_HOST_PACKAGE_DIGEST_MISMATCH/);
  assert.equal(receipt.model_requests, undefined);
  await assert.rejects(access(join(output, 'installed')), /ENOENT/);
  assert.ok(!(await readdir(output)).some(name => name.startsWith('host-')));
});

test('browser executable is explicit, absolute and regular; never silently falls back', async t => {
  const root = await fixture(t), modulePath = join(root, 'browser-fixture.mjs'), executable = join(root, 'owned-browser');
  await writeFile(modulePath, 'export const chromium = { launch: async options => options };');
  await writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  assert.deepEqual(await launchFirstPurchaseBrowser({ modulePath, executablePath: executable }), { executablePath: executable, headless: true });
  await assert.rejects(launchFirstPurchaseBrowser({ modulePath, executablePath: 'chrome' }), /HOST_BROWSER_EXECUTABLE_ABSOLUTE/);
  await assert.rejects(launchFirstPurchaseBrowser({ modulePath, executablePath: root }), /HOST_BROWSER_EXECUTABLE_REGULAR/);
  const link = join(root, 'link'); await symlink(executable, link);
  await assert.rejects(launchFirstPurchaseBrowser({ modulePath, executablePath: link }), /HOST_BROWSER_EXECUTABLE_REGULAR/);
  await chmod(executable, 0o600);
  await assert.rejects(launchFirstPurchaseBrowser({ modulePath, executablePath: executable }), /EACCES/);
});

test('browser launch failure preserves a NOT_STARTED observation', async t => {
  const root = await fixture(t), modulePath = join(root, 'browser-fixture.mjs');
  await writeFile(modulePath, 'export const chromium = { launch: async () => { throw Error("owned-launch-failure"); } };');
  await assert.rejects(runFirstPurchaseBrowser({ modulePath, output: root }), /owned-launch-failure/);
  const evidence = JSON.parse(await readFile(join(root, 'browser-observations.json')));
  assert.equal(evidence.browser_version, 'NOT_STARTED');
  assert.deepEqual(evidence.rows, []);
});

for (const stage of ['context', 'page', 'evidence', 'close']) {
  test(`browser probe closes owned resources when ${stage} fails`, async t => {
    const root = await fixture(t), modulePath = join(root, 'browser-fixture.mjs');
    // This is a lifecycle fault fixture, not a Chrome acceptance result.
    await writeFile(modulePath, `
      export const state = { browserClosed: false, contextClosed: false };
      const stage = ${JSON.stringify(stage)};
      const page = { on() {}, setDefaultTimeout() {},
        locator: () => ({ innerText: async () => 'owned fixture' }), screenshot: async () => {} };
      const context = {
        newPage: async () => { if (stage === 'page') throw Error('page'); return page; },
        close: async () => { state.contextClosed = true; if (stage === 'close') throw Error('close'); }
      };
      export const chromium = { launch: async () => ({
        newContext: async options => { state.contextOptions = options; if (stage === 'context') throw Error('context'); return context; },
        close: async () => { state.browserClosed = true; }
      }) };
    `);
    const { state } = await import(pathToFileURL(modulePath).href);
    const output = stage === 'evidence' ? modulePath : root;
    await assert.rejects(runFirstPurchaseBrowser({ modulePath, output, sessionId: 'owned',
      host: { request: async () => { throw Error('stop before any browser interaction'); } } }),
    stage === 'evidence' ? /ENOTDIR/ : new RegExp(stage));
    assert.equal(state.browserClosed, true);
    assert.equal(state.contextOptions.locale, 'zh-CN');
    assert.equal(state.contextClosed, stage !== 'context');
  });
}

const digest = value => createHash('sha256').update(value).digest('hex');
async function artifactFixture(t) {
  const directory = await fixture(t), packs = {}, ids = {
    workbench: '@shine-mage/dsh-analytics-workbench-b0', crm: '@shine-mage/dsh-crm-knowledge',
  };
  const write = (path, value) => writeFile(path, JSON.stringify(value) + '\n');
  for (const [domain, id] of Object.entries(ids)) {
    const stage = join(directory, domain), pkg = join(stage, 'package');
    await mkdir(join(pkg, 'lib'), { recursive: true });
    await write(join(pkg, 'package.json'), { name: id, version: '1.0.0',
      peerDependencies: { '@deepseek-ai/dsh-tools': DSH_SDK_VERSION } });
    await writeFile(join(pkg, 'lib/index.js'), "export function apply() { throw Error('fixture must not activate'); }\n");
    const extra = domain === 'crm' ? 'lib/host.js' : 'lib/skills.js';
    await writeFile(join(pkg, extra), domain === 'crm'
      ? "export function apply() { throw Error('fixture must not activate'); }\n"
      : `export const firstPurchaseMethodPackageDigest = '${'a'.repeat(64)}';\n`);
    const name = domain + '.tgz', archive = join(directory, name);
    execFileSync('tar', ['-czf', archive, '-C', stage, 'package'],
      { env: { PATH: process.env.PATH, COPYFILE_DISABLE: '1' } });
    const bytes = await readFile(archive);
    packs[domain] = { schema_version: 'dsh-plugin-pack/v1', package_name: id, package_version: '1.0.0',
      source_sha: 'b'.repeat(40), source_dirty: false, dsh_pin: DSH_SDK_VERSION,
      tarball: { name, sha256: digest(bytes), bytes: bytes.length }, entries: ['lib/index.js', extra, 'package.json'] };
  }
  const { binding, gate } = await serviceFixture();
  const profile = { schema_version: 'dsh-profile/v1', profile_id: 'fixture',
    dsh: { sdk_version: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA },
    plugins: [{ path: 'dsh-plugins/analytics-workbench', id: ids.workbench, build: 'build.mjs', enabled: true }],
    service_binding: binding };
  await write(join(directory, 'profile.json'), profile);
  const profileDigest = digest(await readFile(join(directory, 'profile.json')));
  const base = { schema_version: 'dsh-plugin-candidate/v1', profile_id: 'fixture', profile_digest: profileDigest,
    profile_snapshot: { name: 'profile.json', sha256: profileDigest },
    source_sha: packs.workbench.source_sha,
    plugin: { id: ids.workbench, path: 'dsh-plugins/analytics-workbench', version: '1.0.0', dsh_pin: DSH_SDK_VERSION },
    service_compatibility: gate, pack: packs.workbench.tarball };
  const candidate = { ...base, candidate_digest: digest(JSON.stringify(base)),
    activation: 'NOT_RUN', state_scope: 'local-explicit-journal' };
  await write(join(directory, 'candidate.json'), candidate);
  await write(join(directory, 'plugin-pack.json'), packs.workbench);
  await write(join(directory, 'crm-pack.json'), packs.crm);
  const manifestPath = join(directory, 'input.json');
  const manifest = { schema_version: 'dsh-first-purchase-host-artifacts/v1',
    candidate_path: join(directory, 'candidate.json'), candidate_sha256: digest(await readFile(join(directory, 'candidate.json'))),
    crm_pack_path: join(directory, 'crm-pack.json'), crm_pack_sha256: digest(await readFile(join(directory, 'crm-pack.json'))) };
  await write(manifestPath, manifest);
  return { directory, manifest, manifestPath, candidate, packs, write, output: join(directory, 'installed'), upstream: upstream ?? repository };
}

for (const [name, mutate, error] of [
  ['unknown input', async f => { f.manifest.extra = true; await f.write(f.manifestPath, f.manifest); }, /HOST_ARTIFACT_SCHEMA/],
  ['incomplete service opt-in', async f => {
    f.manifest.schema_version = 'dsh-first-purchase-host-artifacts/v2'; await f.write(f.manifestPath, f.manifest);
  }, /HOST_ARTIFACT_SCHEMA/],
  ['source HTTP without both fixed packages', async f => {
    f.manifest.schema_version = 'dsh-first-purchase-host-artifacts/v4'; await f.write(f.manifestPath, f.manifest);
  }, /HOST_ARTIFACT_SCHEMA/],
  ['implicit service opt-in', async f => {
    f.manifest.service_evidence_path = '/not-an-opt-in'; await f.write(f.manifestPath, f.manifest);
  }, /HOST_ARTIFACT_SCHEMA/],
  ['wrong candidate', async f => { f.manifest.candidate_sha256 = '0'.repeat(64); await f.write(f.manifestPath, f.manifest); }, /HOST_ARTIFACT_CANDIDATE_BYTES/],
  ['profile drift', f => f.write(join(f.directory, 'profile.json'), {}), /HOST_ARTIFACT_PROFILE_DIGEST/],
  ['tarball tamper', f => writeFile(join(f.directory, 'workbench.tgz'), 'changed'), /HOST_ARTIFACT_PACK_SIZE/],
  ['dirty CRM', async f => {
    f.packs.crm.source_dirty = true; await f.write(f.manifest.crm_pack_path, f.packs.crm);
    f.manifest.crm_pack_sha256 = digest(await readFile(f.manifest.crm_pack_path)); await f.write(f.manifestPath, f.manifest);
  }, /HOST_ARTIFACT_DIRTY_SOURCE/],
  ['linked archive', async f => { const archive = join(f.directory, 'crm.tgz'); await rm(archive); await symlink('workbench.tgz', archive); }, /SERVICE_ARTIFACT_SYMLINK/],
  ['FIFO receipt', async f => { await rm(f.manifest.crm_pack_path); execFileSync('mkfifo', [f.manifest.crm_pack_path]); }, /SERVICE_ARTIFACT_FILE_INVALID/],
]) test('exact plugin drill rejects ' + name + ' before extraction or execution', async t => {
  const f = await artifactFixture(t); await mutate(f);
  await assert.rejects(prepareFirstPurchaseArtifacts(f), error);
  await assert.rejects(access(f.output), /ENOENT/);
});

test('exact plugin drill loads verified bytes exclusively and detects post-run mutations', exact, async t => {
  const f = await artifactFixture(t), prepared = await prepareFirstPurchaseArtifacts(f);
  assert.equal(prepared.candidateDigest, f.candidate.candidate_digest);
  assert.equal(prepared.evidence.release_ready, false);
  assert.equal(prepared.evidence.service_runtime, 'workspace-synthetic-service');
  assert.equal(await verifyFirstPurchaseInstalledArtifacts(prepared), true);
  await assert.rejects(prepareFirstPurchaseArtifacts(f), /EEXIST/);
  await writeFile(join(prepared.crm, 'lib/index.js'), 'changed after loading');
  await assert.rejects(verifyFirstPurchaseInstalledArtifacts(prepared), /HOST_ARTIFACT_INSTALLED_CHANGED/);
});

test('exact plugin drill rejects extra files and redirected SDK links after execution', exact, async t => {
  const f = await artifactFixture(t), prepared = await prepareFirstPurchaseArtifacts(f);
  const extra = join(prepared.crm, 'extra.js');
  await writeFile(extra, 'unexpected');
  await assert.rejects(verifyFirstPurchaseInstalledArtifacts(prepared), /HOST_ARTIFACT_INSTALLED_CHANGED/);
  await rm(extra);
  const link = join(prepared.output, 'upstream');
  await rm(link); await symlink(repository, link, 'dir');
  await assert.rejects(verifyFirstPurchaseInstalledArtifacts(prepared), /HOST_ARTIFACT_UPSTREAM_CHANGED/);
});

test('parent setup failure closes the artifact driver without masking its original error', exact, async t => {
  const f = await artifactFixture(t);
  const output = execFileSync(process.execPath, [join(repository, 'scripts/dsh-b0/first-purchase-crm-host.probe.mjs')],
    { cwd: f.directory, input: '', encoding: 'utf8', timeout: 10000, env: {
      PATH: process.env.PATH, B0_NATIVE_CRM_ARTIFACT_MANIFEST: f.manifestPath,
      B0_NATIVE_CRM_ARTIFACT_OUTPUT: f.output, B0_NATIVE_CRM_HOST_UPSTREAM: upstream,
    } });
  assert.deepEqual(JSON.parse(output), { method_digest: 'a'.repeat(64), candidate_digest: f.candidate.candidate_digest });
  assert.deepEqual((await readdir(f.output)).sort(), ['crm', 'crm.tgz', 'dsh-plugins', 'packages.json', 'upstream', 'workbench', 'workbench.tgz']);
});

test('saved-analysis install requires explicit absolute inputs before reading files', async () => {
  await assert.rejects(readFirstPurchaseService({ evidencePath: '.', python: '/unavailable', wheelhouse: '/unavailable' }), /HOST_SERVICE_ABSOLUTE_PATH/);
});

test('source HTTP composition rejects legacy packages and different domain contracts', () => {
  const contract = 'backend/contracts/analytics_first_purchase_source.py';
  const service = { files: { [contract]: { sha256: 'a'.repeat(64) },
    'backend/services/analytics/first_purchase/source_http.py': { sha256: 'b'.repeat(64) } } };
  const kernel = { files: { [contract]: { sha256: 'a'.repeat(64) },
    'backend/analytics_first_purchase_source_app.py': { sha256: 'c'.repeat(64) } } };
  assert.doesNotThrow(() => verifyFirstPurchaseSourceContract(service, kernel));
  assert.throws(() => verifyFirstPurchaseSourceContract({ files: {} }, kernel), /HOST_SOURCE_PACKAGE_REQUIRED/);
  assert.throws(() => verifyFirstPurchaseSourceContract(service, { files: {} }), /HOST_SOURCE_PACKAGE_REQUIRED/);
  kernel.files[contract].sha256 = 'd'.repeat(64);
  assert.throws(() => verifyFirstPurchaseSourceContract(service, kernel), /HOST_SOURCE_CONTRACT_MISMATCH/);
});

const serviceExact = { skip: !['B0_NATIVE_CRM_ARTIFACT_MANIFEST', 'B0_NATIVE_CRM_SERVICE_PYTHON', 'B0_NATIVE_CRM_SERVICE_WHEELHOUSE']
  .every(name => process.env[name]) && 'Explicit existing service pair/Python/wheelhouse required.' };
async function serviceArtifactOptions() {
  const input = JSON.parse(await readFile(process.env.B0_NATIVE_CRM_ARTIFACT_MANIFEST));
  const candidate = JSON.parse(await readFile(input.candidate_path));
  return { evidencePath: input.service_evidence_path, expectedSha: input.service_evidence_sha256,
    gate: candidate.service_compatibility, python: process.env.B0_NATIVE_CRM_SERVICE_PYTHON,
    wheelhouse: process.env.B0_NATIVE_CRM_SERVICE_WHEELHOUSE };
}
test('saved-analysis composition rejects a changed pair receipt before installation', serviceExact, async () => {
  await assert.rejects(readFirstPurchaseService({ ...await serviceArtifactOptions(), expectedSha: '0'.repeat(64) }), /HOST_SERVICE_EVIDENCE_DIGEST/);
});
test('saved-analysis composition rejects same-name wheels with different immutable bytes', serviceExact, async t => {
  const options = await serviceArtifactOptions(), directory = await fixture(t), wheelhouse = join(directory, 'wheels');
  await cp(options.wheelhouse, wheelhouse, { recursive: true });
  const pair = JSON.parse(await readFile(options.evidencePath));
  const wheel = Object.values(pair.artifacts.candidate.installed.wheels)[0];
  await writeFile(join(wheelhouse, wheel.file), 'changed wheel bytes');
  await assert.rejects(readFirstPurchaseService({ ...options, wheelhouse }), /HOST_SERVICE_WHEEL_CHANGED/);
});
test('saved-analysis cold install checks exact closure, exclusive output and bootstrap integrity', serviceExact, async t => {
  const spec = await readFirstPurchaseService(await serviceArtifactOptions());
  const directory = await fixture(t), output = join(directory, 'installed-service');
  const prepared = await installFirstPurchaseService(spec, output);
  assert.equal(prepared.receipt.release_ready, false);
  await verifyFirstPurchaseService(prepared);
  await assert.rejects(installFirstPurchaseService(spec, output), /EEXIST/);
  // A modified bootstrap must be rejected by bytes before it can run again.
  await writeFile(join(prepared.app, 'service.py'), "raise RuntimeError('must never execute changed bootstrap')\n");
  await assert.rejects(verifyFirstPurchaseService(prepared), /HOST_SERVICE_INSTALLED_SIZE/);
});
