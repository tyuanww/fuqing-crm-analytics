import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { launchInstalledProfile, stopInstalledProfile } from './start-installed-profile-core.mjs';

const env = {
  DSH_REPO: '/repo',
  DSH_RUNTIME: '/runtime',
  DSH_NODE: '/node',
  DSH_DEV_PAGE_PYTHON: '/python',
};

function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = signal => {
    child.signalCode = signal;
    queueMicrotask(() => child.emit('exit', null, signal));
    return true;
  };
  return child;
}

test('startup failure stops an already-started page server', async () => {
  let stopped = 0;
  await assert.rejects(
    () => launchInstalledProfile({
      env,
      mkdirFn: async () => {},
      startPageFn: async () => ({ base: 'http://127.0.0.1:18091', token: 'token', stop: async () => { stopped += 1; } }),
      writeStateFn: async () => { throw new Error('state failed'); },
    }),
    /state failed/,
  );
  assert.equal(stopped, 1);
});

test('signal stop reports page cleanup failure', async () => {
  const child = fakeChild();
  await assert.rejects(
    () => stopInstalledProfile({
      page: { stop: async () => { throw new Error('page stop failed'); } },
      child,
    }),
    /page stop failed/,
  );
  assert.equal(child.signalCode, 'SIGTERM');
});

test('repeated stop after child exit does not signal the child again', async () => {
  const child = fakeChild();
  child.exitCode = 0;
  let signals = 0;
  child.kill = () => { signals += 1; return true; };
  await stopInstalledProfile({ page: { stop: async () => {} }, child });
  assert.equal(signals, 0);
});
