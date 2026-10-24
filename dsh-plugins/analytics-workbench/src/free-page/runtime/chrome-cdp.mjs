import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_HTTP_TIMEOUT_MS = 5000;

export function chromePath() {
  return process.env.FREE_PAGE_CHROME || CHROME;
}

export function chromeAvailable() {
  try {
    return existsSync(chromePath());
  } catch {
    return false;
  }
}

export async function fetchCdpJson(url, timeoutMs = CDP_HTTP_TIMEOUT_MS) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`cdp http ${response.status}`);
  }
  return response.json();
}

export function waitForWebSocketOpen(ws, timeoutMs = CDP_HTTP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
    };
    const onOpen = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('cdp websocket failed to open')); };
    const onClose = () => { cleanup(); reject(new Error('cdp websocket closed before opening')); };
    ws.addEventListener('open', onOpen, { once: true });
    ws.addEventListener('error', onError, { once: true });
    ws.addEventListener('close', onClose, { once: true });
    timer = setTimeout(() => {
      cleanup();
      try { ws.close(); } catch { /* ignore cleanup errors */ }
      reject(new Error(`cdp websocket open timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.exceptions = [];
    ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : event.data.toString();
      const msg = JSON.parse(raw);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = (msg.params?.args || []).map((arg) => arg.value ?? arg.description ?? arg.type);
        this.console.push({ type: msg.params?.type, args });
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(msg.params?.exceptionDetails?.text || msg.params?.exceptionDetails?.exception?.description);
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}, timeoutMs = 8000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`cdp timeout ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(error) { clearTimeout(timer); reject(error); },
      });
    });
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function waitForPort(child, userDataDir) {
  const deadline = Date.now() + 20000;
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 8000) stderr = stderr.slice(-4000);
  });
  while (Date.now() < deadline) {
    const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
    if (match) return Number(match[1]);
    try {
      const text = await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8');
      const port = Number(text.split('\n')[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch { /* not ready */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`chrome CDP port not ready: ${stderr.slice(0, 500)}`);
}

export async function launchChrome({ userDataDir, proxyPort, url }) {
  const args = [
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--disable-background-networking',
    '--disable-sync',
    '--mute-audio',
    '--window-size=1280,800',
    `--lang=zh-CN`,
  ];
  // Only this disposable probe browser uses a mock keychain. A temporary HOME
  // has no macOS login keychain; probing must not prompt or touch the user's.
  if (process.platform === 'darwin') args.push('--use-mock-keychain');
  if (proxyPort) {
    args.push(`--proxy-server=http://127.0.0.1:${proxyPort}`);
    args.push('--proxy-bypass-list=127.0.0.1,localhost,<-loopback>');
  }
  args.push(url || 'about:blank');
  const child = spawn(chromePath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const sockets = [];
  let closing;
  const close = () => closing ??= (async () => {
    for (const socket of sockets) socket.close();
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
    let timer;
    try {
      child.kill('SIGTERM');
      await Promise.race([
        exited,
        new Promise(resolve => { timer = setTimeout(resolve, 2000); }),
      ]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    } finally { clearTimeout(timer); }
  })();
  try {
    await once(child, 'spawn');
    const port = await waitForPort(child, userDataDir);
    const version = await fetchCdpJson(`http://127.0.0.1:${port}/json/version`);
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    sockets.push(ws);
    ws.addEventListener('error', () => {});
    await waitForWebSocketOpen(ws);
    const browser = new Cdp(ws);
    const pages = await fetchCdpJson(`http://127.0.0.1:${port}/json/list`);
    const page = pages.find((row) => row.type === 'page') || pages[0];
    const pageWs = new WebSocket(page.webSocketDebuggerUrl);
    sockets.push(pageWs);
    pageWs.addEventListener('error', () => {});
    await waitForWebSocketOpen(pageWs);
    const session = new Cdp(pageWs);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    return {
      child, port, browser, session,
      version: version.Browser || version['Browser'],
      userAgent: version['User-Agent'] || version.UserAgent,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function evaluate(session, expression, timeoutMs = 8000) {
  const result = await session.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'evaluate exception');
  }
  return result.result?.value;
}

export async function screenshot(session) {
  const got = await session.send('Page.captureScreenshot', { format: 'png' }, 15000);
  return Buffer.from(got.data, 'base64');
}
