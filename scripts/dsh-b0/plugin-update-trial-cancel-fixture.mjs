#!/usr/bin/env node
/** Isolated cancellation fixture. It runs only as a process entry, not on import. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import {
  createTrialSignals, handleTrialSignal, reapTrialChildren, runCancellableSequence, trialCancelled,
  finalizeTrialReport, PROTECTED_PORTS,
} from './plugin-update-trial.mjs';

export async function runFixture(mode) {
if (!['during-int', 'during-term', 'gap-int', 'after-term', 'final-check-int', 'final-write-term'].includes(mode)) throw Error('FIXTURE_MODE_REQUIRED');
const signals = createTrialSignals();
const onInt = () => handleTrialSignal(signals, 'SIGINT');
const onTerm = () => handleTrialSignal(signals, 'SIGTERM');
process.on('SIGINT', onInt);
process.on('SIGTERM', onTerm);

const waitForCancel = () => new Promise(resolve => {
  const done = () => { clearTimeout(timer); signals.run.signal.removeEventListener('abort', done); resolve(); };
  const timer = setTimeout(done, 4000);
  signals.run.signal.addEventListener('abort', done, { once: true });
  if (signals.run.signal.aborted) done();
});

const started = [];
let reportDirectory;
try {
  if (mode.startsWith('final-')) {
    reportDirectory = await mkdtemp(join(tmpdir(), 'plugin-final-cancel-'));
    const snapshot = Object.fromEntries(PROTECTED_PORTS.map(port => [port, []]));
    let writes = 0;
    const result = await finalizeTrialReport({
      output: reportDirectory, signals,
      summary: { overall: 'PASS', interrupt: null, protected_ports: { before: snapshot } },
      inspectProtected: async () => {
        if (mode === 'final-check-int') {
          process.stdout.write('FINAL_CHECK\n');
          await waitForCancel();
        }
        return snapshot;
      },
      writeReceipt: async (...args) => {
        await writeFile(...args);
        if (++writes === 1 && mode === 'final-write-term') {
          process.stdout.write('FINAL_WRITE\n');
          await waitForCancel();
        }
      },
    });
    const disk = JSON.parse(await readFile(join(reportDirectory, 'summary.json'), 'utf8'));
    process.stdout.write(`RESULT ${JSON.stringify({ ...result, disk, writes })}\n`);
    process.exitCode = result.overall === 'PASS' ? 0 : 2;
  } else {
  const result = await runCancellableSequence({
    scenarios: ['one', 'two'],
    signals,
    between: async scenario => {
      if (mode === 'gap-int' && scenario === 'two') {
        process.stdout.write('GAP\n');
        await waitForCancel();
      }
    },
    afterAll: async () => {
      if (mode === 'after-term') {
        process.stdout.write('AFTER\n');
        await waitForCancel();
      }
    },
    async runOne(scenario, ctx) {
      started.push(scenario);
      process.stdout.write(`START ${scenario}\n`);
      if (mode.startsWith('during-') && scenario === 'one') {
        const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{}); process.stdout.write("ready\\n"); setInterval(()=>{},200);'], { stdio: ['ignore', 'pipe', 'ignore'] });
        ctx.children.add(child);
        if (child.pid) ctx.owned.add(child.pid);
        await new Promise((resolve, reject) => {
          let text = '';
          const finish = error => {
            clearTimeout(timer);
            child.stdout.off('data', data);
            child.off('error', failure);
            child.off('exit', exited);
            signals.run.signal.removeEventListener('abort', cancelled);
            error ? reject(error) : resolve();
          };
          const data = chunk => { text += chunk; if (text.includes('ready')) finish(); };
          const failure = error => finish(error);
          const exited = code => finish(Error(`sleeper exited before ready ${code}`));
          const cancelled = () => finish(Error('PLUGIN_UPDATE_INTERRUPTED'));
          const timer = setTimeout(() => finish(Error('SLEEPER_READY_TIMEOUT')), 4000);
          child.stdout.on('data', data);
          child.once('error', failure);
          child.once('exit', exited);
          signals.run.signal.addEventListener('abort', cancelled, { once: true });
          if (signals.run.signal.aborted) cancelled();
        });
        process.stdout.write(`HOLD ${child.pid}\n`);
        await waitForCancel();
        return { scenario, status: trialCancelled(signals) ? 'INTERRUPTED' : 'FAIL', error: null };
      }
      return { scenario, status: 'PASS', error: null };
    },
    cleanup: async ctx => {
      const reaped = await reapTrialChildren(ctx);
      return { errors: reaped.errors, reaped };
    },
  });
  process.stdout.write(`RESULT ${JSON.stringify({ ...result, started })}\n`);
  process.exitCode = result.overall === 'PASS' ? 0 : 2;
  }
} catch (error) {
  process.stdout.write(`RESULT ${JSON.stringify({ overall: 'FAIL', error: error.message, started })}\n`);
  process.exitCode = 2;
} finally {
  process.off('SIGINT', onInt);
  process.off('SIGTERM', onTerm);
  if (reportDirectory) await rm(reportDirectory, { recursive: true, force: true });
}
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await runFixture(process.argv[2]);
}
