#!/usr/bin/env node
/** Independent synthetic service application packer; no build/install/network/activation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify, parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertClean, scanTree } from '../release/secret-scan.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MAX_BYTES = 8 * 1024 * 1024;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const canonical = value => JSON.stringify(value, null, 2) + '\n';
const gitEnvironment = () => ({ PATH: process.env.PATH ?? '/usr/bin:/bin',
  GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' });
const SERVICES = {
  metrics: { path: 'crm-metrics', owner: 'crm-service', scope: 'synthetic_only' },
  knowledge: { path: 'crm-knowledge', owner: 'knowledge-service', scope: 'public_synthetic_pack_only' },
  'first-purchase': { path: 'analytics-first-purchase', owner: 'analysis-service', scope: 'synthetic_only' },
};

function safeRelative(value) {
  assert.equal(typeof value, 'string', 'SERVICE_PACK_PATH_INVALID');
  assert.ok(value && !isAbsolute(value) && !/[\\\0]/.test(value) && value.split('/').every(p => p && p !== '.' && p !== '..'), 'SERVICE_PACK_PATH_INVALID');
  return value;
}

async function readInput(root, rel) {
  safeRelative(rel);
  let part = root;
  for (const name of rel.split('/')) {
    part = join(part, name);
    assert.ok(!(await lstat(part)).isSymbolicLink(), 'SERVICE_PACK_SYMLINK');
  }
  const file = await open(part, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    assert.ok(stat.isFile() && stat.size <= 2 * 1024 * 1024, 'SERVICE_PACK_FILE_LIMIT');
    const data = await file.readFile();
    assert.equal(data.length, stat.size, 'SERVICE_PACK_SOURCE_CHANGED');
    return data;
  } finally { await file.close(); }
}

export async function readGitInput(root, revision, rel) {
  assert.match(revision ?? '', /^[0-9a-f]{40}$/, 'SERVICE_PACK_EXACT_SOURCE_REQUIRED');
  safeRelative(rel);
  const options = { cwd: root, env: gitEnvironment(),
    timeout: 10000, maxBuffer: 2 * 1024 * 1024 };
  const tree = (await exec('git', ['ls-tree', '-z', revision, '--', rel], options)).stdout;
  assert.ok(new RegExp('^100(?:644|755) blob [0-9a-f]{40}\\t').test(tree)
    && tree.split('\t')[1] === rel + '\0', 'SERVICE_PACK_GIT_FILE_INVALID');
  return (await exec('git', ['show', revision + ':' + rel], { ...options, encoding: 'buffer' })).stdout;
}

export async function packService({ domain, output, python, root = ROOT, revision, compatibilityBaseline = false }) {
  assert.ok(Object.hasOwn(SERVICES, domain), 'SERVICE_PACK_DOMAIN_INVALID');
  const service = SERVICES[domain];
  assert.ok(isAbsolute(output) && isAbsolute(python), 'SERVICE_PACK_ABSOLUTE_PATH_REQUIRED');
  root = await realpath(root);
  output = resolve(output);
  const exists = await lstat(output).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  assert.ok(!exists, 'SERVICE_PACK_OUTPUT_EXISTS');
  assert.ok(!compatibilityBaseline || (domain === 'first-purchase' && revision), 'SERVICE_PACK_BASELINE_SOURCE_REQUIRED');
  assert.ok(revision === undefined || domain === 'first-purchase', 'SERVICE_PACK_SOURCE_DOMAIN_INVALID');
  if (revision !== undefined) {
    assert.match(revision, /^[0-9a-f]{40}$/, 'SERVICE_PACK_EXACT_SOURCE_REQUIRED');
    const resolved = (await exec('git', ['rev-parse', '--verify', revision + '^{commit}'],
      { cwd: root, env: gitEnvironment(), timeout: 10000 })).stdout.trim();
    assert.equal(resolved, revision, 'SERVICE_PACK_EXACT_SOURCE_REQUIRED');
  }
  const configPath = `services/${service.path}/${compatibilityBaseline ? 'compatibility-baseline.json' : 'package.json'}`;
  const configBytes = await readInput(root, configPath);
  const config = JSON.parse(configBytes);
  assert.deepEqual(Object.keys(config).sort(), ['schema_version', 'domain', 'name', 'version', 'api_version', 'owner', 'scope', 'python', 'dependencies', 'files'].sort(), 'SERVICE_PACK_SCHEMA_INVALID');
  assert.equal(config.schema_version, 'shinemage-service-inputs/v1', 'SERVICE_PACK_SCHEMA_INVALID');
  assert.equal(config.domain, domain, 'SERVICE_PACK_DOMAIN_INVALID');
  assert.equal(config.name, `shinemage-${service.path}-service`, 'SERVICE_PACK_NAME_INVALID');
  assert.match(config.version, /^\d+\.\d+\.\d+(?:rc\d+)?$/, 'SERVICE_PACK_VERSION_INVALID');
  assert.equal(config.api_version, '1.0.0', 'SERVICE_PACK_API_INVALID');
  assert.equal(config.python, '3.14', 'SERVICE_PACK_PYTHON_INVALID');
  assert.equal(config.owner, service.owner, 'SERVICE_PACK_OWNER_INVALID');
  assert.equal(config.scope, service.scope, 'SERVICE_PACK_SCOPE_INVALID');
  assert.ok(config.files && Object.keys(config.files).length <= 100, 'SERVICE_PACK_FILES_INVALID');
  assert.ok(config.dependencies && Object.keys(config.dependencies).length > 0, 'SERVICE_PACK_DEPENDENCIES_INVALID');
  for (const [name, pin] of Object.entries(config.dependencies)) {
    assert.match(name, /^[a-z0-9-]+$/, 'SERVICE_PACK_DEPENDENCY_INVALID');
    assert.match(pin, /^\d+(?:\.\d+)+(?:[a-z]+\d+)?$/, 'SERVICE_PACK_DEPENDENCY_INVALID');
  }
  let serviceSource;
  if (revision) {
    const lock = await readGitInput(root, revision, 'requirements-lock.txt');
    const declared = Object.fromEntries(lock.toString('utf8').split(/\r?\n/)
      .filter(line => /^[a-zA-Z0-9_-]+==/.test(line))
      .map(line => { const [name, pin] = line.split('=='); return [name.toLowerCase().replace(/[-_.]+/g, '-'), pin]; }));
    for (const [name, pin] of Object.entries(config.dependencies)) {
      assert.equal(declared[name], pin, 'SERVICE_PACK_SOURCE_DEPENDENCY_MISMATCH');
    }
    serviceSource = { commit: revision, requirements_sha256: sha256(lock), scope: 'exact-git-code-current-packaging' };
  }
  const env = { PATH: `${dirname(python)}:${process.env.PATH ?? '/usr/bin:/bin'}`, PYTHON_DOTENV_DISABLED: '1' };
  // Git identifies the candidate; a dirty input is never represented as a
  // reviewed release. File hashes capture all actual bytes, including new files.
  const gitEnv = gitEnvironment();
  const head = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root, env: gitEnv })).stdout.trim();
  assert.match(head, /^[0-9a-f]{40}$/, 'SERVICE_PACK_GIT_INVALID');
  const dirty = Boolean((await exec('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, env: gitEnv })).stdout.trim());
  await mkdir(dirname(output), { recursive: true });
  const temp = await mkdtemp(join(dirname(output), '.service-pack-'));
  try {
    const stage = join(temp, 'app');
    const deliverable = join(temp, 'candidate');
    await mkdir(stage, { mode: 0o700 });
    await mkdir(deliverable, { mode: 0o700 });
    const files = {};
    let bytes = 0;
    for (const [target, item] of Object.entries(config.files).sort(([a], [b]) => a.localeCompare(b))) {
      safeRelative(target);
      assert.ok(!['service-manifest.json', 'requirements.lock'].includes(target), 'SERVICE_PACK_RESERVED_PATH');
      assert.deepEqual(Object.keys(item).sort(), ['role', 'source'], 'SERVICE_PACK_FILE_SCHEMA_INVALID');
      assert.ok(['code', 'resource', 'bootstrap'].includes(item.role), 'SERVICE_PACK_ROLE_INVALID');
      const extension = item.role === 'resource' ? '.json' : '.py';
      assert.ok(typeof item.source === 'string' && item.source.endsWith(extension) && target.endsWith(extension), 'SERVICE_PACK_FILE_KIND_INVALID');
      const data = revision && item.role === 'code'
        ? await readGitInput(root, revision, item.source) : await readInput(root, item.source);
      bytes += data.length;
      assert.ok(bytes <= MAX_BYTES, 'SERVICE_PACK_SIZE_LIMIT');
      await mkdir(dirname(join(stage, target)), { recursive: true, mode: 0o700 });
      await writeFile(join(stage, target), data, { flag: 'wx', mode: 0o600 });
      files[target] = { sha256: sha256(data), bytes: data.length, source: item.source, role: item.role };
    }
    if (domain === 'first-purchase') {
      // This service pins its own FastAPI/Pydantic closure. Generate its OpenAPI
      // from the actual staged factory, not the separately pinned B0 runtime.
      assert.ok(!files['openapi.json'], 'SERVICE_PACK_CONTRACT_RESERVED');
      const factory = 'backend/analytics_first_purchase_analysis_app.py';
      assert.ok(files[factory]?.role === 'code', 'SERVICE_PACK_FACTORY_REQUIRED');
      const program = `import importlib.abc,json,sys
sys.dont_write_bytecode=True
sys.path.insert(0,sys.argv[1])
class Guard(importlib.abc.MetaPathFinder):
 def find_spec(self,fullname,path=None,target=None):
  if fullname in {'backend.main','backend.config','backend.routers','duckdb','dotenv'}:
   raise RuntimeError('SERVICE_PACK_CONTRACT_IMPORT')
sys.meta_path.insert(0,Guard())
def offline(event,args):
 if event in {'sqlite3.connect','socket.connect','socket.bind','subprocess.Popen'}:
  raise RuntimeError('SERVICE_PACK_CONTRACT_SIDE_EFFECT')
sys.addaudithook(offline)
from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
from backend.services.analytics.first_purchase import saved
from backend.contracts import analytics_first_purchase_analysis as contract_module
from typing import get_args
from pathlib import Path
declared=json.loads((Path(sys.argv[1])/'backend/contracts/analytics-first-purchase-service.v1.json').read_text())
schema_contract=(get_args(contract_module.FirstPurchaseSavedProvenance.model_fields['schema_version'].annotation)[0]
 if hasattr(contract_module,'FirstPurchaseSavedProvenance') else saved.ANALYSIS_SCHEMA)
actual={'owner':'analysis-service','application_id':saved.APPLICATION_ID,'schema_version':saved.STATE_SCHEMA_VERSION,
 'contract':schema_contract}
if declared.get('state') != actual:
 raise RuntimeError('SERVICE_PACK_STATE_CONTRACT_MISMATCH')
print(json.dumps(create_first_purchase_analysis_app().openapi(),sort_keys=True,ensure_ascii=False,allow_nan=False))`;
      const generated = await exec(python, ['-I', '-c', program, stage], { cwd: temp, env, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
      const contract = canonical(JSON.parse(generated.stdout));
      bytes += Buffer.byteLength(contract);
      assert.ok(bytes <= MAX_BYTES, 'SERVICE_PACK_SIZE_LIMIT');
      await writeFile(join(stage, 'openapi.json'), contract, { flag: 'wx', mode: 0o600 });
      files['openapi.json'] = { sha256: sha256(contract), bytes: Buffer.byteLength(contract), source: factory, role: 'contract' };
    }
    const lock = Object.entries(config.dependencies).sort(([a], [b]) => a.localeCompare(b)).map(([name, pin]) => `${name}==${pin}\n`).join('');
    await writeFile(join(stage, 'requirements.lock'), lock, { flag: 'wx', mode: 0o600 });
    files['requirements.lock'] = { sha256: sha256(lock), bytes: Buffer.byteLength(lock), source: configPath, role: 'lock' };
    const manifest = { ...config, schema_version: 'shinemage-service-package/v1', files,
      ...(serviceSource ? { service_source: serviceSource } : {}),
      source: { commit: head, worktree_dirty: dirty, inputs_manifest: configPath, inputs_sha256: sha256(configBytes) }, release_ready: false };
    const manifestText = canonical(manifest);
    await writeFile(join(stage, 'service-manifest.json'), manifestText, { flag: 'wx', mode: 0o600 });
    assertClean(await scanTree(stage, { maxBytes: MAX_BYTES, allowSyntheticFixtures: false }));
    // A build-time check validates the actual staged artifact with its pinned
    // interpreter/dependencies. It imports no application and opens no port.
    await exec(python, ['-I', join(stage, 'service.py'), 'check'], { cwd: temp, env, timeout: 30000 });
    // Detect source edits during packing; do not silently combine two versions.
    assert.equal(sha256(await readInput(root, configPath)), sha256(configBytes), 'SERVICE_PACK_SOURCE_CHANGED');
    for (const [target, item] of Object.entries(files)) {
      if (target !== 'requirements.lock' && item.role !== 'contract') {
        const data = revision && item.role === 'code'
          ? await readGitInput(root, revision, item.source) : await readInput(root, item.source);
        assert.equal(sha256(data), item.sha256, 'SERVICE_PACK_SOURCE_CHANGED');
      }
    }
    const allow = join(temp, 'allow.json');
    await writeFile(allow, canonical([...Object.keys(files), 'service-manifest.json']));
    const name = `${config.name}-${config.version}.tar.zst`;
    await exec(python, [join(ROOT, 'scripts/release/pack.py'), stage, allow, join(deliverable, name)], { cwd: temp, env, timeout: 30000 });
    const archive = await readFile(join(deliverable, name));
    const receipt = { schema_version: 'shinemage-service-candidate/v1', domain, name: config.name, version: config.version,
      artifact: name, sha256: sha256(archive), bytes: archive.length, manifest_sha256: sha256(manifestText),
      source: manifest.source, ...(serviceSource ? { service_source: serviceSource } : {}),
      release_ready: false, supply_chain: 'NOT_RUN', installation: 'NOT_RUN', activation: 'NOT_RUN' };
    await writeFile(join(deliverable, 'service-manifest.json'), manifestText, { flag: 'wx', mode: 0o600 });
    await writeFile(join(deliverable, 'candidate-receipt.json'), canonical(receipt), { flag: 'wx', mode: 0o600 });
    // Reserve the final directory exclusively; never replace an existing candidate.
    await mkdir(output, { mode: 0o700 });
    for (const file of [name, 'service-manifest.json', 'candidate-receipt.json']) await rename(join(deliverable, file), join(output, file));
    return receipt;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { service: { type: 'string' }, output: { type: 'string' }, python: { type: 'string' },
      source: { type: 'string' }, 'compatibility-baseline': { type: 'boolean' }, help: { type: 'boolean' } }, strict: true });
    if (values.help) console.log('node scripts/crm-calibration/package-service.mjs --service metrics|knowledge|first-purchase --python /absolute/python3.14 --output /absolute/new-candidate [--source FULL_SHA] [--compatibility-baseline]');
    else console.log(JSON.stringify(await packService({ domain: values.service, output: values.output, python: values.python,
      revision: values.source, compatibilityBaseline: values['compatibility-baseline'] })));
  } catch (error) {
    const code = error.message.match(/SERVICE_[A-Z_]+|SECRET_SCAN_FAILED|SECRET_PATTERN|DENY_NAME/)?.[0] ?? 'SERVICE_PACK_FAILED';
    console.error(code);
    process.exitCode = 2;
  }
}
