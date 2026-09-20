import type { SessionObservation, SessionQueryEngine } from '@deepseek-ai/dsh-session-query';
import type { CockpitProduct } from './client/cockpit-products.mjs';
export function deliveryRelativePath(cwd: string, value: string): string | null;
export function sessionDeliveries(header: SessionObservation['header'], events: SessionObservation['events']): { files: CockpitProduct[]; unsupportedPaths: number };
export function readDeliveryHistory(query: Pick<SessionQueryEngine, 'listSessions' | 'observeSession'>, payload?: { cursor?: string | null; sessionId?: string }, signal?: AbortSignal): Promise<{
  files: CockpitProduct[]; examined: number; totalSessions: number; failures: { sessionId: string; reason: string }[];
  unsupportedPaths: number; nextCursor: string | null; currentWorkspace: string | null;
}>;
