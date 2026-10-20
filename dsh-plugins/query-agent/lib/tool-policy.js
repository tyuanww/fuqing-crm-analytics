/**
 * Remove inherited terminal capabilities from Agents using the query preset.
 *
 * This is a Host-plane policy because agent-create listeners and the preset
 * registry are shared services. The restriction is applied to the newly
 * created Agent scope only; other presets keep their complete tool surface.
 */

export const name = 'query-tool-policy'
export const inject = ['agentPresets', 'agents', 'tools']

const terminalTools = new Set([
  'bash',
  'pwsh',
  'terminal_open',
  'terminal_send',
  'terminal_read',
  'terminal_signal',
  'terminal_close',
  'terminal_list',
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

    const deny = agent.ctx.tools.schemas()
      .map(tool => tool.name)
      .filter(name => terminalTools.has(name))
    if (deny.length === 0) return
    const dispose = agent.ctx.tools.restrict({ deny })
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
