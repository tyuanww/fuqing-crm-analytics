import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

test('query agent bundle declares one preset through the DSH bundle contract', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  assert.equal(manifest.name, '@shine-mage/dsh-query-agent')
  assert.equal(manifest.version, '0.0.0-query.11')
  assert.equal(manifest.packageManager, 'pnpm@11.28.2')
  assert.deepEqual(manifest.engines, { node: '24.x' })
  assert.equal(manifest.peerDependencies, undefined)
  assert.equal(manifest.scripts, undefined)
  assert.doesNotMatch(manifest.description, /knowledge explanations/i)
  assert.equal(manifest.shinemage.bundle_role, 'configuration-bundle')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.exports['./tool-policy'], './lib/tool-policy.js')
  assert.deepEqual(manifest.files, ['cordis.patch.yml', 'lib/tool-policy.js', 'locale/*.json', 'icon.svg'])
})

test('preset composes runtime-ready providers without unconfigured knowledge or shell tools', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8')
  assert.match(patch, /id: crm-query/)
  assert.match(patch, /name: '@shine-mage\/dsh-crm-knowledge'/)
  assert.match(patch, /name: '@shine-mage\/dsh-analytics-workbench-b0\/page-tools'/)
  assert.match(patch, /name: file:\/\/\/srv\/shinemage\/dsh\/current\/inputs\/page\/brand-weknora\/weknora\.mjs/)
  assert.match(patch, /provider: deepseek-account\n    model: deepseek-flash\n    reasoningEffort: off/)
  assert.match(patch, /baseUrl: http:\/\/127\.0\.0\.1:18093/)
  assert.match(patch, /dataKind: real/)
  assert.equal((patch.match(/name: '@deepseek-ai\/dsh-agent-preset'/g) ?? []).length, 1)
  assert.match(patch, /name: '@shine-mage\/dsh-query-agent\/tool-policy'/)
  const insert = patch.indexOf("- insert:")
  const policy = patch.indexOf("    - id: query-tool-policy")
  const preset = patch.indexOf("- id: preset-shinemage-crm-query")
  assert.ok(insert >= 0 && policy > insert && policy < preset)
  assert.doesNotMatch(patch, /knowledge-tools-v1|crm_knowledge_explain|graph-tools|query_crm_knowledge_graph|@deepseek-ai\/dsh-tool-bash/)
})

test('Host policy restricts only newly created query Agents', async () => {
  const module = await import('../lib/tool-policy.js')
  assert.equal(module.default, undefined)
  const { apply } = module
  let created
  let restricted
  let guard
  let released = 0
  apply({
    agentPresets: { composedPreset: () => 'crm-query' },
    agents: { get: () => undefined },
    effect: callback => callback(),
    on: (event, listener) => {
      if (event === 'agent/created') created = listener
      return () => {}
    },
  })
  assert.equal(typeof created, 'function')
  created({
    agent: {
      id: 'session-query',
      ctx: {
        effect: callback => callback(),
        tools: {
          schemas: () => [
            { name: 'query_crm_dashboard_gsv' },
            { name: 'terminal_open' },
            { name: 'read' },
            { name: 'list_agents' },
          ],
          restrict: filter => {
            restricted = filter
            return () => { released += 1 }
          },
          guard: callback => {
            guard = callback
            return () => { released += 1 }
          },
        },
      },
    },
  })
  assert.deepEqual(restricted, { deny: ['terminal_open', 'read', 'list_agents'] })
  assert.equal(guard({ name: 'crm_metrics_capabilities' }), undefined)
  assert.equal(guard({ name: 'weknora_search' }), undefined)
  assert.match(guard({ name: 'shell' }), /CRM_QUERY_TOOL_NOT_ALLOWED: shell/)
  assert.equal(released, 0)
})

