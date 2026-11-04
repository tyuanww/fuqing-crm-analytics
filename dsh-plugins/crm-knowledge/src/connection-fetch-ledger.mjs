/**
 * One ledger owns every Connection Fetch route this business plugin registers.
 *
 * The rc.5 owner returns an asynchronous disposer from
 * `ctx.connection.fetch.register()` (`packages/client/connection/src/rpc.ts:169-181`).
 * A host that drops it leaves the exact route mounted after the plugin unloads,
 * so an HMR pass or a second Loader row collides with its own predecessor. This
 * module is the one place that calls `register`, keeps every returned disposer,
 * and owns the teardown order for the whole ledger.
 *
 * Dispose ordering is explicit and LIFO: routes are registered in sequence and
 * unwound in reverse sequence, the same order cordis applies to effect
 * disposers (`vendor/cordis/src/fiber.ts:73-78,415-418`), so the ledger and the
 * framework agree no matter which one unwinds first. `release(owner)` unwinds
 * one owner tag (a child plugin's own effect); `close()` unwinds the ledger
 * (the entry that created it). Both are idempotent, both await the pending
 * registration of routes they release, and both aggregate failures instead of
 * hiding them.
 */

const API_ROOT = '/api';
const FETCH_METHODS = new Set(['GET', 'HEAD', 'POST']);
const REQUEST_BODIES = new Set(['buffered', 'streaming']);

/** Validate one route before the host sees it; a bad shape must fail the load, not the request. */
function normalizeRoute(owner, route) {
  if (typeof owner !== 'string' || owner.length === 0) throw new TypeError('connection.fetch ledger requires an owner tag');
  if (!route || typeof route !== 'object') throw new TypeError(`${owner}: route must be an object`);
  if (typeof route.fetch !== 'function') throw new TypeError(`${owner}: route.fetch must be a function`);
  const path = route.path;
  if (typeof path !== 'string' || (path !== API_ROOT && !path.startsWith(`${API_ROOT}/`))) {
    throw new TypeError(`${owner}: route path must live below ${API_ROOT}: ${String(path)}`);
  }
  if (/[\s?#]/.test(path)) throw new TypeError(`${owner}: route path must not carry whitespace, query or hash: ${path}`);
  if (!Array.isArray(route.methods) || route.methods.length === 0) throw new TypeError(`${owner}: route.methods must be a non-empty array`);
  const methods = [];
  for (const method of route.methods) {
    if (!FETCH_METHODS.has(method)) throw new TypeError(`${owner}: unsupported fetch method ${String(method)}`);
    if (methods.includes(method)) throw new TypeError(`${owner}: duplicate fetch method ${method}`);
    methods.push(method);
  }
  if (!REQUEST_BODIES.has(route.requestBody)) throw new TypeError(`${owner}: requestBody must be buffered or streaming`);
  return { path, methods, requestBody: route.requestBody };
}

function aggregate(errors) {
  if (errors.length === 1) return errors[0];
  return new AggregateError(errors, 'connection.fetch ledger could not release every owned route');
}

export class ConnectionFetchLedger {
  #ctx;
  #label;
  #entries = [];
  #sequence = 0;
  #closeTask;

  constructor(ctx, { label = 'connection.fetch' } = {}) {
    if (!ctx?.connection?.fetch?.register) throw new Error('ConnectionFetchLedger requires the connection.fetch service');
    this.#ctx = ctx;
    this.#label = label;
    // The ledger outlives every child plugin row, so the entry that created it
    // is the last one to release; a child releases only its own tag.
    ctx.effect(() => () => this.close(), `${label}: release owned routes`);
  }

  /**
   * Register one exact route under `owner`.
   * @returns a promise that settles when the host registration settles; it
   * never rejects because a registration failure is recorded on the entry and
   * raised again during release.
   */
  own(owner, route) {
    if (this.#closeTask) throw new Error(`${this.#label}: cannot own ${String(route?.path)} after close`);
    const spec = normalizeRoute(owner, route);
    const duplicate = this.#entries.find(entry => entry.owner === owner
      && entry.path === spec.path && entry.state !== 'released');
    if (duplicate) throw new Error(`${this.#label}: ${owner} already owns ${spec.path}`);
    const entry = {
      seq: ++this.#sequence,
      owner,
      path: spec.path,
      methods: spec.methods,
      requestBody: spec.requestBody,
      state: 'pending',
      dispose: undefined,
      error: undefined,
      registration: undefined,
    };
    this.#entries.push(entry);
    // The async body runs synchronously up to the first `await`, so the host
    // registration still starts inside `own()` exactly as the direct call did.
    entry.registration = (async () => {
      const dispose = await this.#ctx.connection.fetch.register({
        path: spec.path, methods: spec.methods, requestBody: spec.requestBody, fetch: route.fetch,
      });
      if (typeof dispose !== 'function') throw new TypeError(`${this.#label}: register(${spec.path}) returned no disposer`);
      entry.dispose = dispose;
      if (entry.state === 'releasing') {
        // A release already started while this registration was in flight;
        // dispose here exactly once and let #releaseEntry observe the result.
        await dispose();
        entry.state = 'released';
        return;
      }
      entry.state = 'live';
    })().catch((error) => {
      entry.state = 'failed';
      entry.error = error;
      // Never silent: the owning fiber sees the failure as it happens, and the
      // same error is raised again when the ledger releases.
      try { this.#ctx.logger?.error?.(error); } catch { /* logging must not mask the route failure */ }
    });
    return entry.registration;
  }

  /** Release every route owned by one tag, newest first. */
  async release(owner) {
    const errors = [];
    for (const entry of [...this.#entries].reverse()) {
      if (entry.owner !== owner) continue;
      await this.#releaseEntry(entry, errors);
    }
    if (errors.length) throw aggregate(errors);
  }

  /** Release the whole ledger, newest first. Idempotent and awaitable more than once. */
  close() {
    this.#closeTask ??= (async () => {
      const errors = [];
      for (const entry of [...this.#entries].reverse()) await this.#releaseEntry(entry, errors);
      if (errors.length) throw aggregate(errors);
    })();
    return this.#closeTask;
  }

  /** Diagnostic view: no handler reference leaves the ledger. */
  describe() {
    return this.#entries.map(entry => ({
      seq: entry.seq,
      owner: entry.owner,
      path: entry.path,
      methods: [...entry.methods],
      requestBody: entry.requestBody,
      state: entry.state,
      error: entry.error instanceof Error ? entry.error.message : undefined,
    }));
  }

  async #releaseEntry(entry, errors) {
    if (entry.state === 'released') return;
    entry.state = 'releasing';
    await entry.registration;
    // The registration path may have disposed this entry itself, or recorded a
    // failure; either way the entry is settled now.
    if (entry.state === 'released') return;
    if (entry.error) {
      errors.push(entry.error);
      return;
    }
    if (typeof entry.dispose !== 'function') {
      errors.push(new Error(`${this.#label}: ${entry.owner} route ${entry.path} never produced a disposer`));
      return;
    }
    try {
      await entry.dispose();
      entry.state = 'released';
    } catch (error) {
      errors.push(error);
    }
  }
}
