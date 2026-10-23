export function parseClientRequestEnvelope(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const { type, rpcId, method, payload } = input;
  if (type !== 'client-request' || typeof rpcId !== 'string' || typeof method !== 'string'
    || !Object.hasOwn(input, 'payload')) return null;
  return { type, rpcId, method, payload };
}
