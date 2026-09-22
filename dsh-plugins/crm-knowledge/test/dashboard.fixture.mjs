/** Synthetic HTTP fixture. Own ephemeral loopback port; no archive, credentials or model. */
import { createServer } from 'node:http';
import { once } from 'node:events';

export const request = { start_date: '2026-01-01', end_date: '2026-01-02' };
export const overview = { metric_type: 'GSV', date_range: { start: request.start_date, end: request.end_date, cutoff: null }, amount: 100.31, avg_order_value: 999, member_premium: 888, new_users: 3, old_users: 7, new_user_amount: 20.1, old_user_amount: 80.21, new_user_ratio: 0.2004, old_user_ratio: 0.7996 };
export const trend = { metric_type: 'GSV', dates: ['2026-01-01', '2026-01-02'], amounts: [30.1, 70.21] };
export const SYNTHETIC_TOKEN = 'fixture-only-token-000000000000';
export const SYNTHETIC_PASSWORD = 'fixture-password';

export async function serveDashboard(t, custom) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), excluded: url.searchParams.getAll('exclude_channels'), method: req.method, authenticated: req.headers.authorization === `Bearer ${SYNTHETIC_TOKEN}` });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/v1/auth/login') {
      if (custom?.(url, req, res)) return;
      let raw = ''; for await (const chunk of req) raw += chunk;
      let input; try { input = JSON.parse(raw); } catch { res.statusCode = 400; res.end('{}'); return; }
      if (input.username !== 'fixture-user' || input.password !== SYNTHETIC_PASSWORD) { res.statusCode = 401; res.end('{}'); return; }
      res.end(JSON.stringify({ username: 'fixture-user', token: SYNTHETIC_TOKEN, is_admin: false })); return;
    }
    if (req.headers.authorization !== `Bearer ${SYNTHETIC_TOKEN}`) { res.statusCode = 401; res.end('{}'); return; }
    if (custom?.(url, req, res)) return;
    if (url.pathname === '/api/v1/auth/me') res.end(JSON.stringify({ username: 'fixture-user', is_admin: false }));
    else if (url.pathname === '/api/v1/metrics/overview') res.end(JSON.stringify(overview));
    else if (url.pathname === '/api/v1/metrics/trend') res.end(JSON.stringify(trend));
    else if (url.pathname === '/api/v1/metrics/cutoff') res.end(JSON.stringify({ cutoff_date: '2026-07-10' }));
    else { res.statusCode = 404; res.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { calls, server, binding: {
    baseUrl: `http://127.0.0.1:${server.address().port}`, token: SYNTHETIC_TOKEN,
    sessionId: 'fixture-session', username: 'fixture-user', dataKind: 'synthetic',
  } };
}
