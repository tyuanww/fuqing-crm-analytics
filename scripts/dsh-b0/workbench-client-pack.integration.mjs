/** Sealed published client against synthetic slots/React/JSDOM; no full DSH host or real browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadWorkbenchClient } from './workbench-client-pack-inputs.mjs';

const { source, stores, webRequire, JSDOM } = await loadWorkbenchClient();

test('ordinary native chat has no synthetic run status; registered B0 still has its status', () => {
  const { entries, effects } = mount(loadClient());
  const component = entries.find(row => row.options.name === 'conversation.input.dock').component;
  const React = webRequire('react');
  const { renderToStaticMarkup } = webRequire('react-dom/server');
  try {
    const native = renderToStaticMarkup(React.createElement(component, { session: { sessionId: 'native-session-uuid' } }));
    assert.equal(native, '');
    const back = entries.find(row => row.options.id === 'shine-mage.analytics-b0.return-cockpit');
    const returned = renderToStaticMarkup(React.createElement(back.component, {
      session: { sessionId: 'native-session-uuid' }, openCockpit() { return true; },
    }));
    assert.match(returned, /返回驾驶舱/);
    const registered = renderToStaticMarkup(React.createElement(component, { session: { sessionId: 'session-b0-synthetic-primary' } }));
    assert.match(registered, /B0 任务内核状态/);
    const generate = entries.find(row => row.options.id === 'shine-mage.analytics-b0.generate-cockpit');
    const board = generate.options.inject().board;
    const nativeGenerate = renderToStaticMarkup(React.createElement(generate.component, {
      session: { sessionId: 'native-session-uuid' }, board,
    }));
    assert.equal(nativeGenerate, '');
    const registeredGenerate = renderToStaticMarkup(React.createElement(generate.component, {
      session: { sessionId: 'session-b0-synthetic-primary' }, board,
    }));
    assert.match(registeredGenerate, /生成驾驶舱/);
    assert.equal(board.getSnapshot().boardSpec.board_id, 'board_demo_channel_gsv_2026_08');
    board.actions.proposeGenerate();
    assert.equal(board.getSnapshot().pendingGenerate, null);
    assert.match(board.getSnapshot().boardError, /没有可绑定的核验结果/);
    assert.equal(board.getSnapshot().boardSpec.board_id, 'board_demo_channel_gsv_2026_08');
    const facts = { result_c0: { current_gsv: 410, comparison_gsv: 305, difference: 105 } };
    const spec = {
      board_id: 'board_retail_gsv_result_c0',
      version: 1,
      blocks: [
        { block_id: 'm1', kind: 'METRIC', title: '零售 GSV', metric_ref: 'retail_gsv', source_result_id: 'result_c0' },
      ],
    };
    board.actions.proposeGenerate({ spec, facts });
    assert.ok(board.getSnapshot().pendingGenerate);
    board.actions.confirmGenerate();
    assert.equal(board.getSnapshot().pendingGenerate, null);
    assert.equal(board.getSnapshot().boardSpec.board_id, 'board_retail_gsv_result_c0');
  } finally {
    for (const dispose of effects) if (typeof dispose === 'function') dispose();
  }
});

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
  };
}

function fakePluginWindow(storage) {
  const listeners = new Map();
  return {
    localStorage: storage,
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) ?? []).filter(row => row !== fn));
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event?.type) ?? []) fn(event);
      return true;
    },
    open() { assert.fail('lifecycle test opened a tab'); },
  };
}

function loadClient(hostWindow) {
  const storage = hostWindow?.localStorage ?? memoryStorage();
  const view = hostWindow ?? fakePluginWindow(storage);
  const seed = new Map([
    ['react', webRequire('react')],
    ['react-dom', webRequire('react-dom')],
    ['react/jsx-runtime', webRequire('react/jsx-runtime')],
    ['@deepseek-ai/dsh-client-store', stores],
  ]);
  let factoryRow;
  view.__ModuleLoader__ = { load: row => { factoryRow = row; } };
  vm.runInNewContext(source, {
    AbortController,
    setTimeout,
    clearTimeout,
    window: view,
    localStorage: storage,
    document: view.document,
    Event: view.Event,
    KeyboardEvent: view.KeyboardEvent,
    HTMLElement: view.HTMLElement,
    HTMLButtonElement: view.HTMLButtonElement,
    Node: view.Node,
    ResizeObserver: view.ResizeObserver,
    FormData: view.FormData,
    fetch: view.fetch,
    __PAGE_DOCUMENTS_HTTP_BASE__: view.pageBase,
    __SHINE_QUERY__: true,
    __SHINE_BOARD__: true,
    __SHINE_CROWD_ACTION__: true,
    __SHINE_BRAND_OVERRIDE__: true,
  }, { timeout: 1000 });
  assert.equal(factoryRow?.id, '@shine-mage/dsh-analytics-workbench-b0');
  return factoryRow.factory(spec => {
    assert.ok(seed.has(spec), `unexpected browser require: ${spec}`);
    return seed.get(spec);
  });
}

function mount(client, extra = {}) {
  const entries = [];
  const effects = [];
  const tabs = [];
  client.apply({
    effect: factory => { effects.push(factory()); },
    sidebarRightTabs: { register: tab => { tabs.push(tab); return () => tabs.splice(tabs.indexOf(tab), 1); } },
    theme: { overrideTokens: () => () => {} },
    sessions: {
      list: { getSnapshot: () => ({ phase: 'ready', ids: [], byId: {} }), subscribe: () => () => {} },
      retain() { assert.fail('lifecycle test opened a session'); },
      create() { assert.fail('lifecycle test created a session'); },
    },
    slots: {
      inject: (_name, callback) => effects.push(callback()),
      register: (options, component) => {
        entries.push({ options, component });
        return () => {
          const index = entries.findIndex(row => row.options === options);
          if (index >= 0) entries.splice(index, 1);
        };
      },
    },
    ...extra,
  });
  return { entries, effects, tabs };
}

test('apply registers business slots; dispose removes them without touching native keys', () => {
  const client = loadClient();
  const { entries, effects, tabs } = mount(client);
  assert.deepEqual(entries.map(row => row.options.name), [
    'sidebar.right.pane.tab', 'sidebar.right.pane.tab',
    'sidebar.brand.mark', 'conversation.hero.brand.mark',
    'sidebar.footer.action', 'shell.overlay',
    'tool.call.toolview', 'tool.call.toolview', 'tool.call.toolview', 'tool.call.toolview', 'tool.call.toolview', 'tool.call.toolview',
    'conversation.input.dock', 'conversation.input.dock', 'conversation.composer.dock',
    'sidebar.panellist', 'main',
    'sidebar.panellist', 'main',
  ]);
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].canOpen('dsh-resource://cockpit-ai/ai_1234abcd'), true);
  assert.equal(tabs[0].canOpen('dsh-resource://file/current.html'), false);
  assert.equal(tabs[1].canOpen('dsh-resource://cockpit-page/page_abc123'), true);
  assert.equal(tabs[1].canOpen('dsh-resource://cockpit-ai/ai_1234abcd'), false);
  assert.equal(entries[0].options.key, tabs[0].id);
  const panels = entries.filter(row => row.options.name === 'sidebar.panellist');
  const mains = entries.filter(row => row.options.name === 'main');
  assert.deepEqual(panels.map(row => row.options.id), ['cockpit', 'staff']);
  assert.deepEqual(mains.map(row => row.options.key), ['cockpit', 'staff']);
  assert.equal(entries.some(row => row.options.name === 'conversation.view'), false);
  const footers = entries.filter(row => row.options.name === 'sidebar.footer.action');
  assert.deepEqual(footers.map(row => row.options.id),
    ['shine-mage.account.login']);
  assert.deepEqual(footers.map(row => row.options.order), [10]);
  assert.equal(typeof footers[0].component, 'function');
  assert.equal(entries.some(row => ['shine-mage.account.theme', 'shine-mage.account.menu'].includes(row.options.id)), false);
  assert.deepEqual(entries.filter(row => row.options.name === 'tool.call.toolview').map(row => row.options.key), [
    'analytics_b0_query', 'analytics_channel_followup_query', 'analytics_first_purchase_query', 'competition_board_generate', 'competition_board_edit', 'free_html_page_generate',
  ]);
  for (const dispose of effects) if (typeof dispose === 'function') dispose();
  assert.equal(entries.length, 0);
  assert.equal(tabs.length, 0);
});

test('artifact confirmation uncertainty survives tab recreation and arms browser leave protection', async () => {
  const view = fakePluginWindow(memoryStorage());
  view.pageBase = 'http://synthetic.invalid';
  const ready = { id: 'ai_test', target_kind: 'page', target_id: 'page_test', base_version: 1,
    status: 'READY', candidate_hash: 'candidate', filename: 'page-package.json' };
  const writes = []; let fail = true;
  view.fetch = async (url, init) => {
    if (url.endsWith('/confirm')) {
      writes.push(init.body);
      if (fail) { fail = false; throw new Error('lost receipt'); }
      return Response.json({ ...ready, status: 'SAVED', saved_version: 2 });
    }
    if (url.endsWith('/ai_test')) return Response.json(ready);
    return Response.json({ items: [] });
  };
  const { entries, effects } = mount(loadClient(view));
  try {
    const createClient = entries.find(row => row.options.name === 'sidebar.right.pane.tab').options.inject().createClient;
    const client = createClient(ready.id);
    assert.equal(await client.load(ready.id), true);
    assert.equal((await client.confirm()).ok, false);
    let prevented = false;
    view.dispatchEvent({ type: 'beforeunload', preventDefault() { prevented = true; } });
    assert.equal(prevented, true, 'right tab must participate in host leave protection');
    const reopened = createClient(ready.id);
    assert.equal(reopened, client, 'a recreated tab must retain the uncertain request');
    assert.equal(reopened.getSnapshot().confirmationUncertain, true);
    assert.equal((await reopened.confirm()).ok, true);
    assert.deepEqual(writes, [writes[0], writes[0]]);
    prevented = false;
    view.dispatchEvent({ type: 'beforeunload', preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
  } finally {
    for (const dispose of effects) if (typeof dispose === 'function') dispose();
  }
});

test('generate dock openCockpit selects sidebar.panellist id cockpit on the main slot', () => {
  const selected = [];
  const { entries, effects } = mount(loadClient(), {
    layout: { selectPanel: id => { selected.push(id); } },
  });
  const generate = entries.find(row => row.options.id === 'shine-mage.analytics-b0.generate-cockpit');
  assert.equal(generate.options.name, 'conversation.composer.dock');
  assert.equal(generate.options.inject().openCockpit(), true);
  assert.deepEqual(selected, ['cockpit']);
  assert.equal(entries.find(row => row.options.name === 'sidebar.panellist').options.id,
    entries.find(row => row.options.name === 'main').options.key);
  for (const dispose of effects) if (typeof dispose === 'function') dispose();
});

test('the sealed current package leaves account menus and theme ownership with the native host', () => {
  const { entries, effects } = mount(loadClient());
  try {
    const row = entries.find(item => item.options.id === 'shine-mage.account.login');
    assert.ok(row);
    assert.equal(row.options.store, undefined);
    assert.equal(row.options.inject, undefined);
    assert.equal(entries.some(item => ['shine-mage.account.menu', 'shine-mage.account.theme'].includes(item.options.id)), false);
  } finally {
    for (const dispose of effects) if (typeof dispose === 'function') dispose();
  }
});

test('the sealed current package exposes its native account bridge in wide and rail layouts', () => {
  const { entries, effects } = mount(loadClient());
  const React = webRequire('react');
  const { renderToStaticMarkup } = webRequire('react-dom/server');
  try {
    const row = entries.find(item => item.options.id === 'shine-mage.account.login');
    const wide = renderToStaticMarkup(React.createElement(row.component, { wide: true }));
    const rail = renderToStaticMarkup(React.createElement(row.component, { wide: false }));
    assert.match(wide, /账号与设置/);
    assert.match(wide, /data-wide="1"/);
    assert.match(wide, /data-native-account-bridge="rc1"/);
    assert.match(wide, /aria-label="账号与设置"/);
    assert.doesNotMatch(wide, /未登录|shine-account-name-input/);
    assert.match(wide, /<svg /);
    assert.match(rail, /data-wide="0"/);
    assert.match(rail, /aria-label="账号与设置"/);
    assert.match(rail, /<svg /);
  } finally {
    for (const dispose of effects) if (typeof dispose === 'function') dispose();
  }
});

test('the compiled account bridge reports a refused native gesture and recovers on retry', async () => {
  const React = webRequire('react');
  const { createRoot } = webRequire('react-dom/client');
  const act = typeof React.act === 'function' ? React.act : webRequire('react-dom/test-utils').act;
  const dom = new JSDOM('<!doctype html><body><button data-signed-out="true" aria-haspopup="menu" aria-expanded="false"></button><div id="root"></div></body>', {
    url: 'http://127.0.0.1:4318/',
  });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const account = dom.window.document.querySelector('button');
  account.getClientRects = () => [{ width: 1, height: 1 }];
  let accept = false, clicks = 0;
  account.addEventListener('click', () => {
    clicks += 1;
    if (accept) account.setAttribute('aria-expanded', 'true');
  });
  const { entries, effects } = mount(loadClient(dom.window));
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    const row = entries.find(item => item.options.id === 'shine-mage.account.login');
    await act(() => root.render(React.createElement(row.component, { wide: true })));
    const button = dom.window.document.querySelector('[data-testid="shine-account-login"]');
    const waitForState = async expected => {
      for (let attempt = 0; attempt < 100 && button.getAttribute('data-state') !== expected; attempt++) {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      }
      assert.equal(button.getAttribute('data-state'), expected);
    };
    await act(() => button.click());
    await waitForState('error');
    assert.equal(clicks, 1);
    assert.match(dom.window.document.getElementById('shine-native-account-notice').textContent, /未能打开/);
    accept = true;
    await act(() => button.click());
    await waitForState('ready');
    assert.equal(clicks, 2);
    assert.equal(account.getAttribute('aria-expanded'), 'true');
    assert.equal(dom.window.document.getElementById('shine-native-account-notice'), null);
  } finally {
    await act(() => root.unmount());
    for (const dispose of effects) if (typeof dispose === 'function') dispose();
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.act === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT; else globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    dom.window.close();
  }
});

test('a second apply on the same fake ctx duplicates registrations; Host must not double-insert the plugin', () => {
  const client = loadClient();
  const entries = [];
  const ctx = {
    effect: factory => factory(),
    sidebarRightTabs: { register: () => () => {} },
    theme: { overrideTokens: () => () => {} },
    sessions: {
      list: { getSnapshot: () => ({ phase: 'ready', ids: [], byId: {} }), subscribe: () => () => {} },
      retain() { return { sessionId: '', release() {} }; }, create() { assert.fail('lifecycle test created a session'); },
    },
    slots: {
      inject: (_name, callback) => callback(),
      register: (options, component) => { entries.push({ options, component }); return () => {}; },
    },
  };
  client.apply(ctx);
  client.apply(ctx);
  // A second apply duplicates every registration; no identity is added or lost.
  const ids = entries.filter(row => row.options.id !== undefined).map(row => row.options.id);
  assert.equal(entries.some(row => ['shine-mage.account.theme', 'shine-mage.account.menu'].includes(row.options.id)), false);
  for (const id of ['shine-mage.account.login',
    'shine-mage.analytics-b0.generate-cockpit', 'shine-mage.analytics-b0.overlay']) {
    assert.equal(entries.filter(row => row.options.id === id).length, 2, `${id} registered twice`);
    assert.equal(ids.filter(value => value === id).length, 2, `${id} counted twice`);
  }
});

test('board store refreshBoard rebinds catalog; cancelGenerate drops pending; generateBoard writes', () => {
  const { entries, effects } = mount(loadClient());
  try {
    const board = entries.find(row => row.options.id === 'shine-mage.analytics-b0.generate-cockpit').options.inject().board;
    board.actions.setFactsCatalog({
      demo_live: { current_gsv: 999, comparison_gsv: 1, difference: 998 },
    });
    board.actions.refreshBoard();
    assert.equal(board.getSnapshot().boardFacts.demo_live.current_gsv, 999);
    assert.equal(board.getSnapshot().boardFacts.demo_private, undefined);
    const spec = {
      board_id: 'board_x',
      version: 1,
      blocks: [{ block_id: 'm1', kind: 'METRIC', title: 'x', source_result_id: 'demo_live' }],
    };
    board.actions.proposeGenerate({ spec, facts: { demo_live: { current_gsv: 1, comparison_gsv: 1, difference: 0 } } });
    assert.ok(board.getSnapshot().pendingGenerate);
    board.actions.cancelGenerate();
    assert.equal(board.getSnapshot().pendingGenerate, null);
    board.actions.generateBoard();
    assert.match(board.getSnapshot().boardError, /没有可绑定的核验结果/);
    board.actions.generateBoard({ spec, facts: { demo_live: { current_gsv: 2, comparison_gsv: 1, difference: 1 } } });
    assert.equal(board.getSnapshot().boardSpec.board_id, 'board_x');
    assert.equal(board.getSnapshot().pendingGenerate, null);
  } finally {
    for (const dispose of effects) if (typeof dispose === 'function') dispose();
  }
});

test('generate dock proposes a bound board from results and appends a LINK without Feishu token', async () => {
  const React = webRequire('react');
  const { createRoot } = webRequire('react-dom/client');
  const act = typeof React.act === 'function' ? React.act : webRequire('react-dom/test-utils').act;
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:4318/' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { entries, effects } = mount(loadClient());
  const root = createRoot(dom.window.document.getElementById('root'));
  let opened = 0;
  try {
    const generate = entries.find(row => row.options.id === 'shine-mage.analytics-b0.generate-cockpit');
    const board = generate.options.inject().board;
    await act(() => {
      root.render(React.createElement(generate.component, {
        session: { sessionId: 'session-b0-synthetic-primary' },
        board,
        openCockpit() { opened += 1; },
        async fetchResults() {
          return [{
            result_id: 'result_c0',
            facts: { current: { gsv: 410 }, comparison: { gsv: 305 }, difference: 105 },
          }];
        },
      }));
    });
    await act(() => { dom.window.document.querySelector('[data-testid="analytics-b0-generate-cockpit"]').click(); });
    for (let i = 0; i < 30 && !board.getSnapshot().pendingGenerate; i += 1) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
    }
    const pending = board.getSnapshot().pendingGenerate;
    assert.ok(pending);
    assert.equal(pending.spec.blocks[0].source_result_id, 'result_c0');
    assert.equal(pending.facts.result_c0.current_gsv, 410);
    assert.equal(opened, 1);
  } finally {
    await act(() => root.unmount());
    for (const dispose of effects) if (typeof dispose === 'function') dispose();
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.act === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    dom.window.close();
  }
});

test('built browser factory requires only platform modules and registers shared-root entries', async () => {
  const seed = new Map([
    ['react', webRequire('react')],
    ['react-dom', webRequire('react-dom')],
    ['react/jsx-runtime', webRequire('react/jsx-runtime')],
    ['@deepseek-ai/dsh-client-store', stores],
  ]);
  let factoryRow;
  const primary = 'session-b0-synthetic-primary';
  const browser = {
    localStorage: { getItem: () => null },
    __ModuleLoader__: { load: row => { factoryRow = row; } },
  };
  vm.runInNewContext(source, {
    AbortController,
    window: browser,
    __SHINE_QUERY__: true,
    __SHINE_BOARD__: true,
    __SHINE_B0_SESSION_IDS__: [primary],
    // This test exercises the explicit opt-in branding path. The default
    // runtime keeps native DSH branding when this flag is absent.
    __SHINE_BRAND_OVERRIDE__: true,
  }, { filename: 'analytics-b0-client.js', timeout: 1000 });
  assert.equal(factoryRow.id, '@shine-mage/dsh-analytics-workbench-b0');
  const client = factoryRow.factory(spec => {
    assert.ok(seed.has(spec), `unexpected browser require: ${spec}`);
    return seed.get(spec);
  });
  const entries = [];
  const effects = [], opened = [], selected = [];
  let snapshot = { phase: 'pending', ids: [primary], byId: { [primary]: { id: primary, retainedBy: {} } } };
  const listeners = new Set();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  let held;
  client.apply({
    sidebarRightTabs: { register: () => () => {} },
    effect: factory => { effects.push(factory()); },
    theme: { overrideTokens: () => () => {} },
    layout: { selectPanel: id => { selected.push(id); } },
    sessions: {
      list: { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
      retain(id) {
        opened.push(id);
        snapshot = { ...snapshot, byId: { ...snapshot.byId, [id]: { id, retainedBy: { mainView: 1 } } } };
        held = { sessionId: id, release() {
          snapshot = { ...snapshot, byId: { ...snapshot.byId, [id]: { id, retainedBy: {} } } };
        } };
        return held;
      },
      create: () => assert.fail('compiled client attempted session/create'),
    },
    slots: {
    inject: (_name, callback) => callback(),
    register: (options, component) => { entries.push({ options, component }); return () => {}; },
  } });
  assert.deepEqual(opened, []);
  snapshot = { ...snapshot, phase: 'ready' };
  notify();
  notify();
  assert.deepEqual(opened, [primary]);
  const names = entries.map(row => row.options.name);
  assert.ok(names.includes('conversation.hero.brand.mark'));
  assert.ok(names.includes('sidebar.panellist'));
  assert.equal(entries.some(row => row.options.name === 'conversation.view'), false);
  const login = entries.find(row => row.options.id === 'shine-mage.account.login');
  const overlay = entries.find(row => row.options.id === 'shine-mage.analytics-b0.overlay');
  const dock = entries.find(row => row.options.id === 'shine-mage.analytics-b0.generate-cockpit');
  const panel = entries.find(row => row.options.name === 'sidebar.panellist');
  const main = entries.find(row => row.options.name === 'main');
  assert.equal(entries.find(row => row.options.name === 'sidebar.brand.mark').options.priority, -10);
  assert.equal(entries.find(row => row.options.name === 'conversation.hero.brand.mark').options.priority, -10);
  const selection = overlay.options.inject();
  selection.detachSelection();
  selection.restoreSelection();
  assert.equal(snapshot.byId[primary].retainedBy.mainView, 1);
  assert.equal(login.options.store, undefined);
  assert.equal(dock.options.store, undefined);
  assert.ok(dock.options.inject().board);
  const seeded = dock.options.inject().board.getSnapshot();
  assert.equal(seeded.boardSpec.board_id, 'board_demo_channel_gsv_2026_08');
  assert.equal(seeded.boardFacts.demo_live.current_gsv, 180);
  assert.equal(seeded.boardError, '');
  assert.equal(panel.options.id, 'cockpit');
  assert.equal(main.options.key, 'cockpit');
  assert.deepEqual(JSON.parse(JSON.stringify(main.options.children)), { 'cockpit.crm': { kind: 'single', scope: 'root' } });
  assert.equal(dock.options.inject().openCockpit(), true);
  assert.deepEqual(selected, ['cockpit']);
  const state = overlay.options.store.create();
  assert.equal(state.getSnapshot().open, false);
  state.actions.open();
  assert.equal(state.getSnapshot().open, true);
  assert.equal(state.getSnapshot().intent, 'view');
  state.actions.close();
  state.actions.openGenerate();
  assert.equal(state.getSnapshot().open, true);
  assert.equal(state.getSnapshot().intent, 'generate');
  state.actions.close();
  state.actions.open();
  state.actions.edit('编译产物标题');
  state.actions.preview();
  state.actions.requestClose();
  assert.equal(state.getSnapshot().confirmClose, true);
  assert.equal(state.getSnapshot().open, true);
  state.actions.keepEditing();
  assert.equal(state.getSnapshot().confirmClose, false);
  state.actions.commit('仅 UI 测试');
  assert.equal(state.getSnapshot().editor.title, '编译产物标题');
  state.actions.close();
  assert.equal(state.getSnapshot().open, false);
  state.actions.open();
  state.actions.edit('不应保存');
  state.actions.discardAndClose();
  assert.equal(state.getSnapshot().editor.draft, '编译产物标题');
  assert.equal(state.getSnapshot().open, false);
  for (const dispose of effects) dispose();
  assert.equal(listeners.size, 0);
});
