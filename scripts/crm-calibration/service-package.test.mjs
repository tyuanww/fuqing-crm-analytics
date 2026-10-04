import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { packService } from './package-service.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));
const python = process.env.CRM_SERVICE_PYTHON;
assert.ok(python && isAbsolute(python), 'CRM_SERVICE_PYTHON must select the full pinned Python 3.14 environment');
const digest = data => createHash('sha256').update(data).digest('hex');
const input = {
  source_id: 'synthetic-crm-metrics', contains_real_data: false, metric_version: 'crm-metrics/v1',
  query_id: 'sales_window_summary', period_start: '2026-09-01', period_end_exclusive: '2026-10-01',
  refund_view: 'ORDER_COHORT_AS_OF', refund_as_of: '2026-09-21T00:00:00+08:00', data_through: '2026-09-21T00:00:00+08:00',
};

async function scratch(t) {
  const dir = await mkdtemp(join(tmpdir(), 'crm-packed-service-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function unpack(candidate, receipt, destination) {
  const archive = join(candidate, receipt.artifact);
  assert.equal(digest(await readFile(archive)), receipt.sha256);
  await exec(python, [join(root, 'scripts/release/secure-unpack.py'), archive, destination, '--max-bytes', '8388608', '--max-entries', '100'], { cwd: dirname(destination), timeout: 30000 });
  assert.equal(digest(await readFile(join(destination, 'service-manifest.json'))), receipt.manifest_sha256);
}

function isolatedEnv(home) {
  return { PATH: `${dirname(python)}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: home, TMPDIR: home,
    PYTHONPATH: '/deliberately-unavailable-repository', PYTHON_DOTENV_DISABLED: '1' };
}

async function check(app, home, interpreter = python) {
  return exec(interpreter, ['-I', join(app, 'service.py'), 'check'], { cwd: home, env: isolatedEnv(home), timeout: 10000 });
}

async function serve(t, domain, app, home, interpreter = python) {
  // Fail if an independent application attempts to import the legacy aggregate,
  // the other service, or optional heavy dependencies. No repository is on path.
  const blocked = ['backend.main', 'backend.config', 'backend.contracts.schemas', 'dotenv', 'bcrypt',
    ...(domain === 'knowledge' ? ['duckdb', '_duckdb', 'backend.semantic', 'backend.services.crm_readonly', 'backend.crm_metrics_app'] : ['backend.services.crm_knowledge', 'backend.crm_knowledge_app'])];
  const guard = `import sys,runpy,importlib.abc,json
blocked=json.loads(sys.argv.pop(1))
class Guard(importlib.abc.MetaPathFinder):
 def find_spec(self, fullname, path=None, target=None):
  if any(fullname==n or fullname.startswith(n+'.') for n in blocked):
   raise ImportError('UNDECLARED_SERVICE_DEPENDENCY '+fullname)
sys.meta_path.insert(0,Guard())
sys.argv=sys.argv[1:]
runpy.run_path(sys.argv[0],run_name='__main__')`;
  const child = spawn(interpreter, ['-I', '-c', guard, JSON.stringify(blocked), join(app, 'service.py'), 'serve', '--port', '0'], {
    cwd: home, env: isolatedEnv(home), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-4096); });
  async function stop() {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await done; } finally { clearTimeout(timer); }
  }
  t.after(stop);
  const receipt = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('service startup timeout: ' + stderr)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('service exited: ' + stderr)); });
    child.stdout.on('data', data => {
      text += data;
      if (text.includes('\n')) {
        clearTimeout(timer);
        try { resolve(JSON.parse(text.split('\n')[0])); } catch (error) { reject(error); }
      }
    });
  });
  assert.equal(receipt.status, 'SERVICE_SOCKET_BOUND');
  assert.ok(receipt.port > 0);
  const origin = 'http://127.0.0.1:' + receipt.port;
  const headers = { 'X-ShineMage-Contract': `crm-${domain}-service/1.0.0`, 'Content-Type': 'application/json' };
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${origin}/api/v1/crm-${domain}/capabilities`, { headers, signal: AbortSignal.timeout(500) });
      ready = response.ok; await response.arrayBuffer(); if (ready) break;
    } catch { /* bounded startup */ }
    await delay(25);
  }
  assert.ok(ready, stderr);
  return { origin, headers, receipt, stop };
}

