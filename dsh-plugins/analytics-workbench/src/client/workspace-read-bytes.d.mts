/** Byte window the cockpit delivery reader still passes as `{ offset, length }`. */
export type WorkspaceByteWindow = {
  offset?: number;
  length?: number;
};

/** `readBytes` options for DSH 0.1.7: the window lives under `range`. */
export function workspaceReadBytesRequest(range: WorkspaceByteWindow): {
  range: WorkspaceByteWindow;
};

/**
 * Keep an already-encoded envelope. When `data` is raw bytes, return the
 * delivery reader's `{ ok, value: { data: base64, ... } }` shape.
 */
export function normalizeWorkspaceReadBytes(raw: unknown): unknown;
