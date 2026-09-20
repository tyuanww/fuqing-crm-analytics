export type TextNode = { node_id: string; kind: string; mapping: string; mapping_token: string; version_hash: string; text: string; tag: string; editableText?: boolean; block?: boolean; aiSource?: { start: number; end: number; inner_start: number; inner_end: number; html_hash: string }; source?: { start: number; end: number; inner_start: number; inner_end: number; html_hash: string } };
export function editableTextNodes(pkg: any, manifest?: any): TextNode[];
export function selectionSrcdoc(pkg: any, options: { channel: string; pageId: string; version: number; nodes?: TextNode[]; selected?: string | null; editing?: boolean }): string;
export function acceptSelection(event: MessageEvent, context: { source: Window | null; channel: string; pageId: string; version: number; nodes: TextNode[] }): TextNode | null | undefined;
export function acceptTargets(event: MessageEvent, context: { source: Window | null; channel: string; pageId: string; version: number; nodes: TextNode[] }): TextNode[] | undefined;

export function editablePageNodes(pkg: any, manifest?: any): TextNode[];
