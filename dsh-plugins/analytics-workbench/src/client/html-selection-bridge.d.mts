import type { RenderedLocator } from './html-rendered-text.mjs';
export type TextNode = { anchor?: RenderedLocator['anchor']; packageHash?: string; runtime?: RenderedLocator; runtimeOnly?: boolean; inspectOnly?: boolean; editable?: boolean; node_id: string; kind: string; mapping: string; mapping_token: string; version_hash: string; text: string; editorText?: string; richText?: boolean; tag: string; editableText?: boolean; block?: boolean; read_only_reason?: string | null; selection_hints?: { selectedText: string; htmlSelection: string; textValue?: string }; aiSource?: { start: number; end: number; inner_start: number; inner_end: number; html_hash: string }; source?: { start: number; end: number; inner_start: number; inner_end: number; html_hash: string } };
export function editableTextNodes(pkg: any, manifest?: any): TextNode[];
export function selectableNodes(pkg: any, manifest?: any): TextNode[];
export function selectionSrcdoc(pkg: any, options: { channel: string; pageId: string; version: number; nodes?: TextNode[]; editableIds?: string[]; selected?: string | null; editing?: boolean; selectBlocks?: boolean }): string;
export function acceptSelection(event: MessageEvent, context: { source: Window | null; channel: string; pageId: string; version: number; nodes: TextNode[] }): TextNode | null | undefined;
export function acceptTargets(event: MessageEvent, context: { source: Window | null; channel: string; pageId: string; version: number; nodes: TextNode[] }): TextNode[] | undefined;

export function editablePageNodes(pkg: any, manifest?: any): TextNode[];
