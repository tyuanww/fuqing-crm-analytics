/**
 * Apply the query allowlist only to Agent scopes that select `crm-query`.
 *
 * Agent-create listeners and preset composition are process-wide services.
 * The restriction and guard belong to each matching Agent scope.
 */

export const name = 'query-tool-policy'
export const inject = ['agentPresets', 'agents', 'tools']

export const queryToolAllowlist = Object.freeze([
  'query_crm_dashboard_snapshot',
  'query_crm_dashboard_gsv',
  'query_crm_dashboard_purchases',
  'query_crm_metrics_v1',
  'query_crm_dashboard_readiness',
  'query_crm_dashboard_membership',
  'query_crm_dashboard_net_gsv',
  'crm_metrics_capabilities',
  'crm_service_health',
  'weknora_search',
  'weknora_read_document',
  'free_html_page_generate',
])
const allowedTools = new Set(queryToolAllowlist)
const hiddenInheritedTools = new Set([
  'bash',
  'pwsh',
  'terminal_open',
  'terminal_send',
  'terminal_read',
  'terminal_signal',
  'terminal_close',
  'terminal_list',
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'read_image',
  'web_search',
  'web_fetch',
  'run_code',
  'subagent',
  'list_subagent_models',
  'spawn_teammate',
  'send_message',
  'list_agents',
  'interrupt_agent',
  'wait_agent',
  'team_task_create',
  'team_task_get',
  'team_task_list',
  'team_task_update',
  'todo_write',
  'exit_plan_mode',
  'skill',
])

export const queryPresetId = 'crm-query'

export function apply(ctx) {
  const restrictions = new Map()
  const agentIdOf = agent => agent?.id ?? agent?.session?.id
  const release = target => {
    const agentId = typeof target === 'string' ? target : agentIdOf(target)
    if (agentId === undefined) return
    restrictions.get(agentId)?.()
    restrictions.delete(agentId)
  }
  const enforce = agent => {
    const agentId = agentIdOf(agent)
    if (agentId === undefined || agent?.ctx === undefined) return
    if (ctx.agentPresets.composedPreset(agent.ctx) !== queryPresetId) {
      release(agentId)
      return
    }
    if (restrictions.has(agentId)) return

    // Hide known inherited shell, filesystem and collaboration tools without
    // replacing the preset's scoped business tools. The guard is the final
    // deny-by-default boundary for any future tool that appears in schema.
    const visibleNames = agent.ctx.tools.schemas().map(tool => tool.name)
    const deny = visibleNames.filter(tool => hiddenInheritedTools.has(tool))
    const dispose = agent.ctx.effect(() => {
      const liftMask = deny.length > 0 ? agent.ctx.tools.restrict({ deny }) : undefined
      const liftGuard = agent.ctx.tools.guard(execution => (
        allowedTools.has(execution.name)
          ? undefined
          : `CRM_QUERY_TOOL_NOT_ALLOWED: ${execution.name}`
      ))
      return () => {
        liftGuard()
        liftMask?.()
      }
    })
    if (typeof dispose === 'function') restrictions.set(agentId, dispose)
  }

  return ctx.effect(() => {
    const created = ctx.on('agent/created', ({ agent }) => enforce(agent))
    // Selecting a preset on a blank session rebinds the Agent in place; DSH
    // emits this event instead of creating a new Agent.
    const selected = ctx.on('agent-preset/selected', sessionId => {
      const agent = ctx.agents.get(sessionId)
      if (agent !== undefined) enforce(agent)
    })
    const disposed = ctx.on('agent/disposed', ({ agent }) => release(agent))
    return () => {
      created?.()
      selected?.()
      disposed?.()
      for (const agentId of [...restrictions.keys()]) release(agentId)
    }
  })
}
