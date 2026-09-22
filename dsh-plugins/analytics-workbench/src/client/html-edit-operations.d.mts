export const EDIT_CHANNELS: readonly ['presentation', 'source', 'logic'];
export const EDIT_ACTIONS: readonly ['select', 'set_text', 'set_attribute', 'set_style', 'replace_structure', 'ai_instruction'];
export const EDIT_KINDS: readonly ['select', 'set_text', 'set_attribute', 'set_style', 'replace_structure', 'ai_instruction'];
export const EDIT_MODES: readonly ['select', 'direct', 'ai', 'style'];
export type EditChannel = (typeof EDIT_CHANNELS)[number];
export type EditKind = (typeof EDIT_ACTIONS)[number];
export type EditAction = EditKind;
export type EditMode = (typeof EDIT_MODES)[number];
export function actionForMode(mode: EditMode | string, detail?: 'style' | 'attribute' | string): EditAction;
export function channelForAction(action: EditAction | string): EditChannel;
export function operationCapabilities(node: any): Record<string, boolean>;
export function operationBoundary(node: any, kind?: EditAction | string): string;
export function createEditOperation(input: {
  pageId?: string; baseVersion?: number; node: any; channel?: EditChannel; kind?: EditAction; action?: EditAction;
  value?: string; instruction?: string; attributes?: Record<string, string>; styles?: Record<string, string>;
  structure?: string | null; original?: string; proposed?: string; proposedValue?: string;
}): {
  operation_id: string; page_id: string | null; base_version: number | null; channel: EditChannel; action: EditAction; kind: EditAction;
  target: Record<string, unknown>; breadcrumb: unknown[]; original_value: string; proposed_value: string;
  capability: Record<string, boolean>; payload: Record<string, unknown>; boundary: string | null;
  status: 'ready_for_adapter' | 'needs_contract';
};
export function acceptOperation(operation: any, context?: {
  pageId?: string; version?: number; nodes?: any[]; selection?: any; apply?: boolean; channel?: string;
}): { ok: true; operation: any } | { ok: false; reason: string };
export function formatCapability(node: any): string;
export function parseStyleDeclaration(text: string): Record<string, string>;
export function nodeLabel(node: any): string;
