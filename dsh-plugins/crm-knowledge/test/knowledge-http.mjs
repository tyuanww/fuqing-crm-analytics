/** Public crm-knowledge-service/1.0.0 caller for CRM tests. Does not import the knowledge plugin. */
const CONTRACT = 'crm-knowledge-service/1.0.0';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
function unavailable(code) {
  return { status: 'NOT_AVAILABLE', reason: { code } };
}
async function readBoundedJson(response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel();
    throw new Error('INVALID_RESPONSE');
  }
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('INVALID_RESPONSE');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function explainPublicKnowledge(origin, topic, { timeoutMs = 30000 } = {}) {
  // Shorter budgets are only for owned negative fixtures; all requests stay bounded.
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('INVALID_TIMEOUT');
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(origin + '/api/v1/crm-knowledge/explain', {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
      headers: { 'X-ShineMage-Contract': CONTRACT, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ topic }),
    });
    if (response.headers.get('x-shinemage-contract') !== CONTRACT || response.status === 409) {
      await response.body?.cancel();
      return unavailable('CONTRACT_MISMATCH');
    }
    if (!response.ok) {
      await response.body?.cancel();
      return unavailable('SERVICE_UNAVAILABLE');
    }
    try { return await readBoundedJson(response); }
    catch { return unavailable(signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE'); }
  } catch {
    return unavailable(signal.aborted ? 'TIMEOUT' : 'SERVICE_UNAVAILABLE');
  }
}
