import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from './dashboard-service.js';
import type {} from './knowledge-access.generated.js';
import type {} from './first-purchase-access.generated.js';
import { createDashboardAccess, CRM_UI_PATH, CRM_ASSETS_UI_PATH } from './dashboard-access.mjs';

export const name = 'crm-dashboard-login-host';
export const inject = ['connection', 'sessions', 'webServer'];

/** Public configuration contains an origin only, no credentials. */
export function apply(ctx: Context, config: { baseUrl?: string; firstPurchaseOrigin?: string; dataKind?: 'real' | 'synthetic' } = {}): void {
  const access = createDashboardAccess({
    ...config, browserOrigin: [`http://127.0.0.1:${ctx.webServer.port}`, 'https://app.tyuan.chat'],
    hasSession: (id: string) => ctx.sessions.get(id as never) !== undefined,
  });
  ctx.provide('crmDashboard', access.service);
  ctx.provide('crmKnowledgeAccess', access.knowledgeService);
  ctx.provide('crmFirstPurchaseAccess', access.firstPurchaseService);
  ctx.effect(() => () => access.dispose(), 'crm: discard in-memory login grants');
  ctx.connection.fetch.register({ path: CRM_UI_PATH, methods: ['POST'], requestBody: 'streaming', fetch: access.browser });
  ctx.connection.fetch.register({ path: CRM_ASSETS_UI_PATH, methods: ['POST'], requestBody: 'streaming', fetch: access.browser });
}
