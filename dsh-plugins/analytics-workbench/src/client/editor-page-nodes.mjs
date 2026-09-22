/**
 * Cockpit page catalog.
 * FQ_FREE_PAGE_SIDECAR_INDEX on/smoke uses the production node graph.
 * off keeps the existing source index. There is no second indexer.
 */
import { BLOCK_TAGS, editablePageNodes, editableTextNodes } from './html-node-graph-bridge.mjs';
import { openSidecarGraph } from '../free-page/runtime/sidecar-flag.mjs';

const BLOCK = new Set(BLOCK_TAGS);
const OPAQUE = new Set(['iframe', 'canvas', 'script', 'object', 'embed']);

function boundIds(manifest) {
  return new Set((manifest?.bindings ?? []).map(row => row?.node_id).filter(id => typeof id === 'string'));
}

function boundaryFor(value, tag, bound, runtime) {
  if (bound.has(value.node_id)) return 'bound';
  if (tag === 'iframe') return 'cross_origin_iframe';
  if (tag === 'canvas') return 'canvas_visual';
  if (runtime) return 'runtime_dom';
  if (value.kind === 'dynamic_region') return 'dynamic_region';
  return '';
}

function crumb(node) {
  return { node_id: node.node_id, tag: node.tag, kind: node.kind };
}

function pageNodesFromGraph(graph, manifest) {
  const bound = boundIds(manifest);
  const rows = [];
  for (const record of graph.node_list) {
    const projected = graph.toEditNodeRef(record);
    if (!projected.ok) continue;
    const value = projected.value;
    const tag = String(record.tag || 'div').toLowerCase();
    const range = record.source_range;
    const runtime = record.origin === 'runtime' || projected.channel_policy?.source !== true;
    const text = typeof range?.inner_text === 'string' ? range.inner_text : '';
    const nested = /<[a-z!/]/i.test(text);
    const opaque = OPAQUE.has(tag) || value.kind === 'dynamic_region';
    const structural = !runtime && !opaque && value.kind === 'static_element';
    const direct = structural && !bound.has(value.node_id) && !nested && Boolean(range);
    rows.push({
      node_id: value.node_id,
      page_id: value.page_id,
      kind: value.kind,
      mapping: runtime ? 'runtime' : 'valid',
      mapping_token: value.mapping_token,
      source_hash: value.source_hash,
      region_hash: value.region_hash,
      selector: value.selector,
      text,
      tag,
      source_range: value.source_range,
      range_start: Number.isInteger(range?.start) ? range.start : null,
      range_end: Number.isInteger(range?.end) ? range.end : null,
      capabilities: {
        select: true,
        direct_text: direct,
        ai: !opaque && tag !== 'iframe' && !bound.has(value.node_id),
        attribute: structural,
        style: structural,
        structure: structural,
        bound: bound.has(value.node_id),
        script_generated: value.kind === 'dynamic_region',
        dynamic: value.kind === 'dynamic_region',
        cross_origin: tag === 'iframe',
        canvas: tag === 'canvas',
      },
      boundary: boundaryFor(value, tag, bound, runtime),
    });
  }
  for (const node of rows) {
    const parents = rows.filter(other => other.node_id !== node.node_id
      && other.range_start != null && node.range_start != null
      && other.range_start <= node.range_start && other.range_end >= node.range_end)
      .sort((left, right) => (left.range_end - left.range_start) - (right.range_end - right.range_start));
    const parent = parents[0];
    const block = parents.find(row => BLOCK.has(row.tag));
    node.parent_node_id = parent?.node_id ?? null;
    node.parent_node_ids = parents.map(row => row.node_id);
    node.parent_block = block ? crumb(block) : null;
    node.breadcrumb = [...parents].reverse().concat(node).slice(-8).map(crumb);
  }
  return rows;
}

export function editorPageCatalog(pkg, manifest, options = {}) {
  if (!pkg || typeof pkg.html !== 'string') {
    return { source: 'source-index', code: 'INVALID_EDIT', mode: 'off', pageNodes: [], textNodes: [] };
  }
  const opened = openSidecarGraph(pkg, {
    page_id: options.pageId,
    flag: options.flag,
    env: options.env,
  });
  if (!opened.ok) {
    return {
      source: 'source-index',
      code: opened.code,
      mode: opened.mode,
      pageNodes: editablePageNodes(pkg, manifest),
      textNodes: editableTextNodes(pkg, manifest),
    };
  }
  const pageNodes = pageNodesFromGraph(opened.graph, manifest);
  return {
    source: 'node-graph',
    code: null,
    mode: opened.mode,
    pageNodes,
    textNodes: pageNodes.filter(node => node.capabilities?.direct_text),
  };
}
