import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
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

/**
 * Deployed tree laid out the way a real rc.5 `pnpm deploy` lays it out.
 *
 * A 0.2.1-rc.5 runtime archive (upstream `b830ec95`) stores the client
 * packages in the pnpm virtual store, never at the top level:
 *
 *   node_modules/.pnpm/node_modules/@deepseek-ai/dsh-web-frontend -> ../../<store>/...
 *   node_modules/.pnpm/node_modules/@deepseek-ai/dsh-client-ui-layout -> ../../<store>/...
 *   node_modules/.pnpm/node_modules/@deepseek-ai/dsh-web-app -> <web-app package>
 *   node_modules/@deepseek-ai/dsh-web-app -> ../.pnpm/<store>/...
 *   <web-app package>/node_modules/@deepseek-ai/dsh-web-frontend -> ...
 *
 * The store entries are real byte copies of the rewritten workspace, and the
 * hoisted entries are relative symlinks into the store, exactly like pnpm.
 */
const PNPM_STORE = 'node_modules/.pnpm';
const PNPM_FRONTEND_STORE = '@deepseek-ai+dsh-web-frontend@file+fixture/node_modules/@deepseek-ai/dsh-web-frontend';
const PNPM_LAYOUT_STORE = '@deepseek-ai+dsh-client-ui-layout@file+fixture/node_modules/@deepseek-ai/dsh-client-ui-layout';
const PNPM_WEB_APP_STORE = '@deepseek-ai+dsh-web-app@file+fixture/node_modules/@deepseek-ai/dsh-web-app';

async function pnpmDeployedFixture(t, root, { hoisted = true, omit = null } = {}) {
  const deployed = await mkdtemp(join(tmpdir(), 'client-title-deployed-pnpm-'));
  t.after(() => rm(deployed, { recursive: true, force: true }));
  const packageFiles = {
    [`${PNPM_STORE}/${PNPM_WEB_APP_STORE}/package.json`]: JSON.stringify({ name: '@deepseek-ai/dsh-web-app' }),
    [`${PNPM_STORE}/${PNPM_WEB_APP_STORE}/lib/index.js`]: 'export const app = true;\n',
  };
  if (omit !== '@deepseek-ai/dsh-web-frontend') {
    packageFiles[`${PNPM_STORE}/${PNPM_FRONTEND_STORE}/package.json`] = JSON.stringify({
      name: '@deepseek-ai/dsh-web-frontend',
      exports: { './package.json': './package.json', './dist/*': './dist/*' },
    });
  }
  if (omit !== '@deepseek-ai/dsh-client-ui-layout') {
    packageFiles[`${PNPM_STORE}/${PNPM_LAYOUT_STORE}/package.json`] = JSON.stringify({
      name: '@deepseek-ai/dsh-client-ui-layout',
      exports: { './package.json': './package.json' },
    });
  }
  await writeFiles(deployed, { ...packageFiles, 'lib/bin.js': '#!/usr/bin/env node\n' });

  const webApp = resolve(deployed, PNPM_STORE, PNPM_WEB_APP_STORE);
  const frontend = resolve(deployed, PNPM_STORE, PNPM_FRONTEND_STORE);
  const layout = resolve(deployed, PNPM_STORE, PNPM_LAYOUT_STORE);
  if (omit !== '@deepseek-ai/dsh-web-frontend') {
    await cp(resolve(root, 'apps/web/dist'), resolve(frontend, 'dist'), { recursive: true });
  }
  if (omit !== '@deepseek-ai/dsh-client-ui-layout') {
    await mkdir(resolve(layout, 'lib'), { recursive: true });
    await cp(resolve(root, 'packages/client/ui-layout/lib/client.js'), resolve(layout, 'lib/client.js'));
  }

  const link = async (target, path) => {
    await mkdir(dirname(path), { recursive: true });
    await symlink(relative(dirname(path), target), path, 'dir');
  };
  // `dsh-web-app/node_modules`: how pnpm reaches a dependency it does not hoist.
  if (omit === null) {
    await link(frontend, resolve(webApp, 'node_modules/@deepseek-ai/dsh-web-frontend'));
    await link(layout, resolve(webApp, 'node_modules/@deepseek-ai/dsh-client-ui-layout'));
  }
  await link(webApp, resolve(deployed, 'node_modules/@deepseek-ai/dsh-web-app'));
  await link(webApp, resolve(deployed, PNPM_STORE, 'node_modules/@deepseek-ai/dsh-web-app'));
  if (hoisted) {
    // `node_modules/.pnpm/node_modules`: the pnpm virtual-store hoist root.
    if (omit !== '@deepseek-ai/dsh-web-frontend') {
      await link(frontend, resolve(deployed, PNPM_STORE, 'node_modules/@deepseek-ai/dsh-web-frontend'));
    }
    if (omit !== '@deepseek-ai/dsh-client-ui-layout') {
      await link(layout, resolve(deployed, PNPM_STORE, 'node_modules/@deepseek-ai/dsh-client-ui-layout'));
    }
  }
  return deployed;
}

