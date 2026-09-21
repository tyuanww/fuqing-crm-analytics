import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sourceHash, validatePresentation } from '../free-page/presentation/model.mjs';
import { editablePageNodes, selectionSrcdoc, acceptTargets, acceptSelection } from './html-selection-bridge.mjs';
import { renderedTextPreview, renderedPackageHash, validRenderedLocator } from './html-rendered-text.mjs';
import { selectionForAI } from './html-source-selection.mjs';

const upstream = resolve(process.env.B0_BUILD_UPSTREAM ?? '.context/dsh-b0/upstream');
const { JSDOM } = createRequire(upstream + '/node_modules/jsdom/package.json')('jsdom');
const pkg = { html: '<h1>原来的标题</h1><button id="switch">切换</button><section id="cards"></section>', css: '', resources: [], node_map: [],
  js: `let count=42; function render() { document.getElementById('cards').innerHTML='<article data-node="metric"><span class="label">收入文案</span><strong>'+count+'</strong></article>'; } render(); document.getElementById('switch').onclick=()=>{count++;render();};` };
async function mount(t, source, { editing = true, selectBlocks = false } = {}) {
  const messages = [], nodes = editablePageNodes(source, {});
  const dom = new JSDOM(selectionSrcdoc(source, { channel: 'test', pageId: 'page', version: 1, nodes, editing, selectBlocks }), {
    runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(window) { window.postMessage = data => messages.push(data); },
  });
  t.after(() => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close(); });
  await new Promise(resolve => dom.window.addEventListener('load', () => setTimeout(resolve, 10), { once: true }));
  const context = { source: dom.window, channel: 'test', pageId: 'page', version: 1, nodes };
  const targets = () => acceptTargets({ source: dom.window, origin: 'null', data: messages.findLast(message => message.type === 'cockpit.targets') }, context);
  return { dom, messages, nodes, targets, context };
}

test('script-rendered cards expose copy and whole-block targets; direct edit keeps renderer and interaction', async t => {
  const ui = await mount(t, pkg);
  const text = ui.targets().find(node => node.runtime && node.text === '收入文案');
  assert.ok(text?.editableText, 'the previously unreachable card copy is editable');
  assert.equal(text.runtime.package_hash, renderedPackageHash(pkg));
  ui.dom.window.document.querySelector('.label').click();
  const selected = acceptSelection({ source: ui.dom.window, origin: 'null', data: ui.messages.findLast(x => x.type === 'cockpit.selection') }, { ...ui.context, nodes: ui.targets() });
  assert.equal(selected.node_id, text.node_id);
  const changed = renderedTextPreview(pkg, text, '新的收入文案', {});
  assert.equal(changed.html, pkg.html); assert.equal(changed.css, pkg.css); assert.equal(changed.js, pkg.js);
  const reopened = await mount(t, changed, { editing: false });
  assert.equal(reopened.dom.window.document.querySelector('.label').textContent, '新的收入文案');
  reopened.dom.window.document.querySelector('#switch').click();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(reopened.dom.window.document.querySelector('strong').textContent, '43');
  assert.equal(reopened.dom.window.document.querySelector('.label').textContent, '新的收入文案');
  assert.equal(reopened.dom.window.document.querySelector('h1').textContent, '原来的标题');
});

test('AI mode promotes a child click to its card and carries source anchor plus current rendered content', async t => {
  const ui = await mount(t, pkg, { selectBlocks: true });
  ui.dom.window.document.querySelector('.label').click();
  const selected = acceptSelection({ source: ui.dom.window, origin: 'null', data: ui.messages.findLast(x => x.type === 'cockpit.selection') }, { ...ui.context, nodes: ui.targets() });
  assert.equal(selected.tag, 'article'); assert.equal(selected.block, true);
  const scope = selectionForAI(pkg, selected);
  assert.match(scope.rendered.html, /data-node="metric"/);
  assert.equal(pkg.html.slice(scope.start, scope.end), '<section id="cards"></section>');
});

test('literal replacement remains data and stale or bound edits are refused', async t => {
  const ui = await mount(t, pkg), text = ui.targets().find(node => node.runtime && node.text === '收入文案');
  const value = '</script><script>window.compromised=true</script>&';
  const reopened = await mount(t, renderedTextPreview(pkg, text, value, {}), { editing: false });
  assert.equal(reopened.dom.window.document.querySelector('.label').textContent, value);
  assert.equal(reopened.dom.window.compromised, undefined);
  assert.throws(() => renderedTextPreview({ ...pkg, js: pkg.js + '\n' }, text, 'new', {}), /选区或内容来源已变化/);
  assert.throws(() => renderedTextPreview(pkg, text, 'new', { result_refs: ['business'] }), /选区或内容来源已变化/);
  assert.equal(validRenderedLocator({ anchor: { attribute: 'id', value: 'cards' }, path: [null] }), false);
  assert.equal(acceptTargets({ source: ui.dom.window, origin: 'null', data: { type: 'cockpit.targets', channel: 'test', pageId: 'page', version: 1, nodeIds: [], runtimeNodes: [null] } }, ui.context), undefined);
});

