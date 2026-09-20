/** Selection-only bridge. The untrusted frame can never request a write. */
import { sourceTargets, instrumentSourceTargets } from './html-source-selection.mjs';
import { buildSrcdoc } from '../free-page/preview/srcdoc-builder.mjs';
import { buildSourceIndex } from '../free-page/source-index/index.mjs';

export function editablePageNodes(pkg, manifest) {
  const inferred = sourceTargets(pkg, manifest);
  const index = buildSourceIndex(pkg), mapped = editableTextNodes(pkg, manifest);
  const starts = new Set(mapped.map(node => index.nodes[node.node_id].html_range.start));
  const dynamic = Object.values(index.nodes).filter(node => node.js_ranges.length || node.kind === 'dynamic_region');
  return [...mapped.map(node => ({ ...node, aiSource: inferred.find(item => item.source.start === index.nodes[node.node_id].html_range.start)?.source })),
    ...inferred.filter(node => !starts.has(node.source.start) && !dynamic.some(other =>
      node.source.start < other.html_range.end && node.source.end > other.html_range.start))];
}

export function editableTextNodes(pkg, manifest) {
  if (!pkg) return [];
  const index = buildSourceIndex(pkg);
  const bound = new Set((manifest?.bindings ?? []).map(row => row.node_id));
  return Object.values(index.nodes).filter(node => node.kind === 'static_element' && !bound.has(node.node_id)
    && !node.js_ranges.length && !/<[a-z!/]/i.test(node.html_range.inner_text)).map(node => ({
      node_id: node.node_id, kind: node.kind, mapping: 'valid',
      mapping_token: node.mapping_token, version_hash: index.version_hash,
      text: node.html_range.inner_text, tag: node.tag, editableText: true,
    }));
}

