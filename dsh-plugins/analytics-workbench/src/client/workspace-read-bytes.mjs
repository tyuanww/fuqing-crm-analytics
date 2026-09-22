/** Adapt DSH 0.1.7 workspaceFiles.readBytes for the cockpit delivery reader. */

export function workspaceReadBytesRequest(range) {
  return { range };
}

function bytesToBase64(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export function normalizeWorkspaceReadBytes(raw) {
  const wrapped = raw && typeof raw === 'object' && raw.ok === true;
  const value = wrapped ? raw.value : raw;
  const data = value && typeof value === 'object' ? value.data : undefined;
  if (typeof data === 'string' || data == null) return raw;
  const encoded = { ...value, data: bytesToBase64(data) };
  return wrapped ? { ...raw, value: encoded } : { ok: true, value: encoded };
}