const tick = () => new Promise(resolve => setTimeout(resolve, 15));

test('identity survives reorder/insertion of equal-looking cards; unkeyed duplicates are not editable', async t => {
  const input = { ...pkg, js: `window.order=['a','b']; window.render=()=>{cards.innerHTML=order.map(id=>'<article data-node="'+id+'"><span>相同</span></article>').join('')};render();` };
  const ui = await mount(t, input);
  const target = ui.targets().find(n => n.runtime?.path.some(p => p.key?.value === 'b') && n.tag === 'span');
  const edited = renderedTextPreview(input, target, '只改 B', {});
  const out = await mount(t, edited, { editing: false });
  out.dom.window.order = ['b','new','a']; out.dom.window.render(); await tick();
  assert.equal(out.dom.window.document.querySelector('[data-node="b"] span').textContent, '只改 B');
  assert.equal(out.dom.window.document.querySelector('[data-node="a"] span').textContent, '相同');
  assert.equal(out.dom.window.document.querySelector('[data-node="new"] span').textContent, '相同');
  const ambiguous = await mount(t, { ...pkg, js: `cards.innerHTML='<article><span>相同</span></article><article><span>相同</span></article>';` });
  assert.equal(ambiguous.targets().filter(n => n.runtime && n.tag === 'span').length, 0);
});

test('display override survives value refresh without changing original calculation state', async t => {
  const ui = await mount(t, pkg), target = ui.targets().find(n => n.tag === 'strong');
  const edited = renderedTextPreview(pkg, target, '显示占位', {});
  const out = await mount(t, edited, { editing: false });
  out.dom.window.document.querySelector('#switch').click(); await tick();
  assert.equal(out.dom.window.document.querySelector('strong').textContent, '显示占位');
  assert.equal(out.dom.window.eval('count'), 43);
  assert.equal(edited.js, pkg.js);
});

test('mixed text preserves its unit and child identity while the original calculation keeps running', async t => {
  const source = { ...pkg, js: pkg.js.replace("'+count+'</strong>", "'+count+'<small>单</small></strong>") };
  const ui = await mount(t, source), target = ui.targets().find(n => n.tag === 'strong');
  assert.equal(target.text, '42'); assert.equal(target.editableText, true);
  const out = await mount(t, renderedTextPreview(source, target, '已编辑', {}), { editing: false });
  assert.equal(out.dom.window.document.querySelector('strong').textContent, '已编辑单');
  out.dom.window.document.querySelector('#switch').click(); await tick();
  assert.equal(out.dom.window.document.querySelector('small').textContent, '单');
  assert.equal(out.dom.window.document.querySelector('strong').textContent, '已编辑单');
  assert.equal(out.dom.window.eval('count'), 43);
});

test('missing or ambiguous saved identities report unresolved; returning filtered item restores edit', async t => {
  const ui = await mount(t, pkg), target = ui.targets().find(n => n.text === '收入文案' && n.runtime);
  const out = await mount(t, renderedTextPreview(pkg, target, '保存的文案', {}), { editing: false });
  out.dom.window.document.querySelector('article').remove(); await tick();
  assert.deepEqual(Array.from(out.dom.window.__cockpitPresentationStatus.unresolved), [0]);
  out.dom.window.eval('render()'); await tick();
  assert.equal(out.dom.window.document.querySelector('.label').textContent, '保存的文案');
  assert.equal(out.dom.window.__cockpitPresentationStatus.unresolved.length, 0);
  const article = out.dom.window.document.querySelector('article'); article.after(article.cloneNode(true)); await tick();
  assert.equal(out.dom.window.__cockpitPresentationStatus.unresolved.length, 1);
});

