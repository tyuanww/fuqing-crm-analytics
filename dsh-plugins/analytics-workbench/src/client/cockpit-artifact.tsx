import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { CockpitAIClient } from './cockpit-ai-client.mjs';
import { CockpitAIPanel, CockpitAIPreview } from './cockpit-ai-panel.tsx';
import { cockpitCss } from './cockpit-workspace-style.ts';

export const COCKPIT_ARTIFACT_TAB = 'shine-mage.cockpit-artifact';
export const cockpitArtifactAddress = (id: string) => 'dsh-resource://cockpit-ai/' + encodeURIComponent(id);

/** Session-owned native tab; preview is always the server's immutable source/candidate. */
export function CockpitArtifact({ useTabInfo, createClient }: PropsRuntime<'sidebar.right.pane.tab'> & { createClient(id: string): CockpitAIClient }) {
  const { tab } = useTabInfo();
  const id = useMemo(() => {
    try { return decodeURIComponent(new URL(tab.contentId).pathname.replace(/^\//, '')); }
    catch { return ''; }
  }, [tab.contentId]);
  const client = useMemo(() => createClient(id), [createClient, id]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const savedPreview = useRef<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void client.load(id).then(async ok => {
      const job = client.getSnapshot().active;
      if (alive && (ok || job?.id === id) && job) await client.preview(job.candidate_hash ? 'candidate' : 'source');
    });
    return () => { alive = false; };
  }, [client, id]);
  useEffect(() => {
    if (state.active?.status !== 'SAVED' || state.busy || state.confirmationUncertain
      || (state.previewVariant === 'candidate' && state.html)) return;
    const request = id + ':' + state.active.candidate_hash;
    if (savedPreview.current === request) return;
    savedPreview.current = request;
    void client.preview('candidate');
  }, [client, id, state.active?.status, state.active?.candidate_hash, state.busy, state.confirmationUncertain, state.previewVariant, state.html]);
  const retained = useRef({ client, html: state.previewVariant === 'candidate' ? state.html : null });
  if (retained.current.client !== client) retained.current = { client, html: null };
  if (state.html && state.previewVariant === 'candidate') retained.current.html = state.html;
  const shown = state.active?.status === 'SAVED' ? { ...state, html: retained.current.html } : state;
  return <div className="cockpit-artifact" data-testid="cockpit-native-artifact" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <style>{cockpitCss}</style>
    <div className="cockpit-document-tools"><strong>{state.active?.title ?? 'HTML 产物'}</strong>
      <span className="cockpit-muted">{state.active?.status === 'SAVED' ? '已保存 · 版本 ' + state.active.saved_version : state.previewVariant === 'candidate' ? '修改候选 · 尚未保存' : '当前版本'}</span></div>
    <CockpitAIPanel client={client} state={state} />
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}><CockpitAIPreview state={shown} /></div>
  </div>;
}
