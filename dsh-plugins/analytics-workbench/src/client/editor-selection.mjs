/** Sidebar list and text-box gate for the cockpit page editor. */

export function visibleEditorNodes(listed, verified) {
  const base = Array.isArray(listed) ? listed : [];
  if (!Array.isArray(verified) || !verified.length) return base;
  const ids = new Set(verified.map(node => node?.node_id));
  return [...base.filter(node => !ids.has(node?.node_id)), ...verified];
}

export function editorSelectionReady(selection) {
  return Boolean(selection && selection.ok !== false && selection.node_id);
}
