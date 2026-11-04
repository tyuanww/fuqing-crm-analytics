import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_SCHEMA, DEFAULT_CONTRACT, evaluate, extractSlotCatalog, maskComments, render, topLevelProperties,
} from './rc5-surface-gate.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const SLOT_CATALOG_FIXTURE = `export const CLIENT_NOTES: readonly string[] = ['x']

// Every slot the shipped web bundle declares, sorted by key.
export const CLIENT_SLOT_API: readonly ClientSlotEntry[] = [
  {
    key: 'main',
    kind: 'keyed',
    scope: 'root',
    summary: 'Main pane.',
  },
  {
    key: 'sidebar.panellist',
    kind: 'list',
    scope: 'root',
    summary: 'Sidebar panels.',
  },
]
`;

const GOOD_PLUGIN = {
  'package.json': {
    name: '@fixture/plugin',
    private: true,
    type: 'module',
    exports: { '.': './lib/index.js', './client': './lib/client.js', './cordis.patch.yml': './cordis.patch.yml' },
    peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.1-rc.5' },
    dsh: { client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-sidebar'] }, bundle: { patch: './cordis.patch.yml' } },
  },
  'cordis.patch.yml': 'plugins: {}\n',
  'src/connection-fetch-ledger.mjs': 'export const owner = true;\n',
  'src/index.ts': '',
  'src/route.ts': [
    "import { ConnectionFetchLedger } from './connection-fetch-ledger.mjs';",
    'const ROUTE_PATH = \'/api/fixture\';',
    'export function apply(ctx: Context, config: { routes?: ConnectionFetchLedger } = {}) {',
    "  const routes = config.routes ?? new ConnectionFetchLedger(ctx);",
    "  ctx.effect(() => () => routes.release('fixture'), 'fixture: release');",
    "  void routes.own('fixture', { path: ROUTE_PATH, methods: ['POST'], requestBody: 'buffered', async fetch() { return new Response('ok'); } });",
    '}',
    "ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'fixture' }, Panel));",
    "ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'fixture', children: { 'fixture.page': Page } }, Main));",
    "ctx.slots.inject('fixture.page', () => ctx.slots.register({ name: 'fixture.page' }, Page));",
    "ctx.tools.register(defineTool({ name: 'fixture' }));",
  ].join('\n'),
};

async function fixtureRepo({ plugin = GOOD_PLUGIN, contract = {}, files = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rc5-gate-'));
  const baseContract = {
    schema_version: CONTRACT_SCHEMA,
    target: {
      release: '0.2.1-rc.5',
      commit: 'b830ec950faba0a46dda564be3e2d854afed94f1',
      packages: { '@deepseek-ai/dsh-tools': '0.2.1-rc.5' },
      node_major: 24,
    },
    privateSlots: [],
    routeOwnership: {
      ownerModule: 'dsh-plugins/fixture/src/connection-fetch-ledger.mjs',
      debt: [],
    },
    tools: { dsl: 'defineTool' },
    envDeploymentPrefixes: ['B0_'],
    slots: extractSlotCatalog(SLOT_CATALOG_FIXTURE),
    ...contract,
  };
  await mkdir(join(root, 'config'), { recursive: true });
  await mkdir(join(root, 'dsh-plugins/fixture/src'), { recursive: true });
  await writeFile(join(root, DEFAULT_CONTRACT), `${JSON.stringify(baseContract, null, 2)}\n`);
  for (const [name, body] of Object.entries(plugin)) {
    const path = join(root, 'dsh-plugins/fixture', name);
    if (name.includes('/')) await mkdir(join(root, 'dsh-plugins/fixture', name.split('/').slice(0, -1).join('/')), { recursive: true });
    await writeFile(path, typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`);
  }
  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(root, name.split('/').slice(0, -1).join('/')), { recursive: true });
    await writeFile(path, body);
  }
  return root;
}

const codes = result => result.errors.map(row => row.code);

test('the rc.5 slot catalog extraction keeps key/kind/scope and refuses a duplicate', () => {
  assert.deepEqual(extractSlotCatalog(SLOT_CATALOG_FIXTURE), [
    { key: 'main', kind: 'keyed', scope: 'root' },
    { key: 'sidebar.panellist', kind: 'list', scope: 'root' },
  ]);
  assert.throws(() => extractSlotCatalog('export const OTHER = []'), /no CLIENT_SLOT_API/);
  const duplicate = `${SLOT_CATALOG_FIXTURE.replace('sidebar.panellist', 'main')}`;
  assert.throws(() => extractSlotCatalog(duplicate), /repeats main/);
});

test('the object reader handles quoted keys, shorthand handlers and nested children', () => {
  const source = `{
    name: 'main', key: PANEL_ID,
    'quoted-key': { nested: 'a,b' },
    children: { 'cockpit.crm': Page },
    async fetch(request) { return new Response(request.url); },
    inject: () => ({ id: 'not-a-route-field' }),
  }`;
  const properties = topLevelProperties(source);
  assert.equal(properties.get('name'), "'main'");
  assert.equal(properties.get('key'), 'PANEL_ID');
  assert.equal(properties.get('fetch'), '(method)');
  assert.deepEqual([...topLevelProperties(properties.get('children')).keys()], ['cockpit.crm']);
});

