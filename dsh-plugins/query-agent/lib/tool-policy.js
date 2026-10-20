/**
 * Remove inherited terminal capabilities from Agents using the query preset.
 *
 * This is a Host-plane policy because agent-create listeners and the preset
 * registry are shared services. The restriction is applied to the newly
 * created Agent scope only; other presets keep their complete tool surface.
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

    // Scoped business tools stay visible because restrict() only masks the
    // inherited global layer. The guard then denies any future scoped or
    // global tool that is not explicitly part of this read-mostly preset.
    const dispose = agent.ctx.effect(() => {
      const liftGlobalMask = agent.ctx.tools.restrict({ allow: [] })
      const liftGuard = agent.ctx.tools.guard(execution => (
        allowedTools.has(execution.name)
          ? undefined
          : `CRM_QUERY_TOOL_NOT_ALLOWED: ${execution.name}`
      ))
      return () => {
        liftGuard()
        liftGlobalMask()
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
