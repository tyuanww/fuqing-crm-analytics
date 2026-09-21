/**
 * Explicit real-browser + real FastAPI/SQLite probe. Synthetic files and owned random ports.
 * No DSH shell, model, live service or production credentials. Run after build.
 * B0_BUILD_UPSTREAM, FQ_B0_PYTHON, COCKPIT_PLAYWRIGHT and COCKPIT_CHROMIUM are explicit existing tools.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { handleBoardBrowserCall } from '../src/board-spec/browser-api.mjs';
import { checkSelectionRegressions } from './helpers/cockpit-selection-regressions.mjs';
import { checkPresentationFlow } from './helpers/cockpit-presentation-flow.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const plugin = join(root, 'dsh-plugins/analytics-workbench');
const evidence = resolve(process.env.COCKPIT_EVIDENCE_DIR ?? join(root, '.context/checks/cockpit-ui-ux/browser'));
await mkdir(evidence, { recursive: true });
const upstream = resolve(process.env.B0_BUILD_UPSTREAM ?? join(root, '.context/dsh-b0/upstream'));
const web = createRequire(join(upstream, 'apps/web/package.json'));
const esbuild = createRequire(web.resolve('vite/package.json'))('esbuild');
await esbuild.build({ absWorkingDir: plugin, entryPoints: ['test/helpers/cockpit-v2-browser-entry.tsx'],
  outfile: join(plugin, 'lib/cockpit-v2-browser.js'), bundle: true, platform: 'browser', format: 'esm',
  alias: { react: web.resolve('react').replace(/\/index\.js$/, ''), 'react-dom': web.resolve('react-dom').replace(/\/index\.js$/, '') },
  jsx: 'automatic', target: 'es2022', loader: { '.css': 'empty' }, logLevel: 'silent' });
const javascript = await readFile(join(plugin, 'lib/cockpit-v2-browser.js'));
const child = spawn(process.env.FQ_B0_PYTHON ?? 'python3.14', ['-m', 'backend.tests.library_board_http_probe', '--cockpit-ui-ux'],
  { cwd: root, env: { PATH: process.env.PATH, PYTHONPATH: root, PYTHONNOUSERSITE: '1', PYTHON_DOTENV_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['pipe','pipe','pipe'] });
const terminal = new Promise(resolve => { child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', error => resolve({ error: error.message })); });
let stderr = '';
child.stderr.on('data', data => { stderr += data; });
let browser, server, readyTimer;
const results = [], errors = [], screenshots = [];
const check = (name, detail = '') => { results.push({ name, status: 'PASS', detail }); process.stdout.write('PASS ' + name + '\n'); };
try {
  const lines = createInterface({ input: child.stdout });
  const ready = await Promise.race([
    new Promise((resolve, reject) => lines.once('line', line => { try { resolve(JSON.parse(line)); } catch (error) { reject(error); } })),
    terminal.then(result => { throw new Error('HTTP stopped ' + JSON.stringify(result) + stderr); }),
    new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error('HTTP readiness timeout')), 15000); }),
  ]).finally(() => { clearTimeout(readyTimer); lines.close(); });
  assert.equal(ready.contains_real_data, false);
  process.env.COMPETITION_HTTP_BASE = 'http://127.0.0.1:' + ready.port;
  process.env.COMPETITION_HTTP_TOKEN = 'isolated-native-board-integration-token';
  const headers = { authorization: 'Bearer ' + process.env.COMPETITION_HTTP_TOKEN, 'content-type': 'application/json' };
  const backend = async (path, body, key) => {
    const response = await fetch(process.env.COMPETITION_HTTP_BASE + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(key ? { 'idempotency-key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  const prefix = '/api/v1/analytics/board-spec';
  const generated = await backend(prefix + '/previews', { title: '渠道复盘 · 合成看板', session_id: 'native_session', blocks: [
    { block_id: 'note', title: '本周经营观察', kind: 'TEXT', props: { content: '渠道结构保持稳定。先核对口径，再决定下一步行动。' }, layout: { x: 0, y: 0, w: 7, h: 6 } },
    { block_id: 'plan', title: '接下来做什么', kind: 'TEXT', props: { content: '1. 核对新增客户\n2. 观察渠道变化\n3. 记录验证结论' }, layout: { x: 7, y: 0, w: 5, h: 6 } },
  ] });
  const board = await backend(prefix + '/previews/' + generated.preview_id + '/confirm', {}, 'browser-seed');
  const readBody = async req => { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); };
  server = createServer((req, res) => { void (async () => {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const path = new URL(req.url, origin).pathname;
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) { res.writeHead(403); res.end(); return; }
    if (path === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>驾驶舱 V2 · 隔离合成验收</title><style>html,body,#root{height:100%;margin:0}body{overflow:hidden}#fixture-label{position:fixed;bottom:4px;right:8px;z-index:100;font:10px sans-serif;color:#999;pointer-events:none}</style></head><body><div id="root"></div><span id="fixture-label">隔离 synthetic · 本地候选</span><script type="module" src="/fixture.js"></script></body></html>'); return; }
    if (path === '/fixture.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(javascript); return; }
    if (path === '/fixture/board' && req.method === 'POST') {
      const { operation, payload } = JSON.parse(await readBody(req));
      const reply = await handleBoardBrowserCall(operation, payload);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(reply)); return;
    }
    if (path.startsWith('/api/v1/analytics/page-documents/') || path.startsWith('/api/v1/analytics/cockpit-files') || path.startsWith('/api/v1/analytics/cockpit-ai')) {
      const body = await readBody(req);
      const response = await fetch(process.env.COMPETITION_HTTP_BASE + req.url, { method: req.method,
        headers: { ...headers, ...(req.headers['idempotency-key'] ? { 'idempotency-key': req.headers['idempotency-key'] } : {}) },
        ...(body.length ? { body } : {}) });
      res.writeHead(response.status, { 'content-type': 'application/json' }); res.end(await response.text()); return;
    }
    res.writeHead(404); res.end();
  })().catch(error => { res.writeHead(500); res.end(JSON.stringify({ error: { message: error.message } })); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const { chromium } = createRequire(import.meta.url)(process.env.COCKPIT_PLAYWRIGHT);
  browser = await chromium.launch({ executablePath: process.env.COCKPIT_CHROMIUM, headless: true, args: ['--use-mock-keychain'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  const idle = () => page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false' && !window.cockpitFixture.fileClient.getSnapshot().organizing);
  const click = async name => { await page.getByRole('button', { name, exact: true }).click(); await idle(); };
  const shot = async name => { const path = join(evidence, name + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
  if (process.argv.includes('--presentation')) {
    await checkPresentationFlow({ page, origin, backend, check, shot });
  } else {
  await page.goto(origin + '/?ux=1'); await page.getByTestId('library-html-preview').waitFor(); await idle();
  assert.equal(await page.locator('.cockpit-product-copy small').count(), 0);
  assert.equal(await page.frameLocator('iframe').locator('header').innerText(), '经营回顾 🌟\n\n本周观察');
  assert.ok(!(await page.frameLocator('iframe').locator('body').innerText()).includes('</header>'));
  check('标题单行、header 结束标签正确渲染');
  const first = page.locator('[data-product-id="file:native_session:weekly-review.html"]');
  const second = page.locator('[data-product-id="file:native_session:second.html"]');
  await first.locator('.cockpit-drag').dragTo(second); await idle();
  const order = await page.locator('[data-kind=html]').evaluateAll(nodes => nodes.map(node => node.dataset.productId));
  assert.ok(order.indexOf('file:native_session:weekly-review.html') > order.indexOf('file:native_session:second.html'));
  const keyboardHandle = second.locator('.cockpit-drag');
  await keyboardHandle.focus(); await keyboardHandle.press('ArrowDown'); await idle();
  assert.equal(await keyboardHandle.evaluate(node => document.activeElement === node), true);
  await keyboardHandle.press('ArrowUp'); await idle();
  assert.equal(await keyboardHandle.evaluate(node => document.activeElement === node), true);
  const separator = page.getByRole('separator', { name: '调整产物侧栏宽度' });
  const box = await separator.boundingBox(); await page.mouse.move(box.x + 3, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 75, box.y + 100, { steps: 8 }); await page.mouse.up(); await idle();
  assert.equal(await separator.getAttribute('aria-valuenow'), '320');
  await page.reload(); await idle(); await page.getByTestId('library-html-preview').waitFor();
  assert.equal(await separator.getAttribute('aria-valuenow'), '320');
  assert.deepEqual(await page.locator('[data-kind=html]').evaluateAll(nodes => nodes.map(node => node.dataset.productId)), order);
  check('鼠标排序与调宽，刷新后服务端保存的设置保持');
  const grab = page.getByRole('button', { name: '拖动产物面板', exact: true });
  const grabBox = await grab.boundingBox();
  await page.mouse.move(grabBox.x + 20, grabBox.y + 12); await page.mouse.down(); await page.mouse.move(grabBox.x + 420, grabBox.y + 102, { steps: 10 }); await page.mouse.up(); await idle();
  const panel = page.locator('.cockpit-rail-container');
  assert.equal(await panel.getAttribute('data-floating'), 'true');
  const placed = await panel.boundingBox(); assert.ok(placed.x >= 395 && placed.y >= 150);
  const corner = await page.getByRole('button', { name: '缩放产物面板', exact: true }).boundingBox();
  await page.mouse.move(corner.x + 10, corner.y + 10); await page.mouse.down(); await page.mouse.move(corner.x + 60, corner.y + 70, { steps: 8 }); await page.mouse.up(); await idle();
  const resized = await panel.boundingBox(); assert.ok(resized.width > placed.width + 40 && resized.height > placed.height + 50);
  await page.reload(); await idle(); await page.getByTestId('library-html-preview').waitFor();
  assert.equal(await panel.getAttribute('data-floating'), 'true');
  const restored = await panel.boundingBox(); assert.equal(restored.x, resized.x); assert.equal(restored.width, resized.width);
  await shot('00-floating-panel');
  const movedGrab = await grab.boundingBox();
  await page.mouse.move(movedGrab.x + 20, movedGrab.y + 12); await page.mouse.down(); await page.mouse.move(movedGrab.x + 100, movedGrab.y + 62, { steps: 5 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal((await panel.boundingBox()).x, restored.x);
  await grab.focus(); await page.keyboard.press('ArrowLeft'); await idle(); assert.equal((await panel.boundingBox()).x, restored.x - 10);
  await click('将产物面板停靠左侧'); assert.equal(await panel.getAttribute('data-floating'), 'false');
  check('整个产物面板拖出停靠、任意移动、双向缩放、刷新恢复与一键停靠');
  await first.locator('.cockpit-product-delete').click(); await page.getByRole('alertdialog').waitFor();
  await click('取消'); assert.equal(await first.count(), 1);
  await first.locator('.cockpit-product-delete').click(); await click('移入回收站'); assert.equal(await first.count(), 0);
  await page.reload(); await idle(); assert.equal(await first.count(), 0);
  await click('回收站'); await page.getByRole('button', { name: '恢复产物：weekly-review.html' }).click(); await idle();
  await click('返回产物'); await first.locator('.cockpit-product').click(); await idle();
  check('删除确认、刷新不复现、回收站恢复原产物');
  await click('保存为可编辑副本'); await page.getByTestId('html-import-preview').waitFor(); await click('确认保存副本');
  await click('编辑');
  const frame = page.frameLocator('[data-testid="library-html-preview"]');
  await frame.locator('h1[data-cockpit-target]').click(); await page.getByTestId('html-replacement').fill('修改后的经营回顾');
  await click('预览修改'); await click('确认保存');
  assert.equal(await frame.locator('h1').innerText(), '修改后的经营回顾');
  assert.equal(await frame.locator('h2').innerText(), '保持不变');
  check('无专用标记的普通 HTML 可点选、手动改字并保存版本');
  await frame.locator('h1[data-cockpit-target]').click();
  await page.getByLabel('选择上级板块').selectOption({ label: 'header · 修改后的经营回顾  本周观察' });
  await click('用 AI 修改此选区');
  await page.getByTestId('html-ai-composer').getByRole('textbox').fill('仅把这个板块背景改为浅灰');
  await click('发送并进入对话');
  const selection = JSON.parse(await page.locator('body').getAttribute('data-ai-selection'));
  assert.ok(selection.end > selection.start && selection.html_hash.length === 64);
  const job = await page.evaluate(() => window.cockpitFixture.aiClient.getSnapshot().active);
  assert.deepEqual(job.selection, selection);
  check('点选上级板块、真实 AI 任务记录持久化精确选区（未调用模型）');
  await click('放弃本次修改');
  assert.equal(await page.locator('.cockpit-ai-complete').getAttribute('open'), null);
  assert.ok((await page.getByTestId('library-pathbar').boundingBox()).height <= 40);
  await click('完成编辑'); await shot('01-compact-preview');
  await click('全屏展示'); await page.waitForFunction(() => document.fullscreenElement?.dataset.presenting === 'true');
  assert.equal(await page.locator('.sm-library-pathbar').isVisible(), false);
  assert.equal(await page.locator('.sm-library-rail').isVisible(), false);
  await shot('02-fullscreen'); await click('退出全屏 · Esc');
  await page.waitForFunction(() => !document.fullscreenElement && document.querySelector('main').dataset.presenting === 'false');
  check('全屏展示隐藏侧栏和辅助条，退出后恢复');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.sm-library-rail').hidden); await shot('03-mobile');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('390px 窄屏无横向溢出');
  await checkSelectionRegressions({ page, idle, click, check, shot });
  }
  assert.deepEqual(errors, []); check('浏览器无未处理异常');
} catch (error) {
  results.push({ name: 'probe', status: 'FAIL', detail: error.stack });
  process.stderr.write(error.stack + '\n');
  if (browser) { const page = browser.contexts()[0]?.pages()[0]; if (page) await writeFile(join(evidence, 'failure-state.json'), JSON.stringify(await page.evaluate(() => ({ selection: window.cockpitFixture?.pageStore.getSnapshot().selection, message: window.cockpitFixture?.pageStore.getSnapshot().message, events: window.selectionEvents })), null, 2)); }
  if (browser) { const page = browser.contexts()[0]?.pages()[0]; if (page) { await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }); await writeFile(join(evidence, 'failure.txt'), await page.locator('body').innerText()); } }
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  child.stdin.end();
  const kill = setTimeout(() => child.kill('SIGTERM'), 12000);
  const stopped = await terminal; clearTimeout(kill);
  if (stopped.code !== 0) { results.push({ name: 'owned HTTP cleanup', status: 'FAIL', detail: stderr }); process.exitCode = 1; }
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ results, errors, screenshots, full_dsh_shell: 'NOT_RUN', real_model: 'NOT_RUN', contains_real_data: false }, null, 2));
}
