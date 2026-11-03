import { NATIVE_PAGE_AI_PRESET, NATIVE_PAGE_AI_SESSION } from './native-page-ai-tools.mjs';

export const name = 'native-page-ai-policy';
export const inject = ['tools', 'agents', 'agentPresets'];
const ALLOWED = new Set(['cockpit_page_read', 'cockpit_page_propose']);

export async function apply(ctx, config = {}) {
  if (config.enabled !== true) return;
  const guarded = new WeakSet();
  const guard = agent => {
    if (typeof agent?.id !== 'string' || !NATIVE_PAGE_AI_SESSION.test(agent.id) || guarded.has(agent)) return;
    if (agent.session?.header?.id !== agent.id || !agent.ctx?.tools) throw new Error('AI_SESSION_INVALID');
    guarded.add(agent);
    // Keep the restriction on the agent even if the policy itself is unloaded.
    agent.ctx.tools.restrict({ allow: [] });
    agent.ctx.tools.guard(exec => exec.agent === agent && ALLOWED.has(exec.name) ? undefined : 'AI_TOOL_DENIED');
  };
  ctx.on('agent/created', ({ agent }) => guard(agent), { global: true });
  for (const agent of ctx.agents.list()) guard(agent);
  const unregister = await ctx.agentPresets.register({ id: NATIVE_PAGE_AI_PRESET, name: '页面编辑', plugins: [] });
  ctx.effect(() => unregister, 'native page AI preset');
  ctx.provide('nativePageAIPolicy', true);
}
