export function firstPurchaseCommandEnvelope(sessionId: string, line: string, rpcId: string): object;
export const FIRST_PURCHASE_CANCEL_COPY: Readonly<Record<'submitting' | 'accepted' | 'unknown' | 'unavailable' | 'inactive' | 'active' | 'error', string>>;
export function firstPurchaseCancelOutcome(response: { status: number; body: unknown }): 'accepted' | 'unknown' | 'unavailable' | 'inactive' | 'active' | 'error';
