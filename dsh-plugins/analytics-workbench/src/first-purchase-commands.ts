/** Official slash commands own only first-purchase admission, never native RPCs. */
import type { Context } from '@deepseek-ai/cordis';
import type { CommandInvocation } from '@deepseek-ai/dsh-commands';
import { runtimeFamily, FIRST_PURCHASE_FAMILY, registeredSessionIds } from './runtime-family.mjs';
import { runtimePortBase } from './runtime-endpoints.ts';
import { nativeJournal, requestForToolIn } from './native-evidence.mjs';
import { createFirstPurchaseCommands } from './first-purchase-commands.mjs';

export const name = 'analytics-first-purchase-commands';
export const inject = ['commands'];
export function apply(ctx: Context): void {
  // Explicit isolated profile only; no token/config enters the browser bundle.
  if (process.env.DSH_ANALYTICS_UI_ONLY === '1' || runtimeFamily() !== FIRST_PURCHASE_FAMILY) return;
  const journal = nativeJournal(ctx);
  const commands = createFirstPurchaseCommands({ portBase: runtimePortBase(),
    sessionId: registeredSessionIds()[0], gatewayToken: process.env.B0_GATEWAY_TOKEN });
  ctx.effect(() => () => commands.dispose(), 'first purchase: cancel owned command requests');
  for (const [name, description, hint] of [
    ['first-purchase', 'SYNTHETIC · 首购查询（需先连接 CRM）', '<首购问题>'],
    ['first-purchase-status', '核对原首购任务，不重复提交', '[run_id]'],
    ['first-purchase-cancel', '取消指定首购任务；受理不表示已停止', 'run <run_id> 或 call <call_id>'],
  ]) ctx.commands.register({ name, description, input: { hint, attachments: false },
    handler: (invocation: CommandInvocation) => commands.execute(name, {
      sessionId: invocation.agent.id, commandId: invocation.commandId,
      rawInput: invocation.rawInput, signal: invocation.signal,
      requestForCall: (callId: string) => requestForToolIn(journal.of(invocation.agent.session), callId),
    }),
  });
}
