/** Binding-correlated ACP tool callback.
 *
 * In the ACP child there is no kernel `session_id`/`request_id` and no journal
 * `rpcId` on the prompt, so the native bridge correlation is unavailable by
 * construction. The child sends only its ACP session id and the model
 * tool-call id; the kernel joins `acp_bindings` to the live run. This module is
 * the single builder both the bridge default and the ACP callback share, so the
 * wire body can never silently carry a kernel id the ACP child does not have.
 */

export const ACP_CALLBACK_PATH = '/internal/acp/tool-call';
export const ACP_CONTEXT_PATH = '/internal/acp/run-context';

/** True only when the kernel spawned this child with the scoped ACP marker. */
export function acpCallbackEnabled() {
  return process.env.B0_ACP_CALLBACK === '1';
}

/** Build the exact ACP callback body. A model-supplied id is never trusted. */
export function acpCallbackPayload(agent, callId, body) {
  if (!agent || typeof agent.id !== 'string' || agent.id.length === 0 || agent.id.length > 128) {
    throw new Error('ACP tool callback has no bound session');
  }
  if (typeof callId !== 'string' || callId.length === 0 || callId.length > 128) {
    throw new Error('ACP tool callback has no bound call id');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('ACP tool callback body must be an object');
  }
  return { acp_session_id: agent.id, call_id: callId, ...body };
}

/** Kernel URL for the callback; the base URL is already loopback-validated. */
export function acpCallbackUrl(kernelOrigin) {
  return acpOrigin(kernelOrigin, 'ACP tool callback') + ACP_CALLBACK_PATH;
}

/** Kernel URL for the binding-correlated pre-step context read. */
export function acpContextUrl(kernelOrigin) {
  return acpOrigin(kernelOrigin, 'ACP context read') + ACP_CONTEXT_PATH;
}

function acpOrigin(kernelOrigin, label) {
  if (typeof kernelOrigin !== 'string' || !kernelOrigin.startsWith('http://127.0.0.1:')) {
    throw new Error(`${label} requires a loopback kernel origin`);
  }
  return kernelOrigin.replace(/\/+$/, '');
}
