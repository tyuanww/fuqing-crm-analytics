import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from './dashboard-service.js';
import type {} from '@shine-mage/dsh-contracts/crm-knowledge/knowledge-access.generated.ts';
import type {} from '@shine-mage/dsh-contracts/crm-knowledge/first-purchase-access.generated.ts';
import { ConnectionFetchLedger } from './connection-fetch-ledger.mjs';
import { createDashboardAccess, CRM_UI_PATH, CRM_ASSETS_UI_PATH } from './dashboard-access.mjs';

export const name = 'crm-dashboard-login-host';
export const inject = ['connection', 'sessions', 'webServer'];

export interface CrmDashboardHostConfig {
  baseUrl?: string;
  firstPurchaseOrigin?: string;
  dataKind?: 'real' | 'synthetic';
  /** Ledger created by the entry that mounts this row; a standalone mount owns its own. */
  routes?: ConnectionFetchLedger;
}

/** Public configuration contains an origin only, no credentials. */
export function apply(ctx: Context, config: CrmDashboardHostConfig = {}): void {
  const { routes: sharedRoutes, ...accessConfig } = config;
  const access = createDashboardAccess({
    ...accessConfig, browserOrigin: [`http://127.0.0.1:${ctx.webServer.port}`, 'https://app.tyuan.chat'],
    hasSession: (id: string) => ctx.sessions.get(id as never) !== undefined,
  });
  ctx.provide('crmDashboard', access.service);
  ctx.provide('crmKnowledgeAccess', access.knowledgeService);
  ctx.provide('crmFirstPurchaseAccess', access.firstPurchaseService);
  ctx.effect(() => () => access.dispose(), 'crm: discard in-memory login grants');
  // The two streaming UI routes are exact Fetch routes on the same host as the
  // workbench rows. This package ships to its own author repository, so it owns
  // its own ledger entry and releases both routes newest-first.
  const routes = sharedRoutes ?? new ConnectionFetchLedger(ctx, { label: name });
  ctx.effect(() => () => routes.release(name), `${name}: release the CRM dashboard routes`);
  void routes.own(name, { path: CRM_UI_PATH, methods: ['POST'], requestBody: 'streaming', fetch: access.browser });
  void routes.own(name, { path: CRM_ASSETS_UI_PATH, methods: ['POST'], requestBody: 'streaming', fetch: access.browser });
}
