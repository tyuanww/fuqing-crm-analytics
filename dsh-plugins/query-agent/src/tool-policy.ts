/**
 * Apply the query allowlist only to Agent scopes that select `crm-query`.
 *
 * Agent-create listeners and preset composition are process-wide services.
 * The restriction and guard belong to each matching Agent scope.
 *
 * The allowed, hidden and explicitly denied tool names are generated from
 * `config/query-agent-tool-policy.v1.json` by `build.mjs`; do not copy them
 * into this module.
 */
import { toolPolicy } from './tool-policy.data.js'

export const name = 'query-tool-policy'
export const inject: string[] = ['agentPresets', 'agents', 'tools']

export const queryPresetId: string = toolPolicy.preset_id
export const queryToolAllowlist: readonly string[] = toolPolicy.allowed
export const hiddenInheritedTools: readonly string[] = toolPolicy.hidden_inherited
export const officialDeniedTools: readonly string[] = toolPolicy.official_denied

const allowedTools: ReadonlySet<string> = new Set(queryToolAllowlist)
const hiddenTools: ReadonlySet<string> = new Set(hiddenInheritedTools)

export interface QueryToolExecution {
  name: string
}

export interface QueryToolSchema {
  name: string
}

export interface QueryToolFilter {
  deny: string[]
}

export interface QueryAgentTools {
  schemas(): QueryToolSchema[]
  restrict(filter: QueryToolFilter): (() => void) | undefined
  guard(predicate: (execution: QueryToolExecution) => string | undefined): () => void
}

export type EffectDisposer = () => void

export interface QueryAgentContext {
  tools: QueryAgentTools
  effect(callback: () => void | EffectDisposer): void | EffectDisposer
}

export interface QueryAgent {
  id?: string
  session?: { id?: string }
  ctx?: QueryAgentContext
}

export interface QueryAgentPresetRegistry {
  composedPreset(context: QueryAgentContext): string | undefined
}

export interface QueryAgentRegistry {
  get(sessionId: string): QueryAgent | undefined
}

export interface QueryPluginContext {
  agentPresets: QueryAgentPresetRegistry
  agents: QueryAgentRegistry
  effect(callback: () => void | EffectDisposer): void | EffectDisposer
  on(
    event: 'agent/created',
    listener: (payload: { agent: QueryAgent }) => void,
  ): EffectDisposer | undefined
  on(
    event: 'agent-preset/selected',
    listener: (sessionId: string, presetId?: string) => void,
  ): EffectDisposer | undefined
  on(
    event: 'agent/disposed',
    listener: (payload: { agent: QueryAgent }) => void,
  ): EffectDisposer | undefined
}

export function apply(ctx: QueryPluginContext): void | EffectDisposer {
  const restrictions = new Map<string, EffectDisposer>()
  const agentIdOf = (agent?: QueryAgent): string | undefined => agent?.id ?? agent?.session?.id
  const release = (target: string | QueryAgent): void => {
    const agentId = typeof target === 'string' ? target : agentIdOf(target)
    if (agentId === undefined) return
    restrictions.get(agentId)?.()
    restrictions.delete(agentId)
  }
  const enforce = (agent?: QueryAgent): void => {
    const agentId = agentIdOf(agent)
    if (agentId === undefined || agent === undefined || agent.ctx === undefined) return
    if (ctx.agentPresets.composedPreset(agent.ctx) !== queryPresetId) {
      release(agentId)
      return
    }
    if (restrictions.has(agentId)) return

    // Hide known inherited shell, filesystem and collaboration tools without
    // replacing the preset's scoped business tools. The guard is the final
    // deny-by-default boundary for any future tool that appears in schema.
    const agentContext = agent.ctx
    const visibleNames = agentContext.tools.schemas().map(tool => tool.name)
    const deny = visibleNames.filter(tool => hiddenTools.has(tool))
    const dispose = agentContext.effect(() => {
      const liftMask = deny.length > 0 ? agentContext.tools.restrict({ deny }) : undefined
      const liftGuard = agentContext.tools.guard(execution => (
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
