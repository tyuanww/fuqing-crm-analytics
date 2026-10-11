/** Remaining main-owned coordinator fixture and author destination contracts; source access remains explicit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repository = fileURLToPath(new URL('../..', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
test('independent workbench fixtures match their tracked contract owners byte for byte', async () => {
  const fixtures = join(repository, 'dsh-plugins/analytics-workbench/test/fixtures/coordinator');
  const provenance = JSON.parse(await readFile(join(fixtures, 'provenance.json')));
  assert.equal(provenance.schema_version, 'plugin-test-contract-fixtures/v1');
  const sources = {
    'analytics_first_purchase_v1_expected.json': 'backend/tests/fixtures/analytics_first_purchase_v1_expected.json',
    'analytics_first_purchase_v1_missing_role_expected.json': 'backend/tests/fixtures/analytics_first_purchase_v1_missing_role_expected.json',
    'frozen-contract-v0.json': 'docs/hackathon/free-html-cockpit/fixtures/frozen-contract-v0.json',
    'd48-scope.fixture.json': 'docs/hackathon/free-html-cockpit/fixtures/d48-scope.fixture.json',
    'analytics-page.openapi.json': 'backend/contracts/analytics-page.openapi.json',
  };
  assert.deepEqual(provenance.files.map(item => item.name).sort(), Object.keys(sources).sort());
  for (const record of provenance.files) {
    assert.equal(record.source_path, sources[record.name]);
    const expected = await readFile(join(repository, record.source_path));
    const actual = await readFile(join(fixtures, record.name));
    assert.equal(digest(actual), record.sha256, `fixture provenance digest: ${record.name}`);
    assert.deepEqual(actual, expected, `update the reviewed independent fixture with its owner: ${record.source_path}`);
  }
});

test('author destination resolves parent aliases before writes and allows outside aliases', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-author-destination-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), sourceDirectory = join(source, 'src');
  await mkdir(sourceDirectory, { recursive: true });
  const author = await readFile(join(repository, 'dsh-plugins/analytics-workbench/author-inputs.mjs'));
  await writeFile(join(source, 'author-inputs.mjs'), author);
  await writeFile(join(source, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.2' }));
  await writeFile(join(sourceDirectory, 'original.txt'), 'source must stay unchanged');
  const kit = join(root, 'kit.tgz'), domain = join(root, 'domain'), preload = join(root, 'stop-before-install.cjs');
  const bytes = Buffer.from('guard-only fixture: stopped before package manager execution');
  await writeFile(kit, bytes); await mkdir(domain);
  await writeFile(preload, "require('node:child_process').execFileSync = () => { throw new Error('AUTHOR_TEST_STOP_BEFORE_PACKAGE_MANAGER'); }; require('node:module').syncBuiltinESMExports();\n");
  const invoke = destination => {
    try {
      execFileSync(process.execPath, ['--require', preload, join(source, 'author-inputs.mjs'),
        '--destination', destination, '--kit', kit, '--kit-sha256', digest(bytes), '--package-inputs', domain],
      { cwd: root, env: { COREPACK_HOME: root }, encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
      assert.fail('guard probe unexpectedly completed');
    } catch (error) {
      assert.equal(error.status, 1);
      return String(error.stderr);
    }
  };
  const insideAlias = join(root, 'inside-alias'); await symlink(sourceDirectory, insideAlias, 'dir');
  const rejected = invoke(join(insideAlias, 'new-author'));
  t.diagnostic(JSON.stringify({ author_sha256: digest(author), source_was_written: (await readdir(sourceDirectory)).includes('new-author'),
    destination_guard_rejected: rejected.includes('AUTHOR_DESTINATION_OUTSIDE_SOURCE') }));
  assert.match(rejected, /AUTHOR_DESTINATION_OUTSIDE_SOURCE/);
  assert.deepEqual(await readdir(sourceDirectory), ['original.txt']);
  assert.deepEqual((await readdir(source)).sort(), ['author-inputs.mjs', 'package.json', 'src']);
  assert.equal(await readFile(join(sourceDirectory, 'original.txt'), 'utf8'), 'source must stay unchanged');
  const outside = join(root, 'outside'), outsideAlias = join(root, 'outside-alias');
  await mkdir(outside); await symlink(outside, outsideAlias, 'dir');
  // The plain tmpdir path also covers macOS /var -> /private canonicalization.
  for (const [parent, name] of [[root, 'plain-author'], [outsideAlias, 'aliased-author']]) {
    const destination = join(parent, name);
    assert.match(invoke(destination), /AUTHOR_TEST_STOP_BEFORE_PACKAGE_MANAGER/);
    assert.deepEqual(await readFile(join(destination, 'inputs/kit.tgz')), bytes);
    assert.match(invoke(destination), /EEXIST/);
  }
  assert.deepEqual(await readdir(sourceDirectory), ['original.txt']);
});