test('legacy labels match unique original text inside a keyed card, surviving reorder but refusing changed or duplicate labels', async t => {
  const source = { ...pkg, js: `window.labels=['峰值日','11-15']; window.render=()=>{cards.innerHTML='<article data-node="metric"><div>'+labels.map(x=>'<span>'+x+'</span>').join('')+'</div></article>';};render();` };
  const ui = await mount(t, source), target = ui.targets().find(n => n.runtime && n.text === '峰值日');
  assert.equal(target.runtime.path.at(-1).key.attribute, 'text');
  ui.dom.window.document.querySelector('span').click();
  const picked = acceptSelection({ source: ui.dom.window, origin: 'null', data: ui.messages.findLast(x => x.type === 'cockpit.selection') }, { ...ui.context, nodes: ui.targets() });
  assert.equal(picked.text, '峰值日');
  const out = await mount(t, renderedTextPreview(source, target, '新名称', {}), { editing: true });
  const changed = out.targets().find(n => n.text === '新名称');
  assert.equal(changed.runtime.path.at(-1).key.value, '峰值日');
  const empty = await mount(t, renderedTextPreview(source, target, '', {}), { editing: true });
  assert.ok(empty.targets().some(n => n.editableText && n.text === '' && n.runtime.path.at(-1).key?.value === '峰值日'));
  out.dom.window.labels.reverse(); out.dom.window.render(); await tick();
  assert.equal(out.dom.window.document.querySelector('article').textContent, '11-15新名称');
  out.dom.window.labels = ['峰值日','峰值日']; out.dom.window.render(); await tick();
  assert.equal(out.dom.window.__cockpitPresentationStatus.unresolved.length, 1);
  out.dom.window.labels = ['新口径名称','11-16']; out.dom.window.render(); await tick();
  assert.equal(out.dom.window.__cockpitPresentationStatus.unresolved.length, 1);
  assert.equal(out.dom.window.document.querySelector('article').textContent, '新口径名称11-16');
});

test('AI and manual edits use the same versioned record; styles remain local and source stays exact', async t => {
  const ui = await mount(t, pkg), target = ui.targets().find(n => n.text === '收入文案' && n.runtime);
  const edited = renderedTextPreview(pkg, target, '手工修改', {});
  edited.presentation.edits[0].text = 'AI 调整';
  edited.presentation.edits.push({ target: { anchor: target.runtime.anchor, path: target.runtime.path.slice(0, -1) }, style: { 'background-color': '#eee', padding: '20px' } });
  const out = await mount(t, edited);
  assert.equal(out.dom.window.document.querySelector('.label').textContent, 'AI 调整');
  assert.equal(out.dom.window.document.querySelector('article').style.padding, '20px');
  const selected = out.targets().find(n => n.runtime && n.text === 'AI 调整');
  const again = renderedTextPreview(edited, selected, '再次手改', {});
  assert.equal(again.presentation.edits.length, 2);
  const reopened = await mount(t, again, { editing: false });
  assert.equal(reopened.dom.window.document.querySelector('.label').textContent, '再次手改');
  assert.equal(again.js, pkg.js);
});

test('legacy text identity expires when a renderer reuses the same leaf for different content', async t => {
  const source = { ...pkg, js: `cards.innerHTML='<article data-node="metric"><span>峰值日</span><span>日期</span></article>';` };
  const ui = await mount(t, source), target = ui.targets().find(n => n.runtime && n.text === '峰值日');
  const out = await mount(t, renderedTextPreview(source, target, '保存的名称', {}), { editing: false });
  const label = out.dom.window.document.querySelector('span');
  label.firstChild.nodeValue = '另一项指标'; await tick();
  assert.equal(label.textContent, '另一项指标');
  assert.equal(out.dom.window.__cockpitPresentationStatus.unresolved.length, 1);
  label.textContent = '峰值日'; await tick();
  assert.equal(label.textContent, '保存的名称');
  label.textContent = '第三项指标'; await tick();
  assert.equal(label.textContent, '第三项指标');
  assert.equal(out.dom.window.__cockpitPresentationStatus.unresolved.length, 1);
  label.textContent = '峰值日'; await tick();
  const parent = label.parentElement;
  label.remove(); await tick();
  label.textContent = '离线复用后的指标'; parent.append(label); await tick();
  assert.equal(label.textContent, '离线复用后的指标');
  assert.equal(out.dom.window.__cockpitPresentationStatus.unresolved.length, 1);
});

