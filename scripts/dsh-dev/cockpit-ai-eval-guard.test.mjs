import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, rmSync, realpathSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import { apply } from './cockpit-ai-eval-guard.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cockpit-guard-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'workspace'); mkdirSync(cwd);
  writeFileSync(join(cwd, 'TASK.md'), 'Synthetic task');
  writeFileSync(join(cwd, 'source.json'), '{}');
  const config = { workspaceRoot: root, presetId: 'cockpit-eval-test' };
  const restrictions = [], listeners = new Map(); let guard;
  const ctx = { tools: { restrict: value => restrictions.push(value), guard: value => { guard = value; } },
    on: (name, callback) => listeners.set(name, callback) };
  apply(ctx, config);
  const own = [];
  const agent = { id: 'session-synthetic', ctx: { tools: { restrict: value => own.push(value) } },
    session: { header: { id: 'session-synthetic', cwd, agentPreset: config.presetId } } };
  const admit = () => listeners.get('agent/created')({ agent });
  const call = (name, args, caller = agent) => guard({ name, arguments: args, agent: caller });
  return { root, cwd, config, restrictions, own, agent, admit, call, listeners };
}

test('admits only its own lifecycle agent and limits the inherited tool catalog', t => {
  const f = fixture(t);
  assert.deepEqual(f.restrictions, [{ deny: [] }]);
  assert.equal(f.call('read', { file_path: 'TASK.md' }), 'EVAL_SCOPE_INVALID');
  f.admit();
  assert.deepEqual(f.own, [{ allow: ['read', 'write', 'edit', 'present'] }]);
  for (const tool of ['bash', 'weknora_search', 'read_image', 'run_code', 'plugin_install']) {
    assert.equal(f.call(tool, {}), 'EVAL_TOOL_DENIED');
  }
  assert.equal(f.call('read', { file_path: 'TASK.md' }, null), 'EVAL_SCOPE_INVALID');
  const other = { ...f.agent, id: 'other' };
  assert.equal(f.call('read', { file_path: 'TASK.md' }, other), 'EVAL_SCOPE_INVALID');
  assert.throws(() => f.listeners.get('agent/created')({ agent: other }), /EVAL_SCOPE_INVALID/);
  const foreign = { ...f.agent, session: { header: { ...f.agent.session.header, agentPreset: 'standard' } } };
  assert.throws(() => f.listeners.get('agent/created')({ agent: foreign }), /EVAL_SCOPE_INVALID/);
});

test('native file_path and present.files allow only task reads and candidate writes', t => {
  const f = fixture(t); f.admit();
  for (const file of ['TASK.md', 'source.json']) {
    assert.equal(f.call('read', { file_path: file }), undefined);
    assert.equal(f.call('read', { file_path: join(f.cwd, file) }), undefined);
    for (const tool of ['write', 'edit']) assert.equal(f.call(tool, { file_path: file }), 'EVAL_PATH_DENIED');
  }
  assert.equal(f.call('write', { file_path: './candidate.json', content: '{}' }), undefined);
  for (const tool of ['read', 'edit']) assert.equal(f.call(tool, { file_path: 'candidate.json' }), 'EVAL_PATH_DENIED');
  assert.equal(f.call('present', { files: [{ path: 'candidate.json' }] }), 'EVAL_PATH_DENIED');
  writeFileSync(join(f.cwd, 'candidate.json'), '{}');
  for (const tool of ['read', 'write', 'edit']) assert.equal(f.call(tool, { file_path: 'candidate.json' }), undefined);
  assert.equal(f.call('present', { files: [{ path: join(f.cwd, 'candidate.json') }] }), undefined);
  for (const value of ['', '../source.json', './folder/../candidate.json', 'folder/candidate.json',
    join(f.root, 'candidate.json'), pathToFileURL(join(f.cwd, 'candidate.json')).href, 'https://example.test/source.json', '\0']) {
    assert.equal(f.call('read', { file_path: value }), 'EVAL_PATH_DENIED');
    assert.equal(f.call('write', { file_path: value }), 'EVAL_PATH_DENIED');
  }
  for (const args of [{ path: 'candidate.json' }, null, [], {}]) assert.equal(f.call('read', args), 'EVAL_PATH_DENIED');
  for (const files of [[], [{ path: 'source.json' }], [{ path: 'candidate.json' }, { path: 'TASK.md' }], [null]]) {
    assert.equal(f.call('present', { files }), 'EVAL_PATH_DENIED');
  }
});

