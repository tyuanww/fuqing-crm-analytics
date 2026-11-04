import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  apply,
  hiddenInheritedTools,
  officialDeniedTools,
  queryPresetId,
  queryToolAllowlist,
} from '../lib/tool-policy.js'

function createPlugin(overrides = {}) {
  const listeners = new Map()
  const unsubscribed = []
  const ctx = {
    agentPresets: { composedPreset: context => context.preset ?? 'crm-query' },
    agents: { get: () => undefined },
    effect: callback => callback(),
    on: (event, listener) => {
      listeners.set(event, listener)
      return () => {
        listeners.delete(event)
        unsubscribed.push(event)
      }
    },
    ...overrides,
  }
  const disposePlugin = apply(ctx)
  return { ctx, listeners, unsubscribed, disposePlugin }
}

function createAgent({ id = 'session-query', preset = 'crm-query', names = [] } = {}) {
  const events = { masks: [], guards: [], maskLifts: 0, guardLifts: 0, effectDisposals: 0 }
  const agent = {
    ...(id === undefined || id === null ? {} : { id }),
    ctx: {
      preset,
      effect(callback) {
        const dispose = callback()
        return () => {
          if (typeof dispose === 'function') dispose()
          events.effectDisposals += 1
        }
      },
      tools: {
        schemas: () => names.map(name => ({ name })),
        restrict(filter) {
          events.masks.push(filter)
          return () => { events.maskLifts += 1 }
        },
        guard(callback) {
          events.guards.push(callback)
          return () => { events.guardLifts += 1 }
        },
      },
    },
  }
  return { agent, events }
}

test('the allowlist is the reviewed frozen domain list', () => {
  assert.equal(queryPresetId, 'crm-query')
  assert.ok(Object.isFrozen(queryToolAllowlist))
  assert.ok(Object.isFrozen(hiddenInheritedTools))
  assert.ok(Object.isFrozen(officialDeniedTools))
  assert.equal(queryToolAllowlist.length, 15)
  assert.equal(hiddenInheritedTools.length, 31)
  assert.equal(officialDeniedTools.length, 37)
  assert.equal(queryToolAllowlist.includes('query_crm_warehouse_snapshot'), true)
  assert.equal(queryToolAllowlist.includes('bash'), false)
})

test('explicitly denied official tools stay visible but never pass the guard', () => {
  const { listeners } = createPlugin()
  const { agent, events } = createAgent({
    names: ['bash', 'read', 'ask_user_question', 'plugin_market', 'present', 'query_crm_dashboard_gsv'],
  })
  listeners.get('agent/created')({ agent })

  // Only known inherited tools are masked; denied-but-visible official tools
  // keep their schema entry and are stopped by the guard at execution time.
  assert.deepEqual(events.masks, [{ deny: ['bash', 'read'] }])
  assert.equal(events.guards.length, 1)
  assert.equal(events.guards[0]({ name: 'query_crm_dashboard_gsv' }), undefined)
  assert.match(events.guards[0]({ name: 'ask_user_question' }), /CRM_QUERY_TOOL_NOT_ALLOWED: ask_user_question/)
  assert.match(events.guards[0]({ name: 'plugin_market' }), /CRM_QUERY_TOOL_NOT_ALLOWED: plugin_market/)
  assert.match(events.guards[0]({ name: 'present' }), /CRM_QUERY_TOOL_NOT_ALLOWED: present/)
})

test('the guard is deny-by-default for future and unknown tool names', () => {
  const { listeners } = createPlugin()
  const { agent, events } = createAgent({ names: ['weknora_search'] })
  listeners.get('agent/created')({ agent })
  assert.deepEqual(events.masks, [])
  for (const name of ['future_official_tool', 'another_runtime_tool', 'bash']) {
    assert.equal(events.guards[0]({ name }), `CRM_QUERY_TOOL_NOT_ALLOWED: ${name}`)
  }
})

test('repeated enforcement is idempotent per Agent scope', () => {
  const { listeners } = createPlugin()
  const { agent, events } = createAgent({ names: ['bash', 'query_crm_dashboard_gsv'] })
  listeners.get('agent/created')({ agent })
  listeners.get('agent/created')({ agent })
  const agentPresetListener = listeners.get('agent-preset/selected')
  agentPresetListener(agent.id)
  assert.equal(events.masks.length, 1)
  assert.equal(events.guards.length, 1)
})

test('switching away releases once and switching back reinstalls the policy', () => {
  const { agent, events } = createAgent({ names: ['bash'] })
  const { listeners } = createPlugin({ agents: { get: id => id === agent.id ? agent : undefined } })
  listeners.get('agent/created')({ agent })
  assert.equal(events.masks.length, 1)

  agent.ctx.preset = 'standard'
  const selected = listeners.get('agent-preset/selected')
  selected(agent.id)
  selected(agent.id)
  assert.equal(events.guardLifts, 1)
  assert.equal(events.maskLifts, 1)
  assert.equal(events.effectDisposals, 1)

  agent.ctx.preset = 'crm-query'
  selected(agent.id)
  assert.equal(events.masks.length, 2)
  assert.equal(events.guards.length, 2)
})

test('an Agent without id, session id or ctx is ignored', () => {
  const { listeners } = createPlugin()
  const noId = createAgent({ id: null, names: ['bash'] })
  listeners.get('agent/created')({ agent: noId.agent })
  assert.equal(noId.events.masks.length, 0)

  listeners.get('agent/created')({ agent: { id: 'no-ctx' } })
  assert.doesNotThrow(() => listeners.get('agent/created')({ agent: undefined }))

  const unknown = createAgent({ id: 'unknown-session', names: ['bash'] })
  listeners.get('agent-preset/selected')('unknown-session')
  assert.equal(unknown.events.masks.length, 0)
})

test('plugin cleanup releases every restriction and unsubscribes listeners', () => {
  const { listeners, unsubscribed, disposePlugin } = createPlugin()
  const first = createAgent({ id: 'first', names: ['bash'] })
  const second = createAgent({ id: 'second', names: ['read'] })
  listeners.get('agent/created')({ agent: first.agent })
  listeners.get('agent/created')({ agent: second.agent })

  assert.equal(typeof disposePlugin, 'function')
  disposePlugin()
  assert.equal(first.events.guardLifts, 1)
  assert.equal(first.events.maskLifts, 1)
  assert.equal(second.events.guardLifts, 1)
  assert.equal(second.events.maskLifts, 1)
  assert.deepEqual(unsubscribed.sort(), ['agent-preset/selected', 'agent/created', 'agent/disposed'])

  assert.doesNotThrow(() => disposePlugin())
})

test('the disposed event uses the session-id fallback and releases the scope', () => {
  const { listeners } = createPlugin()
  const { agent, events } = createAgent({ id: null, names: ['bash'] })
  agent.session = { id: 'session-without-agent-id' }
  listeners.get('agent/created')({ agent })
  listeners.get('agent/disposed')({ agent })
  assert.equal(events.guardLifts, 1)
  assert.equal(events.maskLifts, 1)
})
