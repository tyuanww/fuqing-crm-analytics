import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveDashboard } from './dashboard.fixture.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
export const library = JSON.parse(execFileSync(process.env.CRM_METRICS_PYTHON ?? 'python3', [fileURLToPath(new URL('./crm-assets.fixture.py', import.meta.url)), '--assets'], {
  cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, PYTHONPATH: root, PYTHON_DOTENV_DISABLED: '1' },
}));
export const snapshot = library.snapshots[0];
export const analysis = library.analyses[0];
export const reference = library.references[0];
export async function serveAssets(t, override) {
  const writes = [];
  const fixture = await serveDashboard(t, (url, req, res) => {
    if (override?.(url, req, res)) return true;
    const value = { 'dashboard-snapshots': snapshot, 'crm-library': library, 'crm-analyses': analysis, 'crm-cockpit-references': reference }[url.pathname.split('/').at(-1)];
    if (!value) return false;
    void (async () => {
      let text = ''; for await (const chunk of req) text += chunk;
      if (text) writes.push({ body: JSON.parse(text), key: req.headers['idempotency-key'] });
      res.end(JSON.stringify(value));
    })();
    return true;
  });
  return { ...fixture, writes };
}
