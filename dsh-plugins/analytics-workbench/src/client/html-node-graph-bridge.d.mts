export type Crumb = { node_id: string; tag: string; kind: string };
export type PageNode = {
  node_id: string; kind: string; mapping: string; mapping_token?: string | null; version_hash?: string | null;
  text: string; tag: string; parent_node_id?: string | null; parent_node_ids?: string[]; parent_block?: Crumb | null;
  breadcrumb?: Crumb[]; source_range?: { start: number; end: number }; capabilities?: Record<string, boolean>; boundary?: string;
};
export type TextNode = PageNode;
export const BLOCK_TAGS: readonly string[];
export function editableTextNodes(pkg: any, manifest?: any): TextNode[];
export function editablePageNodes(pkg: any, manifest?: any): PageNode[];
export function selectionRuntime(config: any): void;
export function selectionSrcdoc(pkg: any, options: { channel: string; pageId: string; version: number; nodes?: PageNode[]; selected?: string | null; editing?: boolean; allowRuntime?: boolean }): string;
export function acceptSelection(event: MessageEvent, context: { source: Window | null; channel: string; pageId: string; version: number; nodes: PageNode[]; allowRuntime?: boolean }): PageNode | null | undefined;
export function acceptOperationMessage(event: MessageEvent, context: { source: Window | null; channel: string; pageId: string; version: number; nodes?: PageNode[]; selection?: PageNode | null; apply?: boolean }): { ok: boolean; reason?: string; operation?: any };
