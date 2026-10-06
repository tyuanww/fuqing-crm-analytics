import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from './first-purchase-access.generated.js';
import { createSaveGateway, FIRST_PURCHASE_SAVE_PATH } from './first-purchase-save-gateway.mjs';
export const name = 'analytics-first-purchase-save-api';
export const inject = ['connection', 'webServer'];
export function apply(ctx: Context, config: { firstPurchaseCandidateDigest?: string } = {}): void {
  const gateway = createSaveGateway({ provider: () => ctx.get('crmFirstPurchaseAccess'),
    candidateDigest: config.firstPurchaseCandidateDigest,
    browserOrigins: [`http://127.0.0.1:${ctx.webServer.port}`, 'https://app.tyuan.chat'] });
  ctx.effect(() => () => gateway.dispose(), 'first purchase: cancel owned save requests');
  ctx.connection.fetch.register({ path: FIRST_PURCHASE_SAVE_PATH, methods: ['POST'], requestBody: 'streaming', fetch: gateway.browser });
}
