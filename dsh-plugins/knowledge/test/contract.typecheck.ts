import type { components } from '@shine-mage/dsh-contracts/knowledge/knowledge-contract.generated.js';
import type { KnowledgeAccess } from '@shine-mage/dsh-contracts/knowledge/knowledge-access.generated.ts';
export function explanation(value: components['schemas']['KnowledgeExplanation']) {
  const accepted: false = value.real_business_acceptance;
  return { accepted, digest: value.pack_sha256 };
}
export function scope(access: KnowledgeAccess, sessionId: string) {
  const lease = access.authorize(sessionId);
  return lease?.isCurrent() ? lease.username : null;
}
