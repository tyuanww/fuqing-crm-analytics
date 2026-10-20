import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAllowlistedWeKnoraClient,
  createScopedWeKnoraTools,
} from './weknora-production-scope.mjs'

const PROJECT = '1c4627e2-dfc1-48ca-aeef-2c00b53da5f8'
const OTHER = '9a4ea853-9466-4d27-8d4e-d8e8bd5a8018'

function definition(name, execute) {
  return { name, execute }
}

test('fixed scope rejects explicit non-project knowledge base search', async () => {
  let called = false
  const [search] = createScopedWeKnoraTools({
    definitions: [{ ...definition('weknora_search', async () => { called = true }), description: 'upstream' }],
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
  await search.execute({ query: '会员溢价', knowledge_base_ids: [PROJECT] }, {})
  assert.equal(called, true)
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
  const scoped = createAllowlistedWeKnoraClient({
    client: {
      async findDocuments() {
        lookedUp = true
        return [{ knowledge_base_id: OTHER }]
      },
      async search() {
        searched = true
        return []
      },
    },
    allowedKnowledgeBaseIds: [PROJECT],
  })

  assert.deepEqual(await scoped.findDocuments({ keyword: '会员', limit: 8 }), [])
  assert.equal(lookedUp, false)
  await scoped.search({ query: '会员', knowledgeBaseIds: [PROJECT], knowledgeIds: [] })
  assert.equal(searched, true)
})

test('scoped tool client rejects an empty production allowlist', () => {
  assert.throws(
    () => createAllowlistedWeKnoraClient({ client: {}, allowedKnowledgeBaseIds: [] }),
    /allowed knowledge base list is empty/,
  )
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
  const [read] = createScopedWeKnoraTools({
    definitions: [definition('weknora_read_document', async args => calls.push(args.knowledge_id))],
    client: {
      async getDocument(id) {
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

test('document metadata failures fail closed and unrelated tools stay untouched', async () => {
  const unrelated = definition('other_tool', async () => 'ok')
  const [read, same] = createScopedWeKnoraTools({
    definitions: [
      definition('weknora_read_document', async () => 'leaked'),
      unrelated,
    ],
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
  assert.equal(same, unrelated)
})

test('an empty production allowlist is rejected', () => {
  assert.throws(
    () => createScopedWeKnoraTools({ definitions: [], client: {}, allowedKnowledgeBaseIds: [] }),
    /allowed knowledge base list is empty/,
  )
})
