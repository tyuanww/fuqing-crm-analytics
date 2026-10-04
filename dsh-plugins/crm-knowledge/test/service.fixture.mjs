/** Starts only two owned, ephemeral public-synthetic APIs; plugin never spawns them. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../..', import.meta.url));
export async function serveCrmServices(t) {
  const python = process.env.CRM_METRICS_PYTHON;
  assert.ok(python && isAbsolute(python), 'CRM_METRICS_PYTHON must select the locked backend Python 3.14+');
  const home = await mkdtemp(join(tmpdir(), 'crm-service-fixture-'));
  const children = [];
  async function stop(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  t.after(async () => { for (const child of children) await stop(child); await rm(home, { recursive: true, force: true }); });
  const config = {}, stops = {};
  for (const domain of ['metrics', 'knowledge']) {
    const child = spawn(python, [fileURLToPath(new URL('./service.fixture.py', import.meta.url)), domain], {
      cwd: home, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: dirname(python) + ':/usr/bin:/bin', HOME: home, TMPDIR: home,
        PYTHONPATH: root, PYTHON_DOTENV_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1', LANG: 'en_US.UTF-8' },
    });
    children.push(child); let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
    const port = await new Promise((resolve, reject) => {
      let text = ''; const timer = setTimeout(() => reject(new Error('service fixture startup timed out: ' + stderr)), 10000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('service fixture exited: ' + stderr)); });
      child.stdout.on('data', chunk => {
        text += chunk;
        if (text.includes('\n')) {
          clearTimeout(timer);
          try { resolve(JSON.parse(text.split('\n')[0]).port); } catch (error) { reject(error); }
        }
      });
    });
    assert.ok(Number.isInteger(port) && port > 0);
    const origin = 'http://127.0.0.1:' + port;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(origin + '/api/v1/crm-' + domain + '/capabilities', {
          headers: { 'X-ShineMage-Contract': 'crm-' + domain + '-service/1.0.0' }, signal: AbortSignal.timeout(1000),
        });
        ready = response.ok; await response.arrayBuffer(); if (ready) break;
      } catch { /* The socket is allocated before uvicorn starts listening. */ }
      await delay(25);
    }
    assert.ok(ready, 'service fixture did not become ready: ' + stderr);
    config[domain + 'Origin'] = origin;
    stops[domain] = () => stop(child);
  }
  return { config, stop: stops };
}
