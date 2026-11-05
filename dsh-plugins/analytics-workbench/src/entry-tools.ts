/** Tools-only Host entry for `dsh --profile analytics-acp` (design R11).
 *
 * The business entry (`index.ts`) also mounts the private loopback bridge and
 * the browser Connection Fetch routes. Neither can exist in the ACP child: its
 * stdout is the ACP channel and it has no browser peer, so a row that injects
 * `connection`/`webServer` would wait forever. This entry registers exactly the
 * typed tools of the bridge composition through their existing entries:
 *
 * - `tool.ts`      the kernel-backed typed tool for the active run family;
 * - `skills.ts`    the method/Skill adapter over the same native journal;
 * - `page-tools.ts` the public HTML delivery tool.
 *
 * It deliberately does not mount the bridge, the save/history browser routes,
 * slash commands or the competition bundle. Those stay on the business entry;
 * the ACP profile never imports this module together with `index.ts`.
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config, type NativeWorkbenchConfig } from './config.mjs';
import { apply as applyKernelTool } from './tool.ts';
import { apply as applySkills } from './skills.ts';
import { apply as applyPageTools } from './page-tools.ts';

export const name = 'analytics-workbench-b0-tools';
// The union of the three entries' contracts. Declaring them here keeps the
// subpath row independent of the business row's inject list.
export const inject = ['tools', 'sessions', 'sessionQuery', 'skills', 'agents'];
// rc.5 Config is validated on the row; the ACP profile passes the same
// baseUrl/runtimeToken as the bridge composition.
export { Config };

export function apply(ctx: Context, config: NativeWorkbenchConfig = {}): void {
  applyKernelTool(ctx, config);
  applySkills(ctx, config);
  applyPageTools(ctx);
}
