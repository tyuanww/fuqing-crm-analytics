import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from './dashboard-service.js';
import { createDashboardAccess, CRM_UI_PATH } from './dashboard-access.mjs';

export const name = 'crm-dashboard-login-host';
export const inject = ['connection', 'sessions', 'webServer'];

/** Public configuration contains an origin only, no credentials. */
export function apply(ctx: Context, config: { baseUrl?: string; dataKind?: 'real' | 'synthetic' } = {}): void {
  const access = createDashboardAccess({
    ...config, browserOrigin: `http://127.0.0.1:${ctx.webServer.port}`,
    hasSession: (id: string) => ctx.sessions.get(id as never) !== undefined,
  });
  ctx.provide('crmDashboard', access.service);
  ctx.effect(() => () => access.dispose(), 'crm: discard in-memory login grants');
  ctx.connection.fetch.register({ path: CRM_UI_PATH, methods: ['POST'], requestBody: 'streaming', fetch: access.browser });
}
