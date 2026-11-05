import { NATIVE_BOUNDS, kernelUrl, type NativeRuntime } from './runtime-endpoints.ts';
import { acpCallbackEnabled, acpContextUrl } from './acp-callback.mjs';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { FIRST_PURCHASE_FAMILY, QUERY_FAMILY, isRegisteredSession } from './runtime-family.mjs';

export async function loadRunContext(runtime: NativeRuntime, agent: Agent | undefined, requestId: string | undefined,
  unitId: string, packageDigest: string, signal: AbortSignal, resource: string | null = null): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const token = runtime.runtimeToken;
  const family = runtime.family;
  const queryMode = family === QUERY_FAMILY || family === FIRST_PURCHASE_FAMILY;
  const acp = acpCallbackEnabled();
  // In the ACP child the kernel session identity is the ACP session id; the
  // journal request id does not exist there. The binding resolver derives the
  // registered session/request pair from this id.
  const expectedRequestId = acp ? agent?.id : requestId;
  if (!token || !agent || (!acp && !isRegisteredSession(agent.id)) || !expectedRequestId) {
    throw new Error(queryMode ? 'query context has no bound native request' : 'B0 context has no bound native request');
  }
  const response = await fetch(acp ? acpContextUrl(runtime.kernelOrigin) : kernelUrl(runtime, 'kernel.run-context'), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(acp
      ? { acp_session_id: agent.id, unit_id: unitId, package_digest: packageDigest, resource }
      : { session_id: agent.id, request_id: requestId, unit_id: unitId, package_digest: packageDigest, resource }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(NATIVE_BOUNDS.contextTimeoutMs)]), redirect: 'error',
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(queryMode ? 'query kernel refused current context or budget' : 'B0 kernel refused current context or budget'); }
  // Enforce a streaming bound, not response.text() followed by a late size test.
  const reader = response.body?.getReader();
  if (!reader) throw new Error(queryMode ? 'query context has no body' : 'B0 context has no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > NATIVE_BOUNDS.payloadBytes) { await reader.cancel(); throw new Error(queryMode ? 'query context exceeds bound' : 'B0 context exceeds bound'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const context = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const schema = family === FIRST_PURCHASE_FAMILY ? 'analytics-first-purchase-runtime-context/v1'
    : family === QUERY_FAMILY ? 'analytics-channel-followup-runtime-context/v1' : 'analytics-b0-runtime-context/v1';
  const approval = queryMode ? 'NOT_AVAILABLE_IN_QUERY_RUN' : 'NOT_AVAILABLE_IN_B0';
  if (context.schema_version !== schema || context.session_id !== agent.id
    || context.request_id !== expectedRequestId || context.versions?.method_package_digest !== packageDigest
    || !(context.run_status === 'RUNNING' || (family === FIRST_PURCHASE_FAMILY
      && resource === null && context.run_status === 'SUCCEEDED')) || context.contains_real_data !== false
    || context.approval_state !== approval || context.memory_authority !== 'NONE') {
    throw new Error(queryMode ? 'query context contract mismatch' : 'B0 context contract mismatch');
  }
  signal.throwIfAborted();
  return context;
}
