/**
 * Incremental runtime identity sidecar for free HTML pages.
 *
 * No DOM dependency. A host may pass a real MutationObserver; tests can pass
 * an observer-shaped factory. The page HTML is never annotated or serialised.
 *
 * Observer callbacks are coalesced onto one microtask. `suppress()` disconnects
 * the observer around the host's own DOM writes and drops callbacks that arrive
 * while that write is in progress, so applying an update cannot re-enter the
 * batch handler. Over-budget batches disconnect the observer and leave already
 * bound identities readable.
 */
import {
  NODE_GRAPH_BUDGETS,
  createDynamicInstanceRef,
  createTemplateInstanceRef,
  createTemporaryNodeRef,
} from '../source-index/node-graph.mjs';

export const RUNTIME_IDENTITY_SCHEMA_VERSION = 'free-page-runtime-identity/v1';
export { NODE_GRAPH_BUDGETS };

function idOf(ref) {
  if (typeof ref === 'string') return ref;
  if (!ref || typeof ref !== 'object') return null;
  if (typeof ref.identity === 'string') return ref.identity;
  if (typeof ref.node_ref === 'string') return ref.node_ref;
  return ref.node_ref?.identity || null;
}

function frozen(value) {
  return Object.freeze(value);
}

function queueTask(fn) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function resolveBudgets(override) {
  const next = { ...NODE_GRAPH_BUDGETS };
  if (!override || typeof override !== 'object') return next;
  for (const key of Object.keys(NODE_GRAPH_BUDGETS)) {
    if (Number.isFinite(override[key]) && override[key] >= 0) next[key] = override[key];
  }
  return next;
}

function isNode(value) {
  return Boolean(value) && (typeof value === 'object' || typeof value === 'function');
}

/**
 * Create an identity registry. `sourceRef` is normally produced by the
 * source-index sidecar; template/dynamic/temporary refs are generated here
 * and, when a graph is attached, recorded into that sidecar.
 */
