/** Public-protocol checks. Fixed-package sandbox runs only with SHINEMAGE_PROBE_FIXED_BINDING. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { FIRST_PURCHASE_TOOL_NAME as scenarioToolName } from './first-purchase-scenario.mjs';
import { acceptPublicSaveHttp, publicCommandExecuteEnvelope, readCommandExecuteBody, readSaveHttpBody,
  PUBLIC_HTTP_ADMISSION, PUBLIC_SAVE_CONTROLLER, PUBLIC_SAVE_EVIDENCE, WORKSPACE_HTTP_ADMISSION } from './first-purchase-host-protocol.mjs';
import * as fixture from '../../dsh-plugins/analytics-workbench/test/first-purchase-save.fixture.mjs';
import { decodeFirstPurchaseSaveReceipt, decodeFirstPurchaseSaveResult } from '../../dsh-plugins/analytics-workbench/src/first-purchase-save-model.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const probePath = fileURLToPath(new URL('./first-purchase-crm-host.probe.mjs', import.meta.url));
const deniedSource = fileURLToPath(new URL('../../dsh-plugins/analytics-workbench/src/first-purchase-save-client.mjs', import.meta.url));
const UI = 'shinemage-first-purchase-ui/v1';
const BINDING_SCHEMA = 'shinemage-probe-fixed-binding/v1';
const BINDING_KEYS = ['schema_version', 'manifest_path', 'upstream_path', 'expected_candidate_digest',
  'expected_upstream_sha', 'read_deny', 'write_deny'];
const bindingOptIn = process.env.SHINEMAGE_PROBE_FIXED_BINDING;
const fixedSkip = bindingOptIn === undefined || bindingOptIn === ''
  ? 'NOT_RUN: SHINEMAGE_PROBE_FIXED_BINDING is unset; fixed-package sandbox handshake was not run'
  : false;

function statusBody(owner = fixture.owner, current = fixture.identity) {
  return { schema_version: UI, ok: true, owner, identity: structuredClone(current) };
}
function inspectEnvelope(value = fixture.inspected) {
  return fixture.ok(structuredClone(value));
}
function savedEnvelope(value = fixture.saved) {
  return fixture.ok(structuredClone(value));
}
async function accept(call, overrides = {}) {
  return acceptPublicSaveHttp({
    call, target: fixture.target, candidateDigest: fixture.candidate, title: fixture.command.title,
    expectedOwner: fixture.owner, ...overrides,
  });
}
function freshInspect() {
  const value = structuredClone(fixture.inspected);
  const generated = Date.parse(value.provenance.generated_at);
  const maxAge = 3_600_000;
  const expires = 7_200_000;
  value.provenance.freshness = {
    freshness_state: 'FRESH', freshness_checked_at: new Date(generated).toISOString(),
    freshness_stale_at: new Date(generated + maxAge).toISOString(),
    freshness_expires_at: new Date(generated + expires).toISOString(),
    policy_version: 'fixture-policy', max_age_ms: maxAge, expires_after_ms: expires, reason: 'WITHIN_WINDOW',
  };
  return value;
}
async function rejectInspect(name, mutate, code, decoder = true) {
  const ops = [];
  const inspected = structuredClone(fixture.inspected);
  mutate(inspected);
  if (decoder) assert.equal(decodeFirstPurchaseSaveResult(structuredClone(inspected)), null, name);
  await assert.rejects(accept(async operation => {
    ops.push(operation);
    if (operation === 'status') return statusBody();
    if (operation === 'inspect') return fixture.ok(inspected);
    throw new Error(`${name} reached ${operation}`);
  }), new RegExp(code), name);
  assert.deepEqual(ops, ['status', 'inspect'], name);
}
async function rejectSaved(name, mutate, code, decoder = true) {
  const ops = [];
  const saved = structuredClone(fixture.saved);
  mutate(saved);
  if (decoder) assert.equal(decodeFirstPurchaseSaveReceipt(structuredClone(saved)), null, name);
  await assert.rejects(accept(async operation => {
    ops.push(operation);
    if (operation === 'status') return statusBody();
    if (operation === 'inspect') return inspectEnvelope();
    if (operation === 'save') return fixture.ok(saved);
    throw new Error(`${name} reached ${operation}`);
  }), new RegExp(code), name);
  assert.deepEqual(ops, ['status', 'inspect', 'status', 'save'], name);
}

test('public save HTTP accepts one complete contract response from reconcile', async () => {
  assert.notEqual(decodeFirstPurchaseSaveResult(structuredClone(fixture.inspected)), null);
  assert.notEqual(decodeFirstPurchaseSaveReceipt(structuredClone(fixture.saved)), null);
  const saves = []; const saveValues = [];
  const accepted = await accept(async (operation, payload) => {
    if (operation === 'status') return statusBody();
    if (operation === 'inspect') return inspectEnvelope();
    if (operation === 'save') { const body = savedEnvelope(); saves.push(payload); saveValues.push(body.value); return body; }
    return savedEnvelope();
  });
  assert.equal(accepted.accepted_from, 'reconcile');
  assert.deepEqual(accepted.receipt, fixture.saved);
  assert.notEqual(accepted.receipt, saveValues[0]);
  assert.deepEqual(accepted.receipt, saveValues[0]);
  assert.equal(accepted.writes_before_reconcile, 1);
  assert.equal(accepted.evidence, PUBLIC_SAVE_EVIDENCE);
  assert.equal(accepted.controller, 'NOT_RUN');
  assert.deepEqual(accepted.operations_before_accept, ['status', 'inspect', 'status', 'save', 'reconcile']);
  assert.deepEqual(saves[0], fixture.command);
  assert.equal(saves.length, 2);
  await accepted.replay();
  assert.equal(saves.length, 3);
  assert.deepEqual(saves[1], fixture.command);
  assert.deepEqual(saves[2], fixture.command);
});

test('public save HTTP accepts a complete FRESH inspect with the same saved receipt', async () => {
  const inspected = freshInspect();
  assert.notEqual(decodeFirstPurchaseSaveResult(structuredClone(inspected)), null);
  const accepted = await accept(async operation => {
    if (operation === 'status') return statusBody();
    if (operation === 'inspect') return fixture.ok(structuredClone(inspected));
    return savedEnvelope();
  });
  assert.equal(accepted.accepted_from, 'reconcile');
  assert.deepEqual(accepted.receipt, fixture.saved);
  assert.equal(accepted.writes_before_reconcile, 1);
  assert.equal(accepted.controller, PUBLIC_SAVE_CONTROLLER);
});

test('review gaps stop: missing receipt fields, foreign candidate, and foreign data scope', async () => {
  await rejectSaved('SAVED without analysis_ref and durable_state_key', value => {
    delete value.analysis_ref; delete value.durable_state_key;
  }, 'PUBLIC_SAVE_ANALYSIS');
  await rejectInspect('inspect provenance bound to another candidate', value => {
    value.provenance.candidate_digest = 'd'.repeat(64);
  }, 'PUBLIC_SAVE_CANDIDATE');
  await rejectInspect('inspect from another permission data scope', value => {
    value.provenance.permission_scope.data_scope = 'other-scope';
  }, 'PUBLIC_SAVE_SCOPE');
});

test('public save HTTP rejects equivalent receipt and inspect contract bypasses', async () => {
  await rejectSaved('missing analysis_ref only', value => { delete value.analysis_ref; }, 'PUBLIC_SAVE_ANALYSIS');
  await rejectSaved('missing durable_state_key only', value => { delete value.durable_state_key; }, 'PUBLIC_SAVE_ANALYSIS');
  await rejectSaved('null analysis binding', value => { value.analysis_ref = null; value.durable_state_key = null; }, 'PUBLIC_SAVE_ANALYSIS');
  await rejectSaved('analysis version is not positive', value => { value.analysis_ref.version = 0; }, 'PUBLIC_SAVE_ANALYSIS');
  await rejectSaved('analysis_ref has an extra key', value => { value.analysis_ref.extra = true; }, 'PUBLIC_SAVE_ANALYSIS');
  await rejectSaved('durable key is not bound to analysis id and version', value => {
    value.durable_state_key = 'first-purchase-analysis:analysis-fixture:2';
  }, 'PUBLIC_SAVE_ANALYSIS');
  await rejectSaved('SAVED reason is not null', value => { value.reason = 'RECEIPT_NOT_FOUND'; }, 'PUBLIC_SAVE_RECEIPT');
  await rejectSaved('receipt schema is wrong', value => { value.schema_version = 'analytics-first-purchase-save-receipt/v2'; }, 'PUBLIC_SAVE_SCHEMA');
  await rejectSaved('receipt api version is wrong', value => { value.api_version = '1.0.1'; }, 'PUBLIC_SAVE_SCHEMA');
  await rejectSaved('state schema version is wrong', value => { value.state_schema_version = 2; }, 'PUBLIC_SAVE_SCHEMA');
  await rejectSaved('finite_mock is not true', value => { value.finite_mock = false; }, 'PUBLIC_SAVE_RECEIPT');
  await rejectSaved('receipt service owner is wrong', value => { value.service_owner = 'other-service'; }, 'PUBLIC_SAVE_SERVICE');
  await rejectSaved('receipt source data scope differs', value => { value.source_ref.data_scope = 'other-scope'; }, 'PUBLIC_SAVE_SCOPE');
  await rejectSaved('receipt source service owner is wrong', value => { value.source_ref.service_owner = 'other-service'; }, 'PUBLIC_SAVE_SERVICE');
  await rejectSaved('receipt owner is not the status owner', value => { value.owner_id = 'other-user'; }, 'PUBLIC_SAVE_OWNER', false);
  await rejectSaved('idempotency key is not the action id', value => { value.idempotency_key = `fp-save-${'e'.repeat(64)}`; }, 'PUBLIC_SAVE_IDEMPOTENCY', false);
  await rejectSaved('receipt evidence is a different digest', value => { value.source_ref.evidence_digest = '11'.repeat(32); }, 'PUBLIC_SAVE_EVIDENCE', false);
  await rejectInspect('source data scope differs from permission', value => {
    value.provenance.source_refs.data_scope = 'other-scope';
  }, 'PUBLIC_SAVE_SCOPE');
  await rejectInspect('source service owner is wrong', value => {
    value.provenance.source_refs.service_owner = 'other-service';
  }, 'PUBLIC_SAVE_SERVICE');
  await rejectInspect('environment is not synthetic', value => { value.provenance.environment = 'production'; }, 'PUBLIC_SAVE_PROVENANCE');
  await rejectInspect('generated_at is null', value => { value.provenance.generated_at = null; }, 'PUBLIC_SAVE_PROVENANCE');
  await rejectInspect('result state is not SUCCESS_UNSAVED', value => { value.result_state = 'SAVED'; }, 'PUBLIC_SAVE_RESULT');
  await rejectInspect('primary result ref is missing', value => { value.provenance.source_refs.primary_result_ref = null; }, 'PUBLIC_SAVE_SOURCE');
  await rejectInspect('method package digest is missing', value => { value.provenance.source_refs.method_package_digest = null; }, 'PUBLIC_SAVE_SOURCE');
  await rejectInspect('freshness state is not eligible', value => { value.provenance.freshness.freshness_state = 'STALE'; }, 'PUBLIC_SAVE_PROVENANCE');
});

test('public save HTTP rejects a session or call identity mismatch', async () => {
  for (const key of ['session_id', 'call_id']) {
    const target = { ...fixture.target, [key]: `${fixture.target[key]}-other` };
    await assert.rejects(accept(async operation => {
      if (operation === 'status') return statusBody();
      throw new Error(`unexpected ${operation}`);
    }, { target }), /PUBLIC_SAVE_IDENTITY/);
  }
});

test('public save HTTP rejects weakened identity, permission, evidence and replay', async () => {
  let calls = 0;
  const counting = async () => { calls += 1; return statusBody(); };
  await assert.rejects(accept(counting, { candidateDigest: 'zz' }), /PUBLIC_SAVE_CANDIDATE/);
  await assert.rejects(accept(counting, { expectedOwner: '../other' }), /PUBLIC_SAVE_OWNER/);
  await assert.rejects(accept(counting, { title: ' padded' }), /PUBLIC_SAVE_TITLE/);
  assert.equal(calls, 0);
  const fail = async (call, code) => assert.rejects(accept(call), new RegExp(code));
  await fail(async operation => operation === 'status' ? statusBody('other-user') : inspectEnvelope(), 'PUBLIC_SAVE_OWNER');
  await fail(async operation => operation === 'status'
    ? statusBody(fixture.owner, { ...fixture.identity, candidate_digest: 'e'.repeat(64) }) : inspectEnvelope(), 'PUBLIC_SAVE_CANDIDATE');
  const denied = [];
  await fail(async operation => {
    denied.push(operation);
    if (operation === 'status') return statusBody();
    const body = inspectEnvelope(); body.value.provenance.permission_scope.can_save = false; return body;
  }, 'PUBLIC_SAVE_PERMISSION');
  assert.deepEqual(denied, ['status', 'inspect']);
  await fail(async operation => {
    if (operation === 'status') return statusBody();
    const body = inspectEnvelope(); body.value.provenance.source_refs.created_from_run_id = 'other-run'; return body;
  }, 'PUBLIC_SAVE_RUN');
  await fail(async operation => {
    if (operation === 'status') return statusBody();
    const body = inspectEnvelope(); body.value.provenance.source_refs.evidence_digest = 'short'; return body;
  }, 'PUBLIC_SAVE_EVIDENCE');
  let statusCount = 0; const ownerOps = [];
  await fail(async operation => {
    ownerOps.push(operation);
    if (operation === 'status') return statusBody(statusCount++ === 0 ? fixture.owner : 'other-user');
    if (operation === 'inspect') return inspectEnvelope();
    throw new Error('save must not run after an owner change');
  }, 'PUBLIC_SAVE_OWNER');
  assert.deepEqual(ownerOps, ['status', 'inspect', 'status']);
  const evidenceOps = [];
  await fail(async operation => {
    evidenceOps.push(operation);
    if (operation === 'status') return statusBody();
    if (operation === 'inspect') return inspectEnvelope();
    if (operation === 'save') {
      const body = savedEnvelope(); body.value.source_ref.evidence_digest = '11'.repeat(32); return body;
    }
    throw new Error('reconcile must not replace a mismatched save');
  }, 'PUBLIC_SAVE_EVIDENCE');
  assert.deepEqual(evidenceOps, ['status', 'inspect', 'status', 'save']);
  await fail(async operation => {
    if (operation === 'status') return statusBody();
    if (operation === 'inspect') return inspectEnvelope();
    if (operation === 'save') return savedEnvelope();
    return fixture.ok(structuredClone(fixture.unknown));
  }, 'PUBLIC_SAVE_RECEIPT_NOT_ACCEPTED');
  const divergent = structuredClone(fixture.saved);
  divergent.analysis_ref = { analysis_id: 'analysis-replay', version: 2 };
  divergent.durable_state_key = 'first-purchase-analysis:analysis-replay:2';
  assert.notEqual(decodeFirstPurchaseSaveReceipt(structuredClone(divergent)), null);
  let replaySaves = 0;
  await fail(async operation => {
    if (operation === 'status') return statusBody();
    if (operation === 'inspect') return inspectEnvelope();
    if (operation === 'reconcile') return savedEnvelope();
    if (operation === 'save') return ++replaySaves === 1 ? savedEnvelope() : fixture.ok(structuredClone(divergent));
    throw new Error(operation);
  }, 'PUBLIC_SAVE_REPLAY');
});

test('public command and save readers keep the HTTP failure boundary', () => {
  const rpc = publicCommandExecuteEnvelope('session-1', '/first-purchase', 'rpc-1');
  assert.deepEqual(rpc, { type: 'client-request', rpcId: 'rpc-1', method: 'commands/execute',
    payload: { args: { agentId: 'session-1', line: '/first-purchase', submittedAttachments: [] } } });
  const value = readCommandExecuteBody({ status: 200, value: { rpcId: 'rpc-1', result: { ok: true, value: { result: { kind: 'success' } } } } }, 'rpc-1');
  assert.equal(value.result.kind, 'success');
  assert.throws(() => readCommandExecuteBody({ status: 200, value: { rpcId: 'rpc-1', result: { ok: false } } }, 'rpc-1'), /PUBLIC_COMMAND_RESULT/);
  assert.throws(() => readCommandExecuteBody({ status: 200, value: { rpcId: 'rpc-1', result: { ok: true, value: { result: {} } } } }, 'rpc-1'), /PUBLIC_COMMAND_KIND/);
  assert.throws(() => readSaveHttpBody({ status: 401, value: null }), /PUBLIC_SAVE_HTTP_STATUS/);
  assert.throws(() => readSaveHttpBody({ status: 403, value: { schema_version: UI, ok: false } }), /PUBLIC_SAVE_HTTP_STATUS/);
  assert.throws(() => readSaveHttpBody({ status: 200, value: { schema_version: 'other', ok: true } }), /PUBLIC_SAVE_SCHEMA/);
  assert.equal(WORKSPACE_HTTP_ADMISSION, 'official commands/execute HTTP; browser rendering NOT_RUN');
  assert.match(PUBLIC_HTTP_ADMISSION, /createSaveController NOT_RUN/);
  assert.notEqual(PUBLIC_HTTP_ADMISSION, WORKSPACE_HTTP_ADMISSION);
});

test('workspace mode still drives the real createSaveController; browser rendering NOT_RUN', async () => {
  const [{ createSaveController: real }, { createSaveController: used, firstPurchaseCommandEnvelope, runWorkspaceSaveAcceptance },
    { firstPurchaseCommandEnvelope: sourceEnvelope }, { inspected, saved, unknown, status, ok, storage },
    { FIRST_PURCHASE_TOOL_NAME: sourceTool }] = await Promise.all([
    import('../../dsh-plugins/analytics-workbench/src/first-purchase-save-client.mjs'),
    import('./first-purchase-workspace-save.mjs'),
    import('../../dsh-plugins/analytics-workbench/src/first-purchase-command-client.mjs'),
    import('../../dsh-plugins/analytics-workbench/test/first-purchase-save.fixture.mjs'),
    import('../../dsh-plugins/analytics-workbench/src/first-purchase-query-model.mjs'),
  ]);
  assert.equal(used, real);
  assert.equal(scenarioToolName, sourceTool);
  assert.deepEqual(publicCommandExecuteEnvelope('s', '/first-purchase-status', 'rpc'), sourceEnvelope('s', '/first-purchase-status', 'rpc'));
  assert.equal(firstPurchaseCommandEnvelope, sourceEnvelope);
  const owner = 'crm-owner';
  const statusBodyForController = { ...status, owner };
  const inspectedBody = structuredClone(inspected);
  inspectedBody.provenance.permission_scope.owner_id = owner;
  const unknownBody = { ...unknown, owner_id: owner };
  const savedBody = { ...saved, owner_id: owner };
  const seen = [];
  const request = async (_target, operation) => {
    seen.push(operation);
    if (operation === 'status') return statusBodyForController;
    if (operation === 'inspect') return ok(inspectedBody);
    if (operation === 'reconcile') return ok(seen.includes('save') ? savedBody : unknownBody);
    if (operation === 'save') return ok(savedBody);
    throw new Error(operation);
  };
  const controllers = [];
  const accepted = await runWorkspaceSaveAcceptance({ target: fixture.target, storage: storage(), request, title: '官方宿主合成首购', controllers });
  assert.equal(accepted.writes, 1);
  assert.equal(seen.filter(item => item === 'save').length, 2);
  await accepted.replay();
  assert.equal(accepted.writes, 1);
  assert.equal(controllers.length, 2);
  controllers.forEach(controller => controller.dispose());
});

test('probe startup graph does not statically load business plugin source', async () => {
  const protocolSource = await readFile(fileURLToPath(new URL('./first-purchase-host-protocol.mjs', import.meta.url)), 'utf8');
  assert.equal(/from\s+['"][^'"]*(?:analytics-workbench|first-purchase-save-(?:model|client|gateway))/.test(protocolSource), false);
  const source = await readFile(probePath, 'utf8');
  assert.equal(source.includes("from '../../dsh-plugins/analytics-workbench/src/first-purchase-save-client.mjs'"), false);
  assert.equal(source.includes("from '../../dsh-plugins/analytics-workbench/src/first-purchase-command-client.mjs'"), false);
  assert.equal(/^[ \t]*import\s+.*first-purchase-workspace-save\.mjs/m.test(source), false);
  assert.match(source, /import\('\.\/first-purchase-workspace-save\.mjs'\)/);
  const visited = [];
  async function walk(file) {
    if (visited.includes(file)) return;
    visited.push(file);
    if (file.endsWith('.json')) return;
    const text = await readFile(file, 'utf8');
    const specs = new Set();
    for (const pattern of [
      /(?:^|\n)[ \t]*import\s+[\s\S]*?\sfrom\s+['"](\.[^'"]+)['"]/g,
      /(?:^|\n)[ \t]*export\s+[\s\S]*?\sfrom\s+['"](\.[^'"]+)['"]/g,
      /(?:^|\n)[ \t]*import\s+['"](\.[^'"]+)['"]/g,
    ]) {
      for (const match of text.matchAll(pattern)) specs.add(match[1]);
    }
    for (const spec of specs) {
      const raw = resolve(dirname(file), spec);
      let found = null;
      for (const candidate of [raw, `${raw}.mjs`, `${raw}.js`, `${raw}.json`]) {
        try { await stat(candidate); found = candidate; break; } catch { /* try the next explicit extension */ }
      }
      assert.ok(found, `unresolved ${spec} from ${file}`);
      const normalized = found.split(sep).join('/');
      const plugin = normalized.slice(normalized.indexOf('/dsh-plugins/') + '/dsh-plugins/'.length);
      if (normalized.includes('/dsh-plugins/')) assert.ok(plugin.startsWith('plugin-kit/'), normalized);
      await walk(found);
    }
  }
  await walk(probePath);
  assert.ok(visited.some(file => file.endsWith(`${sep}first-purchase-host-protocol.mjs`)));
  assert.equal(visited.some(file => file.endsWith(`${sep}first-purchase-workspace-save.mjs`)), false);
  const normalizedVisited = visited.map(file => file.split(sep).join('/'));
  assert.ok(normalizedVisited.some(file => file.includes('/dsh-plugins/plugin-kit/')
    || file.endsWith('/scripts/release/toolchain.mjs')));
});

