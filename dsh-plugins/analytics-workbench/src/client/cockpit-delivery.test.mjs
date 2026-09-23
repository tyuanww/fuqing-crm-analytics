import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePageGenerateSession } from '../initial-session.mjs';
import {
  captureDeliverySessionSource, createCockpitDelivery, inspectDeliveryHostCapabilities,
  ingestWorkspaceEventFiles, tryAttachWorkspaceChangeRefresh,
} from './cockpit-delivery.mjs';

function row(id, mainView = 0) {
  return { id, retainedBy: mainView ? { mainView } : {} };
}

test('capture requires an explicit listed session and never uses ids[0]', () => {
  const live = {
    ids: ['session-old', 'session-visible'],
    byId: {
      'session-old': row('session-old'),
      'session-visible': row('session-visible', 1),
    },
  };
  assert.equal(resolvePageGenerateSession(live), 'session-visible');
  assert.equal(captureDeliverySessionSource(live).sessionId, 'session-visible');
  assert.equal(captureDeliverySessionSource(live, 'session-old').sessionId, 'session-old');
  const none = {
    ids: ['session-old', 'session-other'],
    byId: { 'session-old': row('session-old'), 'session-other': row('session-other') },
  };
  assert.equal(captureDeliverySessionSource(none).status, 'no-session');
  assert.notEqual(captureDeliverySessionSource(none).sessionId, none.ids[0]);
});

test('delivery refresh reports no-session, empty, ready, truncated, and error', async () => {
  const tree = {
    sess: {
      '.': { path: '', entries: [{ name: 'a.html', type: 'file' }] },
    },
  };
  const delivery = createCockpitDelivery({
    listDir: async (sessionId, path) => {
      if (sessionId === 'boom') throw new Error('list failed');
      if (sessionId === 'empty') return { path: '', entries: [] };
      return tree[sessionId]?.[path === '.' ? '.' : path] ?? { ok: false };
    },
  });
  assert.equal((await delivery.refresh()).status, 'no-session');
  delivery.setSessionId('empty');
  assert.equal((await delivery.refresh()).status, 'empty');
  delivery.setSessionId('sess');
  const ready = await delivery.refresh();
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.files.map(item => item.path), ['a.html']);
  delivery.setSessionId('boom');
  assert.equal((await delivery.refresh()).status, 'error');
  delivery.dispose();
});

test('stale refresh does not overwrite a newer session snapshot', async () => {
  let releaseSlow;
  const slow = new Promise(resolve => { releaseSlow = resolve; });
  const delivery = createCockpitDelivery({
    listDir: async (sessionId) => {
      if (sessionId === 'slow') {
        await slow;
        return { path: '', entries: [{ name: 'old.html', type: 'file' }] };
      }
      return { path: '', entries: [{ name: 'new.html', type: 'file' }] };
    },
  });
  const first = delivery.refresh({ sessionId: 'slow' });
  const second = await delivery.refresh({ sessionId: 'fast' });
  assert.equal(second.sessionId, 'fast');
  assert.deepEqual(second.files.map(item => item.path), ['new.html']);
  releaseSlow();
  await first;
  assert.equal(delivery.getSnapshot().sessionId, 'fast');
  assert.deepEqual(delivery.getSnapshot().files.map(item => item.path), ['new.html']);
  delivery.dispose();
});

test('event ingest rejects absolute and parent paths and dedupes repeats', () => {
  const first = ingestWorkspaceEventFiles('sess', [
    'ops-dashboard-live/web/index.html',
    '/tmp/escape.html',
    '../secret.html',
    { path: 'ops-dashboard-live/web/index.html' },
  ]);
  assert.deepEqual(first.map(item => item.path), ['ops-dashboard-live/web/index.html']);
  const again = ingestWorkspaceEventFiles('sess', ['ops-dashboard-live/web/index.html'], { existing: first });
  assert.equal(again.length, 1);
  const presented = ingestWorkspaceEventFiles('sess', ['ops-dashboard-live/web/index.html'], {
    existing: first,
    source: 'session-presented',
  });
  assert.equal(presented[0].source, 'session-presented');
});

