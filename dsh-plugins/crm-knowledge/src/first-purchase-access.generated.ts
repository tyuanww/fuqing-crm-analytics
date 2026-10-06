// Generated from dsh-plugins/crm-knowledge/contracts/first-purchase-access.v1.ts; do not edit.
// source_sha256: 66f6b49cc6eb8e4bf550d0b5ffc5eb14e192cd1e2eefafe218d9998cb1a2cac7
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
