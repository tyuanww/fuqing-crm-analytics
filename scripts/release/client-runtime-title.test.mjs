import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import {
  BUILD_RECORD,
  CLIENT_TITLE_ENV,
  UPSTREAM_TITLE,
  applyClientTitle,
  clientArtifactDigest,
  clientArtifactPaths,
  clientTitleFromEnvironment,
  clientTitleProvenance,
  installClientRuntimeTitle,
  rewriteClientRuntimeTitle,
} from './client-runtime-title.mjs';
import { runtimeSourceTree } from './runtime-inputs.mjs';

const TITLE = '伸美 AI 增长董事会';
const ENVIRONMENT = {
  DSH_CLIENT_BUILD_PROFILE: 'official',
  DSH_CLIENT_COMMIT_HASH: '0123456',
  DSH_CLIENT_TITLE: UPSTREAM_TITLE,
  DSH_CLIENT_VERSION: '0.2.1-rc.5',
};
const CONFIGURED = { [CLIENT_TITLE_ENV]: TITLE };

async function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

async function fixture(t, { duplicateIndex = false, omitProduct = false, quotedProduct = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'client-title-workspace-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const product = omitProduct ? [] : [quotedProduct
    ? `  const productTitle = '${UPSTREAM_TITLE}';`
    : `  const productTitle = ${JSON.stringify(UPSTREAM_TITLE)};`];
  await writeFiles(root, {
    'apps/web/package.json': JSON.stringify({ name: '@deepseek-ai/dsh-web-frontend' }),
    'apps/web/dist/index.html': [
      '<!doctype html>',
      '<html><head>',
      ...(duplicateIndex ? [`<title>${UPSTREAM_TITLE}</title>`] : []),
      `<title>${UPSTREAM_TITLE}</title>`,
      '</head><body></body></html>',
    ].join('\n'),
    'apps/web/dist/manifest.webmanifest': JSON.stringify({ name: UPSTREAM_TITLE, short_name: UPSTREAM_TITLE }),
    'apps/web/dist/assets/app.js': `export const banner = ${JSON.stringify(UPSTREAM_TITLE)};\n`,
    'packages/client/ui-layout/package.json': JSON.stringify({ name: '@deepseek-ai/dsh-client-ui-layout' }),
    'packages/client/ui-layout/lib/client.js': [
      'export const AppFrame = () => {',
      ...product,
      '  return null;',
      '};',
    ].join('\n'),
    'packages/client/ui-layout/lib/client.js.map': JSON.stringify({
      version: 3,
      sources: ['AppFrame.tsx'],
      sourcesContent: [`const productTitle = ${JSON.stringify(UPSTREAM_TITLE)};`],
    }),
    'packages/client/ui-plugin-manager/package.json': JSON.stringify({ name: '@deepseek-ai/dsh-client-ui-plugin-manager' }),
    'packages/client/ui-plugin-manager/lib/client.js': `export const warning = ${JSON.stringify(`damage ${UPSTREAM_TITLE}`)};\n`,
  });
  const record = { formatVersion: 1, environment: ENVIRONMENT, artifacts: clientArtifactDigest(root) };
  await writeFiles(root, { [BUILD_RECORD]: `${JSON.stringify(record, null, 2)}\n` });
  return root;
}

async function deployedFixture(t, root) {
  const deployed = await mkdtemp(join(tmpdir(), 'client-title-deployed-'));
  t.after(() => rm(deployed, { recursive: true, force: true }));
  await writeFiles(deployed, {
    'lib/bin.js': '#!/usr/bin/env node\n',
    'node_modules/@deepseek-ai/dsh-web-frontend/package.json': JSON.stringify({
      name: '@deepseek-ai/dsh-web-frontend',
      exports: { './package.json': './package.json', './dist/*': './dist/*' },
    }),
    'node_modules/@deepseek-ai/dsh-client-ui-layout/package.json': JSON.stringify({
      name: '@deepseek-ai/dsh-client-ui-layout',
      exports: { './package.json': './package.json' },
    }),
  });
  const dist = resolve(deployed, 'node_modules/@deepseek-ai/dsh-web-frontend/dist');
  await mkdir(dist, { recursive: true });
  await cp(resolve(root, 'apps/web/dist'), dist, { recursive: true });
  const layout = resolve(deployed, 'node_modules/@deepseek-ai/dsh-client-ui-layout/lib');
  await mkdir(layout, { recursive: true });
  await cp(resolve(root, 'packages/client/ui-layout/lib/client.js'), join(layout, 'client.js'));
  return deployed;
}

async function snapshot(root) {
  const files = [...clientArtifactPaths(root), BUILD_RECORD];
  return Object.fromEntries(await Promise.all(files.map(async path =>
    [path, (await readFile(resolve(root, path))).toString('base64')])));
}

test('title configuration is opt-in, trimmed and validated', () => {
  assert.equal(clientTitleFromEnvironment({}), null);
  assert.equal(clientTitleFromEnvironment({ [CLIENT_TITLE_ENV]: '' }), null);
  assert.equal(clientTitleFromEnvironment({ [CLIENT_TITLE_ENV]: ` ${TITLE} ` }), TITLE);
  assert.throws(() => clientTitleFromEnvironment({ [CLIENT_TITLE_ENV]: '   ' }), /CLIENT_TITLE_INVALID/);
  assert.throws(() => clientTitleFromEnvironment({ [CLIENT_TITLE_ENV]: '<script>' }), /CLIENT_TITLE_HTML_UNSAFE/);
  assert.throws(
    () => clientTitleFromEnvironment({ [CLIENT_TITLE_ENV]: `x ${UPSTREAM_TITLE}` }),
    /CLIENT_TITLE_UPSTREAM_CONFLICT/,
  );
});

