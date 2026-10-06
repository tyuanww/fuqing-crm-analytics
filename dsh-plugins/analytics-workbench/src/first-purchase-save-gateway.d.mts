import type { FirstPurchaseAccess } from './first-purchase-access.generated.js';
export const FIRST_PURCHASE_SAVE_PATH: string;
export function createSaveGateway(options: { provider: () => FirstPurchaseAccess | undefined; candidateDigest?: string; browserOrigins: string[] }):
  { browser(request: Request): Promise<Response>; dispose(): void };
