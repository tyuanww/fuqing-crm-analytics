/** Sealed independent leaf bundles; synthetic DOM/Cordis surfaces, no browser or model. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { LEAF_NAMES, loadLeafComposition } from './leaf-pack-inputs.mjs';

const runtime = await loadLeafComposition({ scope: 'leaf' });
after(() => runtime.dispose());
const source = new Map(await Promise.all(LEAF_NAMES.map(async name => [name, await readFile(runtime.resolveExport(name, 'client'), 'utf8')])));

function client(name, { override = false, document, MutationObserver } = {}) {
  const rows = [], sandbox = { window: { __ModuleLoader__: { load: row => rows.push(row) } },
    ...(override ? { __SHINE_BRAND_OVERRIDE__: true } : {}), ...(document ? { document } : {}),
    ...(MutationObserver ? { MutationObserver } : {}) };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source.get(name), sandbox, { timeout: 1000 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, `@shine-mage/dsh-${name}`);
  const value = rows[0].factory(specifier => {
    assert.ok(runtime.react.has(specifier), `UNEXPECTED_BROWSER_REQUIRE: ${specifier}`);
    return runtime.react.get(specifier);
  });
  return { value, sandbox };
}

function mountBrand(value) {
  const entries = [], effects = [];
  value.apply({ effect: factory => effects.push(factory()), slots: {
    inject: (_name, callback) => effects.push(callback()),
    register: (options, component) => {
      const row = { options, component }; entries.push(row);
      return () => entries.splice(entries.indexOf(row), 1);
    },
  } });
  return { entries, dispose: () => effects.forEach(effect => typeof effect === 'function' && effect()) };
}

for (const name of LEAF_NAMES) {
  test(`${name}: published host entry mounts and disposes on actual Cordis`, async t => {
    const ctx = new runtime.Context(); t.after(() => ctx.fiber.dispose());
    const entry = await runtime.loadExport(name);
    assert.equal(entry.name, `${name}-ui`);
    assert.equal(JSON.stringify(entry.inject), '[]');
    const mounted = await ctx.plugin(entry);
    assert.ok(Number.isInteger(mounted.uid));
    await mounted.dispose();
    assert.equal(mounted.uid, null);
  });
}

test('brand bundle registers only its opt-in slot and disposes it', () => {
  const { value } = client('shine-brand', { override: true });
  assert.equal(JSON.stringify(value.inject), '["slots"]');
  assert.doesNotMatch(source.get('shine-brand'), /require\(/);
  const mounted = mountBrand(value);
  assert.deepEqual(mounted.entries.map(row => row.options.name), ['sidebar.brand.name']);
  assert.equal(mounted.entries[0].options.priority, -10);
  assert.equal(mounted.entries[0].component(), '伸美 AI 增长董事会');
  mounted.dispose(); assert.deepEqual(mounted.entries, []);
});

test('brand bundle preserves native chrome and slots by default', () => {
  const document = { documentElement: {}, title: 'Native DSH' };
  const mounted = mountBrand(client('shine-brand', { document }).value);
  assert.equal(document.title, 'Native DSH');
  assert.deepEqual(mounted.entries, []); mounted.dispose();
});

function documentFixture({ icon = false, nested = false, preview = false } = {}) {
  const heading = { textContent: 'Into the Unknown', children: { length: nested ? 1 : 0 } };
  const leaf = { textContent: '把增长问清楚', children: { length: 0 } };
  const badge = { textContent: '预览版', style: {}, setAttribute(name, value) { this[name] = value; } };
  const icons = icon ? [{ setAttribute(name, value) { this[name] = value; } }] : [];
  const document = { documentElement: {}, body: {}, title: 'DeepSeek Harness', head: { appendChild: node => icons.push(node) },
    querySelector: () => icons[0] ?? null,
    querySelectorAll: selector => selector.includes('previewBadge') ? (preview ? [badge] : []) : [heading, leaf],
    createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
  };
  return { document, heading, leaf, badge, icons };
}

test('brand bundle applies its opted-in title, greeting and icon from published bytes', () => {
  const f = documentFixture();
  const mounted = mountBrand(client('shine-brand', { override: true, document: f.document }).value);
  assert.equal(f.document.title, '伸美 AI 增长董事会');
  assert.equal(f.heading.textContent, 'Shine mage Work');
  assert.equal(f.icons[0].href, '/b0/brand/mark.svg'); mounted.dispose();
});

test('brand bundle preserves nested headlines, hides preview and releases its observer', () => {
  const f = documentFixture({ icon: true, nested: true, preview: true });
  let observed = 0, disconnected = 0;
  class Observer { observe(body, options) { assert.equal(body, f.document.body); assert.equal(options.subtree, true); observed++; } disconnect() { disconnected++; } }
  const mounted = mountBrand(client('shine-brand', { override: true, document: f.document, MutationObserver: Observer }).value);
  assert.equal(f.heading.textContent, 'Into the Unknown');
  assert.equal(f.leaf.textContent, 'Shine mage Work');
  assert.equal(f.badge.hidden, ''); assert.equal(f.badge.style.display, 'none');
  assert.equal(f.icons[0].href, '/b0/brand/mark.svg');
  assert.equal(observed, 1); mounted.dispose(); assert.equal(disconnected, 1);
});

for (const name of LEAF_NAMES.filter(name => name !== 'shine-brand')) {
  test(`${name}: published client factory applies its capability marker`, () => {
    if (name === 'shine-board') assert.doesNotMatch(source.get(name), /require\(|\.context\/dsh-b0|COMPETITION_HTTP/);
    const { value, sandbox } = client(name); value.apply({});
    assert.equal(sandbox[`__${name.replaceAll('-', '_').toUpperCase()}__`], true);
  });
}

const { funnelGeometry } = await runtime.loadExport('shine-funnel', 'funnel');
const { waterfallGeometry } = await runtime.loadExport('shine-waterfall', 'waterfall');
const funnel = counts => ({ unit: '人', cohort_label: '合成同一人群', counting_rule: '至少1/2/3笔有效订单',
  stages: counts.map((count, index) => ({ label: `阶段${index + 1}`, count })) });

test('published funnel uses raw ratios and zero denominators without fabricated widths', () => {
  assert.deepEqual(funnelGeometry(funnel([10, 5, 0])).stages.map(row => row.previous_ratio), [null, .5, 0]);
  assert.deepEqual(funnelGeometry(funnel([10, 5, 0])).stages.map(row => row.first_ratio), [1, .5, 0]);
  assert.deepEqual(funnelGeometry(funnel([0, 0, 0])).stages.map(row => row.first_ratio), [null, null, null]);
  assert.deepEqual(funnelGeometry(funnel([10, 0, 0])).stages.map(row => row.previous_ratio), [null, 0, null]);
  assert.equal(funnelGeometry(funnel([10, 0, 0])).stages[1].width, 0);
});

test('published funnel rejects unregistered facts, labels, units and executable props', () => {
  for (const mutate of [x => { x.unit = '元'; }, x => { delete x.unit; }, x => { x.stages[0].label = ' '; },
    x => { x.stages[1].label = x.stages[0].label; }, x => { x.stages[1].extra = 0; }, x => { x.cohort_label = ''; },
    x => { x.script = 'alert(1)'; }, x => { x.counting_rule = ''; }, x => { x.stages[0].count = Infinity; }]) {
    const input = funnel([10, 5, 0]); mutate(input); assert.equal(funnelGeometry(input), null);
  }
});

test('published waterfall preserves its large proportional list and rejects overflow', () => {
  const input = { unit: '个', start: { label: '起点', value: 0 }, end: { label: '终点', value: 200 },
    contributions: Array.from({ length: 200 }, (_, i) => ({ label: `渠道${i}`, value: 1 })) };
  const geometry = waterfallGeometry(input);
  assert.equal(geometry.bars.length, 202); assert.ok(geometry.width > 19000);
  assert.ok(Math.abs(geometry.bars[1].bottom - geometry.bars[1].top - 1) < 1e-8);
  input.contributions.push({ label: '不能截断', value: 0 }); assert.equal(waterfallGeometry(input), null);
});
