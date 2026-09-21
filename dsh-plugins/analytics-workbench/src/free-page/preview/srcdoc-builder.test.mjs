import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSrcdoc } from './srcdoc-builder.mjs';
import { sourceHash } from '../presentation/model.mjs';
import { FREE_PAGE_CSP, FREE_PAGE_SANDBOX } from '../runtime/isolation-policy.mjs';
import { BRIDGE_PROTOCOL } from '../resource/frozen-contract.mjs';
import { SAVED_COMPLEX_PACKAGE } from '../runtime/fixtures.mjs';

test('srcdoc keeps complex source, injects CSP and bridge bootstrap, and does not allow-same-origin', () => {
  const srcdoc = buildSrcdoc({
    ...SAVED_COMPLEX_PACKAGE,
    instanceId: 'inst_1',
    pageId: 'page_fixture_unbound',
    version: 1,
    nonce: 'nonce_1',
  });
  assert.match(srcdoc, /已保存经营复盘/);
  assert.match(srcdoc, /getContext/);
  assert.match(srcdoc, /linear-gradient/);
  assert.match(srcdoc, /<svg/);
  assert.match(srcdoc, new RegExp(BRIDGE_PROTOCOL));
  assert.match(srcdoc, /Content-Security-Policy/);
  assert.match(srcdoc, /connect-src 'none'/);
  assert.equal(srcdoc.includes(FREE_PAGE_CSP.split('; ')[0]), true);
  assert.equal(FREE_PAGE_SANDBOX.includes('allow-same-origin'), false);
  const escaped = buildSrcdoc({
    html: '</body></html><meta http-equiv="refresh"><script>steal()</script>',
    css: '',
    js: '',
    instanceId: 'inst_1',
    pageId: 'page_a',
    version: 1,
    nonce: 'nonce_1',
  });
  assert.match(escaped, /&lt;\/body/);
  assert.match(escaped, /&lt;meta/);
  const scriptBreak = buildSrcdoc({
    html: '<p>x</p>',
    css: '</style><meta http-equiv="refresh">',
    js: '</script><meta http-equiv="refresh">',
    instanceId: 'inst_1',
    pageId: 'page_a',
    version: 1,
    nonce: 'nonce_1',
  });
  assert.match(scriptBreak, /&lt;\/style/);
  assert.match(scriptBreak, /<\\\/script/);
  assert.equal((scriptBreak.match(/<\/script>/gi) || []).length, 2);
});

test('header/footer and similarly named tags retain real closing tags inside the trusted wrapper', () => {
  const html = '<header><h1>Title</h1></header><main>Body</main><footer>End</footer><heading>x</heading><bodyguard>y</bodyguard><head-note>z</head-note>';
  const src = buildSrcdoc({ html, css: '', js: 'window.header = "</header>"' });
  assert.ok(src.includes(html));
  assert.doesNotMatch(src, /&lt;\/header|&lt;\/heading|&lt;\/bodyguard/);
  assert.match(src, /window.header = "<\/header>"/);
});

test('presentation runtime is injected as data and mismatched hashes fail closed', () => {
  const html = '<section id="cards">x</section>', css = '', js = '';
  const presentation = { source_hash: sourceHash({ html, css, js }), edits: [
    { target: { anchor: { attribute: 'id', value: 'cards' }, path: [] }, text: 'a < b', style: { padding: '8px' } },
  ] };
  const src = buildSrcdoc({ html, css, js, presentation, instanceId: 'i', pageId: 'p', version: 1, nonce: 'n' });
  assert.match(src, /presentationRuntime|__cockpitPresentationStatus/);
  assert.match(src, /\\u003c/);
  assert.doesNotMatch(src, /"a < b"/);
  assert.throws(() => buildSrcdoc({ html, css, js, presentation: { ...presentation, source_hash: '0'.repeat(64) } }), /文案修改与页面来源不匹配/);
  const empty = buildSrcdoc({ html, css, js, presentation: { source_hash: sourceHash({ html, css, js }) }, instanceId: 'i', pageId: 'p', version: 1, nonce: 'n' });
  assert.doesNotMatch(empty, /__cockpitPresentationStatus/);
});
