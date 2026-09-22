/**
 * Rollout gate for the production node graph.
 * This does not index pages itself.
 */
import { buildNodeGraph } from '../source-index/node-graph.mjs';

export const SIDECAR_FLAG = 'FQ_FREE_PAGE_SIDECAR_INDEX';

export function readSidecarFlag(env = globalThis.process?.env ?? {}, override) {
  const host = globalThis[SIDECAR_FLAG] ?? globalThis[`__${SIDECAR_FLAG}__`];
  const raw = override ?? env?.[SIDECAR_FLAG] ?? host ?? 'off';
  if (raw === 'on' || raw === 'smoke') return raw;
  return 'off';
}

export function openSidecarGraph(pagePackage, options = {}) {
  const mode = readSidecarFlag(options.env, options.flag);
  if (mode === 'off') {
    return Object.freeze({ ok: false, code: 'FLAG_DISABLED', mode, graph: null });
  }
  const before = pagePackage?.html;
  const graph = buildNodeGraph(pagePackage, options);
  return Object.freeze({
    ok: true,
    mode,
    graph,
    metrics: Object.freeze({
      node_count: graph.budget.node_count,
      build_ms: graph.budget.elapsed_ms,
      degraded: graph.budget.degraded,
      source_bytes_unchanged: pagePackage?.html === before,
    }),
  });
}
