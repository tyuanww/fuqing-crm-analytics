/**
 * Selection bridge for an opaque preview frame.
 * The frame may name the DOM node under the pointer. It cannot write.
 * Mapped source nodes keep the source-index edit contract. The cockpit
 * catalog asks the sidecar flag before using the production node graph.
 * Runtime nodes stay inspectable and are not direct writes.
 */
import { buildSrcdoc } from '../free-page/preview/srcdoc-builder.mjs';
import { buildSourceIndex } from '../free-page/source-index/index.mjs';
import { acceptOperation } from './html-edit-operations.mjs';

export const BLOCK_TAGS = Object.freeze([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'header', 'main', 'nav', 'ol', 'section',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
const BLOCK_TAG_SET = new Set(BLOCK_TAGS);
const NON_SELECTABLE = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title', 'template', 'noscript']);
const OPAQUE_TAGS = new Set(['iframe', 'canvas', 'script', 'object', 'embed']);
const RUNTIME_ID = /^runtime:[A-Za-z0-9_.:/-]{1,240}$/;
const SOURCE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const TAG_NAME = /^[a-z][a-z0-9:-]{0,31}$/i;

function boundNodeIds(manifest) {
  return new Set((manifest?.bindings ?? []).map(row => row?.node_id).filter(id => typeof id === 'string'));
}

function parentNodes(index, node) {
  return Object.values(index.nodes)
    .filter(other => other.node_id !== node.node_id
      && other.html_range.start <= node.html_range.start
      && other.html_range.end >= node.html_range.end)
    .sort((a, b) => (a.html_range.end - a.html_range.start) - (b.html_range.end - b.html_range.start));
}

function canDirectEdit(node, bound) {
  const tag = String(node.tag || '').toLowerCase();
  return node.kind === 'static_element' && !bound.has(node.node_id) && !node.js_ranges.length
    && !OPAQUE_TAGS.has(tag) && !/<[a-z!/]/i.test(node.html_range.inner_text);
}

function canAiEdit(node, bound) {
  const tag = String(node.tag || '').toLowerCase();
  return !bound.has(node.node_id) && tag !== 'iframe';
}

function crumb(node) {
  return { node_id: node.node_id, tag: String(node.tag || '').toLowerCase(), kind: node.kind };
}

function boundaryFor(node, bound) {
  const tag = String(node.tag || '').toLowerCase();
  if (bound.has(node.node_id)) return 'bound';
  if (tag === 'iframe') return 'cross_origin_iframe';
  if (tag === 'canvas') return 'canvas_visual';
  if (node.kind === 'dynamic_region') return 'dynamic_region';
  if (node.js_ranges?.length) return 'script_region';
  return '';
}

function toNodeRef(index, node, bound) {
  const tag = String(node.tag || '').toLowerCase();
  const parents = parentNodes(index, node);
  const parent = parents[0];
  const block = parents.find(row => BLOCK_TAG_SET.has(String(row.tag || '').toLowerCase()));
  const direct = canDirectEdit(node, bound);
  const ai = canAiEdit(node, bound);
  const opaque = OPAQUE_TAGS.has(tag) || node.kind === 'dynamic_region' || node.js_ranges.length > 0 || bound.has(node.node_id);
  const structural = !opaque && node.kind === 'static_element';
  return {
    node_id: node.node_id,
    kind: node.kind,
    mapping: 'valid',
    mapping_token: node.mapping_token,
    version_hash: index.version_hash,
    text: node.html_range.inner_text,
    tag,
    parent_node_id: parent?.node_id ?? null,
    parent_node_ids: parents.map(row => row.node_id),
    parent_block: block ? crumb(block) : null,
    breadcrumb: [...parents].reverse().concat(node).slice(-8).map(crumb),
    source_range: { start: node.html_range.start, end: node.html_range.end },
    capabilities: {
      select: true,
      direct_text: direct,
      ai: ai && tag !== 'iframe',
      attribute: structural,
      style: structural,
      structure: structural,
      bound: bound.has(node.node_id),
      script_generated: Boolean(node.js_ranges.length) || node.kind === 'dynamic_region',
      dynamic: node.kind === 'dynamic_region',
      cross_origin: tag === 'iframe',
      canvas: tag === 'canvas',
    },
    boundary: boundaryFor(node, bound),
  };
}

/** Existing literal text editing list; kept narrow for backwards compatibility. */
export function editableTextNodes(pkg, manifest) {
  if (!pkg) return [];
  const index = buildSourceIndex(pkg);
  const bound = boundNodeIds(manifest);
  return Object.values(index.nodes).filter(node => canDirectEdit(node, bound)).map(node => toNodeRef(index, node, bound));
}

/** Source nodes the selection UI can name, including blocks that cannot be written. */
export function editablePageNodes(pkg, manifest) {
  if (!pkg) return [];
  const index = buildSourceIndex(pkg);
  const bound = boundNodeIds(manifest);
  return Object.values(index.nodes).map(node => toNodeRef(index, node, bound));
}

export function selectionRuntime(config) {
  const blocks = new Set(config.blocks || []);
  const hidden = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title', 'template', 'noscript']);
  const post = payload => parent.postMessage({
    type: 'cockpit.selection', channel: config.channel, pageId: config.pageId, version: config.version, ...payload,
  }, '*');
  const ids = new Set(config.ids || []);
  const known = new Map((config.nodes || []).map(node => [node.node_id, node]));
  let hover = null;

  const identity = node => node?.getAttribute?.('data-shine-node')
    || node?.getAttribute?.('data-shine-region') || node?.getAttribute?.('data-cockpit-source');
  const shown = node => {
    if (!node || node.nodeType !== 1 || hidden.has(node.tagName.toLowerCase())) return false;
    if (node.closest?.('script,style,template,head')) return false;
    try {
      const style = window.getComputedStyle?.(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    } catch { /* keep the element selectable when style lookup is unavailable */ }
    return true;
  };
  const runtimeIdFor = node => {
    if (!node || node.nodeType !== 1) return null;
    const parts = [];
    let current = node;
    while (current && current.nodeType === 1 && current !== document.body && current !== document.documentElement) {
      let index = 0;
      let sibling = current;
      while ((sibling = sibling.previousElementSibling)) index += 1;
      parts.unshift(`${current.tagName.toLowerCase()}:${index}`);
      current = current.parentElement;
    }
    return `runtime:${parts.join('/') || 'body'}`.slice(0, 248);
  };
  const nearest = target => {
    let node = target?.nodeType === 1 ? target : target?.parentElement;
    while (node && node !== document.documentElement) {
      if (shown(node)) return node;
      node = node.parentElement;
    }
    return null;
  };
  const parentBlock = node => {
    let cursor = node?.parentElement;
    while (cursor && cursor !== document.body && cursor !== document.documentElement) {
      if (blocks.has(cursor.tagName.toLowerCase()) && shown(cursor)) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  };
  const idFor = node => {
    const marked = identity(node);
    if (marked && ids.has(marked)) return marked;
    return runtimeIdFor(node);
  };
  const kindFor = node => {
    const marked = identity(node);
    const mapped = marked && ids.has(marked) ? known.get(marked) : null;
    if (mapped?.kind) return mapped.kind;
    if (node.getAttribute?.('data-shine-region') || node.closest?.('[data-shine-region]')) return 'dynamic_region';
    return 'static_element';
  };
  const refFor = node => {
    if (!node) return null;
    const nodeId = idFor(node);
    if (!nodeId) return null;
    const mapped = ids.has(nodeId) ? known.get(nodeId) : null;
    const tag = node.tagName.toLowerCase();
    const kind = kindFor(node);
    const block = parentBlock(node);
    const parent = node.parentElement;
    const dynamic = kind === 'dynamic_region';
    const iframe = tag === 'iframe';
    const canvas = tag === 'canvas';
    const breadcrumb = [];
    let cursor = node;
    while (cursor && cursor !== document.body && cursor !== document.documentElement && breadcrumb.length < 8) {
      if (shown(cursor)) {
        const cursorId = idFor(cursor);
        if (cursorId) breadcrumb.unshift({ node_id: cursorId, tag: cursor.tagName.toLowerCase(), kind: kindFor(cursor) });
      }
      cursor = cursor.parentElement;
    }
    const text = String(node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
    return {
      node_id: nodeId,
      kind,
      mapping: mapped ? 'valid' : 'runtime',
      mapping_token: mapped?.mapping_token ?? null,
      version_hash: mapped?.version_hash ?? null,
      text: mapped?.text ?? text,
      tag,
      parent_node_id: parent ? idFor(parent) : null,
      parent_block: block ? { node_id: idFor(block), tag: block.tagName.toLowerCase(), kind: kindFor(block) } : null,
      breadcrumb,
      capabilities: {
        select: true,
        direct_text: Boolean(mapped?.capabilities?.direct_text) && !dynamic && !iframe && !canvas,
        ai: !iframe && mapped?.capabilities?.ai !== false,
        attribute: Boolean(mapped?.capabilities?.attribute) && !dynamic && !iframe && !canvas,
        style: Boolean(mapped?.capabilities?.style) && !dynamic && !iframe && !canvas,
        structure: Boolean(mapped?.capabilities?.structure) && !dynamic && !iframe && !canvas,
        bound: Boolean(mapped?.capabilities?.bound),
        script_generated: dynamic || Boolean(mapped?.capabilities?.script_generated),
        dynamic,
        cross_origin: iframe,
        canvas,
      },
      boundary: iframe ? 'cross_origin_iframe' : canvas ? 'canvas_visual' : dynamic ? 'dynamic_region' : mapped ? (mapped.boundary || '') : 'runtime_dom',
    };
  };
  const findById = id => {
    if (!id) return null;
    for (const node of document.querySelectorAll('[data-shine-node],[data-shine-region],[data-cockpit-source],[data-cockpit-runtime]')) {
      if (identity(node) === id || node.getAttribute('data-cockpit-runtime') === id) return node;
    }
    if (String(id).startsWith('runtime:') && document.body) {
      for (const node of document.body.querySelectorAll('*')) {
        if (runtimeIdFor(node) === id) return node;
      }
    }
    return null;
  };
  const mark = (node, selected = false, attr = 'data-cockpit-target') => {
    if (!node) return;
    const id = idFor(node);
    if (id) node.setAttribute('data-cockpit-runtime', id);
    node.setAttribute(attr, '');
    if (selected) node.setAttribute('data-cockpit-selected', '');
    else node.removeAttribute('data-cockpit-selected');
  };
  const clearVisual = () => document.querySelectorAll('[data-cockpit-target],[data-cockpit-hover],[data-cockpit-selected]').forEach(node => {
    node.removeAttribute('data-cockpit-target');
    node.removeAttribute('data-cockpit-hover');
    node.removeAttribute('data-cockpit-selected');
  });
  const publish = node => {
    const ref = refFor(node);
    if (!ref || (!ids.has(ref.node_id) && !config.allowRuntime)) return null;
    clearVisual();
    mark(node, true);
    post({ nodeId: ref.node_id, parentNodeId: ref.parent_node_id, ref });
    return ref;
  };
  const install = () => {
    const style = document.createElement('style');
    style.textContent = '[data-cockpit-target],[data-cockpit-hover]{cursor:crosshair!important;outline-offset:3px!important}[data-cockpit-target]:hover,[data-cockpit-hover]{outline:1px dashed #805D9D!important}[data-cockpit-selected]{outline:2px solid #D3C3E8!important;box-shadow:0 0 0 4px rgba(128,93,157,.28)!important}';
    document.head.append(style);
    for (const node of document.querySelectorAll('[data-shine-node],[data-shine-region],[data-cockpit-source]')) {
      const id = identity(node);
      if (id && ids.has(id) && shown(node)) mark(node);
    }
    window.addEventListener('message', event => {
      const data = event.data;
      if (event.source !== parent || !data || data.channel !== config.channel || data.pageId !== config.pageId || data.version !== config.version) return;
      if (data.type === 'cockpit.highlight') {
        clearVisual();
        const node = findById(data.nodeId);
        if (node) mark(node, true);
        return;
      }
      if (data.type === 'cockpit.select') publish(findById(data.nodeId));
    });
    document.addEventListener('pointerover', event => {
      const node = nearest(event.target);
      if (!node || !config.allowRuntime) return;
      if (hover && hover !== node) hover.removeAttribute('data-cockpit-hover');
      hover = node;
      mark(node, false, 'data-cockpit-hover');
    }, true);
    document.addEventListener('click', event => {
      const node = nearest(event.target);
      if (!node) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      publish(node);
    }, true);
    document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); post({ nodeId: null }); return; }
      if (event.key === 'Enter' && event.target?.nodeType === 1) {
        event.preventDefault();
        event.stopImmediatePropagation();
        publish(nearest(event.target));
      }
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

function slimNode(node) {
  return {
    node_id: node.node_id,
    kind: node.kind,
    mapping_token: node.mapping_token ?? null,
    version_hash: node.version_hash ?? null,
    text: String(node.text ?? '').slice(0, 400),
    tag: node.tag,
    capabilities: node.capabilities ?? {},
    boundary: node.boundary ?? '',
    parent_node_id: node.parent_node_id ?? null,
    parent_block: node.parent_block ?? null,
    breadcrumb: node.breadcrumb ?? [],
  };
}

export function selectionSrcdoc(pkg, { channel, pageId, version, nodes = [], selected = null, editing = false, allowRuntime = true } = {}) {
  const src = buildSrcdoc({ ...pkg, instanceId: channel, pageId, version, nonce: channel });
  if (!editing) return src;
  const config = JSON.stringify({
    channel, pageId, version, ids: nodes.map(row => row.node_id), nodes: nodes.map(slimNode),
    selected, allowRuntime, blocks: BLOCK_TAGS,
  }).replace(/</g, '\\u003c');
  return src.replace('</body>', `<script>(${selectionRuntime.toString()})(${config});</script></body>`);
}

function sanitizeCrumb(row) {
  if (!row || typeof row !== 'object') return null;
  const node_id = typeof row.node_id === 'string' ? row.node_id : '';
  const tag = typeof row.tag === 'string' ? row.tag.toLowerCase() : '';
  if (!node_id || node_id.length > 248 || !TAG_NAME.test(tag)) return null;
  if (!(RUNTIME_ID.test(node_id) || SOURCE_ID.test(node_id))) return null;
  if (NON_SELECTABLE.has(tag)) return null;
  return { node_id, tag, kind: row.kind === 'dynamic_region' ? 'dynamic_region' : 'static_element' };
}

function sanitizeCrumbs(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(sanitizeCrumb).filter(Boolean).slice(-8);
}

function tagAgreesWithRuntimeId(id, tag) {
  const last = id.slice('runtime:'.length).split('/').pop() || '';
  return last.toLowerCase().startsWith(`${tag.toLowerCase()}:`);
}

function hostRuntimeNode(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const node_id = typeof ref.node_id === 'string' ? ref.node_id : '';
  const tag = typeof ref.tag === 'string' ? ref.tag.toLowerCase() : '';
  if (!RUNTIME_ID.test(node_id) || !TAG_NAME.test(tag) || NON_SELECTABLE.has(tag)) return null;
  if (!tagAgreesWithRuntimeId(node_id, tag)) return null;
  if (typeof ref.text !== 'string' || ref.text.length > 400) return null;
  const iframe = tag === 'iframe';
  const canvas = tag === 'canvas';
  const dynamic = ref.kind === 'dynamic_region' || ref.boundary === 'dynamic_region';
  return {
    node_id,
    kind: dynamic ? 'dynamic_region' : 'static_element',
    mapping: 'runtime',
    mapping_token: null,
    version_hash: null,
    text: ref.text,
    tag,
    parent_node_id: typeof ref.parent_node_id === 'string' ? ref.parent_node_id : null,
    parent_block: sanitizeCrumb(ref.parent_block),
    breadcrumb: sanitizeCrumbs(ref.breadcrumb),
    capabilities: {
      select: true,
      direct_text: false,
      ai: !iframe,
      attribute: false,
      style: false,
      structure: false,
      bound: false,
      script_generated: dynamic,
      dynamic,
      cross_origin: iframe,
      canvas,
    },
    boundary: iframe ? 'cross_origin_iframe' : canvas ? 'canvas_visual' : dynamic ? 'dynamic_region' : 'runtime_dom',
  };
}

export function acceptSelection(event, { source, channel, pageId, version, nodes, allowRuntime = false }) {
  if (!source || event.source !== source || event.origin !== 'null') return undefined;
  const data = event.data;
  if (!data || data.type !== 'cockpit.selection' || data.channel !== channel || data.pageId !== pageId || data.version !== version) return undefined;
  const allowed = ['type', 'channel', 'pageId', 'version', 'nodeId', 'parentNodeId', 'ref'];
  if (Object.keys(data).some(key => !allowed.includes(key))) return undefined;
  if (data.nodeId === null) return null;
  const known = nodes.find(node => node.node_id === data.nodeId);
  if (known) {
    const liveCrumbs = sanitizeCrumbs(data.ref?.breadcrumb);
    const liveBlock = sanitizeCrumb(data.ref?.parent_block);
    return {
      ...known,
      parent_node_id: typeof data.parentNodeId === 'string' ? data.parentNodeId : (known.parent_node_id ?? null),
      parent_block: liveBlock ?? known.parent_block ?? null,
      breadcrumb: liveCrumbs.length ? liveCrumbs : (known.breadcrumb ?? []),
      capabilities: known.capabilities,
      boundary: known.boundary,
    };
  }
  if (!allowRuntime || data.ref?.node_id !== data.nodeId) return undefined;
  return hostRuntimeNode(data.ref) ?? undefined;
}

export function acceptOperationMessage(event, { source, channel, pageId, version, nodes = [], selection = null, apply = false } = {}) {
  if (!source || event?.source !== source || event?.origin !== 'null' || !event.data || typeof event.data !== 'object') {
    return { ok: false, reason: 'forged_message' };
  }
  const data = event.data;
  if (data.type !== 'cockpit.operation') return { ok: false, reason: 'forged_message' };
  const allowed = ['type', 'channel', 'pageId', 'version', 'operation'];
  if (Object.keys(data).some(key => !allowed.includes(key))) return { ok: false, reason: 'forged_message' };
  if (data.pageId !== pageId) return { ok: false, reason: 'wrong_page' };
  if (data.version !== version) return { ok: false, reason: 'wrong_version' };
  if (data.channel !== channel) return { ok: false, reason: 'forged_message' };
  return acceptOperation(data.operation, { pageId, version, nodes, selection, apply, channel });
}