export function createRuntimeIdentityStore({
  sessionId = 'runtime',
  observerFactory,
  onBatch,
  graph = null,
  now,
  budgets: budgetOverride,
} = {}) {
  const budgets = resolveBudgets(budgetOverride);
  const clock = typeof now === 'function' ? now : defaultNow;
  const byNode = new WeakMap();
  const byIdentity = new Map();
  const childrenOf = new Map();
  const misses = new Set();
  const pending = [];
  let temporaryCounter = 0;
  let observer = null;
  let factory = null;
  let observedTarget = null;
  let observedOptions = null;
  let observing = false;
  let scheduled = false;
  let disposed = false;
  let applying = 0;
  let suppressDepth = 0;
  let degraded = Boolean(graph?.budget?.degraded || graph?.degraded);
  let degradeReason = degraded ? (graph?.budget?.reasons?.[0] || 'BUILD_BUDGET') : null;

  function disposedRecord(refOrId) {
    const identity = idOf(refOrId);
    return frozen({
      schema_version: RUNTIME_IDENTITY_SCHEMA_VERSION,
      identity,
      node_ref: refOrId,
      node: null,
      state: 'disposed',
    });
  }

  function missingRecord(refOrId) {
    return frozen({
      schema_version: RUNTIME_IDENTITY_SCHEMA_VERSION,
      identity: idOf(refOrId),
      node_ref: refOrId,
      node: null,
      state: 'missing',
    });
  }

  function present(record) {
    if (!record) return null;
    if (record.state === 'deleted') return frozen({ ...record, node: null, state: 'deleted' });
    if (record.state === 'connected') return frozen({ ...record, state: 'resolved' });
    return record;
  }

  function degrade(reason) {
    if (disposed || degraded) return;
    degraded = true;
    degradeReason = reason;
    disconnect();
  }

  function linkParent(record) {
    const parent = record.metadata?.parent_identity;
    if (!parent) return;
    let kids = childrenOf.get(parent);
    if (!kids) {
      kids = new Set();
      childrenOf.set(parent, kids);
    }
    kids.add(record.identity);
  }

  function unlinkParent(record) {
    const parent = record.metadata?.parent_identity;
    const kids = parent ? childrenOf.get(parent) : null;
    if (kids) kids.delete(record.identity);
  }

  function bind(node, ref, metadata = {}) {
    if (disposed) return disposedRecord(ref);
    if (!isNode(node)) throw new TypeError('runtime node must be an object');
    const identity = idOf(ref);
    if (!identity) throw new TypeError('node ref requires identity');
    const known = byNode.get(node);
    if (known) {
      if (known.identity !== identity) throw new Error('runtime node already has another identity');
      return known;
    }
    const previous = byIdentity.get(identity);
    if (previous?.node && previous.node !== node) {
      byNode.delete(previous.node);
      unlinkParent(previous);
    }
    misses.delete(identity);
    graph?.revive?.(identity);
    const record = frozen({
      schema_version: RUNTIME_IDENTITY_SCHEMA_VERSION,
      identity,
      node_ref: ref,
      node,
      metadata: frozen({ ...metadata }),
      state: 'connected',
      generation: previous ? (previous.generation || 0) + 1 : 0,
    });
    byNode.set(node, record);
    byIdentity.set(identity, record);
    linkParent(record);
    return record;
  }

  function ensure(node, ref, metadata) {
    if (disposed) return disposedRecord(ref);
    const known = isNode(node) ? byNode.get(node) : null;
    if (known) {
      const identity = idOf(ref);
      if (identity && known.identity !== identity) throw new Error('runtime node already has another identity');
      return known;
    }
    return bind(node, ref, metadata);
  }

  function resolve(refOrId) {
    const identity = idOf(refOrId);
    if (!identity) return null;
    if (disposed) return disposedRecord(refOrId);
    return present(byIdentity.get(identity) || null);
  }

  /**
   * Resolve one identity without scanning the document. A deleted identity
   * stays deleted; the resolver is not called. A miss is cached until a later
   * explicit bind.
   */
  async function resolveLazy(refOrId, resolver) {
    const identity = idOf(refOrId);
    if (!identity) return null;
    if (disposed) return disposedRecord(refOrId);
    const known = byIdentity.get(identity);
    if (known?.state === 'deleted') return present(known);
    if (known?.state === 'connected') return present(known);
    if (misses.has(identity) || typeof resolver !== 'function') return missingRecord(refOrId);
    let result;
    try {
      result = await resolver(refOrId, identity);
    } catch {
      misses.add(identity);
      return missingRecord(refOrId);
    }
    const hasNodeField = Boolean(result) && typeof result === 'object'
      && Object.prototype.hasOwnProperty.call(result, 'node');
    const node = hasNodeField ? result.node : result;
    if (!isNode(node)) {
      misses.add(identity);
      return missingRecord(refOrId);
    }
    const ref = typeof refOrId === 'string' ? { identity: refOrId, node_ref: refOrId, kind: 'source' } : refOrId;
    return bind(node, ref, hasNodeField ? result.metadata || {} : {});
  }

  function sourceRef(node, ref, metadata) {
    return ensure(node, ref, metadata);
  }

  function templateRef(node, template, instanceKey, metadata) {
    if (disposed) return disposedRecord(template);
    const ref = graph?.templateRef?.(template, instanceKey)
      || createTemplateInstanceRef({ templateRef: template, instanceKey });
    return ensure(node, ref, metadata);
  }

  function dynamicRef(node, dynamic, instanceKey, metadata) {
    if (disposed) return disposedRecord(dynamic);
    const ref = graph?.dynamicRef?.(dynamic, instanceKey)
      || createDynamicInstanceRef({ dynamicRef: dynamic, instanceKey });
    return ensure(node, ref, metadata);
  }

  function temporaryRef(node, key, metadata) {
    if (disposed) return disposedRecord(key);
    const ref = graph?.temporaryRef?.(key, { sessionId })
      || createTemporaryNodeRef({
        sessionId,
        key,
        seed: `${sessionId}:${key ?? temporaryCounter}`,
        counter: key == null ? temporaryCounter++ : 0,
      });
    return ensure(node, ref, metadata);
  }

  function identityFrom(nodeOrRef) {
    if (!nodeOrRef) return null;
    if (typeof nodeOrRef === 'string') return nodeOrRef;
    const bound = isNode(nodeOrRef) ? byNode.get(nodeOrRef) : null;
    if (bound) return bound.identity;
    return idOf(nodeOrRef);
  }

  function markDeleted(nodeOrRef) {
    const start = identityFrom(nodeOrRef);
    if (!start) return null;
    if (disposed) return disposedRecord(nodeOrRef);
    const queue = [start];
    const seen = new Set();
    const deleted = [];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (seen.size > budgets.maxFanout) {
        degrade('FANOUT_BUDGET');
        break;
      }
      const record = byIdentity.get(id);
      if (record && record.state !== 'deleted') {
        const next = frozen({ ...record, state: 'deleted', node: null });
        byIdentity.set(id, next);
        if (record.node) byNode.delete(record.node);
        deleted.push(id);
        graph?.markDeleted?.(id);
      }
      const kids = childrenOf.get(id);
      if (kids) {
        for (const child of kids) queue.push(child);
      }
    }
    return frozen(deleted);
  }

  function enqueue(records) {
    if (disposed || applying > 0 || !observing) return;
    const list = Array.isArray(records) ? records : [records];
    for (const record of list) {
      if (!record) continue;
      if (pending.length >= budgets.maxBatchRecords) {
        degrade('BATCH_LIMIT');
        break;
      }
      pending.push(record);
    }
    if (scheduled || pending.length === 0) return;
    scheduled = true;
    queueTask(flush);
  }

  function flush() {
    scheduled = false;
    if (disposed || pending.length === 0) return null;
    const records = pending.splice(0, pending.length);
    const added = [];
    const removed = [];
    for (const record of records) {
      if (record.addedNodes) added.push(...Array.from(record.addedNodes));
      if (record.removedNodes) removed.push(...Array.from(record.removedNodes));
    }
    const deleted = [];
    for (const node of removed) {
      const ids = markDeleted(node);
      if (ids) deleted.push(...ids);
    }
    const batch = frozen({
      schema_version: RUNTIME_IDENTITY_SCHEMA_VERSION,
      added: frozen(added),
      removed: frozen(removed),
      deleted: frozen(deleted),
      records: frozen(records),
    });
    const started = clock();
    suppress(() => {
      onBatch?.(batch);
    });
    if (!degraded && clock() - started > budgets.batchMs) degrade('OBSERVER_BUDGET');
    return batch;
  }

  function reconnect() {
    if (!observing || disposed || degraded || !observedTarget || typeof factory !== 'function') return;
    try {
      observer = new factory(enqueue);
      observer.observe(observedTarget, observedOptions);
    } catch {
      degrade('OBSERVER_FAILED');
    }
  }

  /**
   * Run `fn` without letting the DOM writes it makes re-enter the observer.
   * Pending records queued before the write are preserved. Real observers are
   * disconnected for the duration because they deliver records only after the
   * current turn; the `applying` flag covers a callback invoked inline.
   */
  function suppress(fn) {
    if (disposed) return undefined;
    const top = suppressDepth === 0;
    const pendingRecords = top && observer && typeof observer.takeRecords === 'function'
      ? observer.takeRecords()
      : [];
    if (top && observer && typeof observer.disconnect === 'function') observer.disconnect();
    suppressDepth += 1;
    applying += 1;
    try {
      if (pendingRecords && pendingRecords.length > 0) {
        applying -= 1;
        enqueue(pendingRecords);
        applying += 1;
      }
      return fn?.();
    } finally {
      applying -= 1;
      suppressDepth -= 1;
      if (top) reconnect();
    }
  }

  function observe(target, options = { childList: true, subtree: true, attributes: true, characterData: true }) {
    if (disposed) return { ok: false, reason: 'DISPOSED', degraded: true };
    if (degraded) return { ok: false, reason: degradeReason, degraded: true };
    const Factory = observerFactory === undefined ? globalThis.MutationObserver : observerFactory;
    if (typeof Factory !== 'function') {
      return { ok: false, reason: 'MUTATION_OBSERVER_UNAVAILABLE', degraded: true };
    }
    disconnect();
    factory = Factory;
    observedTarget = target;
    observedOptions = options;
    try {
      observer = new Factory(enqueue);
      observer.observe(target, options);
    } catch {
      observer = null;
      return { ok: false, reason: 'OBSERVER_FAILED', degraded: true };
    }
    observing = true;
    return { ok: true, observer };
  }

  function disconnect() {
    observing = false;
    try {
      observer?.disconnect?.();
    } catch {
      /* observer already dead */
    }
    observer = null;
  }

  function dispose() {
    disconnect();
    disposed = true;
    pending.length = 0;
    byIdentity.clear();
    childrenOf.clear();
    misses.clear();
    observedTarget = null;
  }

  return {
    register: bind,
    source: sourceRef,
    template: templateRef,
    dynamic: dynamicRef,
    temporary: temporaryRef,
    sourceRef,
    templateRef,
    dynamicRef,
    temporaryRef,
    resolve,
    resolveLazy,
    observe,
    disconnect,
    flush,
    dispose,
    suppress,
    markDeleted,
    toSidecar() {
      return graph?.toSidecar?.() || null;
    },
    get size() { return byIdentity.size; },
    get disposed() { return disposed; },
    get degraded() { return degraded; },
    get degradeReason() { return degradeReason; },
  };
}

/** Convenience alias for callers that think in terms of NodeRef resolution. */
export const createNodeIdentityStore = createRuntimeIdentityStore;
