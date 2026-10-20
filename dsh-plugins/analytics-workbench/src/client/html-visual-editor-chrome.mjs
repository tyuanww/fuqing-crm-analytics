/** Scoped chrome for the visual editor. All colors and states come from rc1 content tokens. */
export const visualEditorCss = `
.cockpit-visual-editor {
  --ve-font: var(--sm-font-body);
  --ve-display: var(--sm-font-display);
  --ve-mono: var(--sm-font-mono);
}
.cockpit-visual-editor .cockpit-sidebar,
.cockpit-visual-editor .cockpit-sidebar-header,
.cockpit-visual-editor .cockpit-sidebar-body {
  background: var(--sm-surface-raised);
  color: var(--sm-ink);
  font-family: var(--ve-font);
}
.cockpit-visual-editor .cockpit-sidebar { border-left: 1px solid var(--sm-line); }
.cockpit-visual-editor .cockpit-sidebar-header { border-bottom-color: var(--sm-line); }
.cockpit-visual-editor .cockpit-sidebar h2,
.cockpit-visual-editor .cockpit-sidebar h3 {
  color: var(--sm-ink);
  font-family: var(--ve-display);
}
.cockpit-visual-editor .cockpit-sidebar .cockpit-muted,
.cockpit-visual-editor .cockpit-sidebar .cockpit-eyebrow { color: var(--sm-muted); }
.cockpit-visual-editor .cockpit-sidebar-header button { color: var(--sm-ink); }
.cockpit-visual-editor .cockpit-node-card {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--sm-line-strong);
  border-radius: 12px;
  background: var(--sm-glass);
  box-shadow: inset 0 1px 0 var(--sm-line);
  backdrop-filter: blur(18px);
}
.cockpit-visual-editor .cockpit-node-card div { display: grid; gap: 2px; }
.cockpit-visual-editor .cockpit-node-card dt {
  margin: 0;
  color: var(--sm-lilac);
  font: 11px/16px var(--ve-mono);
  letter-spacing: 0.04em;
}
.cockpit-visual-editor .cockpit-node-card dd {
  margin: 0;
  color: var(--sm-ink);
  font: 14px/22px var(--ve-font);
  overflow-wrap: anywhere;
}
.cockpit-visual-editor [data-testid="html-capability"] { color: var(--sm-signal); }
.cockpit-visual-editor [data-testid="html-operation-boundary"] { color: var(--sm-danger); }
.cockpit-visual-editor .cockpit-mode-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-left: 0; }
.cockpit-visual-editor .cockpit-mode-tabs button,
.sm-library-workspace .cockpit-visual-editor .cockpit-mode-tabs button {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--sm-control-line);
  border-radius: 8px;
  background: var(--sm-control-bg);
  color: var(--sm-copy);
}
.cockpit-visual-editor .cockpit-mode-tabs button:hover:not(:disabled),
.sm-library-workspace .cockpit-visual-editor .cockpit-mode-tabs button:hover:not(:disabled) {
  background: var(--sm-control-bg-hover);
  border-color: var(--sm-control-line-hover);
}
.cockpit-visual-editor .cockpit-mode-tabs button:focus-visible,
.sm-library-workspace .cockpit-visual-editor .cockpit-mode-tabs button:focus-visible {
  outline: var(--sm-focus-width) solid var(--sm-focus);
  outline-offset: var(--sm-focus-offset);
}
.cockpit-visual-editor .cockpit-mode-tabs button:disabled,
.sm-library-workspace .cockpit-visual-editor .cockpit-mode-tabs button:disabled {
  opacity: var(--sm-disabled-opacity);
  cursor: not-allowed;
}
.cockpit-visual-editor .cockpit-mode-tabs button[aria-selected="true"],
.sm-library-workspace .cockpit-visual-editor .cockpit-mode-tabs button[aria-selected="true"] {
  background: var(--sm-purple);
  border-color: var(--sm-purple);
  color: var(--sm-on-primary);
}
.cockpit-visual-editor button.cockpit-primary,
.sm-library-workspace .cockpit-visual-editor button.cockpit-primary {
  background: var(--sm-purple);
  border-color: var(--sm-purple);
  color: var(--sm-on-primary);
}
.cockpit-visual-editor button.cockpit-primary:hover:not(:disabled),
.sm-library-workspace .cockpit-visual-editor button.cockpit-primary:hover:not(:disabled) {
  background: var(--sm-purple-hover);
  border-color: var(--sm-purple-hover);
}
.cockpit-visual-editor .cockpit-sidebar .cockpit-field { color: var(--sm-copy); }
.cockpit-visual-editor .cockpit-sidebar .cockpit-field input,
.cockpit-visual-editor .cockpit-sidebar .cockpit-field select,
.cockpit-visual-editor .cockpit-sidebar .cockpit-field textarea {
  border-color: var(--sm-control-line);
  background: var(--sm-control-bg);
  color: var(--sm-ink);
  font-family: var(--ve-font);
}
.cockpit-visual-editor .cockpit-sidebar .cockpit-field :is(input,select,textarea):disabled {
  opacity: var(--sm-disabled-opacity);
  cursor: not-allowed;
}
.cockpit-visual-editor .cockpit-sidebar .cockpit-source {
  font-family: var(--ve-mono);
  color: var(--sm-copy);
}
.cockpit-visual-editor .cockpit-selection-hint { color: var(--sm-ink); }
.cockpit-visual-editor .cockpit-sidebar button.cockpit-primary {
  background: var(--sm-ink);
  border-color: var(--sm-ink);
  color: var(--sm-surface);
}
@media (prefers-reduced-motion: reduce) {
  .cockpit-visual-editor * { transition: none; animation: none; }
}
`;
