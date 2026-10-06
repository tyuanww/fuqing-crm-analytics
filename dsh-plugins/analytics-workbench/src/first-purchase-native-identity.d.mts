import type { FirstPurchaseAccess } from './first-purchase-access.generated.js';
import type { components } from './first-purchase-analysis-contract.generated.js';
export function resolveNativeIdentity(provider: () => FirstPurchaseAccess | undefined, sessionId: string): Promise<{
  session_id: string; identity: components['schemas']['FirstPurchaseSessionIdentity'];
}>;
export function observeNativeIdentity(provider: () => FirstPurchaseAccess | undefined, sessionId: string): Promise<
  Awaited<ReturnType<typeof resolveNativeIdentity>> | { session_id: string; denied: 'UNAUTHENTICATED' | 'FORBIDDEN' }
>;