async function requireAbsoluteKind(file, kind, code) {
  if (typeof file !== 'string' || !isAbsolute(file)) throw new Error(code);
  let info;
  try { info = await stat(file); } catch { throw new Error(code); }
  if (kind === 'file' && !info.isFile()) throw new Error(code);
  if (kind === 'dir' && !info.isDirectory()) throw new Error(code);
}

/** Explicit fixed-package binding. No manifest, digest, or historical directory is implied. */
export async function loadFixedBinding(file, options = {}) {
  if (typeof file !== 'string' || !isAbsolute(file)) throw new Error('PROBE_BINDING_PATH');
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (error) { throw new Error(`PROBE_BINDING_UNREADABLE:${error.code ?? 'ERROR'}`); }
  let body;
  try { body = JSON.parse(text); } catch { throw new Error('PROBE_BINDING_SCHEMA'); }
  const keysOk = body !== null && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).length === BINDING_KEYS.length && BINDING_KEYS.every(key => Object.hasOwn(body, key));
  if (!keysOk || body.schema_version !== BINDING_SCHEMA) throw new Error('PROBE_BINDING_SCHEMA');
  await requireAbsoluteKind(body.manifest_path, 'file', 'PROBE_BINDING_MANIFEST');
  await requireAbsoluteKind(body.upstream_path, 'dir', 'PROBE_BINDING_UPSTREAM');
  if (typeof body.expected_candidate_digest !== 'string' || !/^[a-f0-9]{64}$/.test(body.expected_candidate_digest)) throw new Error('PROBE_BINDING_CANDIDATE');
  if (typeof body.expected_upstream_sha !== 'string' || !/^[a-f0-9]{40}$/.test(body.expected_upstream_sha)) throw new Error('PROBE_BINDING_UPSTREAM');
  for (const list of [body.read_deny, body.write_deny]) {
    if (!Array.isArray(list) || list.length === 0 || list.some(item => typeof item !== 'string' || !isAbsolute(item))) throw new Error('PROBE_BINDING_DENY');
  }
  const sandboxExec = options.sandboxExec ?? '/usr/bin/sandbox-exec';
  await requireAbsoluteKind(sandboxExec, 'file', 'PROBE_BINDING_SANDBOX');
  return {
    manifest_path: body.manifest_path, upstream_path: body.upstream_path,
    expected_candidate_digest: body.expected_candidate_digest, expected_upstream_sha: body.expected_upstream_sha,
    read_deny: body.read_deny, write_deny: body.write_deny, sandboxExec,
  };
}

