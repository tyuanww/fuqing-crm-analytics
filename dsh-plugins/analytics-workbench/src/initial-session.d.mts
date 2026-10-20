import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
export const B0_PRIMARY_SESSION_ID: 'session-b0-synthetic-primary';
export const QUERY_SESSION_IDS: readonly ['session-query-synthetic-a', 'session-query-synthetic-b'];
export function explicitSessionIds(
  environment?: Record<string, string | undefined> | undefined,
  globals?: { __SHINE_B0_SESSION_IDS__?: string | readonly string[] } | undefined,
): string[];
export function configuredSession(snapshot: SessionListState, sessionIds?: readonly string[] | string): SessionId | null;
export function mainViewSessionId(snapshot: SessionListState): SessionId | undefined;
export function resolvePageGenerateSession(list: SessionListState, compositionSessionId?: string | null): SessionId | null;
export function retainMainView(sessions: Pick<ISessions, 'retain'>, id: SessionId): ReturnType<ISessions['retain']>;
export function bindInitialSession(
  sessions: Pick<ISessions, 'list' | 'retain'>,
  onFailure: () => void,
  options?: { sessionIds?: readonly string[] | string },
): () => void;
