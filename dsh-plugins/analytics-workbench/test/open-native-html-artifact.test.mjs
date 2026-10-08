import test from 'node:test';
import assert from 'node:assert/strict';
import { openNativeHtmlArtifact } from '../src/client/open-native-html-artifact.mjs';

function surface(initial) {
  let current = initial;
  const listeners = new Set(), opened = [];
  return {
    mounted: {
      getSnapshot: () => current,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    },
    openResource: address => opened.push(address),
    publish(next) { current = next; for (const listener of [...listeners]) listener(); },
    listeners, opened,
  };
}
const address = 'dsh-resource://cockpit-ai/ai_a00b';

test('a mounted fresh session with zero tabs can open its first HTML resource through the public face', async () => {
  const api = surface('new');
  api.tabsIn = () => [];
  api.openResourceIn = () => { throw new Error('internal face must not be used'); };
  await openNativeHtmlArtifact(api, 'new', address);
  assert.deepEqual(api.opened, [address]);
  assert.equal(api.listeners.size, 0);
});

test('the previous mounted seat is never used while waiting for the new seat', async () => {
  const api = surface('old');
  const pending = openNativeHtmlArtifact(api, 'new', address);
  assert.deepEqual(api.opened, []);
  api.publish('new');
  await pending;
  assert.deepEqual(api.opened, [address]);
  assert.equal(api.listeners.size, 0);
});

test('timeout rejects, removes the subscription, and keeps all sessions untouched', async () => {
  const api = surface('old');
  await assert.rejects(openNativeHtmlArtifact(api, 'new', address, { timeoutMs: 1 }), /任务已保留/);
  assert.equal(api.listeners.size, 0);
  api.publish('new');
  assert.deepEqual(api.opened, []);
});

test('a foreground switch after the ready notification fails without opening in the wrong session', async () => {
  const api = surface('old');
  const pending = openNativeHtmlArtifact(api, 'new', address);
  api.publish('new');
  api.publish('third');
  await assert.rejects(pending, /当前对话已切换/);
  assert.deepEqual(api.opened, []);
  assert.equal(api.listeners.size, 0);
});

test('public registry errors propagate and do not leak a subscription', async () => {
  const api = surface('new'), error = new Error('no registered tab claims the address');
  api.openResource = () => { throw error; };
  await assert.rejects(openNativeHtmlArtifact(api, 'new', address), value => value === error);
  assert.equal(api.listeners.size, 0);
});

test('synchronous subscription publication is released exactly once', async () => {
  let released = 0, opened = 0;
  await openNativeHtmlArtifact({ mounted: { getSnapshot: () => 'new', subscribe(listener) { listener(); return () => { released += 1; }; } }, openResource() { opened += 1; } }, 'new', address);
  assert.equal(released, 1);
  assert.equal(opened, 1);
});

test('missing mounted contract fails closed without invoking the old internal API', async () => {
  let opened = false;
  await assert.rejects(openNativeHtmlArtifact({ tabsIn: () => ['guide'], openResourceIn() { opened = true; } }, 'new', address), /合同尚未连接/);
  assert.equal(opened, false);
});

test('unloading the plugin aborts the wait and a late ready notification cannot open anything', async () => {
  const api = surface('old'), lifetime = new AbortController();
  const pending = openNativeHtmlArtifact(api, 'new', address, { signal: lifetime.signal });
  lifetime.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(api.listeners.size, 0);
  api.publish('new');
  assert.deepEqual(api.opened, []);
});

test('abort after a ready notification still prevents the queued continuation from opening a resource', async () => {
  const api = surface('old'), lifetime = new AbortController();
  const pending = openNativeHtmlArtifact(api, 'new', address, { signal: lifetime.signal });
  api.publish('new');
  lifetime.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(api.opened, []);
  assert.equal(api.listeners.size, 0);
});

test('an already aborted lifetime never subscribes or opens a tab', async () => {
  const api = surface('new'), lifetime = new AbortController();
  lifetime.abort();
  await assert.rejects(openNativeHtmlArtifact(api, 'new', address, { signal: lifetime.signal }), { name: 'AbortError' });
  assert.equal(api.listeners.size, 0);
  assert.deepEqual(api.opened, []);
});