function pnpmStorePath(deployed, path) {
  return resolve(deployed, PNPM_STORE, path);
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

test('the real pnpm deploy layout ships the rewritten title, record and provenance', async (t) => {
  const root = await fixture(t);
  const preparedDigest = clientArtifactDigest(root);
  const preparedSourceTree = await runtimeSourceTree(root);
  const build = await rewriteClientRuntimeTitle(root, { title: TITLE });
  const deployed = await pnpmDeployedFixture(t, root);
  // Model the live rc.5 layout: neither package exists at the top level.
  await assert.rejects(access(resolve(deployed, 'node_modules/@deepseek-ai/dsh-web-frontend')), /ENOENT/);
  await assert.rejects(access(resolve(deployed, 'node_modules/@deepseek-ai/dsh-client-ui-layout')), /ENOENT/);

  const installed = installClientRuntimeTitle(root, deployed, build);

  assert.deepEqual(installed, [
    '@deepseek-ai/dsh-web-frontend/dist/index.html',
    '@deepseek-ai/dsh-client-ui-layout/lib/client.js',
    BUILD_RECORD,
  ]);

  const indexBytes = await readFile(pnpmStorePath(deployed, `${PNPM_FRONTEND_STORE}/dist/index.html`), 'utf8');
  assert.equal(indexBytes.split(`<title>${TITLE}</title>`).length - 1, 1);
  assert.doesNotMatch(indexBytes, new RegExp(UPSTREAM_TITLE));
  const layoutBytes = await readFile(pnpmStorePath(deployed, `${PNPM_LAYOUT_STORE}/lib/client.js`), 'utf8');
  assert.equal(layoutBytes.split(`const productTitle = ${JSON.stringify(TITLE)};`).length - 1, 1);
  assert.doesNotMatch(layoutBytes, new RegExp(UPSTREAM_TITLE));

  const record = JSON.parse(await readFile(resolve(deployed, BUILD_RECORD), 'utf8'));
  assert.equal(record.environment.DSH_CLIENT_TITLE, TITLE);
  assert.deepEqual(record.artifacts, clientArtifactDigest(root));
  assert.notEqual(record.artifacts.sha256, preparedDigest.sha256);
  assert.deepEqual(await readFile(resolve(deployed, BUILD_RECORD)), await readFile(resolve(root, BUILD_RECORD)));

  const shippedSourceTree = await runtimeSourceTree(root);
  const { client_title_build: provenance } = {
    client_title_build: clientTitleProvenance({ build, preparedSourceTree, shippedSourceTree, runtimePaths: installed }),
  };
  assert.equal(provenance.shipped_source_tree.sha256, shippedSourceTree.sha256);
  assert.equal(provenance.shipped_source_tree.entries, shippedSourceTree.entries);
  assert.notEqual(provenance.prepared_source_tree.sha256, provenance.shipped_source_tree.sha256);
  assert.equal(provenance.build_record.environment.DSH_CLIENT_TITLE, TITLE);
  assert.deepEqual(provenance.runtime_paths, installed);
});

test('the resolver follows dsh-web-app/node_modules when the store does not hoist the packages', async (t) => {
  const root = await fixture(t);
  const build = await rewriteClientRuntimeTitle(root, { title: TITLE });
  const deployed = await pnpmDeployedFixture(t, root, { hoisted: false });
  await assert.rejects(access(resolve(deployed, 'node_modules/.pnpm/node_modules/@deepseek-ai/dsh-web-frontend')), /ENOENT/);
  await assert.rejects(access(resolve(deployed, 'node_modules/.pnpm/node_modules/@deepseek-ai/dsh-client-ui-layout')), /ENOENT/);

  const installed = installClientRuntimeTitle(root, deployed, build);
  assert.deepEqual(installed, [
    '@deepseek-ai/dsh-web-frontend/dist/index.html',
    '@deepseek-ai/dsh-client-ui-layout/lib/client.js',
    BUILD_RECORD,
  ]);
  assert.match(await readFile(pnpmStorePath(deployed, `${PNPM_FRONTEND_STORE}/dist/index.html`), 'utf8'),
    new RegExp(`<title>${TITLE}</title>`));
});

test('the pnpm deploy layout still fails closed when a package cannot be found', async (t) => {
  const root = await fixture(t);
  const build = await rewriteClientRuntimeTitle(root, { title: TITLE });
  const deployed = await pnpmDeployedFixture(t, root, { omit: '@deepseek-ai/dsh-client-ui-layout' });

  assert.throws(
    () => installClientRuntimeTitle(root, deployed, build),
    /CLIENT_TITLE_RUNTIME_PACKAGE_MISSING @deepseek-ai\/dsh-client-ui-layout/,
  );
  // Fail-closed: the missing package is reported before the build record ships.
  await assert.rejects(access(resolve(deployed, BUILD_RECORD)), /ENOENT/);
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
