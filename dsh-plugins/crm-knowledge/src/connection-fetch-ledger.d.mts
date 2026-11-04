/** Types for the single owner of this plugin's Connection Fetch routes. */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {
  ConnectionFetchMethod,
  ConnectionFetchRoute,
  ConnectionRequestBodyMode,
} from '@deepseek-ai/dsh-client-connection';

export interface ConnectionFetchLedgerOptions {
  /** Diagnostic prefix for effect labels and failures. */
  label?: string;
}

export type ConnectionFetchRouteState = 'pending' | 'live' | 'releasing' | 'released' | 'failed';

export interface ConnectionFetchRouteSummary {
  seq: number;
  owner: string;
  path: string;
  methods: ConnectionFetchMethod[];
  requestBody: ConnectionRequestBodyMode;
  state: ConnectionFetchRouteState;
  error?: string;
}

export declare class ConnectionFetchLedger {
  constructor(ctx: Context, options?: ConnectionFetchLedgerOptions);
  /** Register one exact route under an owner tag; throws before touching the host on a bad shape. */
  own(owner: string, route: ConnectionFetchRoute): Promise<void>;
  /** Release one owner tag, newest route first. */
  release(owner: string): Promise<void>;
  /** Release the whole ledger, newest route first; idempotent. */
  close(): Promise<void>;
  /** Diagnostic view; route handlers never leave the ledger. */
  describe(): ConnectionFetchRouteSummary[];
}