test('Host policy allowlist names every query-domain tool exactly once', async () => {
  const { queryToolAllowlist } = await import('../lib/tool-policy.js')
  assert.equal(new Set(queryToolAllowlist).size, queryToolAllowlist.length)
  assert.deepEqual(queryToolAllowlist, [
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
})

test('Host policy leaves other presets unchanged', async () => {
  const { apply } = await import('../lib/tool-policy.js')
  let created
  let touched = false
  apply({
    agentPresets: { composedPreset: () => 'standard' },
    agents: { get: () => undefined },
    effect: callback => callback(),
    on: (event, listener) => {
      if (event === 'agent/created') created = listener
      return () => {}
    },
  })
  created({
    agent: {
      id: 'session-standard',
      ctx: {
        effect: callback => callback(),
        tools: {
          schemas: () => [{ name: 'terminal_open' }],
          restrict: () => { touched = true },
          guard: () => { touched = true },
        },
      },
    },
  })
  assert.equal(touched, false)
})

test('Host policy installs the allowlist guard when no known inherited tool is visible', async () => {
  const { apply } = await import('../lib/tool-policy.js')
  let created
  let restricted
  let guard
  apply({
    agentPresets: { composedPreset: () => 'crm-query' },
    agents: { get: () => undefined },
    effect: callback => callback(),
    on: (event, listener) => {
      if (event === 'agent/created') created = listener
      return () => {}
    },
  })
  created({
    agent: {
      id: 'session-query-without-shell',
      ctx: {
        effect: callback => callback(),
        tools: {
          schemas: () => [{ name: 'weknora_search' }],
          restrict: filter => { restricted = filter },
          guard: callback => { guard = callback },
        },
      },
    },
  })
  assert.equal(restricted, undefined)
  assert.match(guard({ name: 'read' }), /CRM_QUERY_TOOL_NOT_ALLOWED: read/)
  assert.equal(guard({ name: 'free_html_page_generate' }), undefined)
})

test('Host policy follows in-place preset selection and releases the restriction on switch away', async () => {
  const { apply } = await import('../lib/tool-policy.js')
  const listeners = new Map()
  const restricted = []
  let released = 0
  const agent = {
    id: 'session-switched',
    ctx: {
      preset: 'crm-query',
      effect: callback => {
        const release = callback()
        return () => {
          release()
          released += 1
        }
      },
      tools: {
        schemas: () => [{ name: 'query_crm_dashboard_gsv' }, { name: 'list_agents' }],
        restrict: filter => {
          restricted.push(filter)
          return () => {}
        },
        guard: () => () => {},
      },
    },
  }
  apply({
    agentPresets: { composedPreset: context => context.preset },
    agents: { get: sessionId => sessionId === agent.id ? agent : undefined },
    effect: callback => callback(),
    on: (event, listener) => {
      listeners.set(event, listener)
      return () => {}
    },
  })

  listeners.get('agent-preset/selected')(agent.id, 'crm-query')
  assert.deepEqual(restricted, [{ deny: ['list_agents'] }])

  listeners.get('agent-preset/selected')(agent.id, 'crm-query')
  assert.equal(restricted.length, 1)

  agent.ctx.preset = 'standard'
  listeners.get('agent-preset/selected')(agent.id, 'standard')
  assert.equal(released, 1)

  agent.ctx.preset = 'crm-query'
  listeners.get('agent-preset/selected')(agent.id, 'crm-query')
  assert.equal(restricted.length, 2)
})

test('Host policy releases a session-id fallback when the Agent is disposed', async () => {
  const { apply } = await import('../lib/tool-policy.js')
  const listeners = new Map()
  let released = 0
  const agent = {
    session: { id: 'session-without-agent-id' },
    ctx: {
      preset: 'crm-query',
      effect: callback => {
        const release = callback()
        return () => {
          release()
          released += 1
        }
      },
      tools: {
        schemas: () => [{ name: 'terminal_open' }],
        restrict: () => () => {},
        guard: () => () => {},
      },
    },
  }
  apply({
    agentPresets: { composedPreset: context => context.preset },
    agents: { get: () => undefined },
    effect: callback => callback(),
    on: (event, listener) => {
      listeners.set(event, listener)
      return () => {}
    },
  })

  listeners.get('agent/created')({ agent })
  listeners.get('agent/disposed')({ agent })
  assert.equal(released, 1)
})

test('bundle ships localized display metadata and an icon', async () => {
  const en = JSON.parse(await readFile(new URL('locale/en.json', root), 'utf8'))
  const zh = JSON.parse(await readFile(new URL('locale/zh.json', root), 'utf8'))
  assert.match(en.meta.title, /Query Agent/)
  assert.match(zh.meta.title, /问数智能体/)
  assert.match(await readFile(new URL('icon.svg', root), 'utf8'), /<svg/)
})
