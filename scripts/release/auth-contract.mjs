import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

const SENSITIVE = /token|secret|password|cookie|authorization|api[_-]?key/i;
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
async function locked(path, fn) {
  const lock = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true });
  try { await mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw new Error('AUTH_BUSY'); throw e; }
  try { return await fn(); } finally { await rm(lock, { recursive: true, force: true }); }
}
async function load(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { schema_version: 'one-time-token/v1', tokens: {}, rate_limits: {} }; throw e; } }
async function save(path, data) { const temp = `${path}.tmp-${process.pid}`; await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); await rename(temp, path); }

export async function issueToken(path, { ttlSeconds = 300, now = Date.now() } = {}) {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) throw new Error('TOKEN_TTL_INVALID');
  const raw = randomBytes(32).toString('base64url');
  await locked(path, async () => { const db = await load(path); db.tokens[hash(raw)] = { expires_at: now + ttlSeconds * 1000, consumed: false }; await save(path, db); });
  return raw;
}

export async function consumeToken(path, raw, { origin, allowedOrigins = [], rateKey = null, maxAttempts = 5, windowMs = 60_000, now = Date.now() } = {}) {
  if (typeof raw !== 'string' || raw.length < 32) throw new Error('AUTH_INVALID_TOKEN');
  if (typeof origin !== 'string' || !origin || !allowedOrigins.includes(origin)) throw new Error('AUTH_ORIGIN_REJECTED');
  return locked(path, async () => {
    const db = await load(path);
    if (rateKey) { const bucket = db.rate_limits[rateKey] ?? { started_at: now, count: 0 }; if (now - bucket.started_at >= windowMs) { bucket.started_at = now; bucket.count = 0; } if (bucket.count >= maxAttempts) { await save(path, db); throw new Error('AUTH_RATE_LIMIT'); } bucket.count += 1; db.rate_limits[rateKey] = bucket; await save(path, db); }
    const key = hash(raw); const record = db.tokens[key];
    if (!record || record.consumed || record.expires_at <= now) throw new Error(record?.consumed ? 'AUTH_TOKEN_REPLAY' : 'AUTH_TOKEN_EXPIRED_OR_INVALID');
    record.consumed = true; record.consumed_at = now; const session = randomBytes(24).toString('base64url'); db.sessions ??= {}; db.sessions[hash(session)] = { created_at: now, origin }; await save(path, db);
    return { authenticated: true, cookie: cookieHeader(session, { secure: true }) };
  });
}

export function cookieHeader(value, { secure = true, sameSite = 'Lax' } = {}) { return `dsh_session=${value}; Path=/; HttpOnly; SameSite=${sameSite}${secure ? '; Secure' : ''}`; }
export function csrfAllowed({ method, origin, allowedOrigins = [] }) { return ['GET', 'HEAD', 'OPTIONS'].includes(method) || Boolean(origin && allowedOrigins.includes(origin)); }
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE.test(key) ? '[REDACTED]' : redact(item)]));
  return value;
}
export function constantTimeEqual(left, right) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }

export async function tokenExchangeResponse(path, raw, options = {}) { try { const result = await consumeToken(path, raw, options); return { status: 303, headers: { location: '/', 'set-cookie': result.cookie, 'cache-control': 'no-store' }, body: '' }; } catch (error) { return { status: 401, headers: { 'cache-control': 'no-store' }, body: error.message.startsWith('AUTH_') ? 'Unauthorized' : 'Unauthorized' }; } }
