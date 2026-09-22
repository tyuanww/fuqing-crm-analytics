export function previewDirectText(input?: Record<string, unknown>): {
  ok: boolean; code?: string; node_id?: string; kind?: string; overlay?: { text?: string; style?: Record<string, string>; attributes?: Record<string, string> };
  idempotency_key?: string; html?: string; package?: { html: string; css?: string; js?: string }; source_bytes_unchanged?: boolean;
};
export function previewNodeEdit(input?: Record<string, unknown>): {
  ok: boolean; code?: string; node_id?: string; kind?: string; channel?: string;
  overlay?: { text?: string; style?: Record<string, string>; attributes?: Record<string, string> } | null;
  package?: { html: string; css?: string; js?: string; resources?: unknown[]; node_map?: unknown[] };
  source_bytes_unchanged?: boolean; idempotency_key?: string; html?: string;
};
