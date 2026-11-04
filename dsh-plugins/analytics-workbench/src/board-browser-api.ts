/** Official authenticated Connection extension, removed with this business plugin. */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import { ConnectionFetchLedger } from './connection-fetch-ledger.mjs';
import { parseClientRequestEnvelope } from './client-request-envelope.mjs';
import { handleBoardBrowserCall } from './board-spec/browser-api.mjs';
import { BOARD_API_ENDPOINT } from './board-spec/connection-call.mjs';

export const name = 'analytics-workbench-board-browser-api';
export const inject = ['connection', 'webServer'];

export interface BoardBrowserApiConfig {
  /** Ledger created by the entry that mounts this row; a standalone mount owns its own. */
  routes?: ConnectionFetchLedger;
}

export function apply(ctx: Context, config: BoardBrowserApiConfig = {}): void {
  // One ledger owns every connection.fetch route in this plugin, so an unload
  // or a reload releases them in one ordered pass instead of leaking handlers.
  const routes = config.routes ?? new ConnectionFetchLedger(ctx, { label: name });
  // A row mounted with a shared ledger releases only its own tag; the entry
  // that created the ledger closes whatever is left.
  ctx.effect(() => () => routes.release(name), `${name}: release the board browser route`);
  // The pinned rpc.handle dedicated carrier cannot resolve webServer from the
  // Connection provider's shadow scope in a full Host. Its public exact Fetch
  // extension uses the already-mounted /api carrier and the same trust fence.
  void routes.own(name, { path: `/api/${BOARD_API_ENDPOINT}`, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let input: unknown;
      try { input = await request.json(); } catch { return new Response('invalid JSON', { status: 400 }); }
      const message = parseClientRequestEnvelope(input);
      if (!message) return new Response('invalid envelope', { status: 400 });
      const body = message.payload as { operation?: unknown; payload?: unknown } | null;
      const valid = message.method === BOARD_API_ENDPOINT && body !== null && typeof body === 'object'
        && !Array.isArray(body) && typeof body.operation === 'string' && Object.hasOwn(body, 'payload')
        && Object.keys(body).length === 2;
      const result = valid ? await handleBoardBrowserCall(body.operation as string, body.payload, request.signal)
        : { ok: false, error: { code: 'gateway/bad-request', message: 'Invalid board request envelope', details: {} } };
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result }, { headers: { 'cache-control': 'no-store' } });
    },
  });
}