function coveredBy(file, roots) {
  const target = resolve(file);
  return roots.some(root => {
    const base = resolve(root);
    return target === base || target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
  });
}
async function writeBinding(directory, body) {
  const file = join(directory, `binding-${randomBytes(3).toString('hex')}.json`);
  await writeFile(file, JSON.stringify(body));
  return file;
}

test('fixed binding has no implicit package and rejects explicit misconfiguration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shinemage-binding-'));
  const manifest = join(root, 'manifest.json');
  const upstream = join(root, 'upstream');
  const sandbox = join(root, 'sandbox-exec');
  await writeFile(manifest, '{}');
  await mkdir(upstream);
  await writeFile(sandbox, '');
  const valid = {
    schema_version: BINDING_SCHEMA, manifest_path: manifest, upstream_path: upstream,
    expected_candidate_digest: 'a'.repeat(64), expected_upstream_sha: 'b'.repeat(40),
    read_deny: [root], write_deny: [root],
  };
  const loaded = await loadFixedBinding(await writeBinding(root, valid), { sandboxExec: sandbox });
  assert.equal(loaded.manifest_path, manifest);
  assert.equal(loaded.expected_candidate_digest, 'a'.repeat(64));
  assert.equal(loaded.sandboxExec, sandbox);
  await assert.rejects(loadFixedBinding('relative.json'), /PROBE_BINDING_PATH/);
  await assert.rejects(loadFixedBinding(join(root, 'missing.json')), /PROBE_BINDING_UNREADABLE/);
  const broken = join(root, 'broken.json');
  await writeFile(broken, '{');
  await assert.rejects(loadFixedBinding(broken), /PROBE_BINDING_SCHEMA/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, schema_version: 'other' })), /PROBE_BINDING_SCHEMA/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, extra: true })), /PROBE_BINDING_SCHEMA/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, manifest_path: 'relative.json' })), /PROBE_BINDING_MANIFEST/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, manifest_path: join(root, 'absent.json') })), /PROBE_BINDING_MANIFEST/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, upstream_path: 'relative' })), /PROBE_BINDING_UPSTREAM/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, upstream_path: manifest })), /PROBE_BINDING_UPSTREAM/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, expected_candidate_digest: 'zz' })), /PROBE_BINDING_CANDIDATE/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, expected_upstream_sha: 'gg' })), /PROBE_BINDING_UPSTREAM/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, read_deny: [] })), /PROBE_BINDING_DENY/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, read_deny: ['relative'] })), /PROBE_BINDING_DENY/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, { ...valid, write_deny: [root, 'relative'] })), /PROBE_BINDING_DENY/);
  await assert.rejects(loadFixedBinding(await writeBinding(root, valid), { sandboxExec: join(root, 'missing-sandbox') }), /PROBE_BINDING_SANDBOX/);
  await rm(root, { recursive: true, force: true });
});

