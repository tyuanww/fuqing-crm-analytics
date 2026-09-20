/** Only delivery metadata crosses the native authenticated Connection fence. */
import type { Context } from '@deepseek-ai/cordis';
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-session-query';
import { readDeliveryHistory } from './cockpit-history.mjs';

export const name = 'analytics-workbench-cockpit-history';
export const inject = ['connection', 'webServer', 'sessionQuery'];
export function apply(ctx: Context): void {
  ctx.connection.fetch.register({ path: '/api/shine-mage-deliveries', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let input: unknown;
      try { input = await request.json(); } catch { return new Response('invalid JSON', { status: 400 }); }
      const parsed = clientRequestSchema.safeParse(input);
      if (!parsed.success) return new Response('invalid envelope', { status: 400 });
      const { rpcId, method, payload } = parsed.data;
      let result;
      try {
        if (method !== 'shine-mage-deliveries' || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_HISTORY_REQUEST');
        result = { ok: true, value: await readDeliveryHistory(ctx.sessionQuery, payload, request.signal) };
      } catch (error) {
        const code = error instanceof Error && /^(HISTORY_CHANGED|INVALID_HISTORY_\w+)$/.test(error.message) ? error.message : 'HISTORY_UNAVAILABLE';
        result = { ok: false, error: { code, message: code === 'HISTORY_CHANGED' ? '会话目录已更新，请刷新产物。' : '历史交付读取失败，请重试。', details: {} } };
      }
      return Response.json({ type: 'server-response', rpcId, result }, { headers: { 'cache-control': 'no-store' } });
    },
  });
}
