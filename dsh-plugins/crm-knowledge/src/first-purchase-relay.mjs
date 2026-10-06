/** Finite, owner-configured loopback transport. No arbitrary URL, headers, retry or credential export. */
import { request } from 'node:http';
import { dashboardOrigin } from './dashboard.mjs';

const paths = Object.freeze({ inspect: '/save-results/inspect', save: '/save-receipts', reconcile: '/save-receipts/reconcile' });
export function createFirstPurchaseRelay(origin) {
  const base = origin === undefined ? null : dashboardOrigin(origin);
  return Object.freeze({ configured: base !== null,
    async request(operation, body, key, token, signal) {
      if (!base || !Object.hasOwn(paths, operation) || typeof key !== 'string' || !/^[!-~]{1,200}$/.test(key)
        || typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(token)) throw new Error('FIRST_PURCHASE_RELAY_UNAVAILABLE');
      const bytes = Buffer.from(JSON.stringify(body));
      if (bytes.length > 8192) throw new Error('FIRST_PURCHASE_RELAY_INVALID_REQUEST');
      const timeout = AbortSignal.timeout(10000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      combined.throwIfAborted();
      return new Promise((resolve, reject) => {
        const fail = () => reject(new Error('FIRST_PURCHASE_RELAY_UNAVAILABLE'));
        const req = request(new URL('/api/v1/analytics-first-purchase' + paths[operation], base), {
          method: 'POST', signal: combined, maxHeaderSize: 16384,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            accept: 'application/json', 'content-length': bytes.length, 'idempotency-key': key },
        }, res => {
          if (!/^application\/json(?:\s*;|$)/i.test(res.headers['content-type'] ?? '')
            || res.headers['content-encoding'] || res.statusCode < 200 || (res.statusCode >= 300 && res.statusCode < 400) || res.statusCode >= 600) {
            res.destroy(); fail(); return;
          }
          const chunks = []; let size = 0;
          res.on('error', fail);
          res.on('data', chunk => {
            size += chunk.length;
            if (size > 512 * 1024) { res.destroy(); fail(); return; }
            chunks.push(chunk);
          });
          res.on('end', () => {
            try {
              const text = Buffer.concat(chunks).toString('utf8');
              // Never pass a provider's accidental credential echo to another plugin.
              const payload = JSON.parse(text);
              if (JSON.stringify(payload).includes(token)) throw new Error();
              resolve({ status: res.statusCode, payload });
            } catch { fail(); }
          });
        });
        req.on('error', fail);
        req.end(bytes);
      });
    },
  });
}
