/** Selection-only bridge. The untrusted frame can never request a write. */
import { sourceTargets, instrumentSourceTargets } from './html-source-selection.mjs';
import { buildSrcdoc } from '../free-page/preview/srcdoc-builder.mjs';
import { buildSourceIndex } from '../free-page/source-index/index.mjs';
import { renderedPackageHash, validRenderedLocator } from './html-rendered-text.mjs';

export function editablePageNodes(pkg, manifest) {
  const inferred = sourceTargets(pkg, manifest);
  const index = buildSourceIndex(pkg), mapped = editableTextNodes(pkg, manifest);
  const starts = new Set(mapped.map(node => index.nodes[node.node_id].html_range.start));
  const dynamic = Object.values(index.nodes).filter(node => node.js_ranges.length || node.kind === 'dynamic_region');
  const result = [...mapped.map(node => ({ ...node, aiSource: inferred.find(item => item.source.start === index.nodes[node.node_id].html_range.start)?.source })),
    ...inferred.filter(node => !starts.has(node.source.start) && !dynamic.some(other =>
      node.source.start < other.html_range.end && node.source.end > other.html_range.start))];
  if (!manifest?.bindings?.length && !manifest?.result_refs?.length) {
    for (const node of sourceTargets(pkg, manifest, { rendered: true })) {
      const existing = result.find(item => item.source?.start === node.source.start || item.aiSource?.start === node.source.start);
      if (existing) { existing.anchor = node.anchor; existing.packageHash = renderedPackageHash(pkg); }
      else result.push({ ...node, node_id: 'rendered_root_' + node.source.start, runtimeOnly: true, packageHash: renderedPackageHash(pkg) });
    }
  }
  return result;
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
    const runtimeIds = new WeakMap();
    const identity = node => runtimeIds.get(node) || node.getAttribute('data-cockpit-source') || node.getAttribute('data-shine-node');
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
    const originals = new WeakMap();
    const drafted = new Set();
    let liveDraft = null;
    const safeId = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(id);
    const findDraftNode = id => {
      if (typeof id !== 'string' || !id) return null;
      for (const [nodeId, node] of eligible) if (nodeId === id) return node;
      if (!safeId(id)) return null;
      return document.querySelector(`[data-cockpit-source="${id}"],[data-shine-node="${id}"]`);
    };
    const restoreDraft = node => {
      const saved = originals.get(node);
      if (!saved) return;
      node.innerHTML = saved.html;
      if (saved.style == null) node.removeAttribute('style'); else node.setAttribute('style', saved.style);
      originals.delete(node);
      drafted.delete(node);
    };
    const paintDraft = () => {
      if (!liveDraft?.nodeId) return;
      const node = findDraftNode(liveDraft.nodeId);
      if (!node) return;
      if (!liveDraft.active && !liveDraft.style) { restoreDraft(node); return; }
      if (!originals.has(node)) originals.set(node, { html: node.innerHTML, style: node.getAttribute('style') });
      drafted.add(node);
      if (liveDraft.active) {
        const next = String(liveDraft.text ?? '');
        const inlineName = name => ['a', 'b', 'em', 'i', 'small', 'span', 'strong', 'sub', 'sup', 'code'].includes(name);
        const parts = [...node.childNodes].filter(part => part.nodeType === 1 || (part.nodeType === 3 && part.nodeValue));
        const sentence = parts.length > 0 && parts.every(part => part.nodeType !== 1 || inlineName(part.localName))
          && parts.some(part => part.nodeType === 1) && parts.filter(part => part.nodeType === 1).every(part => next.includes(part.textContent));
        if (!sentence) node.textContent = next;
        else {
          let cursor = 0;
          for (const part of parts) {
            if (part.nodeType === 3) {
              const later = parts.slice(parts.indexOf(part) + 1).find(item => item.nodeType === 1);
              const end = later ? next.indexOf(later.textContent, cursor) : next.length;
              const value = next.slice(cursor, end < 0 ? next.length : end);
              if (part.nodeValue !== value) part.nodeValue = value;
              cursor = end < 0 ? next.length : end;
            } else cursor += part.textContent.length;
          }
        }
      }
      if (liveDraft.style && typeof liveDraft.style === 'object') {
        for (const [key, value] of Object.entries(liveDraft.style)) {
          if (typeof key === 'string' && typeof value === 'string' && !/url\s*\(|expression\s*\(/i.test(key + value)) node.style.setProperty(key, value);
        }
      }
    };
    const unchanged = node => {
      const expected = config.source[identity(node)]; if (expected === undefined) return false;
      const clone = node.cloneNode(true);
      if (originals.has(node)) clone.innerHTML = originals.get(node).html;
      clone.querySelectorAll('[data-cockpit-source]').forEach(child => child.removeAttribute('data-cockpit-source'));
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
    let closed = false;
    const observer = new MutationObserver(() => sync());
    window.addEventListener('pagehide', () => { closed = true; observer.disconnect(); }, { once: true });
    const sync = (force = false) => {
      if (closed || typeof document === 'undefined' || !document.documentElement) return;
      observer.disconnect();
      const candidates = new Map(), duplicates = new Set();
      for (const node of document.querySelectorAll('[data-shine-node],[data-cockpit-source]')) {
        const id = identity(node);
        if (!allowed.has(id)) continue;
        if (candidates.has(id)) duplicates.add(id);
        candidates.set(id, node);
      }
      const next = new Map([...candidates].filter(([id, node]) => !duplicates.has(id) && !config.runtimeOnly.includes(id)
        && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && staticAttributes(node) && unchanged(node)));
      const inlineName = name => ['a', 'b', 'em', 'i', 'small', 'span', 'strong', 'sub', 'sup'].includes(name);
      const sentenceNode = node => {
        if (!node || !['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'figcaption', 'caption', 'label', 'td', 'th', 'button', 'blockquote'].includes(node.localName)) return false;
        const kids = [...node.children];
        return kids.length > 0 && kids.every(child => inlineName(child.localName))
          && [...node.childNodes].some(child => child.nodeType === 3 && child.nodeValue.trim());
      };
      const insideSentence = node => {
        let parent = node?.parentElement;
        while (parent) {
          const parentId = identity(parent);
          if (parentId && next.get(parentId) === parent && sentenceNode(parent)) return true;
          parent = parent.parentElement;
        }
        return false;
      };
      for (const [id, node] of [...next]) if (insideSentence(node)) next.delete(id);
      const runtimeNodes = [], seen = new Set(); let runtimeBytes = 0;
      const roots = config.roots.map(root => ({ root, elements: [...document.querySelectorAll('[' + root.anchor.attribute + ']')].filter(node => node.getAttribute(root.anchor.attribute) === root.anchor.value) }))
        .filter(row => row.elements.length === 1).reverse();
      for (const { root, elements: [element] } of roots) {
        const descendants = [element, ...element.querySelectorAll('*')].slice(0, 2000);
        for (const node of descendants) {
          if (seen.has(node) || insideSentence(node) || next.size >= 2000 || node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
            || node.closest('script,style,template,iframe,object,embed,textarea,input,select,[data-shine-region],[data-sp-bindable="database"],[data-page-readonly]') || !staticAttributes(node)) continue;
          const directTexts = [...node.childNodes].filter(n => n.nodeType === 3);
          const visibleTexts = directTexts.filter(n => n.nodeValue.trim());
          const ownText = visibleTexts.length === 1 ? visibleTexts[0] : directTexts.length === 1 ? directTexts[0] : null;
          const savedText = window.__cockpitPresentationIdentity?.has(node);
          const inlineChild = name => ['a', 'b', 'em', 'i', 'small', 'span', 'strong', 'sub', 'sup', 'code'].includes(name);
          const sentence = node.children.length > 0 && [...node.children].every(child => inlineChild(child.localName))
            && visibleTexts.length > 1;
          const editableText = sentence || node.children.length === 0 || Boolean(ownText && (ownText.nodeValue.trim() || savedText));
          const text = sentence ? (node.textContent ?? '') : editableText && node.children.length ? ownText.nodeValue : node.textContent ?? '';
          const block = /^(section|article|header|footer|aside|li)$/.test(node.localName) || (node.hasAttribute('data-node') || node.hasAttribute('data-page-block')) && node.children.length > 0;
          if ((!text.trim() && !savedText || text.length > 20000) || (!editableText && !block)) continue;
          const path = []; let child = node, reliable = true;
          while (child !== element && path.length < 64) {
            const parentNode = child.parentElement; if (!parentNode) break;
            const peers = [...parentNode.children].filter(n => n.localName === child.localName);
            let key;
            for (const attribute of ['data-page-field','data-page-block','data-node','id']) {
              const value = child.getAttribute(attribute);
              if (value && /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(value) && peers.filter(n => n.getAttribute(attribute) === value).length === 1) { key = { attribute, value }; break; }
            }
            if (!key) {
              const value = [...child.classList].find(c => !/^(is-|has-|active|selected|hover|focus)/.test(c) && /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(c) && peers.filter(n => n.classList.contains(c)).length === 1);
              if (value) key = { attribute: 'class', value };
            }
            if (!key && peers.length > 1) {
              const label = item => window.__cockpitPresentationIdentity?.get(item) ?? item.textContent;
              const text = label(child);
              const numericLeaf = !child.children.length && /^[\s\d.,%+−\-]+$/.test(text);
              if (!numericLeaf && text.trim() && text.length <= 2000
                && peers.filter(item => label(item) === text).length === 1) key = { attribute: 'text', value: text };
              else { reliable = false; break; }
            }
            path.unshift({ tag: child.localName, ...(key ? { key } : {}) }); child = parentNode;
          }
          if (!reliable || child !== element) continue;
          const id = 'runtime_' + root.node_id + '_' + JSON.stringify(path);
          for (const [oldId, oldNode] of next) if (oldNode === node) next.delete(oldId);
          // Strip our own annotations before giving the model a read-only view of the selected block.
          const clone = node.cloneNode(true);
          for (const item of [clone, ...clone.querySelectorAll('*')]) {
            for (const attr of [...item.attributes]) if (attr.name.startsWith('data-cockpit-')) item.removeAttribute(attr.name);
            if (item.hasAttribute('tabindex') && item !== node && !item.hasAttribute('data-shine-node')) item.removeAttribute('tabindex');
          }
          const renderedHTML = clone.outerHTML;
          if (renderedHTML.length > 60000 || runtimeBytes + renderedHTML.length + text.length > 524288) continue;
          runtimeBytes += renderedHTML.length + text.length;
          runtimeIds.set(node, id); seen.add(node); next.set(id, node);
          if (sentence) for (const item of node.querySelectorAll('*')) seen.add(item);
          runtimeNodes.push({ node_id: id, root_id: root.node_id, tag: node.localName, text, editableText, block,
            runtime: { anchor: root.anchor, path, package_hash: root.packageHash, html: renderedHTML } });
        }
      }
      for (const [id, node] of eligible) if (next.get(id) !== node) unmark(node);
      for (const node of document.querySelectorAll('[data-cockpit-target]')) {
        if (![...next.values()].includes(node)) unmark(node);
      }
      for (const [id, node] of next) {
        if (!node.hasAttribute('data-cockpit-target')) {
          node.setAttribute('data-cockpit-tabindex', node.getAttribute('tabindex') ?? '');
          node.setAttribute('data-cockpit-target', ''); node.tabIndex = 0;
        }
        node.toggleAttribute('data-cockpit-selected', id === selected);
      }
      eligible = next;
      const ids = [...eligible.keys()].filter(id => !id.startsWith('runtime_')), signature = JSON.stringify([ids, runtimeNodes]);
      if (force || signature !== published) {
        published = signature;
        parent.postMessage({ type: 'cockpit.targets', channel: config.channel, pageId: config.pageId,
          version: config.version, nodeIds: ids, runtimeNodes }, '*');
      }
      paintDraft();
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    };
    window.addEventListener('message', event => {
      const data = event.data;
      if (event.source !== parent || !data || data.channel !== config.channel
        || data.pageId !== config.pageId || data.version !== config.version) return;
      if (data.type === 'cockpit.targets.request') sync(true);
      if (data.type === 'cockpit.highlight') { selected = data.nodeId; sync(); }
      if (data.type === 'cockpit.draft') {
        observer.disconnect();
        if (data.reset) {
          for (const node of [...drafted]) restoreDraft(node);
          liveDraft = null;
        } else {
          liveDraft = { nodeId: data.nodeId, text: data.text, active: Boolean(data.active), style: data.style && typeof data.style === 'object' ? data.style : null };
          if (!liveDraft.active && !liveDraft.style) {
            const node = findDraftNode(liveDraft.nodeId);
            if (node) restoreDraft(node);
            liveDraft = null;
          }
        }
        sync();
      }
    });
    document.addEventListener('click', event => {
      event.preventDefault(); event.stopImmediatePropagation();
      // Publish eligibility before the click even if the mount handshake was
      // missed. The host validates these messages synchronously, before React renders.
      sync(true);
      let node = event.target.closest?.('[data-cockpit-target]');
      if (config.selectBlocks) {
        for (let parent = node; parent; parent = parent.parentElement) {
          if (eligible.get(identity(parent)) === parent && (/^(section|article|li)$/.test(parent.localName) || (parent.hasAttribute('data-node') || parent.hasAttribute('data-page-block')) && parent.children.length)) { node = parent; break; }
        }
      }
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
export function selectionSrcdoc(pkg, { channel, pageId, version, nodes = [], selected = null, editing = false, selectBlocks = false }) {
  let src = buildSrcdoc({ ...(editing ? instrumentSourceTargets(pkg, nodes) : pkg), instanceId: channel, pageId, version, nonce: channel });
  const statusConfig = JSON.stringify({ channel, pageId, version }).replace(/</g, '\\u003c');
  src = src.replace('</body>', '<script>(' + (function (config) {
    const report = () => parent.postMessage({ type: 'cockpit.presentation', ...config, unresolved: window.__cockpitPresentationStatus?.unresolved?.length ?? 0 }, '*');
    window.addEventListener('cockpit-presentation-status', report);
    document.addEventListener('DOMContentLoaded', report, { once: true }); report();
  }).toString() + ')(' + statusConfig + ');</script></body>');
  if (!editing) return src;
  const config = JSON.stringify({ channel, pageId, version, ids: nodes.map(row => row.node_id), source: Object.fromEntries(nodes.map(row => [row.node_id, row.text])), selected,
    runtimeOnly: nodes.filter(row => row.runtimeOnly).map(row => row.node_id), roots: nodes.filter(row => row.anchor && row.packageHash).map(({ node_id, anchor, packageHash }) => ({ node_id, anchor, packageHash })), selectBlocks }).replace(/</g, '\\u003c');
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
    || Object.keys(data).some(key => !['type','channel','pageId','version','nodeIds','runtimeNodes'].includes(key))) return undefined;
  if (!Array.isArray(data.nodeIds) || data.nodeIds.length > nodes.length || new Set(data.nodeIds).size !== data.nodeIds.length) return undefined;
  const accepted = data.nodeIds.map(id => nodes.filter(node => node.node_id === id));
  if (accepted.some(matches => matches.length !== 1)) return undefined;
  const runtime = data.runtimeNodes ?? [];
  if (!Array.isArray(runtime) || runtime.length > 2000 || runtime.length + data.nodeIds.length > 2000) return undefined;
  const extra = []; let runtimeBytes = 0;
  for (const item of runtime) {
    if (!item || typeof item !== 'object') return undefined;
    const root = nodes.find(node => node.node_id === item.root_id && node.anchor && node.packageHash);
    if (!root || !validRenderedLocator(item.runtime) || JSON.stringify(item.runtime.anchor) !== JSON.stringify(root.anchor)
      || item.runtime.package_hash !== root.packageHash || typeof item.node_id !== 'string' || !item.node_id.startsWith('runtime_')
      || typeof item.text !== 'string' || item.text.length > 20000 || typeof item.runtime.html !== 'string' || item.runtime.html.length > 60000
      || !/^[a-z][a-z0-9-]*$/.test(item.tag) || typeof item.editableText !== 'boolean' || typeof item.block !== 'boolean') return undefined;
    runtimeBytes += item.text.length + item.runtime.html.length;
    if (runtimeBytes > 524288) return undefined;
    extra.push({ ...item, kind: 'rendered_element', mapping: 'valid', mapping_token: root.packageHash, version_hash: root.packageHash,
      aiSource: root.source ?? root.aiSource });
  }
  const result = [...accepted.map(matches => matches[0]), ...extra];
  return new Set(result.map(node => node.node_id)).size === result.length ? result : undefined;
}
