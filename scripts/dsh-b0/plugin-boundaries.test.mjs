import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectBoundaries } from './plugin-boundaries.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-boundary-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = { schema_version: 'shinemage-plugin-boundary-policy/v1', inspection_baseline_sha: 'a'.repeat(40), owners: {}, allowed_runtime_edges: [], command_owners: [], contracts: [] };
  await mkdir(join(root, 'config'));
  for (const name of ['plugin-kit', 'first', 'second']) {
    await mkdir(join(root, 'dsh-plugins', name, 'src'), { recursive: true });
    await writeFile(join(root, 'dsh-plugins', name, 'package.json'), JSON.stringify({ name: `@shine-mage/${name}`, version: '1.0.0', scripts: { build: 'node build.mjs' } }));
    policy.owners[name] = { domain: name, target_repository: name, kind: name === 'plugin-kit' ? 'dev-tool' : 'plugin' };
  }
  await writeFile(join(root, 'dsh-plugins/plugin-kit/toolchain.json'), JSON.stringify({ upstream_sha: '4'.repeat(40), sdk_version: '0.1.7-rc.2' }));
  const save = () => writeFile(join(root, 'config/shinemage-plugin-boundaries.v1.json'), JSON.stringify(policy));
  const source = (name, content) => writeFile(join(root, 'dsh-plugins', name, 'src/index.ts'), content);
  const edge = (consumer, provider) => ({ consumer, provider, source: `dsh-plugins/${consumer}/src/index.ts`, target: `dsh-plugins/${provider}/src/index.ts`, remedy: 'fixture remediation', retire_when: 'fixture contract published' });
  await save();
  return { root, policy, save, source, edge };
}

test('the checked inventory equals current sources and includes every plugin', async () => {
  const result = await inspectBoundaries();
  const checked = JSON.parse(await readFile(new URL('../../docs/architecture/shinemage-plugin-boundaries.json', import.meta.url), 'utf8'));
  const toolchain = JSON.parse(await readFile(new URL('../../dsh-plugins/plugin-kit/toolchain.json', import.meta.url), 'utf8'));
  assert.deepEqual(result, checked);
  assert.equal(result.packages.length, 13);
  for (const pkg of result.packages) {
    if (pkg.peers['@deepseek-ai/dsh-tools']) assert.equal(pkg.peers['@deepseek-ai/dsh-tools'], toolchain.sdk_version, `${pkg.name} DSH peer drift`);
  }
  assert.equal(result.extraction_exceptions.length, 0);
  assert.ok(result.cross_package_edges.filter(edge => edge.consumer === 'analytics-workbench' && edge.phase === 'runtime').every(edge => edge.access === 'public-export'));
  assert.ok(result.build_layers[0].includes('plugin-kit'));
  assert.ok(result.unresolved_dynamic_imports.every(item => item.phase === 'test'));
});

test('owner target repositories name the live tyuanww repositories', async () => {
  const policy = JSON.parse(await readFile(new URL('../../config/shinemage-plugin-boundaries.v1.json', import.meta.url), 'utf8'));
  const live = new Set([
    'tyuanww/fuqing-crm-analytics',
    'tyuanww/dsh-analytics-workbench',
    'tyuanww/dsh-crm-knowledge',
    'tyuanww/dsh-knowledge',
    'tyuanww/dsh-shine-board',
    'tyuanww/dsh-shine-brand',
    'tyuanww/dsh-shine-crowd-action',
    'tyuanww/dsh-shine-funnel',
    'tyuanww/dsh-shine-query',
    'tyuanww/dsh-shine-waterfall',
    'tyuanww/shinemage-board-components',
  ]);
  for (const [name, owner] of Object.entries(policy.owners)) {
    assert.ok(live.has(owner.target_repository), `BOUNDARY_TARGET_REPOSITORY ${name}: ${owner.target_repository}`);
  }
});


