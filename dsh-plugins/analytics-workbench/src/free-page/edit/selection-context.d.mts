export const SELECTION_CONTEXT_SCHEMA: 'free-page-selection-context/v1';
export const SELECTION_CONTEXT_LIMITS: Readonly<{ text: number; html: number; related: number; total: number }>;
export type SelectionContextResult =
  | { ok: false; code: string; reason: string }
  | { ok: true; context: Record<string, unknown> };
export function buildSelectionContext(input: {
  pagePackage: Record<string, unknown>;
  pageId: string;
  sessionId: string;
  version: number;
  node: Record<string, unknown>;
  bindingManifest?: Record<string, unknown> | null;
  uriBase?: string;
}): SelectionContextResult;
