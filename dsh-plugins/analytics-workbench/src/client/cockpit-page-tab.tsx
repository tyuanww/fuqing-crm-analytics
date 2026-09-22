import { useEffect, useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

type PageStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { current?: { page_id?: string; title?: string; package?: { html?: string } } | null };
  openPage(pageId: string): Promise<boolean | undefined>;
};

export const COCKPIT_PAGE_TAB = 'shine-mage.cockpit-page';
export const cockpitPageAddress = (pageId: string) => 'dsh-resource://cockpit-page/' + encodeURIComponent(pageId);

export function CockpitPageTab({ useTabInfo, pageStore, openCockpit }: PropsRuntime<'sidebar.right.pane.tab'> & {
  pageStore: PageStore; openCockpit(): boolean;
}) {
  const { tab } = useTabInfo();
  const pageId = useMemo(() => {
    try { return decodeURIComponent(new URL(tab.contentId).pathname.replace(/^\//, '')); }
    catch { return ''; }
  }, [tab.contentId]);
  const state = useSyncExternalStore(pageStore.subscribe, pageStore.getSnapshot);
  useEffect(() => {
    if (!pageId || state.current?.page_id === pageId) return;
    void pageStore.openPage(pageId);
  }, [pageId, pageStore, state.current?.page_id]);
  const current = state.current?.page_id === pageId ? state.current : null;
  return <div data-testid="cockpit-page-sidebar" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: 8 }}>
      <strong>{current?.title || 'HTML 产物'}</strong>
      <button type="button" onClick={() => { openCockpit(); }}>在驾驶舱编辑</button>
    </div>
    {current?.package?.html
      ? <iframe title={current.title || 'HTML 产物'} sandbox="" srcDoc={current.package.html} style={{ flex: 1, width: '100%', border: 0 }} />
      : <p role="status">正在打开页面…</p>}
  </div>;
}
