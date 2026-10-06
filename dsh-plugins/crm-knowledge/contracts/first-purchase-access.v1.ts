/** CRM owns the login grant. Consumers receive a revocable, finite HTTP capability, never credentials. */
import type {} from '@deepseek-ai/cordis';

export const FIRST_PURCHASE_ACCESS_CONTRACT = 'shinemage-first-purchase-access/v1' as const;
export type FirstPurchaseOperation = 'inspect' | 'save' | 'reconcile';
export interface FirstPurchaseLease {
  readonly username: string;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  request(operation: FirstPurchaseOperation, body: unknown, key: string, signal?: AbortSignal): Promise<{
    status: number; payload: unknown;
  }>;
}
export interface FirstPurchaseAccess {
  readonly contract: typeof FIRST_PURCHASE_ACCESS_CONTRACT;
  readonly configured: boolean;
  authorize(sessionId: string): FirstPurchaseLease | null;
}
declare module '@deepseek-ai/cordis' {
  interface Context { crmFirstPurchaseAccess: FirstPurchaseAccess; }
}