test('parser distinguishes type imports and literal routes without executing source', async t => {
  const f = await fixture(t);
  await f.source('first', "type Thing = import('../../second/src/index.ts').Thing;\nconst route = `/api/v1/items/${id}`;\nthrow new Error('must never execute');\n// import 'comment-only-fake'\n");
  f.policy.allowed_runtime_edges.push(f.edge('first', 'second')); await f.save();
  const result = await inspectBoundaries(f.root);
  assert.equal(result.cross_package_edges.length, 1);
  assert.equal(result.cross_package_edges[0].type_only, true);
  assert.equal(result.literal_endpoints[0].route, '/api/v1/items/{parameter}');
  assert.equal(result.external_imports.length, 0);
  assert.deepEqual(result.build_layers, [['plugin-kit', 'second'], ['first']]);
});

test('new cross-plugin source import fails without an exact reviewed exception', async t => {
  const f = await fixture(t);
  await f.source('first', "export { value } from '../../second/src/index.ts';");
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_UNAPPROVED_EDGE/);
  f.policy.allowed_runtime_edges.push(f.edge('first', 'second')); await f.save();
  assert.equal((await inspectBoundaries(f.root)).cross_package_edges.length, 1);
  await f.source('first', 'export const value = 1;');
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_STALE_EXCEPTION/);
});

test('gateway and absolute service route inventory omits origins and query values', async t => {
  const f = await fixture(t);
  await f.source('first', "const routes = ['/b0/assets', 'http://127.0.0.1:4315/internal/native/fixture?scope=synthetic'];");
  const result = await inspectBoundaries(f.root);
  assert.deepEqual(result.literal_endpoints.map(row => row.route).sort(), ['/b0/assets', '/internal/native/fixture']);
  assert.equal(result.literal_endpoints.find(row => row.route.startsWith('/internal')).contract, 'INTERNAL_NOT_PUBLIC');
});

test('runtime cannot import dev-only kit or unresolved module expressions', async t => {
  const f = await fixture(t);
  await f.source('first', "import { bind } from '../../plugin-kit/toolchain.mjs';");
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_UNAPPROVED_EDGE/);
  await f.source('first', 'const module = await import(userInput);');
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_DYNAMIC_RUNTIME_IMPORT/);
});

test('TypeScript import-equals cannot bypass the direct module boundary', async t => {
  const f = await fixture(t);
  await f.source('first', "import second = require('../../second/src/index.ts');");
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_UNAPPROVED_EDGE/);
  f.policy.allowed_runtime_edges.push(f.edge('first', 'second')); await f.save();
  assert.equal((await inspectBoundaries(f.root)).cross_package_edges[0].type_only, false);
  await f.source('first', "import type Second = require('../../second/src/index.ts');");
  assert.equal((await inspectBoundaries(f.root)).cross_package_edges[0].type_only, true);
});

test('approved source edges still cannot create a build/runtime cycle', async t => {
  const f = await fixture(t);
  for (const [consumer, provider] of [['first', 'second'], ['second', 'first']]) {
    await f.source(consumer, `export { value } from '../../${provider}/src/index.ts';`);
    f.policy.allowed_runtime_edges.push(f.edge(consumer, provider));
  }
  await f.save();
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_DEPENDENCY_CYCLE/);
});

test('unknown policy fields, unowned packages and source symlinks fail closed', async t => {
  const f = await fixture(t);
  f.policy.accidentalOverride = true; await f.save();
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_POLICY_FIELDS/);
  delete f.policy.accidentalOverride; delete f.policy.owners.second; await f.save();
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_OWNER_MISSING/);
  f.policy.owners.second = { domain: 'second', target_repository: 'second', kind: 'plugin' }; await f.save();
  await symlink(join(f.root, 'config'), join(f.root, 'dsh-plugins/first/src/foreign'));
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_SOURCE_SYMLINK/);
});

