/** Scoped chrome for the visual editor. Tokens follow DESIGN.md; no cyan dashboard palette. */
export const visualEditorCss = `
.cockpit-visual-editor {
  --ve-plum: #09050D;
  --ve-purple: #805D9D;
  --ve-lilac: #D3C3E8;
  --ve-lime: #F2FFDC;
  --ve-ink: #FEFCFF;
  --ve-danger: #FF7D91;
  --ve-glass: rgba(255, 255, 255, 0.03);
  --ve-font: "Alibaba PuHuiTi 3.0", "PingFang SC", "Microsoft YaHei", sans-serif;
  --ve-display: Outfit, "SF Pro Display", "PingFang SC", sans-serif;
  --ve-mono: "SFMono-Regular", Menlo, monospace;
}
.cockpit-visual-editor .cockpit-sidebar {
  background: var(--ve-plum);
  color: var(--ve-ink);
  border-left: 1px solid rgba(211, 195, 232, 0.28);
  font-family: var(--ve-font);
}
.cockpit-visual-editor .cockpit-sidebar-header { border-bottom-color: rgba(211, 195, 232, 0.22); }
.cockpit-visual-editor .cockpit-sidebar h2,
.cockpit-visual-editor .cockpit-sidebar h3 {
  color: var(--ve-ink);
  font-family: var(--ve-display);
}
.cockpit-visual-editor .cockpit-sidebar .cockpit-muted,
.cockpit-visual-editor .cockpit-sidebar .cockpit-eyebrow { color: var(--ve-lilac); }
.cockpit-visual-editor .cockpit-sidebar-header button { color: var(--ve-lilac); }
.cockpit-visual-editor .cockpit-node-card {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid rgba(211, 195, 232, 0.35);
  border-radius: 12px;
  background: var(--ve-glass);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(18px);
}
.cockpit-visual-editor .cockpit-node-card div { display: grid; gap: 2px; }
.cockpit-visual-editor .cockpit-node-card dt {
  margin: 0;
  color: var(--ve-lilac);
  font: 11px/16px var(--ve-mono);
  letter-spacing: 0.04em;
}
.cockpit-visual-editor .cockpit-node-card dd {
  margin: 0;
  color: var(--ve-ink);
  font: 14px/22px var(--ve-font);
  overflow-wrap: anywhere;
}
.cockpit-visual-editor [data-testid="html-capability"] { color: var(--ve-lime); }
.cockpit-visual-editor [data-testid="html-operation-boundary"] { color: var(--ve-danger); }
.cockpit-visual-editor .cockpit-mode-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-left: 0; }
.cockpit-visual-editor .cockpit-mode-tabs button,
.sm-library-workspace .cockpit-visual-editor .cockpit-mode-tabs button {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid rgba(211, 195, 232, 0.4);
  border-radius: 8px;
  background: var(--ve-glass);
  color: var(--ve-lilac);
}
.cockpit-visual-editor .cockpit-mode-tabs button[aria-selected="true"],
.sm-library-workspace .cockpit-visual-editor .cockpit-mode-tabs button[aria-selected="true"] {
  background: var(--ve-purple);
  border-color: var(--ve-purple);
  color: var(--ve-ink);
}
.cockpit-visual-editor button.cockpit-primary,
.sm-library-workspace .cockpit-visual-editor button.cockpit-primary {
  background: var(--ve-purple);
  border-color: var(--ve-purple);
  color: var(--ve-ink);
}
.cockpit-visual-editor .cockpit-sidebar .cockpit-field { color: var(--ve-lilac); }
.cockpit-visual-editor .cockpit-sidebar .cockpit-field input,
.cockpit-visual-editor .cockpit-sidebar .cockpit-field select,
.cockpit-visual-editor .cockpit-sidebar .cockpit-field textarea {
  border-color: rgba(211, 195, 232, 0.4);
  background: var(--ve-ink);
  color: var(--ve-plum);
  font-family: var(--ve-font);
}
.cockpit-visual-editor .cockpit-sidebar .cockpit-source {
  font-family: var(--ve-mono);
  color: var(--ve-lilac);
}
.cockpit-visual-editor .cockpit-selection-hint { color: var(--ve-lilac); }
@media (prefers-reduced-motion: reduce) {
  .cockpit-visual-editor * { transition: none; animation: none; }
}
`;
