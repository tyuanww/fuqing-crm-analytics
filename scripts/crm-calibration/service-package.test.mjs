import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { packService, readGitInput } from './package-service.mjs';
import { startPackedService } from './service-process.fixture.mjs';

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
  const service = await startProcess(t, interpreter,
    ['-I', '-c', guard, JSON.stringify(blocked), join(app, 'service.py'), 'serve', '--port', '0'], home);
  const { origin } = service;
  const headers = { 'X-ShineMage-Contract': `crm-${domain}-service/1.0.0`, 'Content-Type': 'application/json' };
  await ready(origin + `/api/v1/crm-${domain}/capabilities`, headers, 200);
  return { ...service, headers };
}

async function startProcess(t, interpreter, args, home, input) {
  const child = spawn(interpreter, args, {
    cwd: home, env: isolatedEnv(home), stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
  if (input !== undefined) child.stdin.end(JSON.stringify(input));
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
  return { origin, receipt, stop };
}

async function ready(url, headers, status) {
  let success = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(500) });
      success = response.status === status; await response.arrayBuffer(); if (success) break;
    } catch { /* bounded startup */ }
    await delay(25);
  }
  assert.ok(success, 'service did not reach the expected HTTP response');
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

async function inputFixture(t, domain = 'knowledge') {
  const home = await scratch(t), inputRoot = join(home, 'source'); await mkdir(inputRoot);
  const path = domain === 'first-purchase' ? 'services/analytics-first-purchase/package.json' : 'services/crm-knowledge/package.json';
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

for (const checkFreshness of [true, false]) {
test(`first-purchase archive saves, restarts, reconciles and forward-fixes (age check ${checkFreshness})`, async t => {
  const home = await scratch(t), output = join(home, 'analysis-candidate'), app = join(home, 'analysis-app');
  const receipt = await packService({ domain: 'first-purchase', output, python });
  t.diagnostic(`SERVICE_ARTIFACT domain=first-purchase sha256=${receipt.sha256} manifest=${receipt.manifest_sha256} bytes=${receipt.bytes}`);
  assert.equal(receipt.release_ready, false);
  assert.equal(receipt.activation, 'NOT_RUN');
  await unpack(output, receipt, app);
  const manifest = JSON.parse(await readFile(join(app, 'service-manifest.json')));
  assert.equal(manifest.owner, 'analysis-service');
  assert.ok(!Object.keys(manifest.files).some(p => /(^|\/)(tests|dsh-plugins|node_modules)\/|\.sqlite|\.duckdb/.test(p)));
  for (const name of ['duckdb', 'httpx', 'pytest', 'psutil', 'bcrypt']) assert.equal(manifest.dependencies[name], undefined);
  const runtime = await exec(python, ['-I', join(root, 'scripts/crm-calibration/service-runtime.fixture.py'),
    join(app, 'service-manifest.json'), join(home, 'analysis-venv')], { cwd: home, env: isolatedEnv(home), timeout: 30000 });
  const interpreter = runtime.stdout.trim();
  const emptyWheels = join(home, 'empty-wheels'); await mkdir(emptyWheels);
  await assert.rejects(exec(python, ['-I', join(root, 'scripts/crm-calibration/service-runtime.fixture.py'),
    join(app, 'service-manifest.json'), join(home, 'rejected-cold-venv'), '--wheelhouse', emptyWheels],
  { cwd: home, env: isolatedEnv(home), timeout: 10000 }),
  error => error.stderr?.includes('SERVICE_WHEELHOUSE_INVALID'));
  const installed = await exec(interpreter, ['-I', '-c', 'import importlib.metadata,json;print(json.dumps(sorted(d.metadata["Name"].lower() for d in importlib.metadata.distributions())))'],
    { cwd: home, env: isolatedEnv(home) });
  assert.deepEqual(JSON.parse(installed.stdout).map(name => name.replace(/[-_.]+/g, '-')).sort(),
    Object.keys(manifest.dependencies).sort());
  await check(app, home, interpreter);
  const crmIdentity = await exec(interpreter, ['-I', '-B', join(root, 'scripts/crm-calibration/crm-identity-package.fixture.py'), app],
    { cwd: home, env: isolatedEnv(home), timeout: 15000 });
  const identityReport = JSON.parse(crmIdentity.stdout);
  assert.equal(identityReport.status, 'PASS');
  assert.deepEqual(identityReport.observations,
    ['existing-crm-account', 'revoked-admin', 'unapproved-account', 'revoked-session', 'identity-outage']);
  t.diagnostic(`CRM_IDENTITY_PACKED ${identityReport.status} observations=${identityReport.observations.length}`);
  const base = '/api/v1/analytics-first-purchase';
  // The shipped entry has neither identity nor state. Merely starting it cannot
  // turn on D15, open a caller-selected DB, or grant access to the legacy writer.
  const empty = await startProcess(t, interpreter, ['-I', join(app, 'service.py'), 'serve', '--port', '0'], home);
  await ready(empty.origin + base + '/analyses', {}, 401);
  await empty.stop();
  await check(app, home, interpreter);

  const state = join(home, 'analysis-state'); await mkdir(state, { mode: 0o700 });
  await writeFile(join(state, '.synthetic-package-test'), 'owned-synthetic-state/v1\n');
  const driver = join(root, 'scripts/crm-calibration/first-purchase-package.fixture.py');
  await exec(python, ['-I', driver, 'seed', root, state], { cwd: home, env: isolatedEnv(home), timeout: 30000 });
  const context = JSON.parse(await readFile(join(state, 'context.json')));
  const credentials = { writer: randomBytes(32).toString('hex'), reader: randomBytes(32).toString('hex') };
  const identity = { schema_version: 'analytics-first-purchase-save-identity/v1',
    action_id: 'package-save', candidate_digest: 'a'.repeat(64), correlation_id: 'package-correlation' };
  const command = { schema_version: 'analytics-first-purchase-save-command/v1', identity,
    created_from_run_id: context.run_id, title: 'isolated synthetic package', evidence_digest: context.evidence_digest };
  async function start(operation) {
    const service = await startProcess(t, interpreter, ['-I', driver, operation, app, state,
      ...(checkFreshness ? [] : ['--without-age-check'])], home, credentials);
    assert.equal(service.receipt.manifest_sha256, receipt.manifest_sha256);
    assert.equal(service.receipt.openapi, 'MATCHED');
    await ready(service.origin + base + '/analyses', {}, 401);
    return service;
  }
  let service = await start('serve');
  async function request(path, status, body, role = 'writer', extra = {}) {
    const response = await fetch(service.origin + base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: 'Bearer ' + credentials[role], 'content-type': 'application/json',
        'idempotency-key': 'package-save', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const inspected = await request('/save-results/inspect', 200, {
    schema_version: 'analytics-first-purchase-save-inspect/v1', identity, created_from_run_id: context.run_id });
  assert.equal(inspected.save_eligible, true);
  assert.equal(inspected.provenance.freshness.freshness_state, checkFreshness ? 'FRESH' : 'NOT_CHECKED');
  if (!checkFreshness) {
    assert.equal(inspected.provenance.freshness.reason, 'DISABLED_BY_POLICY');
    for (const key of ['max_age_ms', 'expires_after_ms', 'freshness_stale_at', 'freshness_expires_at']) {
      assert.equal(inspected.provenance.freshness[key], null);
    }
    assert.equal(Date.parse(inspected.provenance.freshness.freshness_checked_at)
      - Date.parse(inspected.provenance.generated_at), 365 * 24 * 60 * 60 * 1000);
  }
  const denied = await request('/save-receipts', 409, {
    ...command, identity: { ...identity, candidate_digest: 'b'.repeat(64) } });
  assert.equal(denied.error.code, 'CANDIDATE_NOT_ADMITTED');
  assert.equal((await request('/analyses', 200)).items.length, 0);
  const saved = await request('/save-receipts', 201, command);
  assert.equal(saved.status, 'SAVED');
  assert.deepEqual(await request('/save-receipts', 201, command), saved);
  assert.equal((await request('/save-receipts', 409, { ...command, title: 'conflict' })).error.code, 'CONFLICT');
  assert.equal((await request('/save-receipts', 403, command, 'reader')).error.code, 'FORBIDDEN');
  const path = '/analyses/' + saved.analysis_ref.analysis_id;
  const original = await request(path + '/provenance', 200);
  await service.stop();
  await assert.rejects(fetch(service.origin + base + '/analyses', { signal: AbortSignal.timeout(1000) }));
  // No source RunStore or admission provider in the recovery process: exact
  // persisted replay must work, but a new action cannot be inferred as admitted.
  service = await start('recover');
  assert.deepEqual(await request('/save-receipts/reconcile', 200, identity), saved);
  assert.deepEqual(await request('/save-receipts', 201, command), saved);
  assert.equal((await request('/analyses', 200)).items.length, 1);
  assert.deepEqual(await request(path + '/provenance', 200), original);
  const unknown = await request('/save-receipts/reconcile', 200, { ...identity, action_id: 'new-action' }, 'writer',
    { 'idempotency-key': 'new-action' });
  assert.equal(unknown.status, 'SAVE_UNKNOWN');
  const fixed = await request(path + '/versions', 201, { title: 'synthetic forward fix' }, 'writer',
    { 'if-match': '1', 'idempotency-key': 'forward-fix' });
  assert.equal(fixed.version, 2);
  assert.deepEqual((await request(path + '/provenance', 200)).provenance, original.provenance);
  assert.deepEqual(await request('/save-receipts/reconcile', 200, identity), saved);
  assert.equal((await request('/analyses', 409, {
    created_from_run_id: context.run_id, title: 'legacy bypass' })).error.code, 'VERSIONED_SAVE_REQUIRED');
  await service.stop();
  // Cancel while the pair helper owns a real, HTTP-ready service process.
  const controller = new AbortController();
  const interrupted = await startPackedService({ python: interpreter, driver, operation: 'recover', app, state, home,
    credentials, log: join(home, 'interrupted'), signal: controller.signal });
  t.after(interrupted.stop);
  controller.abort();
  await interrupted.stop();
  await assert.rejects(fetch(interrupted.origin + base + '/analyses', { signal: AbortSignal.timeout(1000) }));
  const interruptionLog = (await readFile(join(home, 'interrupted.stdout'), 'utf8'))
    + await readFile(join(home, 'interrupted.stderr'), 'utf8');
  for (const token of Object.values(credentials)) assert.ok(!interruptionLog.includes(token));
  await check(app, home, interpreter);
  const repeated = await packService({ domain: 'first-purchase', output: join(home, 'analysis-again'), python });
  assert.equal(repeated.sha256, receipt.sha256);
});
}

test('service input and installed manifest FIFOs fail without waiting for a writer', async t => {
  const { inputRoot, home } = await inputFixture(t);
  const source = join(inputRoot, 'backend/services/crm_knowledge.py');
  await rm(source); await exec('mkfifo', [source], { cwd: home });
  const call = `import {packService} from ${JSON.stringify(new URL('./package-service.mjs', import.meta.url).href)};
    try { await packService(${JSON.stringify({domain:'knowledge', output:join(home,'blocked'), python, root:inputRoot})}); }
    catch(e) { console.error(e.message); process.exitCode=2; }`;
  await assert.rejects(exec(process.execPath, ['--input-type=module', '-e', call], { cwd: home, env: isolatedEnv(home), timeout: 5000 }),
    error => error.code === 2 && error.stderr.includes('SERVICE_PACK_FILE_LIMIT'));
  const output = join(home, 'good');
  const receipt = await packService({ domain: 'knowledge', output, python });
  const app = join(home, 'app'); await unpack(output, receipt, app);
  await rm(join(app, 'service-manifest.json'));
  await exec('mkfifo', [join(app, 'service-manifest.json')], { cwd: home });
  await assert.rejects(check(app, home), error => error.code === 2 && error.stderr.trim() === 'SERVICE_SPECIAL_FILE_OR_SIZE');
});

test('package contract generation checks real state constants and refuses database side effects', async t => {
  const { inputRoot, home } = await inputFixture(t, 'first-purchase');
  const stateSource = join(inputRoot, 'backend/services/analytics/first_purchase/saved.py');
  const original = await readFile(stateSource, 'utf8');
  assert.ok(original.includes('STATE_SCHEMA_VERSION = 1'));
  await writeFile(stateSource, original.replace('STATE_SCHEMA_VERSION = 1', 'STATE_SCHEMA_VERSION = 99'));
  await assert.rejects(packService({ domain: 'first-purchase', output: join(home, 'blocked-state'), python, root: inputRoot }),
    error => error.stderr?.includes('SERVICE_PACK_STATE_CONTRACT_MISMATCH'));
  await writeFile(stateSource, original);
  const target = join(inputRoot, 'backend/analytics_first_purchase_analysis_app.py');
  await writeFile(target, 'import sqlite3\nsqlite3.connect(":memory:")\n');
  const output = join(home, 'blocked-contract');
  await assert.rejects(packService({ domain: 'first-purchase', output, python, root: inputRoot }),
    error => error.stderr?.includes('SERVICE_PACK_CONTRACT_SIDE_EFFECT'));
  await assert.rejects(readFile(join(output, 'candidate-receipt.json')), { code: 'ENOENT' });
});

test('exact-source packages bind Git code separately from current packaging and reject floating refs', async t => {
  const home = await scratch(t), revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  await assert.rejects(packService({ domain: 'first-purchase', revision: 'HEAD',
    output: join(home, 'floating'), python }), /SERVICE_PACK_EXACT_SOURCE_REQUIRED/);
  await assert.rejects(packService({ domain: 'first-purchase', compatibilityBaseline: true,
    output: join(home, 'missing-source'), python }), /SERVICE_PACK_BASELINE_SOURCE_REQUIRED/);
  const output = join(home, 'exact');
  const receipt = await packService({ domain: 'first-purchase', revision, output, python });
  assert.equal(receipt.service_source.commit, revision);
  const manifest = JSON.parse(await readFile(join(output, 'service-manifest.json')));
  assert.deepEqual(manifest.service_source, receipt.service_source);
  assert.equal(manifest.service_source.requirements_sha256, digest(await readGitInput(root, revision, 'requirements-lock.txt')));
  for (const item of Object.values(manifest.files).filter(item => item.role === 'code')) {
    assert.equal(item.sha256, digest(await readGitInput(root, revision, item.source)));
  }
  // A D15 source cannot be relabelled as the historical pre-D15 baseline.
  await assert.rejects(packService({ domain: 'first-purchase', revision, compatibilityBaseline: true,
    output: join(home, 'wrong-baseline'), python }),
    error => error.stderr?.includes('SERVICE_PACK_STATE_CONTRACT_MISMATCH') || error.message.includes('SERVICE_PACK_STATE_CONTRACT_MISMATCH'));
});

test('exact-source reads ignore local Git replacement objects', async t => {
  const home = await scratch(t);
  const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = args => exec('git', args, { cwd: home, env });
  await git(['init', '--template=', '--initial-branch=codex/source-fixture']);
  const original = 'value = "reviewed"\n';
  await writeFile(join(home, 'code.py'), original);
  await git(['add', 'code.py']);
  const commit = async message => {
    await git(['-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '--no-gpg-sign', '-m', message]);
    return (await git(['rev-parse', 'HEAD'])).stdout.trim();
  };
  const pinned = await commit('original');
  await writeFile(join(home, 'code.py'), 'value = "replacement"\n');
  await git(['add', 'code.py']);
  const replacement = await commit('replacement');
  await git(['replace', pinned, replacement]);
  assert.notEqual((await git(['show', pinned + ':code.py'])).stdout, original);
  assert.equal((await readGitInput(home, pinned, 'code.py')).toString(), original);
});

test('abort during service shutdown still reaps an uncooperative owned process', async t => {
  const home = await scratch(t), driver = join(home, 'stubborn.py');
  await writeFile(driver, `import http.server,json,os,signal
signal.signal(signal.SIGTERM, signal.SIG_IGN)
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(401); self.end_headers()
 def log_message(self, *args): pass
server=http.server.HTTPServer(('127.0.0.1',0),Handler)
print(json.dumps({'status':'SERVICE_SOCKET_BOUND','port':server.server_port,'pid':os.getpid()}),flush=True)
server.serve_forever()
`);
  const controller = new AbortController();
  const service = await startPackedService({ python, driver, operation: 'test', app: home, state: home, home,
    credentials: { writer: randomBytes(32).toString('hex'), reader: randomBytes(32).toString('hex') },
    log: join(home, 'shutdown'), signal: controller.signal });
  // Even a failing regression test must reap only the process it just created.
  let reaped = false;
  t.after(() => { if (!reaped) { try { process.kill(service.receipt.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } } });
  const stopping = service.stop();
  controller.abort();
  await stopping;
  reaped = true;
  await assert.rejects(fetch(service.origin, { signal: AbortSignal.timeout(1000) }));
  assert.ok((await readFile(join(home, 'shutdown.stdout'), 'utf8')).includes('SERVICE_SOCKET_BOUND'));
});