test('generated contract imports require the exact private dev-only package and published export', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'dsh-plugins/contracts'), { recursive: true });
  f.policy.owners.contracts = { domain: 'generated-contracts', target_repository: 'shinemage-dsh-contracts', kind: 'contract-package' };
  await f.save();
  const provider = { name: '@shine-mage/dsh-contracts', version: '0.1.0', private: true, type: 'module',
    exports: { './value.generated.js': './value.generated.d.ts', './runtime.generated.ts': './runtime.generated.ts' },
    files: ['value.generated.d.ts', 'runtime.generated.ts'] };
  const consumer = { name: '@shine-mage/first', version: '1.0.0',
    devDependencies: { '@shine-mage/dsh-contracts': '0.1.0' } };
  await writeFile(join(f.root, 'dsh-plugins/first/package.json'), JSON.stringify(consumer));
  await writeFile(join(f.root, 'dsh-plugins/contracts/package.json'), JSON.stringify(provider));
  await writeFile(join(f.root, 'dsh-plugins/contracts/value.generated.d.ts'), 'export interface Value { id: string }\n');
  await writeFile(join(f.root, 'dsh-plugins/contracts/runtime.generated.ts'), 'export const value = 1 as const;\n');
  await f.source('first', "import type { Value } from '@shine-mage/dsh-contracts/value.generated.js';\nimport { value } from '@shine-mage/dsh-contracts/runtime.generated.ts';\nexport const id: Value['id'] = String(value);\n");
  const result = await inspectBoundaries(f.root);
  assert.deepEqual(result.cross_package_edges.map(edge => [edge.provider, edge.phase, edge.access]), [['contracts', 'runtime', 'public-export'], ['contracts', 'runtime', 'public-export']]);
  consumer.devDependencies = {}; await writeFile(join(f.root, 'dsh-plugins/first/package.json'), JSON.stringify(consumer));
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_CONTRACT_DEPENDENCY_REQUIRED/);
  consumer.dependencies = { '@shine-mage/dsh-contracts': '0.1.0' }; consumer.devDependencies = { '@shine-mage/dsh-contracts': '0.1.0' }; await writeFile(join(f.root, 'dsh-plugins/first/package.json'), JSON.stringify(consumer));
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_CONTRACT_DEV_ONLY/);
  delete consumer.dependencies; consumer.devDependencies = { '@shine-mage/dsh-contracts': '0.1.0' }; await writeFile(join(f.root, 'dsh-plugins/first/package.json'), JSON.stringify(consumer));
  await f.source('first', "import type { Value } from '@shine-mage/dsh-contracts/value.generated.js';\nexport const id: Value['id'] = 'x';\n");
  provider.files = [];
  await writeFile(join(f.root, 'dsh-plugins/contracts/package.json'), JSON.stringify(provider));
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_CONTRACT_EXPORT_NOT_PACKED/);
});

test('domain public imports require an exact declared package, packed export and digest lock', async t => {
  const f = await fixture(t);
  f.policy.owners.second.kind = 'domain-library'; await f.save();
  const provider = { name: '@shine-mage/second', version: '1.0.0',
    exports: { './geometry': { types: './lib/geometry.d.mts', import: './lib/geometry.mjs' } },
    files: ['lib/geometry.d.mts', 'lib/geometry.mjs'] };
  const consumer = { name: '@shine-mage/first', version: '1.0.0',
    files: ['bundled-dependencies.json'], devDependencies: { '@shine-mage/second': '1.0.0' } };
  await writeFile(join(f.root, 'dsh-plugins/first/package.json'), JSON.stringify(consumer));
  await writeFile(join(f.root, 'dsh-plugins/second/package.json'), JSON.stringify(provider));
  await writeFile(join(f.root, 'dsh-plugins/first/bundled-dependencies.json'), JSON.stringify({
    schema_version: 'shinemage-bundled-dependencies/v1',
    packages: [{ name: '@shine-mage/second', version: '1.0.0', tarball: 'shine-mage-second-1.0.0.tgz', sha256: 'a'.repeat(64) }] }));
  await f.source('first', "export { geometry } from '@shine-mage/second/geometry';");
  const result = await inspectBoundaries(f.root);
  assert.equal(result.cross_package_edges[0].access, 'public-export');
  assert.deepEqual(result.extraction_exceptions, []);
  await f.source('first', "export { geometry } from '@shine-mage/second/src/geometry.mjs';");
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_PRIVATE_SUBPATH/);
  await f.source('first', "export { geometry } from '@shine-mage/second/geometry';");
  provider.files.pop(); await writeFile(join(f.root, 'dsh-plugins/second/package.json'), JSON.stringify(provider));
  await assert.rejects(() => inspectBoundaries(f.root), /BOUNDARY_EXPORT_NOT_PACKED/);
});

