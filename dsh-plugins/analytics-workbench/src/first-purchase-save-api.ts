import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@shine-mage/dsh-contracts/analytics-workbench/first-purchase-access.generated.ts';
import { ConnectionFetchLedger } from './connection-fetch-ledger.mjs';
import { createSaveGateway, FIRST_PURCHASE_SAVE_PATH } from './first-purchase-save-gateway.mjs';

export const name = 'analytics-first-purchase-save-api';
export const inject = ['connection', 'webServer'];

export interface FirstPurchaseSaveApiConfig {
  firstPurchaseCandidateDigest?: string;
  /** Ledger created by the entry that mounts this row; a standalone mount owns its own. */
  routes?: ConnectionFetchLedger;
}

export function apply(ctx: Context, config: FirstPurchaseSaveApiConfig = {}): void {
  const gateway = createSaveGateway({ provider: () => ctx.get('crmFirstPurchaseAccess'),
    candidateDigest: config.firstPurchaseCandidateDigest,
    browserOrigins: [`http://127.0.0.1:${ctx.webServer.port}`, 'https://app.tyuan.chat'] });
  ctx.effect(() => () => gateway.dispose(), 'first purchase: cancel owned save requests');
  // Shares the entry's ledger with the board and delivery-history rows; this
  // row releases only its own tag when it reloads.
  const routes = config.routes ?? new ConnectionFetchLedger(ctx, { label: name });
  ctx.effect(() => () => routes.release(name), `${name}: release the first purchase save route`);
  void routes.own(name, { path: FIRST_PURCHASE_SAVE_PATH, methods: ['POST'], requestBody: 'streaming', fetch: gateway.browser });
}