test('no configured title leaves every client byte identical', async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  assert.deepEqual(await applyClientTitle(root, { environment: {} }), {
    status: 'DISABLED', files: 0, occurrences: 0, changed: [], runtime_paths: [],
  });
  assert.deepEqual(await snapshot(root), before);
});

test('configured title rewrites every surface and re-digests the build record', async (t) => {
  const root = await fixture(t);
  const build = await rewriteClientRuntimeTitle(root, { title: TITLE });

  assert.equal(build.status, 'REWRITTEN');
  assert.deepEqual(build.changed.map(row => row.path), [
    'apps/web/dist/assets/app.js',
    'apps/web/dist/index.html',
    'apps/web/dist/manifest.webmanifest',
    'packages/client/ui-layout/lib/client.js',
    'packages/client/ui-layout/lib/client.js.map',
    'packages/client/ui-plugin-manager/lib/client.js',
  ]);
  assert.match(await readFile(resolve(root, 'apps/web/dist/index.html'), 'utf8'),
    new RegExp(`<title>${TITLE}</title>`));
  assert.doesNotMatch(await readFile(resolve(root, 'packages/client/ui-layout/lib/client.js'), 'utf8'),
    new RegExp(UPSTREAM_TITLE));
  assert.match(await readFile(resolve(root, 'packages/client/ui-layout/lib/client.js'), 'utf8'),
    new RegExp(`const productTitle = "${TITLE}";`));

  const record = JSON.parse(await readFile(resolve(root, BUILD_RECORD), 'utf8'));
  assert.equal(record.environment.DSH_CLIENT_TITLE, TITLE);
  assert.equal(record.environment.DSH_CLIENT_VERSION, ENVIRONMENT.DSH_CLIENT_VERSION);
  assert.deepEqual(record.artifacts, clientArtifactDigest(root));

  assert.equal((await rewriteClientRuntimeTitle(root, { title: TITLE })).status, 'ALREADY_APPLIED');
});

test('deployed output carries the rewritten title and build record', async (t) => {
  const root = await fixture(t);
  const build = await rewriteClientRuntimeTitle(root, { title: TITLE });
  const deployed = await deployedFixture(t, root);
  const installed = installClientRuntimeTitle(root, deployed, build);

  assert.ok(installed.includes(BUILD_RECORD));
  assert.ok(installed.includes('@deepseek-ai/dsh-web-frontend/dist/index.html'));
  assert.ok(installed.includes('@deepseek-ai/dsh-client-ui-layout/lib/client.js'));
  const record = JSON.parse(await readFile(resolve(deployed, BUILD_RECORD), 'utf8'));
  assert.equal(record.environment.DSH_CLIENT_TITLE, TITLE);
  assert.match(await readFile(resolve(deployed, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html'), 'utf8'),
    new RegExp(`<title>${TITLE}</title>`));
  assert.doesNotMatch(
    await readFile(resolve(deployed, 'node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js'), 'utf8'),
    new RegExp(UPSTREAM_TITLE),
  );
});

test('a missing product-title literal fails closed before writing', async (t) => {
  const root = await fixture(t, { omitProduct: true });
  const before = await snapshot(root);
  await assert.rejects(() => rewriteClientRuntimeTitle(root, { title: TITLE }), /CLIENT_TITLE_PRODUCT_UPSTREAM/);
  assert.deepEqual(await snapshot(root), before);
});

test('a mismatched product-title literal fails closed before writing', async (t) => {
  const root = await fixture(t, { quotedProduct: true });
  const before = await snapshot(root);
  await assert.rejects(() => rewriteClientRuntimeTitle(root, { title: TITLE }), /CLIENT_TITLE_PRODUCT_UPSTREAM/);
  assert.deepEqual(await snapshot(root), before);
});

test('a duplicate index title fails closed before writing', async (t) => {
  const root = await fixture(t, { duplicateIndex: true });
  const before = await snapshot(root);
  await assert.rejects(() => rewriteClientRuntimeTitle(root, { title: TITLE }), /CLIENT_TITLE_INDEX_UPSTREAM/);
  assert.deepEqual(await snapshot(root), before);
});

test('provenance names both the staged and the shipped source tree', async (t) => {
  const root = await fixture(t);
  const preparedSourceTree = await runtimeSourceTree(root);
  const build = await rewriteClientRuntimeTitle(root, { title: TITLE });
  const shippedSourceTree = await runtimeSourceTree(root);
  const provenance = clientTitleProvenance({
    build, preparedSourceTree, shippedSourceTree, runtimePaths: [BUILD_RECORD],
  });

  assert.equal(provenance.prepared_source_tree.sha256, preparedSourceTree.sha256);
  assert.equal(provenance.shipped_source_tree.sha256, shippedSourceTree.sha256);
  assert.notEqual(provenance.prepared_source_tree.sha256, provenance.shipped_source_tree.sha256);
  assert.equal(provenance.build_record.environment.DSH_CLIENT_TITLE, TITLE);
  assert.deepEqual(provenance.runtime_paths, [BUILD_RECORD]);
});

test('the release title test is registered in the B0 node test list', async () => {
  const pipeline = await readFile(resolve(process.cwd(), 'scripts/dsh-b0/pipeline.mjs'), 'utf8');
  assert.match(pipeline, /'scripts\/release\/client-runtime-title\.test\.mjs'/);
});
