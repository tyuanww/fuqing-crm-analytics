/** CRM-owned optional capability. It never exports a password, token or account selector. */
import type {} from '@deepseek-ai/cordis';

export const KNOWLEDGE_ACCESS_CONTRACT = 'shinemage-knowledge-access/v1' as const;
export interface KnowledgeLease {
  readonly username: string;
  readonly signal: AbortSignal;
  /** Recheck expiry, account/session changes and provider disposal after async work. */
  isCurrent(): boolean;
  /** Only this same login grant may record returned references. */
  rememberCitations(citations: unknown[]): void;
}
export interface KnowledgeAccess {
  readonly contract: typeof KNOWLEDGE_ACCESS_CONTRACT;
  authorize(sessionId: string): KnowledgeLease | null;
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    crmKnowledgeAccess: KnowledgeAccess;
  }
}
