/** Shared by every preview. All edit values are data; no selectors, HTML or JS are evaluated. */
export function presentationRuntime(edits) {
  // Legacy labels may lack field IDs. Match their exact original text inside
  // a keyed parent, never their sibling position. Recreated/changed labels
  // must match anew, including nodes changed while detached from the document.
  const identities = new WeakMap(), displayed = new WeakMap();
  window.__cockpitPresentationIdentity = identities;
  const textIdentity = node => {
    const original = identities.get(node), current = node.textContent;
    if (original !== undefined && current !== original && current !== displayed.get(node)) identities.delete(node);
    return identities.get(node) ?? current;
  };
  const inlineName = name => ['a', 'b', 'em', 'i', 'small', 'span', 'strong', 'sub', 'sup', 'code'].includes(name);
  const matches = (node, key) => key.attribute === 'text' ? textIdentity(node) === key.value
    : key.attribute === 'class' ? node.classList.contains(key.value) : node.getAttribute(key.attribute) === key.value;
  const writeSentence = (node, next) => {
    const parts = [...node.childNodes].filter(part => part.nodeType === 1 || (part.nodeType === 3 && part.nodeValue));
    if (!parts.length || parts.some(part => part.nodeType === 1 && !inlineName(part.localName))) {
      if (node.textContent !== next) node.textContent = next;
      return;
    }
    let cursor = 0;
    for (const part of parts) {
      if (part.nodeType !== 1) continue;
      if (next.indexOf(part.textContent, cursor) < 0) {
        if (node.textContent !== next) node.textContent = next;
        return;
      }
      cursor = next.indexOf(part.textContent, cursor) + part.textContent.length;
    }
    cursor = 0;
    for (const part of parts) {
      if (part.nodeType === 3) {
        const later = parts.slice(parts.indexOf(part) + 1).find(item => item.nodeType === 1);
        const end = later ? next.indexOf(later.textContent, cursor) : next.length;
        const value = next.slice(cursor, end);
        if (part.nodeValue !== value) part.nodeValue = value;
        cursor = end;
      } else cursor += part.textContent.length;
    }
  };
  const resolve = target => {
    const roots = [...document.querySelectorAll('[' + target.anchor.attribute + ']')].filter(n => matches(n, target.anchor));
    if (roots.length !== 1) return null;
    let node = roots[0];
    for (const part of target.path) {
      const sameTag = [...node.children].filter(n => n.localName === part.tag);
      if (part.key?.attribute === 'nth') {
        node = sameTag[Number(part.key.value)] ?? null;
        if (!node) return null;
        continue;
      }
      const children = sameTag.filter(n => !part.key || matches(n, part.key));
      if (children.length !== 1) return null;
      node = children[0];
      if (part.key?.attribute === 'text') identities.set(node, part.key.value);
    }
    return node;
  };
  let observer, stopped = false, scheduled = false, signature = '';
  const apply = () => {
    scheduled = false;
    if (stopped || typeof document === 'undefined' || !document.documentElement) return;
    observer.disconnect();
    const unresolved = [];
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i], node = resolve(edit.target);
      if (!node || node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.closest('script,style,template,iframe,object,embed,textarea,input,select,[data-sp-bindable="database"],[data-page-readonly]')
        ) { unresolved.push(i); continue; }
      if (node.hasAttribute('data-cockpit-drafting')) continue;
      if (edit.text != null) {
        if (!identities.has(node)) identities.set(node, node.textContent);
        const texts = [...node.childNodes].filter(n => n.nodeType === 3);
        const visible = texts.filter(n => n.nodeValue.trim());
        const target = visible.length === 1 ? visible[0] : texts.length === 1 ? texts[0] : null;
        if (node.children.length && !target) {
          if (![...node.children].every(child => inlineName(child.localName))) { unresolved.push(i); continue; }
          writeSentence(node, edit.text);
        } else if (node.children.length) { if (target.nodeValue !== edit.text) target.nodeValue = edit.text; }
        else if (node.textContent !== edit.text) node.textContent = edit.text;
        displayed.set(node, node.textContent);
      }
      for (const [key, value] of Object.entries(edit.style ?? {})) if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
    }
    const next = JSON.stringify(unresolved);
    window.__cockpitPresentationStatus = { total: edits.length, unresolved };
    if (next !== signature) {
      signature = next;
      window.dispatchEvent(new CustomEvent('cockpit-presentation-status', { detail: window.__cockpitPresentationStatus }));
    }
    observer.observe(document.documentElement, { childList: true, characterData: true, attributes: true, attributeFilter: ['id','class','data-node','data-page-block','data-page-field','style'], subtree: true });
  };
  const start = () => {
    observer = new MutationObserver(records => {
      // Our own writes happen while disconnected. Any observed text change is
      // from the page: a reused DOM leaf must prove its original identity again.
      for (const record of records) {
        if (record.type === 'characterData' && record.target.parentElement) identities.delete(record.target.parentElement);
        else if (record.type === 'childList' && record.target) identities.delete(record.target);
      }
      if (!scheduled && !stopped) { scheduled = true; queueMicrotask(apply); }
    });
    apply();
  };
  window.addEventListener('pagehide', () => { stopped = true; observer?.disconnect(); }, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
