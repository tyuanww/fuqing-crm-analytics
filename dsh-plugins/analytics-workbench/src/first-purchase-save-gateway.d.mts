import type { FirstPurchaseAccess } from '@shine-mage/dsh-contracts/analytics-workbench/first-purchase-access.generated.ts';
export const FIRST_PURCHASE_SAVE_PATH: string;
export function createSaveGateway(options: { provider: () => FirstPurchaseAccess | undefined; candidateDigest?: string; browserOrigins: string[] }):
  { browser(request: Request): Promise<Response>; dispose(): void };
