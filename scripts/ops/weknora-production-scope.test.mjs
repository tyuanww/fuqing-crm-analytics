import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createAllowlistedWeKnoraClient,
  createScopedWeKnoraTools,
  readProductionWeKnoraKey,
  registerScopedWeKnoraTools,
} from './weknora-production-scope.mjs'

const PROJECT = '1c4627e2-dfc1-48ca-aeef-2c00b53da5f8'
const OTHER = '9a4ea853-9466-4d27-8d4e-d8e8bd5a8018'

function definition(name, execute) {
  return { name, execute }
}

test('fixed scope rejects explicit non-project knowledge base search', async () => {
  let called = false
  let delegated
  const [search] = createScopedWeKnoraTools({
    definitions: [{ ...definition('weknora_search', async args => { called = true; delegated = args }), description: 'upstream' }],
    client: {},
    allowedKnowledgeBaseIds: [PROJECT],
  })

  assert.match(search.description, /Tenant-wide document-name enrichment is disabled/)
  await assert.rejects(
    search.execute({ query: '会员溢价', knowledge_base_ids: [OTHER] }, {}),
    /WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED/,
  )
  assert.equal(called, false)
  await search.execute({ query: '会员溢价' }, {})
  assert.deepEqual(delegated.knowledge_base_ids, [PROJECT])
  await search.execute({ query: '会员溢价', knowledge_base_ids: [PROJECT] }, {})
  assert.equal(called, true)
})

