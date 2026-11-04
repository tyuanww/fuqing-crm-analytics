import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
  assertOfficialToolsRegistered,
  findOfficialToolCatalog,
  officialToolNamesFromFile,
  unregisteredOfficialTools,
} from './support/official-tool-catalog.mjs'

const policy = JSON.parse(readFileSync(new URL('../config/query-agent-tool-policy.v1.json', import.meta.url), 'utf8'))
const snapshot = JSON.parse(readFileSync(new URL('../config/dsh-official-tools.v1.json', import.meta.url), 'utf8'))
const toolchain = JSON.parse(readFileSync(new URL('../../plugin-kit/toolchain.json', import.meta.url), 'utf8'))
const registered = new Set([...policy.hidden_inherited, ...policy.official_denied])

test('single source keeps the reviewed allowed tools in order', () => {
  assert.deepEqual(policy.allowed, [
    'query_crm_dashboard_snapshot',
    'query_crm_warehouse_snapshot',
    'query_crm_dashboard_gsv',
    'query_crm_dashboard_purchases',
    'query_crm_product_customer_cohorts',
    'query_crm_rfm_snapshot',
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
  assert.deepEqual(policy.hidden_inherited, [
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
})

test('single source policy is internally consistent', () => {
  assert.deepEqual(Object.keys(policy).sort(),
    ['allowed', 'hidden_inherited', 'official_denied', 'preset_id', 'schema_version'])
  assert.equal(policy.schema_version, 'query-agent-tool-policy/v1')
  assert.equal(policy.preset_id, 'crm-query')

  for (const field of ['allowed', 'hidden_inherited', 'official_denied']) {
    const list = policy[field]
    assert.ok(Array.isArray(list) && list.length > 0, `${field} must be a non-empty array`)
    assert.equal(new Set(list).size, list.length, `${field} must not contain duplicates`)
    for (const name of list) {
      assert.equal(typeof name, 'string')
      assert.match(name, /^[a-z][a-z0-9_]*$/)
    }
  }

  const groups = {
    allowed: new Set(policy.allowed),
    hidden_inherited: new Set(policy.hidden_inherited),
    official_denied: new Set(policy.official_denied),
  }
  assert.deepEqual([...groups.allowed].filter(name => groups.hidden_inherited.has(name)), [])
  assert.deepEqual([...groups.allowed].filter(name => groups.official_denied.has(name)), [])
  assert.deepEqual([...groups.hidden_inherited].filter(name => groups.official_denied.has(name)), [])
})

test('reviewed official catalog is partitioned into hidden and explicitly denied tools', () => {
  assert.equal(snapshot.schema_version, 'query-agent-official-tools/v1')
  assert.equal(snapshot.source, 'deepseek-harness/docs/tool-catalog.md')
  assert.equal(snapshot.dsh_version, toolchain.sdk_version)
  assert.equal(snapshot.upstream_sha, toolchain.upstream_sha)
  assert.match(snapshot.upstream_sha, /^[a-f0-9]{40}$/)
  assert.equal(snapshot.upstream_sha, 'b830ec950faba0a46dda564be3e2d854afed94f1')
  assert.equal(snapshot.headings, 73)
  assert.equal(snapshot.unique_tools, 68)
  assert.equal(snapshot.unique_tools, snapshot.tools.length)
  assert.equal(new Set(snapshot.tools).size, snapshot.tools.length)
  assert.deepEqual(snapshot.tools, [...snapshot.tools].sort())

  // Every reviewed official name is classified exactly once, and no stale
  // hidden/denied name is kept after an upstream removal.
  assert.deepEqual([...registered].sort(), [...snapshot.tools].sort())
  assert.deepEqual([...new Set([...policy.allowed, ...registered])].sort(),
    [...new Set([...policy.allowed, ...snapshot.tools])].sort())
  assert.deepEqual(policy.allowed.filter(name => snapshot.tools.includes(name)), [])
  assert.deepEqual(policy.official_denied, [...policy.official_denied].sort())
})

test('built artifact exposes exactly the reviewed single source', async () => {
  const built = await import('../lib/tool-policy.js')
  assert.equal(built.queryPresetId, policy.preset_id)
  assert.deepEqual(built.queryToolAllowlist, policy.allowed)
  assert.deepEqual(built.hiddenInheritedTools, policy.hidden_inherited)
  assert.deepEqual(built.officialDeniedTools, policy.official_denied)
  assert.ok(Object.isFrozen(built.queryToolAllowlist))
  assert.ok(Object.isFrozen(built.hiddenInheritedTools))
  assert.ok(Object.isFrozen(built.officialDeniedTools))
  assert.deepEqual(Object.keys(built).sort(),
    ['apply', 'hiddenInheritedTools', 'inject', 'name', 'officialDeniedTools', 'queryPresetId', 'queryToolAllowlist'])
})

test('runtime artifact is one self-contained module without a data import', () => {
  const source = readFileSync(new URL('../lib/tool-policy.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /tool-policy\.data\.js/)
  assert.match(source, /const toolPolicy = Object\.freeze\(/)
  assert.ok(existsSync(new URL('../src/tool-policy.ts', import.meta.url)))
  assert.ok(existsSync(new URL('../build.mjs', import.meta.url)))
  assert.ok(existsSync(new URL('../config/query-agent-tool-policy.v1.json', import.meta.url)))
})

test('a new official tool name fails registration', () => {
  const future = [...snapshot.tools, 'future_official_tool']
  assert.deepEqual(unregisteredOfficialTools(future, registered), ['future_official_tool'])
  assert.throws(
    () => assertOfficialToolsRegistered(future, registered),
    /UNREGISTERED_OFFICIAL_TOOL future_official_tool/,
  )
  assert.throws(
    () => assertOfficialToolsRegistered(['another_future_tool'], []),
    /UNREGISTERED_OFFICIAL_TOOL another_future_tool/,
  )
})

test('live DSH catalog cannot introduce an unregistered official tool', t => {
  const path = findOfficialToolCatalog()
  if (path === undefined) {
    if (process.env.QUERY_AGENT_OFFICIAL_CATALOG_REQUIRED === '1') {
      assert.fail(
        'OFFICIAL_TOOL_CATALOG_UNAVAILABLE: set DSH_TOOL_CATALOG to docs/tool-catalog.md '
          + 'or DSH_UPSTREAM to a DSH checkout',
      )
    }
    t.skip('DSH tool catalog unavailable; set DSH_TOOL_CATALOG or DSH_UPSTREAM to enable the drift gate')
    return
  }
  const liveNames = officialToolNamesFromFile(path)
  assert.ok(liveNames.length > 0, `OFFICIAL_TOOL_CATALOG_EMPTY ${path}`)
  assertOfficialToolsRegistered(liveNames, registered)

  // A checkout of the pinned version must match the reviewed snapshot exactly;
  // older or newer checkouts still use the additive gate above.
  const manifestPath = join(dirname(path), '../package.json')
  if (existsSync(manifestPath)) {
    const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (version === snapshot.dsh_version) {
      assert.deepEqual(liveNames, snapshot.tools,
        `OFFICIAL_TOOL_CATALOG_DRIFT ${version}: review removed/renamed tools and update config/dsh-official-tools.v1.json`)
    }
  }
})
