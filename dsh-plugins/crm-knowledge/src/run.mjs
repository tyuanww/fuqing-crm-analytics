import { spawnSync, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = resolve(root, 'scripts/crm-calibration/query_crm_metrics_v1.py');

export const METRIC_VERSION = 'crm-metrics/v1';
export const QUERY_IDS = ['sales_window_summary', 'existing_customer_repurchase', 'sample_followup'];

export function runCrmCli(payload, python = process.env.CRM_METRICS_PYTHON || 'python3') {
  const result = spawnSync(python, [cli, '--stdin'], {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 30000,
    env: childEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `crm metrics cli exit ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

export function queryCrmMetrics(request) {
  if (request?.contains_real_data) throw new Error('candidate tools reject real data');
  if (request?.metric_version !== METRIC_VERSION) throw new Error('metric_version must be crm-metrics/v1');
  if (!QUERY_IDS.includes(request?.query_id)) throw new Error('unsupported query_id');
  return runCrmCli({ action: 'query', request });
}

export function explainCrm(topic) {
  return runCrmCli({ action: 'explain', topic });
}

export function listCapabilities() {
  return runCrmCli({ action: 'capabilities' });
}

function childEnvironment() {
  const env = { PYTHONPATH: root, PYTHON_DOTENV_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1' };
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'LANG']) if (process.env[name]) env[name] = process.env[name];
  return env;
}

export async function runCrmCliAsync(payload, signal, python = process.env.CRM_METRICS_PYTHON || 'python3') {
  signal?.throwIfAborted();
  return new Promise((resolveValue, reject) => {
    const child = spawn(python, [cli, '--stdin'], {
      cwd: root, env: childEnvironment(), signal, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', bytes = 0, exceeded = false;
    const collect = (chunk, error) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) { exceeded = true; child.kill(); return; }
      if (error) stderr += chunk; else stdout += chunk;
    };
    child.stdout.on('data', chunk => collect(chunk, false));
    child.stderr.on('data', chunk => collect(chunk, true));
    child.on('error', reject);
    child.on('close', code => {
      if (exceeded || code !== 0) { reject(new Error(exceeded ? 'CRM output exceeded limit' : stderr || `CRM process exit ${code}`)); return; }
      try { resolveValue(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify(payload));
  });
}
