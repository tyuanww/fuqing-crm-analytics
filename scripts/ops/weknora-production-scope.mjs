import { readFileSync } from 'node:fs'

const DENIED = 'WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED'
const CHECK_FAILED = 'WEKNORA_DOCUMENT_SCOPE_CHECK_FAILED'
const SEARCH_ARGUMENTS = new Set(['query', 'knowledge_base_ids', 'knowledge_ids', 'max_results'])
const READ_ARGUMENTS = new Set(['knowledge_id', 'page', 'page_size'])

export function readProductionWeKnoraKey(path) {
  let value
  try {
    value = readFileSync(path, 'utf8')
  } catch {
    throw new Error('WEKNORA_RETRIEVAL_KEY_UNAVAILABLE')
  }
  const apiKey = value.trim()
  if (!apiKey) throw new Error('WEKNORA_RETRIEVAL_KEY_UNAVAILABLE')
  return apiKey
}

function requestedKnowledgeBaseIds(args) {
  const value = args?.knowledge_base_ids
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${DENIED}: knowledge_base_ids must be an array`)
  return value
}

function assertAllowedArgumentKeys(toolName, args, allowed) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error(`${DENIED}: ${toolName} arguments must be an object`)
  }
  for (const key of Reflect.ownKeys(args)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new Error(`${DENIED}: ${toolName} argument ${String(key)} is not allowed`)
    }
  }
}

function scopeMessage(knowledgeBaseIds) {
  return `${DENIED}: production retrieval is limited to: ${[...knowledgeBaseIds].join(', ')}`
}

/**
 * The upstream search tool enriches passage matches with a tenant-wide
 * by-document-name lookup. Production scope cannot express that lookup, so
 * deny it before network access while preserving the scoped passage search.
 */
export function createAllowlistedWeKnoraClient({ client, allowedKnowledgeBaseIds }) {
  const allowed = new Set(allowedKnowledgeBaseIds)
  if (allowed.size === 0) throw new Error(`${DENIED}: allowed knowledge base list is empty`)
  if (client === null || typeof client !== 'object') {
    throw new Error(`${DENIED}: WeKnora client is unavailable`)
  }
  // Keep the wrapper as `this` so an upstream instance method cannot reach the
  // tenant-wide document lookup through the original instance.
  const scoped = Object.create(client)
  Object.defineProperty(scoped, 'findDocuments', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: async () => [],
  })
  return scoped
}

/**
 * Wrap the upstream WeKnora tool definitions without changing the external
 * package. The upstream `knowledgeBaseIds` setting is only a default; these
 * wrappers make it an allowlist for both search and document reads.
 */
export function createScopedWeKnoraTools({
  definitions,
  client,
  allowedKnowledgeBaseIds,
  searchName = 'weknora_search',
  readName = 'weknora_read_document',
  requiredToolNames = [],
}) {
  const allowed = new Set(allowedKnowledgeBaseIds)
  if (allowed.size === 0) throw new Error(`${DENIED}: allowed knowledge base list is empty`)
  const supported = new Set([searchName, readName])
  const names = new Set()
  for (const definition of definitions) {
    if (definition === null || typeof definition !== 'object' || typeof definition.name !== 'string'
      || typeof definition.execute !== 'function') {
      throw new Error(`${DENIED}: invalid WeKnora tool definition`)
    }
    if (!supported.has(definition.name)) {
      throw new Error(`${DENIED}: tool ${definition.name} is outside the production scope wrapper`)
    }
    if (names.has(definition.name)) throw new Error(`${DENIED}: duplicate WeKnora tool ${definition.name}`)
    names.add(definition.name)
  }
  for (const name of requiredToolNames) {
    if (!names.has(name)) throw new Error(`${DENIED}: required WeKnora tool ${name} is unavailable`)
  }

  return definitions.map(definition => {
    const execute = definition.execute
    if (definition.name === searchName) {
      return {
        ...definition,
        description: 'Search the fixed production WeKnora project knowledge base and return matching passages verbatim. '
          + 'Tenant-wide document-name enrichment is disabled; results stay within the project allowlist. '
          + 'Use a returned knowledge_id with read_document for fuller context.',
        async execute(args, exec) {
          assertAllowedArgumentKeys(searchName, args, SEARCH_ARGUMENTS)
          const requested = requestedKnowledgeBaseIds(args)
          if (requested.some(id => typeof id !== 'string' || !allowed.has(id))) {
            throw new Error(scopeMessage(allowed))
          }
          const knowledgeIds = args?.knowledge_ids
          if (
            knowledgeIds !== undefined &&
            (!Array.isArray(knowledgeIds) || knowledgeIds.length > 0)
          ) {
            throw new Error(`${DENIED}: document-id search cannot prove production knowledge-base scope`)
          }
          return execute({
            ...args,
            knowledge_base_ids: requested.length > 0 ? requested : [...allowed],
          }, exec)
        },
      }
    }
    if (definition.name === readName) {
      return {
        ...definition,
        async execute(args, exec) {
          assertAllowedArgumentKeys(readName, args, READ_ARGUMENTS)
          const knowledgeId = args?.knowledge_id
          if (typeof knowledgeId !== 'string' || knowledgeId === '') {
            throw new Error(`${CHECK_FAILED}: document id is required`)
          }
          if (typeof client.getDocument !== 'function') {
            throw new Error(`${CHECK_FAILED}: document metadata lookup is unavailable`)
          }

          let document
          try {
            document = await client.getDocument(knowledgeId, exec?.signal)
          } catch (error) {
            if (exec?.signal?.aborted) throw error
            throw new Error(CHECK_FAILED)
          }
          if (!allowed.has(document?.knowledge_base_id)) {
            throw new Error(scopeMessage(allowed))
          }
          return execute(args, exec)
        },
      }
    }
    return definition
  })
}
