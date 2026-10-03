/** Read-only source inventory. --write updates only the generated boundary manifest. */
import assert from 'node:assert/strict';
import { validatePackageLock } from '../../dsh-plugins/plugin-kit/packaged-dependencies.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const policyPath = 'config/shinemage-plugin-boundaries.v1.json';
const inventoryPath = 'docs/architecture/shinemage-plugin-boundaries.json';
const normalize = value => value.split(sep).join('/');
const sourceFile = /\.[cm]?[jt]sx?$/;
const excluded = new Set(['node_modules', 'lib', 'dist', 'build-tools', '.git', '.context']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = values => [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
const fieldKeys = (value, keys, code) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
const safePath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(part => part && !['.', '..'].includes(part));

export function validateBoundaryPolicy(policy) {
  fieldKeys(policy, ['schema_version', 'inspection_baseline_sha', 'owners', 'allowed_runtime_edges', 'command_owners', 'contracts'], 'BOUNDARY_POLICY_FIELDS');
  assert.equal(policy.schema_version, 'shinemage-plugin-boundary-policy/v1', 'BOUNDARY_POLICY_VERSION');
  assert.match(policy.inspection_baseline_sha, /^[a-f0-9]{40}$/, 'BOUNDARY_POLICY_SOURCE');
  for (const [name, owner] of Object.entries(policy.owners)) {
    assert.match(name, /^[a-z0-9-]+$/, 'BOUNDARY_OWNER_NAME');
    fieldKeys(owner, ['domain', 'target_repository', 'kind'], 'BOUNDARY_OWNER_FIELDS');
    assert.ok(['plugin', 'dev-tool', 'domain-library'].includes(owner.kind) && owner.domain && owner.target_repository, 'BOUNDARY_OWNER_INVALID');
  }
  for (const edge of policy.allowed_runtime_edges) {
    fieldKeys(edge, ['consumer', 'provider', 'source', 'target', 'remedy', 'retire_when'], 'BOUNDARY_EDGE_FIELDS');
    assert.ok(policy.owners[edge.consumer] && policy.owners[edge.provider] && safePath(edge.source) && safePath(edge.target) && edge.remedy && edge.retire_when, 'BOUNDARY_EDGE_INVALID');
  }
  for (const entry of policy.command_owners) {
    fieldKeys(entry, ['entry', 'owner', 'scope'], 'BOUNDARY_COMMAND_FIELDS');
    assert.ok(safePath(entry.entry) && entry.owner && entry.scope, 'BOUNDARY_COMMAND_INVALID');
  }
  for (const contract of policy.contracts) {
    fieldKeys(contract, ['id', 'owner', 'source', 'generator', 'consumers', 'compatibility', 'status'], 'BOUNDARY_CONTRACT_FIELDS');
    assert.ok(contract.id && contract.owner && safePath(contract.source) && Array.isArray(contract.consumers) && contract.consumers.length && contract.compatibility, 'BOUNDARY_CONTRACT_INVALID');
    assert.ok(contract.generator === null || safePath(contract.generator), 'BOUNDARY_GENERATOR_INVALID');
    assert.ok(['PINNED_UPSTREAM', 'INTERNAL_NOT_PUBLIC', 'DOMAIN_V1', 'GENERATED_DOMAIN_V1'].includes(contract.status), 'BOUNDARY_CONTRACT_STATUS');
  }
  return policy;
}

export async function inspectBoundaries(root = repository) {
  root = resolve(root);
  const policy = validateBoundaryPolicy(JSON.parse(await readFile(join(root, policyPath), 'utf8')));
  const tools = createRequire(join(repository, 'dsh-plugins/plugin-kit/build-tools/package.json'));
  const ts = tools('typescript');
  assert.equal(ts.version, '6.0.3', 'BOUNDARY_PARSER_VERSION');
  const pin = JSON.parse(await readFile(join(root, 'dsh-plugins/plugin-kit/toolchain.json'), 'utf8'));
  const packages = [];
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (excluded.has(entry.name) || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'BOUNDARY_SOURCE_SYMLINK');
      if (entry.isDirectory()) await walk(path);
      else if (sourceFile.test(entry.name)) {
        assert.ok(entry.isFile(), 'BOUNDARY_SOURCE_SPECIAL');
        files.push(path);
        assert.ok(files.length <= 10000, 'BOUNDARY_SOURCE_COUNT_LIMIT');
      }
    }
  }
  for (const directory of (await readdir(join(root, 'dsh-plugins'), { withFileTypes: true })).filter(entry => entry.isDirectory())) {
    const path = join(root, 'dsh-plugins', directory.name);
    const manifestInfo = await lstat(join(path, 'package.json'));
    assert.ok(manifestInfo.isFile() && !manifestInfo.isSymbolicLink() && manifestInfo.size < 1024 * 1024, 'BOUNDARY_MANIFEST_INVALID');
    const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    assert.ok(policy.owners[directory.name], `BOUNDARY_OWNER_MISSING ${directory.name}`);
    const owner = policy.owners[directory.name];
    const lock = await readFile(join(path, 'bundled-dependencies.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    const bundled = lock ? validatePackageLock(JSON.parse(lock), manifest).packages : [];
    assert.ok(bundled.length || !Object.keys(manifest.devDependencies ?? {}).some(name => name.startsWith('@shine-mage/')), 'BOUNDARY_BUNDLED_LOCK_REQUIRED');
    packages.push({ path: normalize(relative(root, path)), name: manifest.name, version: manifest.version, ...owner,
      exports: manifest.exports ?? {}, files: manifest.files ?? [], peers: manifest.peerDependencies ?? {},
      dependencies: manifest.dependencies ?? {}, dev_dependencies: manifest.devDependencies ?? {}, bundled_inputs: bundled, dsh: manifest.dsh ?? {},
      commands: manifest.scripts ?? {}, manifest_sha256: hash(await readFile(join(path, 'package.json'))) });
    await walk(path);
  }
  assert.deepEqual(packages.map(p => p.path.split('/').at(-1)).sort(), Object.keys(policy.owners).sort(), 'BOUNDARY_OWNER_STALE');
  const identify = path => packages.find(p => path === p.path || path.startsWith(`${p.path}/`));
  const edges = [], repositoryEdges = [], endpoints = [], dynamic = [], external = new Map();
  for (const path of files.sort()) {
    const source = normalize(relative(root, path));
    const consumer = identify(source).path.split('/').at(-1);
    const phase = /(?:^|\/)(?:test|tests)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(source) ? 'test'
      : source.includes('/src/') ? 'runtime' : 'build';
    const info = await lstat(path);
    assert.ok(info.isFile() && info.size < 8 * 1024 * 1024, 'BOUNDARY_SOURCE_LIMIT');
    const ast = ts.createSourceFile(source, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
    assert.equal(ast.parseDiagnostics.length, 0, `BOUNDARY_PARSE_FAILED ${source}`);
    function record(specifier, typeOnly) {
      let target, access = 'source';
      if (specifier.startsWith('.')) target = normalize(relative(root, resolve(dirname(path), specifier)));
      else {
        const pkg = packages.find(p => specifier === p.name || specifier.startsWith(`${p.name}/`));
        if (pkg) {
          target = pkg.path; access = 'public-export';
          const key = specifier === pkg.name ? '.' : `.${specifier.slice(pkg.name.length)}`;
          const exported = pkg.exports[key];
          assert.ok(exported, `BOUNDARY_PRIVATE_SUBPATH ${specifier}`);
          const targets = typeof exported === 'string' ? [exported] : Object.values(exported);
          assert.ok(targets.length && targets.every(value => typeof value === 'string' && value.startsWith('./lib/') && pkg.files.includes(value.slice(2))), 'BOUNDARY_EXPORT_NOT_PACKED');
          const caller = packages.find(p => p.path.split('/').at(-1) === consumer);
          assert.ok(pkg.kind === 'domain-library' && caller.bundled_inputs.some(row => row.name === pkg.name && row.version === pkg.version), `BOUNDARY_PUBLIC_DEPENDENCY_REQUIRED ${specifier}`);
        }
        else {
          if (specifier.startsWith('@shine-mage/')) throw new Error(`BOUNDARY_UNDECLARED_PACKAGE ${source}`);
          const key = `${consumer}:${phase}:${specifier}`;
          external.set(key, { consumer, phase, specifier });
          return;
        }
      }
      const provider = identify(target)?.path.split('/').at(-1);
      if (provider === consumer) return;
      if (!provider) {
        assert.ok(phase !== 'runtime' && /^(?:scripts|backend|config|frontend-vue3)\//.test(target), `BOUNDARY_OUTSIDE_PACKAGE ${source} -> ${target}`);
        repositoryEdges.push({ consumer, phase, source, target });
        return;
      }
      edges.push({ consumer, provider, phase, source, target, specifier, access, type_only: typeOnly });
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        record(node.moduleSpecifier.text, Boolean(node.isTypeOnly || node.importClause?.isTypeOnly));
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        assert.ok(expression && ts.isStringLiteral(expression), 'BOUNDARY_IMPORT_EQUALS_UNRESOLVED');
        record(expression.text, Boolean(node.isTypeOnly));
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        record(node.argument.literal.text, true);
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) record(node.arguments[0].text, false);
        else dynamic.push({ consumer, phase, source, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 });
      }
      let route;
      if (ts.isStringLiteralLike(node)) route = node.text;
      else if (ts.isTemplateExpression(node)) route = node.head.text + node.templateSpans.map(span => `{parameter}${span.literal.text}`).join('');
      // Inventory the gateway paths as well as service paths. Keep origins and
      // query values out of the report; they are configuration, not contracts.
      if (route) route = route.replace(/^https?:\/\/[^/]+(?=\/)/, '').split(/[?#]/)[0];
      if (route && /^\/(?:api|internal|b0)\//.test(route) && !/[\s\n]/.test(route)) {
        endpoints.push({ consumer, phase, source, route, contract: route.startsWith('/internal/') ? 'INTERNAL_NOT_PUBLIC' : 'OBSERVED_NOT_FROZEN' });
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  for (const edge of edges) {
    if (edge.access === 'public-export') continue;
    if (edge.phase === 'test' || (edge.phase === 'build' && edge.provider === 'plugin-kit')) continue;
    assert.ok(policy.allowed_runtime_edges.some(rule => ['consumer', 'provider', 'source', 'target'].every(key => rule[key] === edge[key])), `BOUNDARY_UNAPPROVED_EDGE ${edge.source} -> ${edge.target}`);
  }
  for (const rule of policy.allowed_runtime_edges) assert.ok(edges.some(edge => ['consumer', 'provider', 'source', 'target'].every(key => rule[key] === edge[key])), `BOUNDARY_STALE_EXCEPTION ${rule.source}`);
  assert.ok(dynamic.every(item => item.phase === 'test'), 'BOUNDARY_DYNAMIC_RUNTIME_IMPORT requires an explicit resolvable module contract');
  const remaining = new Set(Object.keys(policy.owners)), buildOrder = [];
  while (remaining.size) {
    const ready = [...remaining].filter(name => !edges.some(edge => edge.phase !== 'test' && edge.consumer === name && remaining.has(edge.provider))).sort();
    assert.ok(ready.length, 'BOUNDARY_DEPENDENCY_CYCLE');
    buildOrder.push(ready); ready.forEach(name => remaining.delete(name));
  }
  const contracts = [];
  for (const entry of policy.contracts) {
    assert.ok(/^(?:backend\/contracts\/|dsh-plugins\/)/.test(entry.source) && /\.(?:json|[cm]?[jt]sx?)$/.test(entry.source), 'BOUNDARY_CONTRACT_SOURCE');
    const info = await lstat(join(root, entry.source));
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 8 * 1024 * 1024, 'BOUNDARY_CONTRACT_FILE');
    const bytes = await readFile(join(root, entry.source));
    if (entry.generator) assert.ok((await lstat(join(root, entry.generator))).isFile(), 'BOUNDARY_GENERATOR_FILE');
    contracts.push({ ...entry, source_sha256: hash(bytes) });
  }
  for (const command of policy.command_owners) assert.ok((await lstat(join(root, command.entry))).isFile(), `BOUNDARY_COMMAND_MISSING ${command.entry}`);
  return { schema_version: 'shinemage-plugin-boundaries/v1', inspection_baseline_sha: policy.inspection_baseline_sha,
    upstream: { sha: pin.upstream_sha, sdk_version: pin.sdk_version, pin_owner: 'dsh-plugins/plugin-kit/toolchain.json' },
    scope: 'static-source-imports-and-literal-routes; not a runtime conformance test',
    packages: sorted(packages), source_files_scanned: files.length, cross_package_edges: sorted(edges),
    build_layers: buildOrder, repository_edges: sorted(repositoryEdges), literal_endpoints: sorted([...new Map(endpoints.map(e => [JSON.stringify(e), e])).values()]),
    unresolved_dynamic_imports: sorted(dynamic), external_imports: sorted([...external.values()]),
    contracts, command_owners: policy.command_owners, extraction_exceptions: policy.allowed_runtime_edges };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length === 3 && ['--check', '--write'].includes(process.argv[2]), 'Usage: node scripts/dsh-b0/plugin-boundaries.mjs --check|--write');
    const result = await inspectBoundaries();
    const text = JSON.stringify(result, null, 2) + '\n';
    if (process.argv[2] === '--write') await writeFile(join(repository, inventoryPath), text);
    else assert.equal(await readFile(join(repository, inventoryPath), 'utf8'), text, 'BOUNDARY_INVENTORY_DRIFT run plugin-boundaries.mjs --write and review the diff');
    console.log(JSON.stringify({ status: 'PASS', packages: result.packages.length, edges: result.cross_package_edges.length, source_files: result.source_files_scanned, dynamic_imports: result.unresolved_dynamic_imports.length, manifest: inventoryPath }));
  } catch (error) { console.error(`BOUNDARY_BLOCKED ${error.message}`); process.exitCode = 2; }
}
