import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

const SENSITIVE = /token|secret|password|cookie|authorization|api[_-]?key|session|csrf/i;
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
async function locked(path, fn) {
  const lock = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true });
  try { await mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw new Error('AUTH_BUSY'); throw e; }
  try { return await fn(); } finally { await rm(lock, { recursive: true, force: true }); }
}
async function load(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { schema_version: 'one-time-token/v1', tokens: {}, rate_limits: {} }; throw e; } }
async function save(path, data) {
  const temp = `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try {
    await rename(temp, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) { await rm(temp, { force: true }); throw error; }
}

export async function issueToken(path, { ttlSeconds = 300, now = Date.now() } = {}) {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) throw new Error('TOKEN_TTL_INVALID');
  const raw = randomBytes(32).toString('base64url');
  await locked(path, async () => { const db = await load(path); db.tokens[hash(raw)] = { expires_at: now + ttlSeconds * 1000, consumed: false }; await save(path, db); });
  return raw;
}

export async function consumeToken(path, raw, { origin, allowedOrigins = [], rateKey = null, maxAttempts = 5, windowMs = 60_000, secure = true, now = Date.now() } = {}) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new Error('AUTH_INVALID_TOKEN');
  if (secure === false && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) throw new Error('AUTH_INSECURE_COOKIE_REJECTED');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || !Number.isInteger(windowMs) || windowMs < 1) throw new Error('AUTH_RATE_CONFIG_INVALID');
  return locked(path, async () => {
    const db = await load(path);
    // Never make rate limiting opt-in. The origin is the safe fallback key;
    // an HTTP adapter should also supply a bounded client identity as rateKey.
    const bucketKey = hash(String(rateKey ?? origin ?? 'anonymous'));
    const bucket = db.rate_limits[bucketKey] ?? { started_at: now, count: 0 };
    if (now - bucket.started_at >= windowMs) { bucket.started_at = now; bucket.count = 0; }
    if (bucket.count >= maxAttempts) throw new Error('AUTH_RATE_LIMIT');
    bucket.count += 1; db.rate_limits[bucketKey] = bucket;
    if (typeof origin !== 'string' || !origin || !allowedOrigins.includes(origin)) {
      await save(path, db);
      throw new Error('AUTH_ORIGIN_REJECTED');
    }
    const key = hash(raw); const record = db.tokens[key];
    if (!record || record.consumed || record.expires_at <= now) {
      await save(path, db);
      throw new Error(record?.consumed ? 'AUTH_TOKEN_REPLAY' : 'AUTH_TOKEN_EXPIRED_OR_INVALID');
    }
    record.consumed = true; record.consumed_at = now;
    const session = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    db.sessions ??= {};
    db.sessions[hash(session)] = { created_at: now, expires_at: now + 8 * 60 * 60_000, origin, csrf_hash: hash(csrf) };
    await save(path, db);
    return { authenticated: true, cookie: cookieHeader(session, { secure }), csrf };
  });
}

export function cookieHeader(value, { secure = true, sameSite = 'Lax' } = {}) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('AUTH_SESSION_INVALID');
  if (!['Lax', 'Strict'].includes(sameSite)) throw new Error('AUTH_COOKIE_POLICY_INVALID');
  return `dsh_session=${value}; Path=/; HttpOnly; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
}
export function csrfCookieHeader(value, { secure = true } = {}) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('AUTH_CSRF_INVALID');
  return `dsh_csrf=${value}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}
export async function authenticateSession(path, session, { origin, allowedOrigins = [], method = 'GET', csrf = null, now = Date.now() } = {}) {
  if (typeof session !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session)) throw new Error('AUTH_SESSION_INVALID');
  if (!origin || !allowedOrigins.includes(origin)) throw new Error('AUTH_ORIGIN_REJECTED');
  const db = await load(path);
  const record = db.sessions?.[hash(session)];
  if (!record || !Number.isFinite(record.expires_at) || record.expires_at <= now || record.origin !== origin) throw new Error('AUTH_SESSION_EXPIRED_OR_INVALID');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf) || typeof record.csrf_hash !== 'string' || !constantTimeEqual(hash(csrf), record.csrf_hash)) throw new Error('AUTH_CSRF_REJECTED');
  }
  return { authenticated: true };
}
export function csrfAllowed({ method, origin, allowedOrigins = [], csrfValid = false }) { return Boolean(origin && allowedOrigins.includes(origin) && (['GET', 'HEAD', 'OPTIONS'].includes(method) || csrfValid === true)); }
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE.test(key) ? '[REDACTED]' : redact(item)]));
  if (typeof value === 'string') return value
    .replace(/([?&](?:token|session|csrf|authorization)=)[^&#\s]+/ig, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9_-]{32,}\b/ig, 'Bearer [REDACTED]');
  return value;
}
export function constantTimeEqual(left, right) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }

export async function tokenExchangeResponse(path, raw, options = {}) {
  const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };
  if (options.method !== 'POST') return { status: 405, headers: { ...headers, allow: 'POST' }, body: 'Method Not Allowed' };
  try {
    const result = await consumeToken(path, raw, options);
    return { status: 303, headers: { ...headers, location: '/', 'set-cookie': [result.cookie, csrfCookieHeader(result.csrf, { secure: options.secure !== false })] }, body: '' };
  } catch {
    return { status: 401, headers, body: 'Unauthorized' };
  }
}
