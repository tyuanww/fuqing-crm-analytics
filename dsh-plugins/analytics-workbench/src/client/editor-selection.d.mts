import type { TextNode } from './html-selection-bridge.mjs';

export function visibleEditorNodes(listed: readonly TextNode[], verified: readonly TextNode[] | null): TextNode[];
export function editorSelectionReady(selection: { ok?: boolean; node_id?: string } | null | undefined): boolean;