test('preview accepts omitted presentation defaults accepted by the server contract', async t => {
  const source = { ...pkg, presentation: { source_hash: sourceHash(pkg), edits: [
    { target: { anchor: { attribute: 'id', value: 'cards' }, path: [] }, style: { padding: '24px' } },
  ] } };
  assert.equal(validatePresentation(source.presentation, source), true);
  const out = await mount(t, source, { editing: false });
  assert.equal(out.dom.window.document.querySelector('#cards').style.padding, '24px');
  assert.equal(validatePresentation({ source_hash: sourceHash(pkg) }, pkg), true);
  assert.equal(validatePresentation({ ...source.presentation, version: null }, source), false);
  assert.equal(validatePresentation({ ...source.presentation, edits: null }, source), false);
  assert.equal(validatePresentation({ ...source.presentation, edits: [{ ...source.presentation.edits[0], text: 'x', style: null }] }, source), false);
});

test('presentation contract rejects executable styles, positional identity and mismatched source', () => {
  const good = { version: 1, source_hash: sourceHash(pkg), edits: [{ target: { anchor: { attribute: 'id', value: 'cards' }, path: [] }, style: { padding: '24px' } }] };
  assert.equal(validatePresentation(good, pkg), true);
  assert.equal(validatePresentation({ ...good, source_hash: '0'.repeat(64) }, pkg), false);
  assert.equal(validatePresentation({ ...good, edits: [{ ...good.edits[0], style: { color: 'url(https://outside)' } }] }, pkg), false);
  assert.equal(validRenderedLocator({ anchor: { attribute: 'id', value: 'cards' }, path: [{ tag: 'div', index: 1 }] }), false);
});

test('characterData plus detach in one mutation batch does not throw or reuse a stale identity', async t => {
  const source = { ...pkg, js: `cards.innerHTML='<article data-node="metric"><span>峰值日</span></article>';` };
  const ui = await mount(t, source), target = ui.targets().find(n => n.runtime && n.editableText && n.text === '峰值日');
  const out = await mount(t, renderedTextPreview(source, target, '保存的名称', {}), { editing: false });
  const label = out.dom.window.document.querySelector('span'), parent = label.parentElement;
  label.firstChild.nodeValue = '另一项指标';
  label.remove();
  await tick();
  assert.deepEqual(Array.from(out.dom.window.__cockpitPresentationStatus.unresolved), [0]);
  label.textContent = '峰值日';
  parent.append(label);
  await tick();
  assert.equal(label.textContent, '保存的名称');
});

test('readonly computed fields stay unresolved and unique class identity stays stable', async t => {
  const readonly = { ...pkg, js: `let count=42; cards.innerHTML='<article data-node="metric"><strong data-page-readonly>'+count+'</strong><span class="kpi-label">收入文案</span><span class="kpi-note">备注</span></article>';` };
  const ui = await mount(t, readonly);
  assert.equal(ui.targets().find(n => n.tag === 'strong'), undefined);
  const label = ui.targets().find(n => n.editableText && n.text === '收入文案' && n.runtime);
  assert.equal(label.runtime.path.at(-1).key.attribute, 'class');
  const forced = renderedTextPreview(readonly, label, '新文案', {});
  forced.presentation.edits.push({ target: { anchor: label.runtime.anchor, path: [{ tag: 'article', key: { attribute: 'data-node', value: 'metric' } }, { tag: 'strong' }] }, text: 'hack' });
  const out = await mount(t, forced, { editing: false });
  assert.equal(out.dom.window.document.querySelector('.kpi-label').textContent, '新文案');
  assert.equal(out.dom.window.document.querySelector('.kpi-note').textContent, '备注');
  assert.equal(out.dom.window.document.querySelector('strong').textContent, '42');
  assert.deepEqual(Array.from(out.dom.window.__cockpitPresentationStatus.unresolved), [1]);
});

test('real standalone example keeps filters, chart and edited KPI label', { skip: !process.env.COCKPIT_EXAMPLE_PACKAGE }, async t => {
  const real = JSON.parse(await readFile(process.env.COCKPIT_EXAMPLE_PACKAGE, 'utf8'));
  const ui = await mount(t, real);
  const label = ui.targets().find(n => n.runtime && n.editableText && n.runtime.path.some(p => p.key?.value?.startsWith('kpi-')) && n.text.trim() && n.tag === 'div');
  assert.ok(label, 'actual JS-generated KPI must expose a stable field');
  const edited = renderedTextPreview(real, label, '本周收入（已调整）', {});
  const out = await mount(t, edited, { editing: false });
  out.dom.window.RevenueReview.setScope('weekend'); await tick();
  assert.ok(out.dom.window.document.querySelector('#kpiGrid').textContent.includes('本周收入（已调整）'));
  assert.equal(out.dom.window.RevenueReview.state.scope, 'weekend');
  assert.ok(out.dom.window.document.querySelector('#chartBars').children.length > 0);
  assert.equal(edited.js, real.js);
});
