import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { runBackpressure } from './backpressure.mjs';

test('first task failure stops dispatch and waits for every already-started task', async () => {
  const failure = new Error('SYNTHETIC_REQUEST_FAILED');
  const started = [];
  const pending = new Map();
  let settled = false;
  const run = runBackpressure({ requests: 12, concurrency: 3, synthetic: true,
    task: index => {
      started.push(index);
      if (index === 0) throw failure;
      return new Promise(resolve => pending.set(index, resolve));
    } }).then(() => ({ unexpected_success: true }), error => ({ error }))
    .finally(() => { settled = true; });
  try {
    await nextTurn();
    assert.deepEqual(started, [0, 1, 2]);
    assert.equal(settled, false, 'caller must not clean resources while owned tasks remain');
    pending.get(1)({ status: 200 });
    await nextTurn();
    assert.deepEqual(started, [0, 1, 2], 'a completed peer must not restart dispatch');
    assert.equal(settled, false);
    pending.get(2)({ status: 200 });
    assert.equal((await run).error, failure);
  } finally {
    for (const resolve of pending.values()) resolve({ status: 200 });
    await run;
    await nextTurn();
  }
});

test('multiple asynchronous failures retain the first rejection and drain peers', async () => {
  const first = new Error('FIRST_FAILURE');
  const second = new Error('SECOND_FAILURE');
  const pending = new Map();
  const started = [];
  let settled = false;
  const run = runBackpressure({ requests: 9, concurrency: 3,
    task: index => {
      started.push(index);
      return new Promise((resolve, reject) => pending.set(index, { resolve, reject }));
    } }).then(() => ({ unexpected_success: true }), error => ({ error }))
    .finally(() => { settled = true; });
  try {
    await nextTurn();
    pending.get(1).reject(first);
    await nextTurn();
    assert.equal(settled, false);
    pending.get(0).reject(second);
    await nextTurn();
    assert.equal(settled, false);
    pending.get(2).resolve({ status: 200 });
    assert.equal((await run).error, first);
    assert.deepEqual(started, [0, 1, 2]);
  } finally {
    for (const { resolve } of pending.values()) resolve({ status: 200 });
    await run;
    await nextTurn();
  }
});

test('undefined rejection is still a failure and cannot restart dispatch', async () => {
  const started = [];
  const result = await runBackpressure({ requests: 7, concurrency: 1,
    task: index => { started.push(index); return Promise.reject(undefined); },
  }).then(() => ({ fulfilled: true }), reason => ({ fulfilled: false, reason }));
  assert.deepEqual(result, { fulfilled: false, reason: undefined });
  assert.deepEqual(started, [0]);
});

test('success preserves input order despite reversed completion order', async () => {
  const pending = new Map();
  const run = runBackpressure({ requests: 4, concurrency: 4, synthetic: true,
    task: index => new Promise(resolve => pending.set(index, resolve)),
  });
  await nextTurn();
  for (const index of [3, 2, 1, 0]) pending.get(index)({ status: 200, index });
  const result = await run;
  assert.equal(result.status, 'PASS');
  assert.equal(result.peak, 4);
  assert.deepEqual(result.results.map(row => row.index), [0, 1, 2, 3]);
});

test('real HTTP failure drains in-flight requests before the caller can close its server', { timeout: 10000 }, async () => {
  const requests = new Map();
  const failedRequest = Promise.withResolvers();
  const server = createServer((request, response) => {
    requests.set(request.url, response);
    if (requests.has('/0') && requests.has('/1') && requests.has('/2')) requests.get('/0').destroy();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  let settled = false;
  const run = runBackpressure({ requests: 12, concurrency: 3, synthetic: true,
    task: async index => {
      try {
        const response = await fetch(origin + '/' + index, { signal: AbortSignal.timeout(4000) });
        await response.text();
        return { status: response.status };
      } catch (error) { failedRequest.resolve(error); throw error; }
    },
  }).then(() => ({ fulfilled: true }), error => ({ fulfilled: false, error }))
    .finally(() => { settled = true; });
  try {
    const firstFailure = await failedRequest.promise;
    await nextTurn();
    assert.equal(settled, false);
    assert.deepEqual([...requests.keys()].sort(), ['/0', '/1', '/2']);
    for (const url of ['/1', '/2']) requests.get(url).end('synthetic peer complete');
    assert.deepEqual(await run, { fulfilled: false, error: firstFailure });
    assert.deepEqual([...requests.keys()].sort(), ['/0', '/1', '/2']);
  } finally {
    for (const response of requests.values()) if (!response.destroyed) response.end('cleanup');
    await run;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
