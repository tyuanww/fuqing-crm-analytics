import type { components } from './first-purchase-analysis-contract.generated.js';
export interface SaveState { phase: string; code: string; receipt: components['schemas']['FirstPurchaseSavedReceipt'] | null; result: components['schemas']['FirstPurchaseSaveResult'] | null; }
export function createSaveController(options: { target: { session_id: string; run_id: string; call_id: string }; storage: Storage | null; onChange(state: SaveState): void }):
  { getState(): SaveState; start(): Promise<void>; reconcile(): Promise<void>; save(title: string): Promise<void>; dispose(): void };
