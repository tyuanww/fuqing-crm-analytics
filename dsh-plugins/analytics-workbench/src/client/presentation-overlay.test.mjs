import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPresentationOverlay } from './presentation-overlay.mjs';

test('overlay preview copies text onto a new string and leaves the package html unchanged', () => {
  const html = '<h1 data-shine-node="n_title">示例标题</h1><p data-shine-node="n_lede">导语</p>';
  const overlays = { n_title: { text: '新标题', style: { color: '#805D9D' } } };
  const shown = applyPresentationOverlay(html, overlays);
  assert.equal(html.includes('示例标题'), true);
  assert.equal(shown.includes('新标题'), true);
  assert.equal(shown.includes('color: #805D9D'), true);
  assert.equal(shown.includes('导语'), true);
  assert.equal(applyPresentationOverlay(html, {}), html);
});

test('nested elements of the same tag keep the outer closer', () => {
  const html = '<div data-shine-node="outer">外<div data-shine-node="inner">内</div>尾</div>';
  const outer = applyPresentationOverlay(html, { outer: { text: '改外' } });
  assert.equal(outer, '<div data-shine-node="outer">改外</div>');
  const inner = applyPresentationOverlay(html, { inner: { text: '改内' } });
  assert.equal(inner, '<div data-shine-node="outer">外<div data-shine-node="inner">改内</div>尾</div>');
  assert.equal(html.includes('内'), true);
});

test('an inferred node paints from its source range when no shine marker exists', () => {
  const html = '<main><p id="lead">本周到店人数保持稳定。</p></main>';
  const start = html.indexOf('<p id="lead">');
  const end = start + '<p id="lead">本周到店人数保持稳定。</p>'.length;
  const shown = applyPresentationOverlay(html, {
    'inf.lead': { text: '到店人数上升。' },
  }, [{ node_id: 'inf.lead', source_range: { start, end } }]);
  assert.equal(shown, '<main><p id="lead">到店人数上升。</p></main>');
  assert.equal(html.includes('本周到店人数保持稳定。'), true);
});

test('style and attribute values stay inside their quotes', () => {
  const html = '<p data-shine-node="n_title">示例</p>';
  const shown = applyPresentationOverlay(html, {
    n_title: {
      style: { color: 'red" onload="alert(1)' },
      attributes: { title: '说"明', onclick: 'alert(1)', href: 'javascript:alert(1)' },
    },
  });
  assert.match(shown, /style="color: red&quot; onload=&quot;alert\(1\)"/);
  assert.match(shown, /title="说&quot;明"/);
  assert.equal(shown.includes('onclick='), false);
  assert.equal(shown.includes('javascript:'), false);
  assert.equal(html.includes('onload'), false);
});
