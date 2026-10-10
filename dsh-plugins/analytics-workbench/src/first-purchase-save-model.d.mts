import type { components } from './first-purchase-analysis-contract.generated.js';
export function decodeFirstPurchaseSaveResult(value: unknown): components['schemas']['FirstPurchaseSaveResult'] | null;
export function decodeFirstPurchaseSaveReceipt(value: unknown):
  components['schemas']['FirstPurchaseSavedReceipt'] | components['schemas']['FirstPurchaseUnknownSaveReceipt'] | null;
export function decodeFirstPurchaseSavedProvenance(value: unknown):
  components['schemas']['FirstPurchaseSavedProvenance'] | null;
