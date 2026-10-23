export const cockpitCss = `
.cockpit-ai-panel { padding:0 16px; }
.cockpit-ai-diff { margin:8px 0; font-size:13px; }
.cockpit-ai-diff pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:220px; overflow:auto; font-size:12px; }

.sm-library-theme { height:100%; min-height:0; }
.sm-library-workspace { --lib-rail:var(--sm-rail);
  container:cockpit / inline-size; color:var(--sm-ink); background:var(--sm-bg); height:100%; min-height:560px; min-width:0; display:flex; flex-direction:column;
  font:14px/1.55 var(--sm-font-body,'PingFang SC',sans-serif); position:relative; }
.sm-library-workspace * { box-sizing:border-box; }
.sm-library-workspace button,.sm-library-workspace input,.sm-library-workspace select,.sm-library-workspace textarea { font:inherit; color:inherit; }
.sm-library-workspace button { min-height:34px; padding:6px 12px; border:1px solid var(--sm-control-line); border-radius:7px; background:var(--sm-control-bg); cursor:pointer; }
.sm-library-workspace button:hover:not(:disabled) { background:var(--sm-control-bg-hover); border-color:var(--sm-control-line-hover); }
.sm-library-workspace button:active:not(:disabled) { background:var(--sm-control-bg-pressed); }
.sm-library-workspace button:disabled { opacity:var(--sm-disabled-opacity); cursor:not-allowed; }
.sm-library-workspace :is(button,input,select,textarea,a):focus-visible { outline:var(--sm-focus-width) solid var(--sm-focus); outline-offset:var(--sm-focus-offset); }
.sm-library-workspace button.cockpit-primary { background:var(--sm-purple); color:var(--sm-on-primary); border-color:var(--sm-purple); font-weight:500; }
.sm-library-workspace button.cockpit-primary:hover:not(:disabled) { background:var(--sm-purple-hover); border-color:var(--sm-purple-hover); }
.sm-library-workspace h1,.sm-library-workspace h2,.sm-library-workspace h3,.sm-library-workspace p { margin:0; }
.sm-library-pagehead { flex-shrink:0; min-height:68px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 24px; background:var(--sm-surface-raised); border-bottom:1px solid var(--sm-line); }
.cockpit-heading { display:flex; align-items:center; gap:14px; min-width:0; }
.cockpit-heading h1 { font-size:18px; font-weight:600; letter-spacing:.02em; }
.cockpit-heading small { display:block; font-size:11px; color:var(--sm-muted); letter-spacing:.06em; }
.cockpit-head-actions { display:flex; gap:8px; align-items:center; }
.cockpit-shell-body { flex:1; display:flex; min-height:0; min-width:0; position:relative; }
.cockpit-rail-container { display:flex; flex:none; min-height:0; position:relative; }
.cockpit-rail-container[hidden] { display:none; }
.cockpit-rail-container[data-floating=true] { position:absolute; z-index:32; border:1px solid var(--sm-line); border-radius:10px; box-shadow:var(--sm-shadow-panel); overflow:hidden; max-height:100%; }
.cockpit-rail-heading .cockpit-rail-grab { border:0; background:transparent; cursor:grab; touch-action:none; padding:2px 0; font-weight:600; }
.cockpit-rail-heading .cockpit-rail-grab:active { cursor:grabbing; }
.sm-library-workspace .cockpit-rail-corner { position:absolute; bottom:0; right:0; border:0; border-radius:0; padding:0; min-height:22px; width:22px; background:var(--lib-rail); cursor:nwse-resize; touch-action:none; }
.sm-library-rail { width:248px; flex:0 0 248px; padding:20px 14px; border-right:1px solid var(--sm-line); display:flex; flex-direction:column; gap:16px; overflow:auto; background:var(--sm-rail); }
.sm-library-rail[hidden] { display:none; }
.cockpit-rail-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.cockpit-rail-heading h2 { font-size:14px; font-weight:600; }
.cockpit-rail-heading button { padding:2px 8px; min-height:28px; }
.cockpit-muted { color:var(--sm-muted); font-size:12px; line-height:1.7; overflow-wrap:anywhere; }
.cockpit-eyebrow { color:var(--sm-muted); font-size:11px; letter-spacing:.08em; }
.cockpit-rail-status { padding:12px; border:1px solid var(--sm-line); border-radius:8px; background:var(--sm-surface-raised); }
.cockpit-rail-status p + button { margin-top:8px; }
.sm-library-products ul { padding:0; margin:6px 0 14px; list-style:none; }
.sm-library-products .cockpit-group { display:flex; align-items:center; width:100%; background:transparent; border:0; text-align:left; padding:5px 8px; color:var(--sm-muted); font-size:12px; }
.cockpit-group span:last-child { margin-left:auto; }
.sm-library-products .cockpit-product { display:flex; width:100%; gap:10px; text-align:left; padding:11px 10px; background:transparent; border:1px solid transparent; margin:3px 0; }
.sm-library-products li[data-selected="1"] .cockpit-product { background:var(--sm-selected-bg); border-color:var(--sm-line-strong); box-shadow:var(--sm-shadow-control); }
.cockpit-file-icon { font:600 10px/30px monospace; width:30px; height:32px; text-align:center; flex-shrink:0; background:var(--sm-surface-subtle); border-radius:5px; color:var(--sm-muted); }
li[data-selected="1"] .cockpit-file-icon { color:var(--sm-highlight-ink); background:var(--sm-highlight-bg); }
.cockpit-product-copy { min-width:0; flex:1; }
.cockpit-product-copy strong { display:block; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cockpit-product-copy small { display:block; font-size:11px; color:var(--sm-muted); margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cockpit-rail-footer { margin-top:auto; border-top:1px solid var(--sm-line); padding:12px 8px 0; }
.sm-library-canvas { display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; background:var(--sm-surface); }
.sm-library-pathbar { display:flex; flex-wrap:nowrap; align-items:center; justify-content:space-between; gap:10px; padding:6px 16px; min-height:36px; border-bottom:1px solid var(--sm-line); background:var(--sm-pathbar); }
.sm-library-pathbar > div { flex:1; min-width:0; }
.sm-library-pathbar h2 { font-size:13px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sm-library-pathbar > .cockpit-badge { flex-shrink:0; }
.cockpit-badge { display:inline-block; border:1px solid var(--sm-line); border-radius:5px; padding:2px 7px; font-size:11px; color:var(--sm-muted); white-space:nowrap; }
.cockpit-badge.pending { color:var(--sm-highlight-ink); background:var(--sm-highlight-bg); border-color:var(--sm-highlight-line); }
.cockpit-content { flex:1; min-height:0; min-width:0; display:flex; flex-direction:column; }
.cockpit-office { display:flex; flex:1; min-height:480px; flex-direction:column; }
.cockpit-office-frame { flex:1; min-height:440px; position:relative; }
.cockpit-office-frame > div,.cockpit-office-frame > iframe { width:100%; height:100%; min-height:440px; border:0; position:absolute; inset:0; }
.cockpit-editor-layout { display:flex; flex:1; min-width:0; min-height:0; position:relative; }
.cockpit-editor-canvas { display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; }
.cockpit-document-tools { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-height:48px; padding:10px 20px; border-bottom:1px solid var(--sm-line); }
.cockpit-document-tools button { font-size:12px; min-height:28px; padding:3px 8px; border-color:transparent; background:transparent; color:var(--sm-copy); }
.sm-library-workspace :is(.cockpit-head-actions, .cockpit-document-tools, .cockpit-notice, .cockpit-mobile-context, .cockpit-modal-actions) button,
.sm-library-workspace .cockpit-sidebar-header button,
.sm-library-workspace .sm-leave-prompt button { min-width:44px; min-height:44px; }
.cockpit-tool-actions { margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; }
.cockpit-frame-wrap { flex:1; min-height:360px; display:flex; flex-direction:column; min-width:0; background:var(--sm-bg); }
.cockpit-html-frame { display:block; border:0; width:100%; height:100%; min-height:440px; flex:1; background:var(--sm-surface); }
.cockpit-sidebar { width:308px; flex:0 0 308px; background:var(--sm-surface-raised); border-left:1px solid var(--sm-line); display:flex; flex-direction:column; min-height:0; }
.cockpit-sidebar-header { display:flex; justify-content:space-between; align-items:center; padding:16px 18px; border-bottom:1px solid var(--sm-line); }
.cockpit-sidebar-header h2 { font-size:14px; font-weight:600; }
.cockpit-sidebar-header button { border:0; background:transparent; font-size:22px; padding:0 6px; line-height:1; }
.cockpit-sidebar-body { display:flex; flex-direction:column; gap:14px; padding:20px; overflow:auto; }
.cockpit-sidebar-body h3 { font-size:15px; font-weight:500; overflow-wrap:anywhere; }
.cockpit-sidebar-tools { display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--sm-line); padding-top:18px; margin-top:10px; }
.cockpit-selection-hint { color:var(--sm-purple); font-size:32px; line-height:1; padding-top:20px; }
.cockpit-field { display:flex; flex-direction:column; align-items:stretch; gap:7px; font-size:12px; color:var(--sm-copy); }
.cockpit-field input:not([type=checkbox]),.cockpit-field select,.cockpit-field textarea { width:100%; min-width:0; border:1px solid var(--sm-control-line); background:var(--sm-control-bg); border-radius:6px; padding:8px 10px; color:var(--sm-ink); font-size:13px; }
.cockpit-field textarea { resize:vertical; min-height:62px; }
.cockpit-field input[type=checkbox] { align-self:flex-start; accent-color:var(--sm-purple); }
.cockpit-board-form { display:flex; flex-direction:column; gap:14px; }
.cockpit-board-form hr { width:100%; border:0; border-top:1px solid var(--sm-line); }
.cockpit-notice { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:14px 20px; background:var(--sm-notice-bg); border-bottom:1px solid var(--sm-notice-line); color:var(--sm-notice-ink); font-size:13px; }
.cockpit-notice > div:first-child { flex:1; min-width:180px; }
.cockpit-notice p { color:var(--sm-notice-ink); font-size:12px; }
.cockpit-change { overflow-wrap:anywhere; }
.cockpit-error { color:var(--sm-danger); background:var(--sm-danger-soft); padding:10px 20px; border-bottom:1px solid var(--sm-danger); font-size:12px; }
.cockpit-live { font-size:12px; color:var(--sm-copy); padding:7px 20px; background:var(--sm-surface-raised); border-bottom:1px solid var(--sm-line); }
.cockpit-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; margin:auto; padding:48px 24px; gap:12px; max-width:480px; min-height:320px; }
.cockpit-empty-mark { font-size:36px; color:var(--sm-muted); border:1px solid var(--sm-line); border-radius:14px; width:64px; height:64px; display:grid; place-items:center; margin-bottom:10px; }
.cockpit-empty h2 { font-size:20px; font-weight:500; }
.cockpit-empty p { font-size:13px; color:var(--sm-muted); }
.cockpit-board-wrap { flex:1; overflow:auto; padding:24px; min-width:0; }
.sm-library-workspace .sm-layout-scroll { max-height:none; }
.sm-library-workspace .sm-layout-block { border-radius:10px; background:var(--sm-surface); }
.cockpit-source { font:11px/1.65 monospace; white-space:pre-wrap; overflow-wrap:anywhere; max-height:500px; overflow:auto; }
.cockpit-history-row { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; padding:8px 0; border-bottom:1px solid var(--sm-line); }
.cockpit-modal-backdrop { position:absolute; inset:0; z-index:50; background:var(--sm-backdrop); display:grid; place-items:center; padding:20px; }
.cockpit-modal { width:min(440px,100%); background:var(--sm-surface-raised); border:1px solid var(--sm-line); border-radius:14px; padding:24px; box-shadow:var(--sm-shadow-panel); display:flex; flex-direction:column; gap:16px; }
.cockpit-modal h2 { font-size:18px; }
.cockpit-modal-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
.sm-library-products li { display:flex; align-items:center; min-width:0; border-radius:6px; }
.sm-library-products li[data-drag-over=true] { box-shadow:inset 0 2px var(--sm-purple); }
.sm-library-products .cockpit-product { flex:1; min-width:0; width:auto; padding:5px 4px; align-items:center; margin:1px 0; }
.cockpit-file-icon { width:24px; height:26px; line-height:26px; }
.sm-library-products .cockpit-drag,.sm-library-products .cockpit-product-delete { border:0; background:transparent; padding:2px 4px; min-height:30px; }
.sm-library-products .cockpit-drag { cursor:grab; color:var(--sm-muted); }
.sm-library-products .cockpit-product-delete { color:var(--sm-danger); opacity:0; }
.sm-library-products li:hover .cockpit-product-delete,.sm-library-products li:focus-within .cockpit-product-delete { opacity:1; }
.cockpit-rail-resize { flex:0 0 6px; cursor:col-resize; touch-action:none; background:var(--lib-rail); z-index:2; }
.sm-library-workspace[data-resizing=true] { cursor:col-resize; user-select:none; }
.sm-library-workspace[data-rail-moving=true] { cursor:grabbing; }
.sm-library-workspace[data-resizing=true] iframe { pointer-events:none; }
.cockpit-rail-resize:hover,.cockpit-rail-resize:focus-visible { background:var(--sm-purple); outline:none; }
.sm-library-workspace:fullscreen { width:100vw; height:100dvh; min-height:0; }
.sm-library-workspace[data-presenting=true] :is(.sm-library-pagehead,.cockpit-rail-container,.sm-library-rail,.cockpit-rail-resize,.sm-library-pathbar,.cockpit-ai-panel,.cockpit-document-tools,.cockpit-sidebar,.cockpit-live,.cockpit-mobile-context) { display:none; }
.sm-library-workspace[data-presenting=true] .cockpit-editor-canvas { display:flex; }
.sm-library-workspace[data-presenting=true] .cockpit-html-frame { min-height:0; }
.cockpit-exit-fullscreen { position:absolute; right:12px; top:12px; z-index:45; opacity:.3; }
.cockpit-exit-fullscreen:hover,.cockpit-exit-fullscreen:focus-visible { opacity:1; }
.cockpit-ai-complete { font-size:12px; color:var(--sm-muted); padding:4px 16px; border-bottom:1px solid var(--sm-line); }
.cockpit-ai-complete summary { cursor:pointer; }
@media (hover:none) { .sm-library-products .cockpit-product-delete { opacity:1; } }
@container cockpit (max-width:760px) {
  .sm-library-pagehead { padding:12px 16px; gap:8px; }
  .cockpit-heading small,.cockpit-back-label { display:none; }
  .cockpit-heading { gap:8px; }
  .cockpit-head-actions { gap:5px; }
  .sm-library-workspace button { padding:6px 9px; }
  /* Floating coordinates and height are inline; narrow layouts must override them. */
  .sm-library-workspace .cockpit-rail-container { position:absolute; inset:0!important; width:100%; height:100%!important; z-index:30; border:0; border-radius:0; }
  .sm-library-rail { position:absolute; inset:0; z-index:30; width:100%; border:0; }
  .sm-library-workspace[data-mobile-inspector=true]:not([data-presenting=true]) .cockpit-editor-layout:has(.cockpit-sidebar) > .cockpit-editor-canvas { display:none; }
  .sm-library-workspace[data-mobile-inspector=false] .cockpit-sidebar { display:none; }
  .cockpit-mobile-context { display:flex; flex-wrap:wrap; gap:8px; padding:10px 16px; border-bottom:1px solid var(--sm-line); }
  .cockpit-mobile-context button[aria-pressed=true] { color:var(--sm-highlight-ink); background:var(--sm-highlight-bg); border-color:var(--sm-highlight-line); }
  .cockpit-sidebar { width:100%; flex:1; border:0; }
  .sm-library-pathbar { padding:6px 14px; }
  .cockpit-document-tools { padding:10px 14px; }
  .cockpit-board-wrap { padding:14px; }
}
@container cockpit (max-width:560px) {
  .sm-library-pagehead { flex-direction:column; align-items:stretch; gap:10px; }
  .cockpit-heading h1 { white-space:nowrap; }
  .cockpit-head-actions { justify-content:space-between; flex-wrap:wrap; }
  .cockpit-head-actions button { white-space:nowrap; }
}
@media (prefers-reduced-motion:reduce) { .sm-library-workspace * { scroll-behavior:auto!important; transition:none!important; } }
`;
