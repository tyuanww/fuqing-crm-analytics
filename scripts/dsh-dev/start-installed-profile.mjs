#!/usr/bin/env node
/** Start the already-installed web profile without running package installation. */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(process.env.DSH_REPO);
const runtime = resolve(process.env.DSH_RUNTIME);
const home = join(runtime, 'harness');
const node = process.env.DSH_NODE;
const python = process.env.DSH_DEV_PAGE_PYTHON;
if (!node || !python) throw new Error('DSH_NODE and DSH_DEV_PAGE_PYTHON are required');

const { startPageHttp, writePageHttpState } = await import(
  pathToFileURL(join(repo, 'scripts/dsh-dev/page-http.mjs')).href
);

await mkdir(join(runtime, 'tmp'), { recursive: true, mode: 0o700 });
const baseEnv = {
  ...process.env,
  HOME: home,
  DSH_HOME: home,
  DSH_AGENTS_HOME: join(home, 'agents'),
  DSH_TELEMETRY_DISABLED: '1',
  DSH_ANALYTICS_UI_ONLY: '1',
  TMPDIR: join(runtime, 'tmp'),
};
const page = await startPageHttp({
  port: 18091,
  stateDir: join(runtime, 'page-documents'),
  python,
  env: baseEnv,
});
await writePageHttpState(runtime, page);

const child = spawn(node, [
  join(repo, 'upstream/lib/bin.js'),
  '--profile', 'web',
  '--patch', join(runtime, 'plugin.patch.yml'),
  '--patch', join(repo, 'inputs/page/brand-weknora/preset.patch.json'),
  '--host', '127.0.0.1',
  '--port', '4328',
  '--trusted-host', 'app.tyuan.chat',
  '--no-open',
], {
  cwd: repo,
  env: {
    ...baseEnv,
    PAGE_DOCUMENTS_HTTP_BASE: page.base,
    PAGE_DOCUMENTS_HTTP_TOKEN: page.token,
    PAGE_DOCUMENTS_BROWSER_BASE: 'https://page.tyuan.chat',
    PAGE_RESULT_HTTP_BASE: page.base,
    PAGE_RESULT_HTTP_TOKEN: page.token,
    PAGE_RESULT_BROWSER_BASE: 'https://page.tyuan.chat',
  },
  stdio: 'inherit',
});

let stopping = false;
async function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  await page.stop();
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  await new Promise(resolveDone => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      resolveDone();
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveDone();
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void stop(signal).finally(() => process.exit(0));
  });
}
child.once('exit', code => {
  void page.stop().finally(() => process.exit(code ?? 1));
});
child.once('error', error => {
  console.error(error);
  void page.stop().finally(() => process.exit(1));
});