test('presented events remain visible after refresh and use the native present source', async () => {
  const received = [];
  const delivery = createCockpitDelivery({
    listDir: async () => ({ path: '', entries: [] }),
    history: async () => ({
      files: [{ id: 'file:session-presented:presented.html', kind: 'html', path: 'presented.html', sessionId: 'session-presented', source: 'session-presented', workspaceRoot: '/workspace' }],
      examined: 1, totalSessions: 1, nextCursor: null, failures: [], unsupportedPaths: 0,
    }),
    artifactInbox: {
      async intake(input) {
        received.push(input);
        return { artifact_id: `a${received.length}`, ...input, status: 'PREVIEWABLE' };
      },
    },
    readBytes: async () => ({
      ok: true,
      value: { offset: 0, data: btoa('<h1>present</h1>'), bytes: 16, eof: true, version: 'v1' },
    }),
  });
  delivery.setSessionId('session-presented');
  delivery.attachHostEvents({
    subscribePresented(listener) {
      listener({ files: [{ path: 'presented.html', title: 'Presented' }] });
      return () => {};
    },
  });
  for (let i = 0; i < 20 && received.length === 0; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const snapshot = delivery.getSnapshot();
  assert.equal(snapshot.files.some(file => file.path === 'presented.html'), true);
  assert.equal(snapshot.files.filter(file => file.path === 'presented.html').length, 1);
  assert.equal(snapshot.files.find(file => file.path === 'presented.html').source, 'session-presented');
  assert.equal(received[0].source, 'native_present');
  delivery.dispose();
});

test('polling keeps scanning past unrelated files until the target appears', async () => {
  let calls = 0;
  const delivery = createCockpitDelivery({
    listDir: async () => ({
      path: '',
      entries: [{ name: calls++ === 0 ? 'noise.html' : 'target.html', type: 'file' }],
    }),
    artifactInbox: {
      async intake(input) { return { artifact_id: input.path, ...input, status: 'PREVIEWABLE' }; },
    },
    readBytes: async () => ({
      ok: true,
      value: { offset: 0, data: btoa('<p>x</p>'), bytes: 8, eof: true, version: 'v1' },
    }),
  });
  delivery.setSessionId('session-polling');
  delivery.startPolling({ sessionId: 'session-polling', targetPaths: ['target.html'], intervalMs: 10, maxMs: 100 });
  for (let i = 0; i < 30 && !delivery.getSnapshot().files.some(file => file.path === 'target.html'); i += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(calls >= 2);
  assert.equal(delivery.getSnapshot().files.some(file => file.path === 'target.html'), true);
  delivery.dispose();
});

test('host capability inspect stays manual unless a real subscribe function exists', () => {
  const missing = inspectDeliveryHostCapabilities({
    remote: { workspaceFiles: { list: async () => ({}), read: async () => ({}) } },
  });
  assert.equal(missing.canListWorkspace, true);
  assert.equal(missing.canReadWorkspace, true);
  assert.equal(missing.canSubscribeWorkspaceChanges, false);
  assert.equal(missing.refreshMode, 'manual');
  assert.match(missing.workspaceChangesReason, /ui-deliverables/);
  const cordisLike = new Proxy({}, { get() { throw new Error('without inject'); } });
  const safeMissing = inspectDeliveryHostCapabilities(cordisLike);
  assert.equal(safeMissing.canListWorkspace, false);
  assert.equal(safeMissing.canSubscribeWorkspaceChanges, false);
  assert.equal(safeMissing.canSubscribePresented, false);
  assert.equal(safeMissing.refreshMode, 'manual');
  let calls = 0;
  const attached = tryAttachWorkspaceChangeRefresh({
    subscribeWorkspaceChanges(listener) {
      listener({ turn: 1 });
      return () => {};
    },
  }, () => { calls += 1; });
  assert.equal(attached.attached, true);
  assert.equal(calls, 1);
  attached.unsubscribe();
  const skipped = tryAttachWorkspaceChangeRefresh({}, () => { calls += 1; });
  assert.equal(skipped.attached, false);
});

test('readFile uses the captured session and does not invent a fallback', async () => {
  const delivery = createCockpitDelivery({
    read: async (sessionId, path) => {
      assert.equal(sessionId, 'session-visible');
      return { text: `<p>${path}</p>` };
    },
  });
  assert.equal((await delivery.readFile('a.html')).reason, 'no-session');
  delivery.setSessionId('session-visible');
  assert.equal((await delivery.readFile('a.html')).text, '<p>a.html</p>');
  delivery.dispose();
});

test('HTML workspace scan registers safe files in the shared artifact inbox', async () => {
  const received = [];
  const delivery = createCockpitDelivery({
    artifactInbox: { async intake(input) { received.push(input); return { artifact_id: `a${received.length}`, ...input, status: 'PREVIEWABLE' }; } },
    listDir: async () => ({ path: '', entries: [{ name: 'dashboard.html', type: 'file' }, { name: '../escape.html', type: 'file' }] }),
    readBytes: async (_sessionId, _path, range) => {
      assert.equal(range.offset, 0);
      const encoded = btoa('<h1>dashboard</h1>');
      return { ok: true, value: { offset: 0, data: encoded, bytes: 18, eof: true, version: 'v1' } };
    },
  });
  const snapshot = await delivery.refresh({ sessionId: 'session-safe' });
  assert.equal(snapshot.files.length, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].source, 'workspace_file');
  assert.equal(received[0].path, 'dashboard.html');
  assert.equal(received[0].session_id, 'session-safe');
  assert.match(received[0].content_hash, /^[a-f0-9]{64}$/);
  delivery.dispose();
});
