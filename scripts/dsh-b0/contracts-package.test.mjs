/** P2d guard: generated contract outputs live in one package and consumers only
 *  import its exports. Byte sync is fail-closed by re-running every generator in
 *  this repository (B0 also re-runs the 15 sealed public compiler contracts in
 *  an isolated stage); plugins must not regain generated copies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstatSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const CONTRACT_PACKAGE = 'dsh-plugins/contracts';
const CONTRACT_NAME = '@shine-mage/dsh-contracts';
const PUBLIC_GENERATORS = [
  'content-theme', 'cockpit-slot', 'run-kernel', 'query', 'query-run', 'analysis', 'cockpit', 'first-purchase',
  'first-purchase-analysis', 'first-purchase-cockpit', 'competition-c0', 'competition-chart', 'competition-computed',
  'board-spec', 'page',
].map(name => `scripts/dsh-b0/${name}-contract.mjs`);
// The single reviewed exception: its contract_hash binds the author archive
// fixture and includes the output path, so moving it needs an author CI rebuild.
const LEGACY_GENERATED = ['dsh-plugins/analytics-workbench/src/competition-c0-contract.generated.d.ts'];
const TYPE_CHECK_CONSUMERS = [
  'dsh-plugins/analytics-workbench/test/analysis-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/test/cockpit-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/test/first-purchase-analysis-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/test/first-purchase-cockpit-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/test/first-purchase-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/test/query-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/test/query-run-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/test/run-contract.typecheck.ts',
  'dsh-plugins/analytics-workbench/src/free-page/contract/page-contract.typecheck.ts',
  'dsh-plugins/crm-knowledge/test/contract.typecheck.ts',
  'dsh-plugins/knowledge/test/contract.typecheck.ts',
];
const sourceFile = /\.[cm]?[jt]sx?$/;
const normalize = value => value.split(sep).join('/');
const exists = path => { try { return lstatSync(path).isFile(); } catch { return false; } };

async function walk(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(join(directory, entry.name), path));
    else files.push(path);
  }
  return files;
}

const contractRoot = join(repository, CONTRACT_PACKAGE);
const manifest = JSON.parse(await readFile(join(contractRoot, 'package.json'), 'utf8'));
const generated = (await walk(contractRoot)).filter(path => path.includes('.generated.'));
const generatedPaths = generated.map(path => `${CONTRACT_PACKAGE}/${path}`).sort();
const exportsMap = manifest.exports ?? {};

/** Canonical subpath for one generated file, mirroring the generator target. */
function canonicalKey(relative) {
  const domain = relative.split('/')[0];
  const rest = relative.slice(domain.length + 1);
  if (rest.endsWith('.generated.d.ts')) return `./${domain}/${rest.slice(0, -'.d.ts'.length)}.js`;
  if (rest.endsWith('.generated.ts')) return `./${domain}/${rest}`;
  if (rest.endsWith('.generated.mjs')) return `./${domain}/${rest}`;
  throw new Error(`unexpected generated extension: ${relative}`);
}

