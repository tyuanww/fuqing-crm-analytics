import type { TextNode } from './html-selection-bridge.mjs';
export type AISourceSelection = { start: number; end: number; html_hash: string; rendered?: import('./html-rendered-text.mjs').RenderedLocator };
export function sourceTargets(pkg: any, manifest?: any, options?: { rendered?: boolean }): TextNode[];
export function selectionForAI(pkg: any, node?: TextNode): AISourceSelection | null;
export function instrumentSourceTargets(pkg: any, nodes: TextNode[]): any;
export function sourceTextPreview(pkg: any, node: TextNode, text: string, manifest?: any): any;
