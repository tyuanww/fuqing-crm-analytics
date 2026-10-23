export function parseClientRequestEnvelope(input: unknown): {
  type: 'client-request';
  rpcId: string;
  method: string;
  payload: unknown;
} | null;
