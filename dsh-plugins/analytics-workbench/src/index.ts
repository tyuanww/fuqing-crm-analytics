/** One Host Loader source owns the private bridge and discovers the browser entry. */
import type { Context } from '@deepseek-ai/cordis';
import { apply as applyBridge, inject as bridgeInject } from './bridge.ts';
import * as competition from './competition-agent/apply.ts';
import { registerFreeHtmlPageTool } from './competition-agent/apply.ts';
import * as boardBrowserApi from './board-browser-api.ts';
import * as cockpitHistoryApi from './cockpit-history-api.ts';

declare const __COMPETITION_SKILL_PACKAGE__: { manifest: object; contents: Record<string, string> };
export const name = 'analytics-workbench-b0-ui';
// RC1 resolves Host capabilities from the package root. The HTML delivery
// tool is registered by this entry, so `tools` must be part of its inject
// contract instead of relying on the alpha runtime's implicit context.
export const inject = [...bridgeInject, 'tools'];

export function apply(ctx: Context): void {
  applyBridge(ctx);
  registerFreeHtmlPageTool(ctx);
  ctx.inject(['connection', 'webServer'], (scoped) => { scoped.plugin(boardBrowserApi); });
  ctx.inject(['connection', 'webServer', 'sessionQuery'], (scoped) => { scoped.plugin(cockpitHistoryApi); });
  if (process.env.DSH_ANALYTICS_UI_ONLY === '1'
    && process.env.COMPETITION_HTTP_BASE && process.env.COMPETITION_HTTP_TOKEN) {
    ctx.plugin(competition, __COMPETITION_SKILL_PACKAGE__);
  }
}