test('public kit exports require an exact dev-only build dependency', async t => {
  const f = await fixture(t);
  const name = '@shine-mage/dsh-plugin-kit';
  const provider = { name, version: '0.1.0', files: ['toolchain.mjs'], exports: { './toolchain': './toolchain.mjs' } };
  const consumer = { name: '@shine-mage/first', version: '1.0.0', devDependencies: { [name]: '0.1.0' } };
  const saveConsumer = () => writeFile(join(f.root, 'dsh-plugins/first/package.json'), JSON.stringify(consumer));
  await saveConsumer(); await writeFile(join(f.root, 'dsh-plugins/plugin-kit/package.json'), JSON.stringify(provider));
  const build = join(f.root, 'dsh-plugins/first/build.mjs');
  await writeFile(build, `import { bindToolchain } from '${name}/toolchain';`);
  const result = await inspectBoundaries(f.root);
  assert.equal(result.cross_package_edges[0].access, 'public-export');
  assert.equal(result.cross_package_edges[0].phase, 'build');
  assert.deepEqual(result.extraction_exceptions, []);
  consumer.devDependencies[name] = '^0.1.0'; await saveConsumer();
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_KIT_DEV_ONLY/);
  consumer.devDependencies[name] = '0.1.0'; consumer.dependencies = { [name]: '0.1.0' }; await saveConsumer();
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_KIT_DEV_ONLY/);
  delete consumer.dependencies; await saveConsumer();
  await f.source('first', `import { bindToolchain } from '${name}/toolchain';`);
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_KIT_DEV_ONLY/);
  await f.source('first', '');
  await writeFile(build, `import { bindToolchain } from '${name}/private';`);
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_PRIVATE_SUBPATH/);
  await writeFile(build, `import { bindToolchain } from '${name}/toolchain';`);
  provider.files = []; await writeFile(join(f.root, 'dsh-plugins/plugin-kit/package.json'), JSON.stringify(provider));
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_EXPORT_NOT_PACKED/);
});


test('build-time resolved public kit imports retain dependency and runtime guards', async t => {
  const f = await fixture(t);
  const name = '@shine-mage/dsh-plugin-kit';
  const provider = { name, version: '0.1.0', files: ['packaged-dependencies.mjs'],
    exports: { './packaged-dependencies': './packaged-dependencies.mjs' } };
  const consumer = { name: '@shine-mage/first', version: '1.0.0', devDependencies: { [name]: '0.1.0' } };
  await writeFile(join(f.root, 'dsh-plugins/plugin-kit/package.json'), JSON.stringify(provider));
  const manifestPath = join(f.root, 'dsh-plugins/first/package.json');
  await writeFile(manifestPath, JSON.stringify(consumer));
  const build = join(f.root, 'dsh-plugins/first/author-inputs.mjs');
  const source = `const kit = await import(pathToFileURL(require.resolve('${name}/packaged-dependencies')));`;
  await writeFile(build, source);
  const result = await inspectBoundaries(f.root);
  assert.deepEqual(result.cross_package_edges.map(({ access, phase, specifier }) => ({ access, phase, specifier })),
    [{ access: 'public-export', phase: 'build', specifier: `${name}/packaged-dependencies` }]);
  assert.deepEqual(result.unresolved_dynamic_imports, []);
  consumer.devDependencies[name] = '^0.1.0'; await writeFile(manifestPath, JSON.stringify(consumer));
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_KIT_DEV_ONLY/);
  consumer.devDependencies[name] = '0.1.0'; await writeFile(manifestPath, JSON.stringify(consumer));
  await writeFile(build, source.replace('/packaged-dependencies', '/private'));
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_PRIVATE_SUBPATH/);
  for (const expression of ['pathToFileURL(require.resolve(userInput))', 'pathToFileURL(other.resolve("x"))']) {
    await writeFile(build, `const kit = await import(${expression});`);
    await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_DYNAMIC_RUNTIME_IMPORT/);
  }
  await writeFile(build, ''); await f.source('first', source);
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_DYNAMIC_RUNTIME_IMPORT/);
});

test('build consumers cannot fall back to sibling kit source', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'dsh-plugins/first/build.mjs'), "import '../plugin-kit/toolchain.mjs';");
  await assert.rejects(inspectBoundaries(f.root), /BOUNDARY_UNAPPROVED_EDGE/);
});
