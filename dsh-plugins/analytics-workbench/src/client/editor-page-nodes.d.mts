import type { PageNode, TextNode } from './html-node-graph-bridge.mjs';

export function editorPageCatalog(pkg: { html?: string } | null | undefined, manifest?: unknown, options?: {
  pageId?: string;
  flag?: string;
  env?: Record<string, string | undefined>;
}): {
  source: 'source-index' | 'node-graph';
  code: string | null;
  mode: string;
  pageNodes: PageNode[];
  textNodes: TextNode[];
};
