import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from 'node:http';
import {
  cleanupOwnedResources,
  stopOwnedChild,
  installProbeInterruption,
  fetchProbeResponse,
} from "./html-host-browser-cleanup.mjs";

for (const signal of ['SIGTERM', 'SIGINT']) test(`probe ${signal} reaches finally and reaps its owned child`, { timeout: 8000 }, async t => {
  const moduleUrl = new URL('./html-host-browser-cleanup.mjs', import.meta.url).href;
  const script = `import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { installProbeInterruption, stopOwnedChild } from ${JSON.stringify(moduleUrl)};
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'ignore'});
const exit = new Promise(resolve => child.once('exit', (code,signal)=>resolve({code,signal})));
const lifetime = installProbeInterruption(()=>child.kill('SIGTERM'));
try { console.log(JSON.stringify({ready:true,pid:child.pid})); throw await lifetime.aborted; }
catch (error) { process.exitCode=1; }
finally { const receipt=await stopOwnedChild({child,exit}); lifetime.dispose(); console.log(JSON.stringify({cleanup:receipt})); }
`;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore','pipe','pipe'] });
  let output = '', childPid;
  const closed = once(parent, 'close');
  t.after(async () => {
    if (parent.exitCode === null && parent.signalCode === null) { parent.kill('SIGKILL'); await closed; }
    if (childPid) { try { process.kill(childPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  });
  parent.stdout.on('data', chunk => {
    output += chunk;
    if (!childPid && output.includes('\n')) { childPid=JSON.parse(output.split('\n')[0]).pid; parent.kill(signal); }
  });
  const [code, exitSignal] = await closed;
  assert.equal(code, 1); assert.equal(exitSignal, null);
  const receipt = JSON.parse(output.trim().split('\n').at(-1)).cleanup;
  assert.equal(receipt.remaining, false);
  assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
});

test('whole-probe budget aborts once and removes signal listeners on disposal', async () => {
  const before = ['SIGTERM','SIGINT'].map(name=>process.listenerCount(name));
  let calls = 0;
  const lifetime = installProbeInterruption(()=>calls++, { timeoutMs: 20 });
  try {
    assert.match((await lifetime.aborted).message, /RUN_TIMEOUT/);
    assert.equal(lifetime.signal.aborted, true);
    assert.equal(calls, 1);
  } finally { lifetime.dispose(); }
  assert.deepEqual(['SIGTERM','SIGINT'].map(name=>process.listenerCount(name)), before);
});

test('probe HTTP bounds response headers and body and honors parent interruption', { timeout: 5000 }, async t => {
  const server = createServer((req, res) => {
    if (req.url === '/ok') res.end('owned');
    else if (req.url === '/body') { res.writeHead(200); res.write('partial'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  assert.equal(await (await fetchProbeResponse(url+'/ok')).text(), 'owned');
  await assert.rejects(fetchProbeResponse(url+'/headers', {}, { timeoutMs: 25 }), { name: 'TimeoutError' });
  const response = await fetchProbeResponse(url+'/body', {}, { timeoutMs: 50 });
  await assert.rejects(response.text(), { name: 'TimeoutError' });
  const controller = new AbortController();
  const pending = fetchProbeResponse(url+'/headers', {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test("a browser close exception and a log-write exception cannot skip other owned cleanup", async () => {
  const observed = [];
  const result = await cleanupOwnedResources(
    [
      [
        "browser",
        () => {
          observed.push("browser");
          throw new Error("synthetic close failure");
        },
      ],
      [
        "host",
        () => {
          observed.push("host");
          return { remaining: false };
        },
      ],
      [
        "model",
        () => {
          observed.push("model");
        },
      ],
      [
        "http",
        () => {
          observed.push("http");
          return { remaining: false };
        },
      ],
    ],
    [
      [
        "host.log",
        () => {
          observed.push("host.log");
          throw new Error("synthetic write failure");
        },
      ],
      [
        "http.log",
        () => {
          observed.push("http.log");
        },
      ],
    ],
  );
  assert.deepEqual(observed, [
    "browser",
    "host",
    "model",
    "http",
    "host.log",
    "http.log",
  ]);
  assert.equal(result.steps.browser.status, "FAIL");
  assert.equal(result.steps.http.status, "PASS");
  assert.equal(result.artifacts["host.log"].status, "FAIL");
  assert.equal(result.artifacts["http.log"].status, "PASS");
  assert.equal(result.errors.length, 2);
});

test("a stalled close is bounded and cleanup still attempts the next owned resource", async () => {
  let next = false;
  const receipt = await cleanupOwnedResources([
    ["browser", () => new Promise(() => {}), 25],
    [
      "http",
      () => {
        next = true;
      },
    ],
  ]);
  assert.equal(next, true);
  assert.equal(receipt.steps.browser.status, "FAIL");
  assert.match(receipt.steps.browser.detail, /CLEANUP_TIMEOUT/);
});

test("an owned child ignoring TERM is killed within the bounded escalation and reaped", async (t) => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      'process.on("SIGTERM",()=>{});process.stdout.write("ready\\n");setInterval(()=>{},1000)',
    ],
    { env: { PATH: "/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"] },
  );
  const exit = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error: error.message }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exit;
    }
  });
  await once(child.stdout, "data");
  const receipt = await stopOwnedChild({
    child,
    exit,
    graceful: () => child.stdin.end(),
    graceMs: 25,
    termMs: 50,
    killMs: 2000,
  });
  assert.equal(receipt.term_sent, true);
  assert.equal(receipt.kill_sent, true);
  assert.equal(receipt.remaining, false);
  assert.equal(receipt.exit.signal, "SIGKILL");
  assert.deepEqual(receipt.errors, []);
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
});

test("a child reporting a failed graceful close is still terminated and reported as failure", async (t) => {
  const child = spawn(
    process.execPath,
    ["-e", 'process.stdout.write("ready\\n");setInterval(()=>{},1000)'],
    { env: { PATH: "/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"] },
  );
  const exit = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  await once(child.stdout, "data");
  const receipt = await cleanupOwnedResources([
    [
      "http",
      () =>
        stopOwnedChild({
          child,
          exit,
          graceful: () => {
            throw new Error("synthetic stdin close");
          },
          graceMs: 25,
          termMs: 2000,
          killMs: 1000,
        }),
    ],
  ]);
  assert.equal(receipt.steps.http.status, "FAIL");
  assert.equal(receipt.steps.http.result.remaining, false);
  assert.match(receipt.errors[0].detail, /synthetic stdin close/);
});
