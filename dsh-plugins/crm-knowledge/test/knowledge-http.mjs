/** Public crm-knowledge-service/1.0.0 caller for CRM tests. Does not import the knowledge plugin. */
const CONTRACT = 'crm-knowledge-service/1.0.0';

function unavailable(code) {
  return { status: 'NOT_AVAILABLE', reason: { code } };
}

export async function explainPublicKnowledge(origin, topic) {
  try {
    const response = await fetch(origin + '/api/v1/crm-knowledge/explain', {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { 'X-ShineMage-Contract': CONTRACT, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ topic }),
    });
    if (response.headers.get('x-shinemage-contract') !== CONTRACT || response.status === 409) {
      await response.arrayBuffer().catch(() => {});
      return unavailable('CONTRACT_MISMATCH');
    }
    if (!response.ok) {
      await response.arrayBuffer().catch(() => {});
      return unavailable('SERVICE_UNAVAILABLE');
    }
    try { return await response.json(); }
    catch { return unavailable('INVALID_RESPONSE'); }
  } catch {
    return unavailable('SERVICE_UNAVAILABLE');
  }
}