test('the contracts package owns every generated output except the reviewed C0 exception', async () => {
  assert.equal(manifest.name, CONTRACT_NAME);
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.private, true, 'CONTRACT_PACKAGE_PRIVATE');
  assert.equal(manifest.type, 'module');
  assert.equal(generatedPaths.length, 30, 'CONTRACT_GENERATED_COUNT');
  const plugins = (await readdir(join(repository, 'dsh-plugins'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name !== 'contracts').map(entry => `dsh-plugins/${entry.name}`);
  const stray = [];
  for (const plugin of plugins) {
    for (const path of await walk(join(repository, plugin), plugin)) {
      if (path.includes('.generated.')) stray.push(path);
    }
  }
  assert.deepEqual(stray.sort(), LEGACY_GENERATED, 'CONTRACT_PLUGIN_LOCAL_GENERATED');
});

test('every generated file is exported and published in files/', () => {
  const published = new Set(manifest.files ?? []);
  for (const relative of generated) {
    const domain = relative.split('/')[0];
    const rest = relative.slice(domain.length + 1);
    const key = canonicalKey(relative);
    assert.equal(exportsMap[key], `./${relative}`, `CONTRACT_EXPORT_MISSING ${key}`);
    if (rest.endsWith('.generated.ts')) {
      const alias = `./${domain}/${rest.slice(0, -'.ts'.length)}.js`;
      assert.equal(exportsMap[alias], `./${relative}`, `CONTRACT_TYPE_ALIAS_MISSING ${alias}`);
    }
    assert.ok(published.has(relative), `CONTRACT_FILE_NOT_PUBLISHED ${relative}`);
  }
  for (const [key, target] of Object.entries(exportsMap)) {
    assert.match(key, /^\.\/[A-Za-z0-9_./-]+$/, `CONTRACT_EXPORT_KEY ${key}`);
    if (key === './package.json') { assert.equal(target, './package.json'); continue; }
    assert.ok(typeof target === 'string' && target.startsWith('./'), `CONTRACT_EXPORT_TARGET ${key}`);
    assert.ok(/\.generated\.(?:d\.ts|ts|mjs)$/.test(target), `CONTRACT_EXPORT_NON_GENERATED ${key} -> ${target}`);
    assert.ok(published.has(target.slice(2)), `CONTRACT_EXPORT_NOT_PUBLISHED ${key} -> ${target}`);
  }
  for (const file of published) {
    if (file === 'package.json' || file === 'README.md') continue;
    assert.ok(exists(join(contractRoot, file)), `CONTRACT_PUBLISHED_FILE_MISSING ${file}`);
  }
});

test('plugin sources only consume generated contracts through package exports', async () => {
  const problems = [];
  const plugins = (await readdir(join(repository, 'dsh-plugins'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name !== 'contracts').map(entry => `dsh-plugins/${entry.name}`);
  for (const plugin of plugins) {
    for (const path of (await walk(join(repository, plugin), plugin))) {
      if (!sourceFile.test(path)) continue;
      const source = await readFile(join(repository, path), 'utf8');
      for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*)'([^']+)'/g)) {
        const specifier = match[1];
        if (specifier.startsWith(`${CONTRACT_NAME}/`)) {
          const key = `.${specifier.slice(CONTRACT_NAME.length)}`;
          if (!(key in exportsMap)) problems.push(`CONTRACT_PRIVATE_SUBPATH ${path} -> ${specifier}`);
          continue;
        }
        if (specifier.startsWith('.') && /\.generated\./.test(specifier)) {
          const relative = normalize(resolve(join(repository, path), '..', specifier)).slice(repository.length + 1);
          const normalized = relative.endsWith('.js') ? `${relative.slice(0, -'.js'.length)}.d.ts` : relative;
          if (!LEGACY_GENERATED.includes(normalized)) problems.push(`CONTRACT_RELATIVE_GENERATED ${path} -> ${specifier}`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], `CONTRACT_CONSUMER_IMPORT ${problems.join(', ')}`);
  const legacyConsumer = await readFile(join(repository, 'dsh-plugins/analytics-workbench/src/client/competition-board/types.ts'), 'utf8');
  assert.ok(legacyConsumer.includes("from '../../competition-c0-contract.generated.d.ts'"), 'CONTRACT_LEGACY_IMPORT_DRIFT');
});

test('plugin manifests declare the contract package as exact dev-only input', async () => {
  for (const name of ['analytics-workbench', 'crm-knowledge', 'knowledge']) {
    const plugin = JSON.parse(await readFile(join(repository, 'dsh-plugins', name, 'package.json'), 'utf8'));
    assert.equal(plugin.devDependencies?.[CONTRACT_NAME], manifest.version, `CONTRACT_DEPENDENCY ${name}`);
    assert.ok(!plugin.dependencies?.[CONTRACT_NAME] && !plugin.peerDependencies?.[CONTRACT_NAME], `CONTRACT_RUNTIME_DEPENDENCY ${name}`);
  }
  const workspace = await readFile(join(repository, 'dsh-plugins/analytics-workbench/pnpm-workspace.yaml'), 'utf8');
  assert.match(workspace, /^\s+- \.\.\/contracts$/m, 'CONTRACT_WORKSPACE_ENTRY');
});

test('the public and CRM generators target the package exports', async () => {
  const expected = new Set(generatedPaths);
  for (const script of PUBLIC_GENERATORS) {
    const source = await readFile(join(repository, script), 'utf8');
    for (const match of source.matchAll(/(dsh-plugins\/contracts\/[A-Za-z0-9_./-]+\.generated\.(?:d\.ts|ts|mjs))/g)) {
      assert.ok(expected.has(match[1]), `CONTRACT_GENERATOR_UNKNOWN_TARGET ${script} -> ${match[1]}`);
    }
  }
  for (const script of ['scripts/crm-calibration/generate_contract.py', 'scripts/crm-calibration/generate_types.mjs']) {
    const source = await readFile(join(repository, script), 'utf8');
    assert.ok(source.includes('dsh-plugins/contracts'), `CONTRACT_CRM_GENERATOR_TARGET ${script}`);
    assert.doesNotMatch(source, /dsh-plugins\/\{?plugin\}?\/src\//, `CONTRACT_CRM_GENERATOR_LEGACY_TARGET ${script}`);
  }
  const c0Generator = await readFile(join(repository, 'scripts/dsh-b0/competition-c0-contract.mjs'), 'utf8');
  assert.ok(c0Generator.includes(LEGACY_GENERATED[0]), 'CONTRACT_C0_LEGACY_TARGET');
});

test('re-running every generator leaves the package byte-identical', async () => {
  const python = process.env.FQ_B0_PYTHON ?? process.env.B0_PYTHON
    ?? execFileSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).trim();
  const before = new Map();
  for (const relative of generatedPaths) before.set(relative, await readFile(join(repository, relative)));
  for (const script of PUBLIC_GENERATORS) {
    const args = [script, '--check'];
    if (!script.endsWith('content-theme-contract.mjs') && !script.endsWith('cockpit-slot-contract.mjs')) args.push('--python', python);
    execFileSync(process.execPath, args, { cwd: repository, stdio: 'pipe', timeout: 120000,
      env: { ...process.env, PYTHONPATH: repository } });
  }
  // The CRM OpenAPI generator needs the full backend dependency closure, which
  // only the Python plan job installs; backend/tests/test_crm_service_contracts.py
  // already runs generate_contract.py --check there. The Node generator runs on
  // the pinned build-tools available to this job.
  execFileSync(process.execPath, ['scripts/crm-calibration/generate_types.mjs', '--check'],
    { cwd: repository, stdio: 'pipe', timeout: 120000 });
  for (const [relative, bytes] of before) {
    assert.deepEqual(await readFile(join(repository, relative)), bytes, `CONTRACT_GENERATOR_DRIFT ${relative}`);
  }
});

test('migrated typecheck companions compile against the package exports', async t => {
  const tools = createRequire(join(repository, 'dsh-plugins/plugin-kit/build-tools/package.json'));
  const ts = tools('typescript');
  assert.equal(ts.version, '6.0.3');
  // The CRM access contracts augment the pinned Cordis Context; main CI does not
  // install the SDK, so supply the reviewed empty interface shape for this
  // compile-only consumer check. Producer author CI still checks the real SDK.
  const stubRoot = await mkdtemp(join(tmpdir(), 'contract-typecheck-'));
  t.after(() => rm(stubRoot, { recursive: true, force: true }));
  const cordisStub = join(stubRoot, 'cordis.d.ts');
  await writeFile(cordisStub, 'export interface Context {}\n');
  const program = ts.createProgram(TYPE_CHECK_CONSUMERS.map(relative => join(repository, relative)), {
    strict: true, noEmit: true, skipLibCheck: false,
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
    types: [], typeRoots: [],
    paths: { [`${CONTRACT_NAME}/*`]: [join(repository, `${CONTRACT_PACKAGE}/*`)],
      '@deepseek-ai/cordis': [cordisStub] },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => repository, getNewLine: () => '\n',
  }));
  const closure = program.getSourceFiles().filter(file => !program.isSourceFileDefaultLibrary(file))
    .map(file => normalize(file.fileName));
  const internals = closure.filter(path => path.includes('.generated.'));
  assert.ok(internals.length > 0, 'CONTRACT_TYPECHECK_CLOSURE_EMPTY');
  assert.ok(internals.every(path => path.startsWith(join(repository, CONTRACT_PACKAGE))), 'CONTRACT_TYPECHECK_SOURCE_LEAK');
});