async function runDirectory(t) {
  const evidence = process.env.SHINEMAGE_PROBE_EVIDENCE;
  const parent = evidence ? join(evidence, 'runs') : await mkdtemp(join(tmpdir(), 'shinemage-probe-protocol-'));
  await mkdir(parent, { recursive: true });
  const root = join(parent, randomBytes(4).toString('hex'));
  await mkdir(root);
  if (!evidence) t.after(() => rm(parent, { recursive: true, force: true }));
  return root;
}
async function record(directory, name, text) {
  if (!process.env.SHINEMAGE_PROBE_EVIDENCE) return;
  await writeFile(join(directory, name), text);
}
function childEnv(extra) {
  if (typeof process.env.PATH !== 'string' || process.env.PATH.length === 0) throw new Error('PROBE_RUNTIME_PATH');
  return { PATH: process.env.PATH, HOME: extra.home, TMPDIR: extra.tmp, PYTHON_DOTENV_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1', ...extra.vars };
}
function sandboxProfile(binding) {
  return ['(version 1)', '(allow default)', '(deny network*)',
    ...binding.read_deny.map(path => `(deny file-read-data (subpath ${JSON.stringify(path)}))`),
    ...binding.write_deny.map(path => `(deny file-write* (subpath ${JSON.stringify(path)}))`)].join('\n') + '\n';
}
function sandboxed(binding, profile, args, env) {
  return spawnSync(binding.sandboxExec, ['-f', profile, ...args], { input: '', encoding: 'utf8', env, timeout: 120000, cwd: repository });
}

test('sandboxed packed handshake cannot read denied source and resolves only the bound install', { skip: fixedSkip }, async t => {
  const binding = await loadFixedBinding(bindingOptIn);
  assert.equal(coveredBy(deniedSource, binding.read_deny), true, 'PROBE_BINDING_DENY');
  const root = await runDirectory(t);
  const profile = join(root, 'handshake.sb');
  await writeFile(profile, sandboxProfile(binding));
  const denied = sandboxed(binding, profile, [process.execPath, '-e', 'import { readFileSync } from "node:fs"; readFileSync(process.argv[1])', deniedSource],
    childEnv({ home: root, tmp: root, vars: {} }));
  await record(root, 'negative-read.txt', `${denied.status}\n${denied.stdout}\n${denied.stderr}`);
  assert.notEqual(denied.status, 0);
  assert.match(`${denied.stderr}`, /EPERM/);
  const output = join(root, `handshake-${randomBytes(4).toString('hex')}`);
  const home = join(root, 'home'); const temp = join(root, 'tmp');
  await mkdir(home); await mkdir(temp);
  const upstreamHead = spawnSync('git', ['-C', binding.upstream_path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(upstreamHead, binding.expected_upstream_sha);
  const before = createHash('sha256').update(await readFile(binding.manifest_path)).digest('hex');
  const result = sandboxed(binding, profile, [process.execPath, probePath], childEnv({ home, tmp: temp, vars: {
    B0_NATIVE_CRM_ARTIFACT_MANIFEST: binding.manifest_path,
    B0_NATIVE_CRM_ARTIFACT_OUTPUT: output,
    B0_NATIVE_CRM_HOST_UPSTREAM: binding.upstream_path,
  } }));
  await record(root, 'handshake.txt', `probe:${createHash('sha256').update(await readFile(probePath)).digest('hex')}\nexit:${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /EPERM|first-purchase-save-client|first-purchase-command-client/);
  const handshake = JSON.parse(result.stdout);
  assert.equal(handshake.candidate_digest, binding.expected_candidate_digest);
  assert.deepEqual(Object.keys(handshake).sort(), ['candidate_digest', 'method_digest']);
  const installed = await import(pathToFileURL(join(output, 'dsh-plugins/workbench/lib/skills.js')).href);
  assert.equal(handshake.method_digest, installed.firstPurchaseMethodPackageDigest);
  assert.notEqual(handshake.method_digest, 'a'.repeat(64));
  assert.deepEqual((await readdir(output)).sort(), ['crm', 'crm.tgz', 'dsh-plugins', 'packages.json', 'upstream', 'workbench', 'workbench.tgz']);
  await assert.rejects(stat(join(output, 'http-observations.json')), /ENOENT/);
  assert.equal(createHash('sha256').update(await readFile(binding.manifest_path)).digest('hex'), before);
  const again = sandboxed(binding, profile, [process.execPath, probePath], childEnv({ home, tmp: temp, vars: {
    B0_NATIVE_CRM_ARTIFACT_MANIFEST: binding.manifest_path,
    B0_NATIVE_CRM_ARTIFACT_OUTPUT: output,
    B0_NATIVE_CRM_HOST_UPSTREAM: binding.upstream_path,
  } }));
  await record(root, 'existing-output.txt', `${again.status}\n${again.stderr}`);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /EEXIST/);
  assert.doesNotMatch(again.stderr, /first-purchase-save-client/);
});

test('sandboxed packed mode fails closed on missing, invalid, and schema input without source fallback', { skip: fixedSkip }, async t => {
  const binding = await loadFixedBinding(bindingOptIn);
  const root = await runDirectory(t);
  const profile = join(root, 'negative.sb');
  await writeFile(profile, sandboxProfile(binding));
  const home = join(root, 'home'); const temp = join(root, 'tmp');
  await mkdir(home); await mkdir(temp);
  const base = JSON.parse(await readFile(binding.manifest_path, 'utf8'));
  const cases = [
    ['missing-manifest', join(root, 'absent.json'), /ENOENT/],
    ['bad-schema', join(root, 'schema.json'), /HOST_ARTIFACT_SCHEMA/],
    ['bad-digest', join(root, 'digest.json'), /HOST_ARTIFACT_CANDIDATE_BYTES/],
  ];
  const schema = { ...base }; delete schema.candidate_sha256;
  const digest = { ...base, candidate_sha256: '0'.repeat(64) };
  await writeFile(cases[1][1], JSON.stringify(schema));
  await writeFile(cases[2][1], JSON.stringify(digest));
  for (const [name, manifest, error] of cases) {
    const output = join(root, name);
    const result = sandboxed(binding, profile, [process.execPath, probePath], childEnv({ home, tmp: temp, vars: {
      B0_NATIVE_CRM_ARTIFACT_MANIFEST: manifest,
      B0_NATIVE_CRM_ARTIFACT_OUTPUT: output,
      B0_NATIVE_CRM_HOST_UPSTREAM: binding.upstream_path,
    } }));
    await record(root, `${name}.txt`, `${result.status}\n${result.stdout}\n${result.stderr}`);
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stderr}`, error, name);
    assert.doesNotMatch(`${result.stderr}`, /first-purchase-save-client|first-purchase-command-client|query-model/, name);
    await assert.rejects(stat(output), /ENOENT/);
  }
});