test('both actual service archives run outside the repository and fail independently', async t => {
  const home = await scratch(t), services = {}, receipts = {};
  for (const domain of ['metrics', 'knowledge']) {
    const output = join(home, domain + '-candidate');
    const receipt = await packService({ domain, output, python });
    t.diagnostic(`SERVICE_ARTIFACT domain=${domain} sha256=${receipt.sha256} manifest=${receipt.manifest_sha256} bytes=${receipt.bytes}`);
    receipts[domain] = receipt;
    assert.equal(receipt.release_ready, false);
    assert.equal(receipt.activation, 'NOT_RUN');
    const app = join(home, domain + '-app');
    await unpack(output, receipt, app);
    const checked = JSON.parse((await check(app, home)).stdout);
    assert.equal(checked.manifest_sha256, receipt.manifest_sha256);
    assert.equal(checked.status, 'SERVICE_PACKAGE_CHECK_PASS');
    const manifest = JSON.parse(await readFile(join(app, 'service-manifest.json')));
    assert.ok(!Object.keys(manifest.files).some(p => /(^|\/)(tests|dsh-plugins|node_modules|scripts)\//.test(p)));
    assert.ok(!Object.keys(manifest.files).some(p => p === 'backend/contracts/schemas.py'));
    if (domain === 'knowledge') assert.equal(manifest.dependencies.duckdb, undefined);
    const runtime = await exec(python, ['-I', join(root, 'scripts/crm-calibration/service-runtime.fixture.py'), join(app, 'service-manifest.json'), join(home, domain + '-venv')], { cwd: home, env: isolatedEnv(home), timeout: 30000 });
    const interpreter = runtime.stdout.trim();
    const installed = await exec(interpreter, ['-I', '-c', 'import importlib.util; print(importlib.util.find_spec("duckdb") is None)'], { cwd: home, env: isolatedEnv(home) });
    assert.equal(installed.stdout.trim(), domain === 'knowledge' ? 'True' : 'False');
    await check(app, home, interpreter);
    services[domain] = await serve(t, domain, app, home, interpreter);
    assert.equal(services[domain].receipt.manifest_sha256, receipt.manifest_sha256);
    const openapi = await fetch(services[domain].origin + '/openapi.json', { headers: services[domain].headers });
    assert.equal(openapi.status, 200);
    assert.deepEqual(await openapi.json(), JSON.parse(await readFile(join(app, 'openapi.json'))));
  }
  const { metrics, knowledge } = services;
  const query = async body => fetch(metrics.origin + '/api/v1/crm-metrics/query', {
    method: 'POST', headers: metrics.headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  for (const queryId of ['sales_window_summary', 'existing_customer_repurchase', 'sample_followup']) {
    const response = await query({ ...input, query_id: queryId });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.metric_version, 'crm-metrics/v1');
    assert.equal(result.source_id, 'synthetic-crm-metrics');
    assert.ok(result.facts);
  }
  const forbidden = await query({ ...input, contains_real_data: true });
  assert.equal(forbidden.status, 400);
  assert.equal((await forbidden.json()).code, 'FORBIDDEN');
  assert.equal((await fetch(metrics.origin + '/api/v1/crm-metrics/capabilities')).status, 409);
  assert.equal((await fetch(metrics.origin + '/api/v1/crm-metrics/explain', { method: 'POST', headers: metrics.headers, body: '{"topic":"aus"}' })).status, 404);
  const explain = async () => {
    const response = await fetch(knowledge.origin + '/api/v1/crm-knowledge/explain', {
      method: 'POST', headers: knowledge.headers, body: '{"topic":"客单价"}', signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const explanation = await explain();
  assert.ok(explanation.decision_ids.includes('D001'));
  assert.equal(explanation.implementation_verification_scope, 'not_evaluated_in_service_package');
  assert.notEqual(explanation.implementation_status, 'synthetic_verified');
  assert.equal(explanation.real_business_acceptance, false);
  await metrics.stop();
  await assert.rejects(query(input));
  assert.deepEqual(await explain(), explanation);
  await knowledge.stop();
  // Startup/readiness never writes into the immutable install directory.
  for (const domain of ['metrics', 'knowledge']) await check(join(home, domain + '-app'), home);
  const second = await packService({ domain: 'knowledge', output: join(home, 'same-input-again'), python });
  assert.equal(second.sha256, receipts.knowledge.sha256, 'same source produces the same immutable archive');
});

test('installed packages fail closed for missing/tampered resources, links, files, and dependency drift', async t => {
  const home = await scratch(t), output = join(home, 'candidate');
  const receipt = await packService({ domain: 'knowledge', output, python });
  const cases = [
    ['missing', async app => rm(join(app, 'resources/knowledge/pack.json')), 'SERVICE_FILE_MISSING_OR_SIZE'],
    ['tampered', async app => writeFile(join(app, 'resources/knowledge/pack.json'), '{}'), 'SERVICE_FILE_MISSING_OR_SIZE'],
    ['extra', async app => writeFile(join(app, 'accidental-source.py'), 'pass'), 'SERVICE_UNDECLARED_FILE'],
    ['link', async app => { await rm(join(app, 'resources/knowledge/pack.json')); await symlink('/nonexistent/private-pack', join(app, 'resources/knowledge/pack.json')); }, 'SERVICE_LINK_REJECTED'],
    ['schema', async app => { const path = join(app, 'service-manifest.json'), m = JSON.parse(await readFile(path)); m.future_field = true; await writeFile(path, JSON.stringify(m)); }, 'SERVICE_MANIFEST_INVALID'],
    ['source', async app => { const path = join(app, 'service-manifest.json'), m = JSON.parse(await readFile(path)); m.source.commit = 'floating-main'; await writeFile(path, JSON.stringify(m)); }, 'SERVICE_SOURCE_INVALID'],
    ['version', async app => {
      const path = join(app, 'service-manifest.json'), m = JSON.parse(await readFile(path)); m.dependencies.fastapi = '0.0.0';
      const lock = Object.entries(m.dependencies).sort(([a],[b]) => a.localeCompare(b)).map(([n,v]) => `${n}==${v}\n`).join('');
      await writeFile(join(app, 'requirements.lock'), lock); m.files['requirements.lock'].sha256 = digest(lock); m.files['requirements.lock'].bytes = Buffer.byteLength(lock);
      await writeFile(path, JSON.stringify(m));
    }, 'SERVICE_DEPENDENCY_VERSION_MISMATCH'],
  ];
  for (const [name, mutate, code] of cases) {
    const app = join(home, name); await unpack(output, receipt, app); await mutate(app);
    await assert.rejects(check(app, home), error => error.code === 2 && error.stderr.trim() === code);
  }
  const before = await readFile(join(output, 'candidate-receipt.json'));
  await assert.rejects(packService({ domain: 'knowledge', output, python }), /SERVICE_PACK_OUTPUT_EXISTS/);
  assert.deepEqual(await readFile(join(output, 'candidate-receipt.json')), before);
});

async function inputFixture(t) {
  const home = await scratch(t), inputRoot = join(home, 'source'); await mkdir(inputRoot);
  const path = 'services/crm-knowledge/package.json';
  const config = JSON.parse(await readFile(join(root, path)));
  for (const source of new Set([path, ...Object.values(config.files).map(v => v.source)])) {
    await mkdir(dirname(join(inputRoot, source)), { recursive: true });
    await cp(join(root, source), join(inputRoot, source));
  }
  const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  await exec('git', ['init', '--template=', '--initial-branch=codex/service-fixture'], { cwd: inputRoot, env });
  await exec('git', ['-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '--no-gpg-sign', '-m', 'synthetic service fixture'], { cwd: inputRoot, env });
  return { home, inputRoot, config, path: join(inputRoot, path) };
}

test('packer refuses path traversal, symlinked sources and undeclared schema fields', async t => {
  const fixture = await inputFixture(t), { config, inputRoot, home, path } = fixture;
  config.files['../escape.py'] = { source: 'backend/services/crm_knowledge.py', role: 'code' };
  await writeFile(path, JSON.stringify(config));
  await assert.rejects(packService({ domain: 'knowledge', output: join(home, 'escape'), python, root: inputRoot }), /SERVICE_PACK_PATH_INVALID/);
  delete config.files['../escape.py'];
  config.extra = true;
  await writeFile(path, JSON.stringify(config));
  await assert.rejects(packService({ domain: 'knowledge', output: join(home, 'schema'), python, root: inputRoot }), /SERVICE_PACK_SCHEMA_INVALID/);
  delete config.extra; await writeFile(path, JSON.stringify(config));
  const source = join(inputRoot, 'backend/services/crm_knowledge.py');
  await rm(source); await symlink('/nonexistent/private-source', source);
  await assert.rejects(packService({ domain: 'knowledge', output: join(home, 'link'), python, root: inputRoot }), /SERVICE_PACK_SYMLINK/);
});

test('secret scanning uses the actual allowlisted payload and leaves no candidate on failure', async t => {
  const { inputRoot, home } = await inputFixture(t);
  const target = join(inputRoot, 'backend/services/crm_knowledge.py');
  await writeFile(target, '# synthetic security test\nvalue = "' + 'github_pat_' + 'A'.repeat(36) + '"\n');
  const output = join(home, 'blocked');
  await assert.rejects(packService({ domain: 'knowledge', output, python, root: inputRoot }), /SECRET_SCAN_FAILED/);
  await assert.rejects(readFile(join(output, 'candidate-receipt.json')), { code: 'ENOENT' });
});
