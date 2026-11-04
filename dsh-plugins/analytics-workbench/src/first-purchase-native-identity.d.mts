import type { FirstPurchaseAccess } from '@shine-mage/dsh-contracts/analytics-workbench/first-purchase-access.generated.ts';
import type { components } from '@shine-mage/dsh-contracts/analytics-workbench/first-purchase-analysis-contract.generated.js';
export function resolveNativeIdentity(provider: () => FirstPurchaseAccess | undefined, sessionId: string): Promise<{
  session_id: string; identity: components['schemas']['FirstPurchaseSessionIdentity'];
}>;
export function observeNativeIdentity(provider: () => FirstPurchaseAccess | undefined, sessionId: string): Promise<
  Awaited<ReturnType<typeof resolveNativeIdentity>> | { session_id: string; denied: 'UNAUTHENTICATED' | 'FORBIDDEN' }
>;
