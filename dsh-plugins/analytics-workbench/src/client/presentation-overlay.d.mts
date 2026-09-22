export function applyPresentationOverlay(
  html: string,
  overlays?: Record<string, { text?: string; style?: Record<string, string>; attributes?: Record<string, string> }> | null,
  nodes?: Array<{ node_id?: string; source_range?: { start: number; end: number } | null }>,
): string;