function selectionRuntime(config) {
  const send = nodeId => parent.postMessage({ type: 'cockpit.selection', channel: config.channel,
    pageId: config.pageId, version: config.version, nodeId }, '*');
  const install = () => {
    const allowed = new Set(config.ids);
    let eligible = new Map(), published = '', selected = config.selected;
    const identity = node => node.getAttribute('data-cockpit-source') || node.getAttribute('data-shine-node');
    const staticAttributes = node => {
      const elements = [node, ...node.querySelectorAll('*')];
      for (let parent = node.parentElement; parent; parent = parent.parentElement) elements.push(parent);
      return elements.every(element => [...element.attributes].every(attribute => {
        const name = attribute.name.toLowerCase(), value = attribute.value.replace(/[\u0000-\u0020\u007f]/g, '');
        if (name.startsWith('on') || name === 'srcdoc') return false;
        if (['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'background', 'codebase', 'poster', 'manifest'].includes(name)
          && /^(?:javascript|vbscript):/i.test(value)) return false;
        return !['href', 'action', 'formaction', 'xlink:href'].includes(name) || !/^(?:data|blob):/i.test(value);
      }));
    };
    const unchanged = node => {
      const expected = config.source[identity(node)]; if (expected === undefined) return false;
      const clone = node.cloneNode(true); clone.querySelectorAll('[data-cockpit-source]').forEach(child => child.removeAttribute('data-cockpit-source'));
      clone.querySelectorAll('[data-cockpit-target]').forEach(child => { child.removeAttribute('data-cockpit-target'); child.removeAttribute('data-cockpit-selected'); if (child.hasAttribute('data-cockpit-tabindex')) { const original = child.getAttribute('data-cockpit-tabindex'); if (original === '') child.removeAttribute('tabindex'); else child.setAttribute('tabindex', original); child.removeAttribute('data-cockpit-tabindex'); } });
      const template = document.createElement('template'); template.innerHTML = expected;
      return clone.innerHTML === template.innerHTML;
    };
    const style = document.createElement('style');
    style.textContent = '[data-cockpit-target]{cursor:text!important;outline-offset:3px} [data-cockpit-target]:hover,[data-cockpit-target]:focus-visible{outline:1px dashed #ff6b35!important} [data-cockpit-target][data-cockpit-selected]{outline:2px solid #ff6b35!important;outline-offset:3px}';
    document.head.append(style);
    const unmark = node => {
      node.removeAttribute('data-cockpit-target'); node.removeAttribute('data-cockpit-selected');
      if (node.hasAttribute('data-cockpit-tabindex')) {
        const original = node.getAttribute('data-cockpit-tabindex');
        if (original === '') node.removeAttribute('tabindex'); else node.setAttribute('tabindex', original);
        node.removeAttribute('data-cockpit-tabindex');
      }
    };
    // Both host controls and canvas clicks use this same runtime-verified set.
    // Observe later script changes too; bridge annotations must not retrigger it.
    const observer = new MutationObserver(() => sync());
    const sync = (force = false) => {
      observer.disconnect();
      const candidates = new Map(), duplicates = new Set();
      for (const node of document.querySelectorAll('[data-shine-node],[data-cockpit-source]')) {
        const id = identity(node);
        if (!allowed.has(id)) continue;
        if (candidates.has(id)) duplicates.add(id);
        candidates.set(id, node);
      }
      const next = new Map([...candidates].filter(([id, node]) => !duplicates.has(id)
        && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && staticAttributes(node) && unchanged(node)));
      for (const [id, node] of eligible) if (next.get(id) !== node) unmark(node);
      for (const [id, node] of next) {
        if (!node.hasAttribute('data-cockpit-target')) {
          node.setAttribute('data-cockpit-tabindex', node.getAttribute('tabindex') ?? '');
          node.setAttribute('data-cockpit-target', ''); node.tabIndex = 0;
        }
        node.toggleAttribute('data-cockpit-selected', id === selected);
      }
      eligible = next;
      const ids = [...eligible.keys()], signature = JSON.stringify(ids);
      if (force || signature !== published) {
        published = signature;
        parent.postMessage({ type: 'cockpit.targets', channel: config.channel, pageId: config.pageId,
          version: config.version, nodeIds: ids }, '*');
      }
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    };
    window.addEventListener('message', event => {
      const data = event.data;
      if (event.source !== parent || !data || data.channel !== config.channel
        || data.pageId !== config.pageId || data.version !== config.version) return;
      if (data.type === 'cockpit.targets.request') sync(true);
      if (data.type === 'cockpit.highlight') { selected = data.nodeId; sync(); }
    });
    document.addEventListener('click', event => {
      event.preventDefault(); event.stopImmediatePropagation();
      // Publish eligibility before the click even if the mount handshake was
      // missed. The host validates these messages synchronously, before React renders.
      sync(true);
      const node = event.target.closest?.('[data-cockpit-target]');
      if (node && eligible.get(identity(node)) === node) send(identity(node));
    }, true);
    document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); send(null); }
      if (event.key === 'Enter' && event.target.matches?.('[data-cockpit-target]')) {
        event.preventDefault(); event.stopImmediatePropagation(); sync(true);
        if (eligible.get(identity(event.target)) === event.target) send(identity(event.target));
      }
    }, true);
    sync(true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
export function selectionSrcdoc(pkg, { channel, pageId, version, nodes = [], selected = null, editing = false }) {
  const src = buildSrcdoc({ ...(editing ? instrumentSourceTargets(pkg, nodes) : pkg), instanceId: channel, pageId, version, nonce: channel });
  if (!editing) return src;
  const config = JSON.stringify({ channel, pageId, version, ids: nodes.map(row => row.node_id), source: Object.fromEntries(nodes.map(row => [row.node_id, row.text])), selected }).replace(/</g, '\\u003c');
  return src.replace('</body>', '<script>(' + selectionRuntime.toString() + ')(' + config + ');</script></body>');
}
export function acceptSelection(event, { source, channel, pageId, version, nodes }) {
  if (!source || event.source !== source || event.origin !== 'null') return undefined;
  const data = event.data;
  if (!data || data.type !== 'cockpit.selection' || data.channel !== channel || data.pageId !== pageId || data.version !== version) return undefined;
  if (Object.keys(data).some(key => !['type','channel','pageId','version','nodeId'].includes(key))) return undefined;
  if (data.nodeId === null) return null;
  const matches = nodes.filter(node => node.node_id === data.nodeId);
  return matches.length === 1 ? matches[0] : undefined;
}
export function acceptTargets(event, { source, channel, pageId, version, nodes }) {
  if (!source || event.source !== source || event.origin !== 'null') return undefined;
  const data = event.data;
  if (!data || data.type !== 'cockpit.targets' || data.channel !== channel || data.pageId !== pageId || data.version !== version
    || Object.keys(data).some(key => !['type','channel','pageId','version','nodeIds'].includes(key))) return undefined;
  if (!Array.isArray(data.nodeIds) || data.nodeIds.length > nodes.length || new Set(data.nodeIds).size !== data.nodeIds.length) return undefined;
  const accepted = data.nodeIds.map(id => nodes.filter(node => node.node_id === id));
  if (accepted.some(matches => matches.length !== 1)) return undefined;
  return accepted.map(matches => matches[0]);
}
