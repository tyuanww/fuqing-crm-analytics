/** Real Chrome against owned FastAPI/SQLite. Skip when Chrome is absent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeAvailable, evaluate, launchChrome } from '../../analytics-workbench/src/free-page/runtime/chrome-cdp.mjs';

const python = process.env.CRM_METRICS_PYTHON || 'python3';
const server = fileURLToPath(new URL('./crm-journey-server.py', import.meta.url));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function freePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test('browser query-save-board-edit-reopen keeps server facts and rejects the other account', async t => {
  if (!chromeAvailable()) { t.skip('Chrome is not installed'); return; }
  const port = await freePort();
  const child = spawn(python, [server, String(port)], { cwd: root, env: { ...process.env, PYTHONPATH: root, PYTHON_DOTENV_DISABLED: '1', PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stderr = [];
  child.stderr.on('data', chunk => stderr.push(chunk));
  t.after(() => { child.kill('SIGTERM'); });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try { const res = await fetch(`http://127.0.0.1:${port}/docs/crm-journey`); ready = res.ok; await res.arrayBuffer(); } catch { /* starting */ }
  }
  assert.ok(ready, `journey server did not start: ${Buffer.concat(stderr).toString().slice(-1000)}`);
  const userDataDir = await mkdtemp(join(tmpdir(), 'crm-chrome-'));
  t.after(() => rm(userDataDir, { recursive: true, force: true }));
  const chrome = await launchChrome({ userDataDir, url: `http://127.0.0.1:${port}/docs/crm-journey` });
  t.after(() => chrome.close());
  await evaluate(chrome.session, `document.getElementById('run').click()`);
  const saved = await evaluate(chrome.session, `new Promise(resolve => {
    const tick = () => { const text = document.querySelector('[data-testid="status"]').textContent; if (text.startsWith('saved ') || text.startsWith('error ')) resolve(text); else setTimeout(tick, 50); };
    tick();
  })`, 15000);
  assert.match(saved, /^saved 已编辑 8001 share=200 revoke=404$/);
  await evaluate(chrome.session, `document.getElementById('reload').click()`);
  const reopened = await evaluate(chrome.session, `new Promise(resolve => {
    const tick = () => { const text = document.querySelector('[data-testid="status"]').textContent; if (text.startsWith('reopen ') || text.startsWith('error ')) resolve(text); else setTimeout(tick, 50); };
    tick();
  })`, 15000);
  assert.match(reopened, /^reopen 已编辑 8001 bob=404$/);
});
