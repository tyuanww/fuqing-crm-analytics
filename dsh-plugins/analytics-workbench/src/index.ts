/** One Host Loader source owns the private bridge and discovers the browser entry. */
import type { Context } from '@deepseek-ai/cordis';
import { apply as applyBridge, inject as bridgeInject } from './bridge.ts';
import * as competition from './competition-agent/apply.ts';
import { registerFreeHtmlPageTool } from './competition-agent/apply.ts';
import * as boardBrowserApi from './board-browser-api.ts';
import { ConnectionFetchLedger } from './connection-fetch-ledger.mjs';
import * as firstPurchaseSaveApi from './first-purchase-save-api.ts';
import * as firstPurchaseCommands from './first-purchase-commands.ts';
import * as cockpitHistoryApi from './cockpit-history-api.ts';

declare const __COMPETITION_SKILL_PACKAGE__: { manifest: object; contents: Record<string, string> };
export const name = 'analytics-workbench-b0-ui';
// RC1 resolves Host capabilities from the package root. The HTML delivery
// tool is registered by this entry, so `tools` must be part of its inject
// contract instead of relying on the alpha runtime's implicit context.
export const inject = [...bridgeInject, 'tools'];

export function apply(ctx: Context, config: { firstPurchaseCandidateDigest?: string } = {}): void {
  applyBridge(ctx);
  ctx.inject(['commands'], scoped => { scoped.plugin(firstPurchaseCommands); });
  ctx.inject(['connection', 'webServer'], scoped => { scoped.plugin(firstPurchaseSaveApi, config); });
  registerFreeHtmlPageTool(ctx);
  // One ledger per entry owns every Connection Fetch route of this plugin and
  // releases them newest-first on unload. Rows that P2d still owns
  // (`first-purchase-save-api.ts`) join it in the follow-up; see
  // config/dsh-rc5-surface.v1.json routeOwnership.debt.
  ctx.inject(['connection', 'webServer'], (scoped) => {
    const routes = new ConnectionFetchLedger(scoped, { label: name });
    scoped.plugin(boardBrowserApi, { routes });
    scoped.plugin(cockpitHistoryApi, { routes });
  });
  if (process.env.DSH_ANALYTICS_UI_ONLY === '1'
    && process.env.COMPETITION_HTTP_BASE && process.env.COMPETITION_HTTP_TOKEN) {
    ctx.plugin(competition, __COMPETITION_SKILL_PACKAGE__);
  }
}