test('rejects symlink, hardlink, non-file and replaced workspace escape paths', t => {
  const f = fixture(t); f.admit();
  const external = join(f.root, 'outside.json'); writeFileSync(external, 'synthetic outside');
  const candidate = join(f.cwd, 'candidate.json');
  for (const make of [() => symlinkSync(external, candidate), () => linkSync(external, candidate), () => mkdirSync(candidate)]) {
    make();
    for (const tool of ['read', 'write', 'edit']) assert.equal(f.call(tool, { file_path: 'candidate.json' }), 'EVAL_PATH_DENIED');
    assert.equal(f.call('present', { files: [{ path: 'candidate.json' }] }), 'EVAL_PATH_DENIED');
    rmSync(candidate, { recursive: true });
  }
  rmSync(join(f.cwd, 'source.json'));
  symlinkSync(external, join(f.cwd, 'source.json'));
  assert.equal(f.call('read', { file_path: 'source.json' }), 'EVAL_PATH_DENIED');
  renameSync(f.cwd, join(f.root, 'old-workspace')); mkdirSync(f.cwd);
  writeFileSync(join(f.cwd, 'TASK.md'), 'replacement');
  assert.equal(f.call('read', { file_path: 'TASK.md' }), 'EVAL_SCOPE_INVALID');
});

test('refuses unknown scope and workspaces outside the physical synthetic root', t => {
  const f = fixture(t);
  assert.throws(() => apply({ tools: { restrict() { throw new Error('unscoped'); } } }, f.config), /unscoped/);
  for (const cwd of [f.root, pathToFileURL(f.cwd).href, '.', join(f.root, 'absent')]) {
    f.agent.session.header.cwd = cwd;
    assert.throws(f.admit);
  }
  const alias = join(f.root, 'alias'); symlinkSync(f.cwd, alias);
  f.agent.session.header.cwd = alias;
  assert.throws(f.admit, /EVAL_SCOPE_INVALID/);
});

test('fixed native scope registry preserves four tools and leaves other agents unchanged', async t => {
  const upstream = process.env.B0_BUILD_UPSTREAM;
  if (!upstream) { t.skip('Set B0_BUILD_UPSTREAM to the existing fixed built upstream for native registry integration'); return; }
  const f = fixture(t);
  const req = createRequire(join(upstream, 'packages/core/tools/package.json'));
  const { Context } = req('@deepseek-ai/cordis');
  const { default: SystemPrompt } = await import(pathToFileURL(join(upstream, 'packages/core/system-prompt/lib/index.js')));
  const { default: ToolRuntime } = await import(pathToFileURL(join(upstream, 'packages/core/tools/lib/index.js')));
  const { createScope, bindScopeParent, scopeOf, scopeTarget } = await import(pathToFileURL(join(upstream, 'packages/core/scope/lib/index.js')));
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {}); await ctx.plugin(ToolRuntime);
  const tool = name => ({ name, description: name, parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => 'synthetic:' + name });
  ctx.tools.register(tool('weknora_search'));
  const scopes = {}, otherAgent = { id: 'other' };
  await ctx.plugin(Object.assign(inner => {
    scopes.preset = createScope(inner, { id: 'preset' });
    scopes.own = createScope(inner, f.agent);
    scopes.other = createScope(inner, otherAgent);
  }, { inject: ['tools', 'systemPrompt'] }));
  t.after(async () => { for (const scope of Object.values(scopes)) await scope.dispose(); });
  f.agent.ctx = scopes.own.ctx;
  bindScopeParent(scopeOf(scopes.own.ctx), scopeOf(scopes.preset.ctx));
  for (const name of ['read', 'write', 'edit', 'present', 'read_image']) scopes.preset.ctx.tools.register(tool(name));
  apply(scopes.preset.ctx, f.config);
  await ctx.serial(scopeTarget(ctx.tools, f.agent), 'agent/created', { agent: f.agent, source: 'fresh' });
  assert.deepEqual(ctx.tools.schemas(f.agent).map(row => row.name).sort(), ['edit', 'present', 'read', 'write']);
  assert.deepEqual(ctx.tools.schemas().map(row => row.name), ['weknora_search']);
  assert.deepEqual(ctx.tools.schemas(otherAgent).map(row => row.name), ['weknora_search']);
  const execute = (name, args) => ctx.tools.execute({ agent: f.agent, name, arguments: args,
    callId: 'guard-test', signal: new AbortController().signal });
  assert.equal((await execute('read', { file_path: 'TASK.md' })).isError, false);
  assert.equal((await execute('write', { file_path: 'source.json' })).isError, true);
  assert.equal((await execute('weknora_search', {})).isError, true);
});
