export function applyPresentationOverlay(
  html: string,
  overlays?: Record<string, { text?: string; style?: Record<string, string>; attributes?: Record<string, string> }> | null,
  nodes?: Array<{ node_id?: string; source_range?: { start: number; end: number } | null }>,
): string;
export function safeOverlayAttributes(attributes: Record<string, string>): Array<[string, string]>;
export function safeOverlayStyles(style: Record<string, string>): Array<[string, string]>;
