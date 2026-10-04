/** Owned loopback process used only by the opt-in artifact compatibility drill. */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function startPackedService({ python, driver, operation, app, state, home, credentials, log, signal }) {
  const child = spawn(python, ['-I', driver, operation, app, state], {
    cwd: home, detached: true, signal,
    env: { PATH: dirname(python) + ':/usr/bin:/bin', HOME: home, TMPDIR: home,
      PYTHONPATH: '/repository-not-available', PYTHON_DOTENV_DISABLED: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // close waits for process exit AND drained pipes, and unlike events.once(exit)
  // cannot reject on an AbortError halfway through owned-process cleanup.
  const closed = new Promise(resolve => child.once('close', resolve));
  let stdout = '', stderr = '', stopPromise;
  const redact = text => Object.values(credentials).reduce((out, secret) => out.replaceAll(secret, '[REDACTED]'), text);
  child.stdout.on('data', data => { stdout = (stdout + data).slice(-65536); });
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-65536); });
  child.stdin.on('error', () => {}); // An early startup rejection may close the pipe.
  child.stdin.end(JSON.stringify(credentials));
  function stop() {
    return stopPromise ??= (async () => {
      let timer;
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000);
      }
      try { await closed; } finally { clearTimeout(timer); }
      await writeFile(log + '.stdout', redact(stdout), { flag: 'wx' });
      await writeFile(log + '.stderr', redact(stderr), { flag: 'wx' });
    })();
  }
  try {
    const receipt = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SERVICE_PROCESS_TIMEOUT')), 15000);
      const failed = error => { clearTimeout(timer); reject(error); };
      child.once('error', failed);
      child.once('exit', () => failed(new Error('SERVICE_PROCESS_EXIT')));
      child.stdout.on('data', () => {
        if (!stdout.includes('\n')) return;
        clearTimeout(timer);
        try { resolve(JSON.parse(stdout.split('\n')[0])); } catch { reject(new Error('SERVICE_PROCESS_RECEIPT_INVALID')); }
      });
    });
    if (receipt.status !== 'SERVICE_SOCKET_BOUND' || !Number.isInteger(receipt.port) || receipt.port <= 0) {
      throw new Error('SERVICE_PROCESS_RECEIPT_INVALID');
    }
    const origin = 'http://127.0.0.1:' + receipt.port;
    for (let i = 0; i < 80; i++) {
      try {
        const response = await fetch(origin + '/api/v1/analytics-first-purchase/analyses', { signal: AbortSignal.timeout(500) });
        const ready = response.status === 401; await response.arrayBuffer();
        if (ready) return { origin, receipt, stop };
      } catch {}
      await delay(25);
    }
    throw new Error('SERVICE_PROCESS_HTTP_NOT_READY');
  } catch (error) {
    await stop(); error.detail = redact(stderr); throw error;
  }
}
