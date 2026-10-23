import test from 'node:test';
import assert from 'node:assert/strict';
import { B0_PRIMARY_SESSION_ID as primary, QUERY_SESSION_IDS, configuredSession, bindInitialSession, explicitSessionIds, resolvePageGenerateSession } from '../src/initial-session.mjs';

function row(id, mainView = 0) {
  return { id, retainedBy: mainView ? { mainView } : {} };
}
const ready = { phase: 'ready', ids: [primary], byId: { [primary]: row(primary) } };
function fixture(initial) {
  let snapshot = initial;
  const listeners = new Set();
  const opened = [];
  const sessions = {
    list: { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
    retain(id) {
      opened.push(id);
      snapshot = { ...snapshot, byId: { ...snapshot.byId, [id]: row(id, 1) } };
      for (const listener of listeners) listener();
      return { sessionId: id, release() {} };
    },
    create() { assert.fail('B0 automatic selection must never create'); },
  };
  return { sessions, opened, listeners, publish(next) { snapshot = next; for (const listener of listeners) listener(); } };
}
test('selection requires explicit ids plus exact matching Host rows', () => {
  assert.equal(configuredSession(ready), null);
  assert.equal(configuredSession(ready, [primary]), primary);
  for (const value of [{ ...ready, phase: 'pending' }, { ...ready, ids: ['another'] },
    { ...ready, byId: {} }, { ...ready, byId: { [primary]: { id: 'another' } } }]) {
    assert.equal(configuredSession(value, [primary]), null);
  }
});
test('pending and unrelated ready lists do not select; arriving exact explicit primary selects once', () => {
  const f = fixture({ ...ready, phase: 'pending' });
  const dispose = bindInitialSession(f.sessions, () => assert.fail('unexpected selection failure'), { sessionIds: [primary] });
  assert.deepEqual(f.opened, []);
  f.publish({ phase: 'ready', ids: ['another'], byId: { another: { id: 'another' } } });
  assert.deepEqual(f.opened, []);
  f.publish(ready);
  assert.deepEqual(f.opened, [primary]);
  // Reentrant notification and subsequent user navigation must not reopen it.
  f.publish({ ...ready, byId: { [primary]: row(primary), another: row('another', 1) }, ids: [primary, 'another'] });
  f.publish(ready);
  assert.deepEqual(f.opened, [primary]);
  dispose();
  assert.equal(f.listeners.size, 0);
});
test('already restored exact primary consumes the initial choice without another open', () => {
  const f = fixture({ ...ready, byId: { [primary]: row(primary, 1) } });
  const dispose = bindInitialSession(f.sessions, () => assert.fail('unexpected failure'), { sessionIds: [primary] });
  f.publish({ ...ready, byId: { [primary]: row(primary), another: row('another', 1) }, ids: [primary, 'another'] });
  assert.deepEqual(f.opened, []);
  dispose();
});
test('unmount while pending prevents later selection', () => {
  const f = fixture({ ...ready, phase: 'pending' });
  const dispose = bindInitialSession(f.sessions, () => assert.fail('unexpected failure'), { sessionIds: [primary] });
  dispose();
  f.publish(ready);
  assert.deepEqual(f.opened, []);
});
test('query pair selects the first registered session once; later user switch is kept', () => {
  const [first, second] = QUERY_SESSION_IDS;
  const queryReady = { phase: 'ready', ids: [...QUERY_SESSION_IDS],
    byId: { [first]: { id: first }, [second]: { id: second } }, current: undefined };
  assert.equal(configuredSession(queryReady, QUERY_SESSION_IDS), first);
  assert.equal(configuredSession({ ...queryReady, ids: [first], byId: { [first]: { id: first } } }, QUERY_SESSION_IDS), null);
  const f = fixture(queryReady);
  const dispose = bindInitialSession(f.sessions, () => assert.fail('unexpected selection failure'), { sessionIds: QUERY_SESSION_IDS });
  assert.deepEqual(f.opened, [first]);
  f.publish({ ...queryReady, byId: { [first]: row(first), [second]: row(second, 1) } });
  f.publish(queryReady);
  assert.deepEqual(f.opened, [first]);
  dispose();
});

test('page generate uses the visible session, never ids[0] or the B0 fixture by default', () => {
  const live = {
    phase: 'ready',
    ids: ['session-old', 'session-visible'],
    byId: {
      'session-old': row('session-old'),
      'session-visible': row('session-visible', 1),
    },
  };
  assert.equal(resolvePageGenerateSession(live, undefined), 'session-visible');
  assert.equal(resolvePageGenerateSession(live, 'session-old'), 'session-old');
  assert.equal(resolvePageGenerateSession(live, 'session-missing'), 'session-visible');
  const noCurrent = {
    phase: 'ready',
    ids: ['session-old', 'session-other'],
    byId: { 'session-old': row('session-old'), 'session-other': row('session-other') },
  };
  assert.equal(resolvePageGenerateSession(noCurrent, undefined), null);
  assert.notEqual(resolvePageGenerateSession(noCurrent, undefined), noCurrent.ids[0]);
  const withFixture = { phase: 'ready', ids: [primary, 'session-live'], byId: { [primary]: row(primary), 'session-live': row('session-live', 1) } };
  assert.equal(resolvePageGenerateSession(withFixture, undefined), 'session-live');
});

test('open failure is reported once, never retried or replaced with another session', () => {
  const f = fixture(ready);
  let failures = 0, attempts = 0;
  f.sessions.retain = id => { assert.equal(id, primary); attempts++; throw new Error('no longer available'); };
  const dispose = bindInitialSession(f.sessions, () => { failures++; }, { sessionIds: [primary] });
  f.publish(ready);
  assert.equal(attempts, 1);
  assert.equal(failures, 1);
  dispose();
});

test('startup never replaces a session already owned by the main view', () => {
  const current = { ...ready, ids: [primary, 'user-current'], byId: {
    [primary]: row(primary), 'user-current': row('user-current', 1) } };
  const f = fixture(current);
  const dispose = bindInitialSession(f.sessions, () => assert.fail('unexpected failure'), { sessionIds: [primary] });
  f.publish(current);
  assert.deepEqual(f.opened, []);
  dispose();
});

test('explicitSessionIds is empty unless B0 configuration is present and valid', () => {
  assert.deepEqual(explicitSessionIds(undefined, {}), []);
  assert.deepEqual(explicitSessionIds({}, {}), []);
  assert.deepEqual(explicitSessionIds({ B0_SESSION_ID: primary }, {}), [primary]);
  assert.deepEqual(explicitSessionIds({ B0_RUNTIME_FAMILY: 'channel_followup', B0_SESSION_IDS: QUERY_SESSION_IDS.join(',') }, {}), [...QUERY_SESSION_IDS]);
  assert.deepEqual(explicitSessionIds({ B0_RUNTIME_FAMILY: 'channel_followup', B0_SESSION_IDS: QUERY_SESSION_IDS[0] }, {}), []);
  assert.deepEqual(explicitSessionIds({ B0_SESSION_IDS: `${primary},${primary}` }, {}), []);
  assert.deepEqual(explicitSessionIds(undefined, { __SHINE_B0_SESSION_IDS__: [primary] }), [primary]);
});