test('fixed scope normalizes an explicitly empty knowledge-base filter', async () => {
  let delegated
  const [search] = createScopedWeKnoraTools({
    definitions: [definition('weknora_search', async args => { delegated = args })],
    client: {},
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await search.execute({ query: '会员溢价', knowledge_base_ids: [] }, {})
  assert.deepEqual(delegated.knowledge_base_ids, [PROJECT])
})

test('fixed scope rejects non-array knowledge base filters before search', async () => {
  let called = false
  const [search] = createScopedWeKnoraTools({
    definitions: [definition('weknora_search', async () => { called = true })],
    client: {},
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    search.execute({ query: '会员溢价', knowledge_base_ids: OTHER }, {}),
    /knowledge_base_ids must be an array/,
  )
  assert.equal(called, false)
})

test('scoped tool client denies tenant-wide document lookup before network access', async () => {
  let lookedUp = false
  let searched = false
  const client = {
    async findDocuments() {
      lookedUp = true
      return [{ knowledge_base_id: OTHER }]
    },
    async search() {
      searched = true
      return this.findDocuments({ keyword: '会员', limit: 8 })
    },
  }
  const scoped = createAllowlistedWeKnoraClient({
    client,
    allowedKnowledgeBaseIds: [PROJECT],
  })

  assert.deepEqual(await scoped.findDocuments({ keyword: '会员', limit: 8 }), [])
  assert.equal(lookedUp, false)
  assert.deepEqual(await scoped.search({ query: '会员', knowledgeBaseIds: [PROJECT], knowledgeIds: [] }), [])
  assert.equal(searched, true)
  assert.equal(lookedUp, false)
})

test('scoped tool client rejects an empty production allowlist', () => {
  assert.throws(
    () => createAllowlistedWeKnoraClient({ client: {}, allowedKnowledgeBaseIds: [] }),
    /allowed knowledge base list is empty/,
  )
})

test('search rejects undeclared and camelCase arguments before delegating', async () => {
  let called = false
  const [search] = createScopedWeKnoraTools({
    definitions: [definition('weknora_search', async () => { called = true })],
    client: {},
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    search.execute({ query: '会员溢价', knowledge_base_ids: [PROJECT], knowledgeBaseIds: [PROJECT] }, {}),
    /knowledgeBaseIds is not allowed/,
  )
  await assert.rejects(
    search.execute({ query: '会员溢价', knowledge_base_id: PROJECT }, {}),
    /knowledge_base_id is not allowed/,
  )
  assert.equal(called, false)
})

test('document reads reject undeclared and camelCase arguments before metadata lookup', async () => {
  let lookedUp = false
  let called = false
  const [read] = createScopedWeKnoraTools({
    definitions: [definition('weknora_read_document', async () => { called = true })],
    client: {
      async getDocument() {
        lookedUp = true
        return { knowledge_base_id: PROJECT }
      },
    },
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    read.execute({ knowledgeId: 'project-document' }, {}),
    /knowledgeId is not allowed/,
  )
  await assert.rejects(
    read.execute({ knowledge_id: 'project-document', knowledge_base_ids: [PROJECT] }, {}),
    /knowledge_base_ids is not allowed/,
  )
  assert.equal(lookedUp, false)
  assert.equal(called, false)
})

test('fixed scope rejects knowledge-id search that cannot prove base membership', async () => {
  let called = false
  const [search] = createScopedWeKnoraTools({
    definitions: [definition('weknora_search', async () => { called = true })],
    client: {},
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    search.execute({ query: '会员溢价', knowledge_ids: ['unknown-document'] }, {}),
    /document-id search cannot prove production knowledge-base scope/,
  )
  assert.equal(called, false)
})

test('fixed scope rejects non-array document-id search filters', async () => {
  let called = false
  const [search] = createScopedWeKnoraTools({
    definitions: [definition('weknora_search', async () => { called = true })],
    client: {},
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    search.execute({ query: '会员溢价', knowledge_ids: 'unknown-document' }, {}),
    /document-id search cannot prove production knowledge-base scope/,
  )
  assert.equal(called, false)
})

test('document reads verify knowledge base membership before delegating', async () => {
  const calls = []
  let metadataReads = 0
  const [read] = createScopedWeKnoraTools({
    definitions: [definition('weknora_read_document', async args => calls.push(args.knowledge_id))],
    client: {
      async getDocument(id) {
        metadataReads += 1
        return { knowledge_base_id: id === 'project-document' ? PROJECT : OTHER }
      },
    },
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    read.execute({ knowledge_id: 'synthetic-document' }, { signal: new AbortController().signal }),
    /WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED/,
  )
  assert.deepEqual(calls, [])
  await read.execute({ knowledge_id: 'project-document' }, { signal: new AbortController().signal })
  assert.deepEqual(calls, ['project-document'])
  assert.equal(metadataReads, 3)
})

test('document reads discard content when scope changes during the request', async () => {
  let calls = 0
  let metadataReads = 0
  const [read] = createScopedWeKnoraTools({
    definitions: [definition('weknora_read_document', async () => {
      calls += 1
      return { knowledge_id: 'project-document', content: 'must not escape' }
    })],
    client: {
      async getDocument() {
        metadataReads += 1
        return { knowledge_base_id: metadataReads === 1 ? PROJECT : OTHER }
      },
    },
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    read.execute({ knowledge_id: 'project-document' }, { signal: new AbortController().signal }),
    /WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED/,
  )
  assert.equal(calls, 1)
  assert.equal(metadataReads, 2)
})

test('document reads reject missing or empty ids before delegating', async () => {
  let called = false
  const [read] = createScopedWeKnoraTools({
    definitions: [definition('weknora_read_document', async () => { called = true })],
    client: {
      async getDocument() {
        return { knowledge_base_id: PROJECT }
      },
    },
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    read.execute({}, { signal: new AbortController().signal }),
    /document id is required/,
  )
  await assert.rejects(
    read.execute({ knowledge_id: '' }, { signal: new AbortController().signal }),
    /document id is required/,
  )
  assert.equal(called, false)
})

test('unknown upstream tools fail closed instead of escaping the scope wrapper', () => {
  assert.throws(
    () => createScopedWeKnoraTools({
      definitions: [definition('weknora_list_knowledge_bases', async () => [])],
      client: {},
      allowedKnowledgeBaseIds: [PROJECT],
    }),
    /outside the production scope wrapper/,
  )
})

test('required production tools must all be present', () => {
  assert.throws(
    () => createScopedWeKnoraTools({
      definitions: [definition('weknora_search', async () => [])],
      client: {},
      allowedKnowledgeBaseIds: [PROJECT],
      requiredToolNames: ['weknora_search', 'weknora_read_document'],
    }),
    /required WeKnora tool weknora_read_document is unavailable/,
  )
})

test('document metadata failures fail closed', async () => {
  const [read] = createScopedWeKnoraTools({
    definitions: [definition('weknora_read_document', async () => 'leaked')],
    client: {
      async getDocument() {
        throw new Error('metadata unavailable')
      },
    },
    allowedKnowledgeBaseIds: [PROJECT],
  })

  await assert.rejects(
    read.execute({ knowledge_id: 'unknown' }, { signal: new AbortController().signal }),
    /WEKNORA_DOCUMENT_SCOPE_CHECK_FAILED/,
  )
})

test('an empty production allowlist is rejected', () => {
  assert.throws(
    () => createScopedWeKnoraTools({ definitions: [], client: {}, allowedKnowledgeBaseIds: [] }),
    /allowed knowledge base list is empty/,
  )
})

test('a missing production key uses the documented fail-closed error', () => {
  assert.throws(
    () => readProductionWeKnoraKey('/definitely/missing/retrieve.key'),
    /WEKNORA_RETRIEVAL_KEY_UNAVAILABLE/,
  )
})

test('registered WeKnora tools are released in reverse order with the plugin effect', () => {
  const definitions = [definition('weknora_search', async () => []), definition('weknora_read_document', async () => ({}))]
  const registered = []
  const released = []
  const disposeEffect = registerScopedWeKnoraTools({
    effect(callback) {
      return callback()
    },
    tools: {
      register(value) {
        registered.push(value.name)
        return () => released.push(value.name)
      },
    },
  }, definitions)

  assert.deepEqual(registered, ['weknora_search', 'weknora_read_document'])
  disposeEffect()
  assert.deepEqual(released, ['weknora_read_document', 'weknora_search'])
  assert.throws(
    () => registerScopedWeKnoraTools({ tools: {} }, definitions),
    /tool lifecycle is unavailable/,
  )
})

test('a failed second registration releases tools registered by the same effect', () => {
  const released = []
  let attempts = 0
  assert.throws(
    () => registerScopedWeKnoraTools({
      effect(callback) {
        return callback()
      },
      tools: {
        register(value) {
          attempts += 1
          if (attempts === 2) throw new Error('duplicate tool')
          return () => released.push(value.name)
        },
      },
    }, [definition('weknora_search', async () => []), definition('weknora_read_document', async () => ({}))]),
    /duplicate tool/,
  )
  assert.equal(attempts, 2)
  assert.deepEqual(released, ['weknora_search'])
})

test('production overlay records project-only scope without embedding runtime credentials', async () => {
  const overlay = JSON.parse(await readFile(
    new URL('../../config/weknora-production-overlay.v1.json', import.meta.url),
    'utf8',
  ))

  assert.equal(overlay.schema_version, 'shinemage-weknora-production-overlay/v1')
  assert.equal(overlay.scope_contract.project_knowledge_base_id, PROJECT)
  assert.deepEqual(overlay.scope_contract.exposed_tools, ['weknora_search', 'weknora_read_document'])
  assert.equal(overlay.scope_contract.list_knowledge_bases, false)
  assert.equal(overlay.scope_contract.document_id_search, 'DENIED')
  assert.equal(overlay.scope_contract.document_read_scope, 'METADATA_CHECK_BEFORE_AND_AFTER_READ')
  assert.equal(overlay.scope_contract.tool_lifecycle, 'EFFECT_DISPOSE_TRANSACTIONAL')
  assert.equal(overlay.scope_contract.tenant_wide_document_name_lookup, 'DENIED_BEFORE_NETWORK')
  for (const digest of Object.values(overlay.overlay_files)) assert.match(digest, /^[a-f0-9]{64}$/)
  assert.equal(overlay.release_ready, undefined)
  assert.doesNotMatch(JSON.stringify(overlay), /"(?:api[_-]?key|authorization|bearer)"\s*:/i)
})
