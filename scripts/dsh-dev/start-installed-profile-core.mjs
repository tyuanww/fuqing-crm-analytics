import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function childRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

export async function launchInstalledProfile({
  env = process.env,
  spawnFn = spawn,
  mkdirFn = mkdir,
  startPageFn,
  writeStateFn,
} = {}) {
  if (!env.DSH_REPO || !env.DSH_RUNTIME || !env.DSH_NODE || !env.DSH_DEV_PAGE_PYTHON) {
    throw new Error('DSH_REPO, DSH_RUNTIME, DSH_NODE and DSH_DEV_PAGE_PYTHON are required');
  }
  const repo = resolve(env.DSH_REPO);
  const runtime = resolve(env.DSH_RUNTIME);
  const home = join(runtime, 'harness');
  let page;
  try {
    const pageModule = startPageFn && writeStateFn
      ? null
      : await import(pathToFileURL(join(repo, 'scripts/dsh-dev/page-http.mjs')).href);
    const startPage = startPageFn ?? pageModule.startPageHttp;
    const writeState = writeStateFn ?? pageModule.writePageHttpState;
    await mkdirFn(join(runtime, 'tmp'), { recursive: true, mode: 0o700 });
    const baseEnv = {
      ...env,
      HOME: home,
      DSH_HOME: home,
      DSH_AGENTS_HOME: join(home, 'agents'),
      DSH_TELEMETRY_DISABLED: '1',
      DSH_ANALYTICS_UI_ONLY: '1',
      TMPDIR: join(runtime, 'tmp'),
    };
    page = await startPage({
      port: 18091,
      stateDir: join(runtime, 'page-documents'),
      python: env.DSH_DEV_PAGE_PYTHON,
      env: baseEnv,
    });
    await writeState(runtime, page);
    const child = spawnFn(env.DSH_NODE, [
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
    return { page, child };
  } catch (error) {
    if (page) {
      try {
        await page.stop();
      } catch (stopError) {
        error.stopError = stopError;
      }
    }
    throw error;
  }
}

export async function stopInstalledProfile({ page, child }, signal = 'SIGTERM') {
  let pageError = null;
  try {
    await page.stop();
  } catch (error) {
    pageError = error;
  }
  if (childRunning(child)) {
    child.kill(signal);
    await new Promise(resolveExit => {
      const timer = setTimeout(() => {
        if (childRunning(child)) child.kill('SIGKILL');
        resolveExit();
      }, 10_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  if (pageError) throw pageError;
}
