import type { components } from '../src/knowledge-contract.generated.js';
import type { KnowledgeAccess } from '../src/knowledge-access.generated.js';
export function explanation(value: components['schemas']['KnowledgeExplanation']) {
  const accepted: false = value.real_business_acceptance;
  return { accepted, digest: value.pack_sha256 };
}
export function scope(access: KnowledgeAccess, sessionId: string) {
  const lease = access.authorize(sessionId);
  return lease?.isCurrent() ? lease.username : null;
}
