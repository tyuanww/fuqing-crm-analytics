/**
 * Build one free-page-edit/v1 EditOperation from a T1 NodeRef.
 * UI verbs are converted by the caller. This module does not invent a second schema.
 */
const utf8Length = value => new TextEncoder().encode(value).byteLength;

export function buildFormalEditOperation({
  pageId,
  node,
  channel,
  action = 'update',
  payload = null,
  idempotencyKey,
  baseVersion,
  operationId,
  capabilities,
} = {}) {
  const sourceRange = node?.source_range
    ? { start: node.source_range.start, end: node.source_range.end }
    : null;
  const nodeRef = {
    page_id: node.page_id,
    node_id: node.node_id,
    kind: node.kind,
    selector: node.selector ?? null,
    source_range: sourceRange,
    mapping_token: node.mapping_token,
    source_hash: node.source_hash,
    region_hash: node.region_hash,
  };
  const operation = {
    schema_version: 'free-page-edit/v1',
    operation_id: operationId,
    channel,
    action,
    selected_scope: {
      page_id: pageId,
      node_id: node.node_id,
      ...(sourceRange ? { source_range: sourceRange } : {}),
    },
    capabilities: capabilities ?? [`edit:${channel}`],
    node: nodeRef,
    cas: {
      base_version: baseVersion,
      source_hash: node.source_hash,
      region_hash: node.region_hash,
      idempotency_key: idempotencyKey,
    },
    encoding: channel === 'presentation' ? 'overlay' : 'bytes',
    byte_length: channel === 'presentation' ? 0 : utf8Length(typeof payload === 'string' ? payload : ''),
  };
  if (channel === 'presentation') {
    if (action !== 'delete' && payload != null) operation.payload = payload;
  } else {
    operation.payload = payload;
    operation.splice = sourceRange;
    operation.expected_region_hash = node.region_hash;
  }
  return operation;
}
