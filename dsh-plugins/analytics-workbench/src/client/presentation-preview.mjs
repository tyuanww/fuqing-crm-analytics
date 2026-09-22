/**
 * Preview a direct text edit as a presentation overlay.
 * The page package html/css/js strings are left unchanged.
 * The sidecar flag selects the node graph; off uses the source index.
 */
import { sha256Hex } from '../free-page/hash.mjs';
import { buildFormalEditOperation } from '../free-page/edit/formal-operation.mjs';
import { previewStructuredPatch } from '../free-page/patch/engine.mjs';
import { openSidecarGraph, readSidecarFlag } from '../free-page/runtime/sidecar-flag.mjs';
import { buildSourceIndex } from '../free-page/source-index/index.mjs';
import { byteRegionHash, packageSourceHash } from '../free-page/source-index/node-graph.mjs';

function projectFromGraph(pagePackage, pageId, nodeId, flag, env, channel) {
  const opened = openSidecarGraph(pagePackage, { page_id: pageId, flag, env });
  if (!opened.ok) return { ok: false, code: opened.code };
  for (const record of opened.graph.node_list) {
    const projected = opened.graph.toEditNodeRef(record, { channel });
    if (projected.ok && projected.value.node_id === nodeId && projected.value.source_range) {
      return { ok: true, node: projected.value };
    }
  }
  return { ok: false, code: 'MAPPING_STALE' };
}

function projectFromSourceIndex(pagePackage, pageId, nodeId) {
  let index;
  try {
    index = buildSourceIndex(pagePackage);
  } catch {
    return { ok: false, code: 'MAPPING_STALE' };
  }
  const node = index.nodes?.[nodeId];
  if (!node?.html_range) return { ok: false, code: 'MAPPING_STALE' };
  const outer = node.html_range.outer_text ?? pagePackage.html.slice(node.html_range.start, node.html_range.end);
  return {
    ok: true,
    node: {
      page_id: pageId,
      node_id: node.node_id,
      kind: node.kind,
      selector: node.selector ?? null,
      source_range: { start: node.html_range.start, end: node.html_range.end },
      mapping_token: node.mapping_token,
      source_hash: packageSourceHash(pagePackage),
      region_hash: byteRegionHash(outer),
    },
  };
}

export function previewNodeEdit({
  pagePackage, pageId, version, nodeId, overlays = {}, binding = { bindings: [], result_refs: [] },
  flag, env, channel = 'presentation', action = 'update', payload, keyPrefix = 'edit',
} = {}) {
  if (!pagePackage || typeof pagePackage.html !== 'string' || !nodeId) return { ok: false, code: 'INVALID_EDIT' };
  const mode = readSidecarFlag(env, flag);
  const projected = mode === 'off'
    ? projectFromSourceIndex(pagePackage, pageId, nodeId)
    : projectFromGraph(pagePackage, pageId, nodeId, mode, env, channel);
  if (!projected.ok) return projected;
  const digest = sha256Hex(typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})).slice(0, 16);
  const idempotencyKey = `${keyPrefix}_${pageId}_${version}_${nodeId}_${digest}`;
  const operation = buildFormalEditOperation({
    pageId: projected.node.page_id,
    node: projected.node,
    channel,
    action,
    payload,
    idempotencyKey,
    baseVersion: version,
    operationId: `op_${keyPrefix}_${nodeId}`.slice(0, 128),
  });
  const caps = channel === 'logic'
    ? ['edit:logic']
    : channel === 'source'
      ? ['edit:presentation', 'edit:source']
      : ['edit:presentation', 'edit:source'];
  const result = previewStructuredPatch({
    pagePackage: { ...pagePackage, presentation_overlays: overlays },
    operation,
    capabilities: caps,
    headVersion: version,
    selectedNodeId: projected.node.node_id,
    binding,
    flag: mode,
    env,
  });
  if (!result.ok) return { ok: false, code: result.error?.code ?? 'INVALID_EDIT' };
  return {
    ok: true,
    node_id: projected.node.node_id,
    kind: projected.node.kind,
    channel,
    overlay: result.preview.overlay,
    package: result.preview.package,
    source_bytes_unchanged: result.preview.source_bytes_unchanged === true,
    idempotency_key: idempotencyKey,
    html: pagePackage.html,
  };
}

export function previewDirectText(input = {}) {
  return previewNodeEdit({
    ...input,
    channel: 'presentation',
    action: 'update',
    payload: { text: input.text },
    keyPrefix: 'text',
  });
}