test('comment masking keeps offsets and line numbers while hiding prose', () => {
  const source = "a\n// ctx.connection.fetch.register(x)\nb /* fetch.register */ c\n";
  const masked = maskComments(source);
  assert.equal(masked.length, source.length);
  assert.equal(masked.split('\n').length, source.split('\n').length);
  assert.equal(masked.includes('fetch.register'), false);
  assert.equal(masked.includes('c'), true);
});

test('a plugin that follows the rc.5 surface produces no error', async t => {
  const root = await fixtureRepo();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await evaluate({ root });
  assert.deepEqual(result.errors, []);
  const stats = result.stats;
  assert.equal(stats.plugins, 1);
  assert.equal(stats.owned, 1, 'the ledger-owned route is counted as owned');
  assert.equal(stats.tools, 1);
  assert.deepEqual([...stats.privateSlots].sort().concat([...stats.declaredChildren].sort()), ['fixture.page']);
});

test('the current repository passes the gate with only recorded warnings', async () => {
  const result = await evaluate({ root: REPO_ROOT });
  assert.deepEqual(result.errors.map(row => `${row.code} ${row.where}`), []);
  assert.ok(result.stats.owned >= 1, 'the ledger must own at least one route');
  assert.ok(result.stats.slots.size >= 10, 'the repository registers a broad slot surface');
  // Debt entries must be either recorded as debt or reported stale, never silent.
  const debtCodes = new Set(result.warnings.filter(row => row.code.startsWith('ROUTE_DEBT')).map(row => row.where));
  for (const entry of result.contract.routeOwnership.debt) {
    assert.ok(debtCodes.has(entry.path), `${entry.path} must be reported as debt`);
  }
  assert.match(render(result), /result: 0 error\(s\)/);
});

test('every fail-closed rule fires on a fixture that drifts', async t => {
  const root = await fixtureRepo({
    plugin: {
      ...GOOD_PLUGIN,
      'package.json': {
        ...GOOD_PLUGIN['package.json'],
        exports: { '.': './lib/index.js' },
        dsh: { client: { platform: 'node', immediately: 'yes' }, bundle: { patch: './missing.yml' } },
      },
      'src/route.ts': [
        "ctx.connection.fetch.register({ path: '/internal/native/x', methods: ['PUT'], requestBody: 'chunked' });",
        "ctx.slots.register({ name: 'sidebar.unknown' }, X);",
        "ctx.slots.register({ name: 'sidebar.panellist' }, Y);",
        "ctx.slots.register({ name: 'main' }, Z);",
        'ctx.tools.register({ name: \'loose\' });',
      ].join('\n'),
    },
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const found = codes(await evaluate({ root }));
  for (const code of [
    'CLIENT_PLATFORM', 'CLIENT_IMMEDIATELY', 'BUNDLE_PATCH', 'CLIENT_EXPORT_MISSING',
    'FETCH_PATH', 'FETCH_METHODS', 'FETCH_BODY', 'FETCH_HANDLER', 'UNOWNED_FETCH_ROUTE',
    'UNKNOWN_SLOT', 'SLOT_LIST_ID', 'SLOT_KEYED_KEY', 'TOOL_DSL', 'OWNER_MODULE_MISSING',
  ]) {
    assert.ok(found.includes(code), `expected ${code}, saw ${found.join(',')}`);
  }
});

test('direct registrations beyond the recorded debt are an error, and the ledger stays mandatory', async t => {
  const root = await fixtureRepo({
    contract: {
      routeOwnership: {
        ownerModule: 'dsh-plugins/fixture/src/connection-fetch-ledger.mjs',
        debt: [{ path: 'dsh-plugins/fixture/src/legacy.ts', routes: 1, reason: 'fixture debt' }],
      },
    },
    plugin: {
      ...GOOD_PLUGIN,
      'src/legacy.ts': [
        "ctx.connection.fetch.register({ path: '/api/legacy-one', methods: ['POST'], requestBody: 'buffered', fetch: h });",
        "ctx.connection.fetch.register({ path: '/api/legacy-two', methods: ['POST'], requestBody: 'buffered', fetch: h });",
      ].join('\n'),
    },
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await evaluate({ root });
  assert.deepEqual(codes(result), ['ROUTE_DEBT_EXCEEDED']);
  const ledgerGone = await fixtureRepo({ plugin: { ...GOOD_PLUGIN, 'src/route.ts': '' } });
  t.after(() => rm(ledgerGone, { recursive: true, force: true }));
  assert.deepEqual(codes(await evaluate({ root: ledgerGone })), ['OWNER_MODULE_MISSING']);
});

test('a missing record is not silently tolerated', async t => {
  const root = await fixtureRepo({
    plugin: { ...GOOD_PLUGIN, 'src/legacy.ts': "ctx.connection.fetch.register({ path: '/api/x', methods: ['POST'], requestBody: 'buffered', fetch: h });" },
    contract: { routeOwnership: { ownerModule: 'dsh-plugins/fixture/src/connection-fetch-ledger.mjs', debt: [{ path: 'dsh-plugins/fixture/src/legacy.ts', routes: 1, reason: 'fixture debt' }] } },
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  // Removing the only direct registration must leave the debt record visibly stale.
  const stale = await evaluate({ root });
  assert.deepEqual(stale.errors, []);
  assert.ok(stale.warnings.some(row => row.code === 'ROUTE_DEBT'));
});

test('a malformed contract stops the gate instead of passing it', async t => {
  const root = await fixtureRepo({ contract: { schema_version: 'wrong' } });
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(evaluate({ root }), /schema_version/);
});
