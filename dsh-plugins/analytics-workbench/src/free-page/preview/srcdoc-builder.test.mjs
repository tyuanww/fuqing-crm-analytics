import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSrcdoc } from './srcdoc-builder.mjs';
import { sourceHash } from '../presentation/model.mjs';
import { FREE_PAGE_CSP, FREE_PAGE_SANDBOX } from '../runtime/isolation-policy.mjs';
import { BRIDGE_PROTOCOL } from '../resource/frozen-contract.mjs';
import { SAVED_COMPLEX_PACKAGE } from '../runtime/fixtures.mjs';
import { previewDocumentContent } from './document-content.mjs';
import { annotateHostMappings } from '../resource/package-normalize.mjs';

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

test('complete documents project into one trusted wrapper while preserving body attributes and head styles', () => {
  const html = '<!--before--><!DOCTYPE html><html lang="zh-CN"><head><meta charset="gbk"><meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://invalid.example"><title>Source title</title><style>body{color:rgb(12,34,56)}</style></head><body class="report" data-label="a > b"><h1 id="heading">业务页面</h1><script>window.fixture=true;</script></body></html><!--after-->';
  const projected = previewDocumentContent(html);
  assert.equal(projected.htmlTag, '<html lang="zh-CN">');
  assert.equal(projected.bodyTag, '<body class="report" data-label="a > b">');
  assert.match(projected.content, /<style>body\{color:rgb\(12,34,56\)\}<\/style>/);
  assert.match(projected.content, /<h1 id="heading">业务页面<\/h1>/);
  assert.match(projected.content, /window.fixture=true/);
  assert.doesNotMatch(projected.content, /<meta|<base|<\/(?:head|body|html)>/i);
  const src = buildSrcdoc({ html, css: '', js: '' });
  assert.equal((src.match(/<html\b/gi) || []).length, 1);
  assert.equal((src.match(/<body\b/gi) || []).length, 1);
  assert.equal((src.match(/http-equiv="Content-Security-Policy"/g) || []).length, 1);
  assert.equal(src.includes(FREE_PAGE_CSP), true);
  assert.doesNotMatch(src, /&lt;\/(?:head|body|html)>|default-src \*|https:\/\/invalid\.example/);
  assert.match(src, /<body class="report" data-label="a > b">/);
});

test('document projection does not mutate persisted source, hashes, mappings, or presentation validation', () => {
  const pkg = annotateHostMappings({
    html: '<!doctype html><html><head><style>h1{color:red}</style></head><body><h1 id="heading">原文</h1></body></html>',
    css: '', js: '', resources: [], node_map: [],
  });
  const before = structuredClone(pkg), digest = sourceHash(pkg);
  const presentation = { source_hash: digest, edits: [
    { target: { anchor: { attribute: 'id', value: 'heading' }, path: [] }, text: '改字', style: {} },
  ] };
  const src = buildSrcdoc({ ...pkg, presentation });
  assert.match(src, /__cockpitPresentationStatus/);
  assert.deepEqual(pkg, before);
  assert.equal(sourceHash(pkg), digest);
  assert.equal(pkg.node_map.length, 1);
  assert.equal(pkg.node_map[0].kind, 'static_element');
  assert.equal(src.includes('data-shine-node="' + pkg.node_map[0].node_id + '"'), true);
  assert.throws(() => buildSrcdoc({ ...pkg, presentation: { ...presentation, source_hash: sourceHash({ ...pkg, html: previewDocumentContent(pkg.html).content }) } }), /文案修改与页面来源不匹配/);
});

test('fragments and malformed or duplicate document wrappers retain fail-closed breakout escaping', () => {
  const values = [
    '<section><p>fragment</p></section>',
    '</head></body></html><meta http-equiv="refresh" content="0">',
    '<html><head></head><body>one</body><body>two</body></html>',
    '<html><body>one</body></html><p>outside</p>',
    '<html><body><p>unclosed</p>',
    '<html><body>x</body><head><meta http-equiv="refresh"></head></html>',
  ];
  for (const html of values) {
    const projected = previewDocumentContent(html);
    assert.equal(projected.content, html);
    assert.equal(projected.htmlTag, '<html>');
    assert.equal(projected.bodyTag, '<body>');
    const src = buildSrcdoc({ html, css: '', js: '' });
    if (html.includes('</body>')) assert.match(src, /&lt;\/body>/);
    if (html.includes('<meta')) assert.match(src, /&lt;meta/);
    assert.equal((src.match(/http-equiv="Content-Security-Policy"/g) || []).length, 1);
    assert.equal(FREE_PAGE_SANDBOX.includes('allow-same-origin'), false);
  }
});

test('full-document projection does not let raw text or body metadata replace the trusted CSP', () => {
  const html = '<html><head><style>.x::after{content:"<meta fake> </head>"}</style><script>window.fixture="<meta raw>";</script></head><body><meta http-equiv="Content-Security-Policy" content="default-src *"><p>safe</p></body></html>';
  const src = buildSrcdoc({ html, css: '</style><meta http-equiv="refresh">', js: '</script><meta http-equiv="refresh">' });
  assert.match(src, /&lt;\/head>/);
  assert.match(src, /&lt;meta raw/);
  assert.match(src, /&lt;meta http-equiv="Content-Security-Policy"/);
  assert.match(src, /&lt;\/style/);
  assert.match(src, /<\\\/script/);
  assert.equal((src.match(/<meta http-equiv="Content-Security-Policy"/g) || []).length, 1);
  assert.equal(src.includes(FREE_PAGE_CSP), true);
});

test('resource aliases in complete-document html/body attributes follow the same preview rewrite as content', () => {
  const html = '<html style="background-image:url(resource:hero)"><head></head><body background="resource:hero" style="background-image:url(resource:hero)"><img src="resource:hero"></body></html>';
  const src = buildSrcdoc({ html, css: '', js: '', resources: [
    { resource_id: 'hero', type: 'image', mime: 'image/png', content_base64: 'aGVsbG8=' },
  ] });
  assert.doesNotMatch(src, /resource:hero/);
  assert.equal((src.match(/data:image\/png;base64,aGVsbG8=/g) || []).length, 4);
  assert.match(src, /<html style="background-image:url\(data:image\/png;base64,aGVsbG8=\)">/);
  assert.match(src, /<body background="data:image\/png;base64,aGVsbG8="/);
});
