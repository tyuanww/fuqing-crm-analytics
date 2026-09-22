import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoActiveOutbound, extractCandidateUrls, isBlockedNetworkUrl, quarantineActiveOutbound } from './network-policy.mjs';
import { DYNAMIC_LEAK_PACKAGE } from '../runtime/fixtures.mjs';

test('blocks http(s), websocket, beacon and protocol-relative URLs', () => {
  assert.equal(isBlockedNetworkUrl('https://example.com/x'), true);
  assert.equal(isBlockedNetworkUrl('http://example.com/x'), true);
  assert.equal(isBlockedNetworkUrl('wss://example.com/'), true);
  assert.equal(isBlockedNetworkUrl('//cdn.example.com/a.js'), true);
  assert.equal(isBlockedNetworkUrl('javascript:alert(1)'), true);
  assert.equal(isBlockedNetworkUrl('data:text/html,x'), true);
  assert.equal(isBlockedNetworkUrl('data:image/png;base64,xx'), false);
  assert.equal(isBlockedNetworkUrl('blob:https://example.com/1'), false);
  assert.equal(isBlockedNetworkUrl('resource:logo_1'), false);
  assert.equal(isBlockedNetworkUrl('/api'), true);
  assert.equal(isBlockedNetworkUrl('../secret'), true);
  assert.equal(isBlockedNetworkUrl('foo.png'), true);
});

test('extracts img/script/link/css/js network exits, not only fetch', () => {
  const urls = extractCandidateUrls(
    '<img src="https://img.example/a.png"><script src="https://js.example/a.js"></script><a ping="https://ping.example/p">x</a>',
    '@import url("https://css.example/a.css"); body{background:url("https://css.example/b.png")}',
    'fetch("https://api.example/x"); new WebSocket("wss://ws.example/"); navigator.sendBeacon("https://b.example/", "z");',
  );
  assert.ok(urls.some((url) => url.includes('img.example')));
  assert.ok(urls.some((url) => url.includes('js.example')));
  assert.ok(urls.some((url) => url.includes('css.example')));
  assert.ok(urls.some((url) => url.includes('ws.example')));
  assert.ok(urls.some((url) => url.includes('b.example')));
  const blocked = assertNoActiveOutbound(
    '<img src="https://img.example/a.png">',
    '',
    '',
  );
  assert.equal(blocked.ok, false);
});

test('quarantine removes scanned outbound addresses and leaves the policy itself strict', () => {
  const source = '<p>看板</p><script>new EventSource("/api/stream");</script>';
  assert.equal(assertNoActiveOutbound(source, '', '').ok, true);
  const parts = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  assert.equal(assertNoActiveOutbound('<p>看板</p>', '', parts[1]).ok, false);
  const stored = quarantineActiveOutbound(source, '', '');
  assert.ok(stored.removed.includes('/api/stream'));
  const storedScript = stored.html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
  assert.equal(assertNoActiveOutbound('', '', storedScript).ok, true);
  assert.doesNotMatch(storedScript, /\/api\/stream/);
  assert.equal(assertNoActiveOutbound('<img src="https://img.example/a.png">', '', '').ok, false);
  assert.equal(quarantineActiveOutbound('<img src="data:image/png;base64,xx">', '', '').removed.length, 0);
});

test('concatenated URLs can evade the static scan and must be covered by runtime CSP', () => {
  const scan = assertNoActiveOutbound(DYNAMIC_LEAK_PACKAGE.html, DYNAMIC_LEAK_PACKAGE.css, DYNAMIC_LEAK_PACKAGE.js);
  assert.equal(scan.ok, true, 'static scan is not sufficient; isolation-probe must hit a real proxy');
});
