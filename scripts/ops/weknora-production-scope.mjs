const DENIED = 'WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED'
const CHECK_FAILED = 'WEKNORA_DOCUMENT_SCOPE_CHECK_FAILED'

function requestedKnowledgeBaseIds(args) {
  const value = args?.knowledge_base_ids
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${DENIED}: knowledge_base_ids must be an array`)
  return value
}

function scopeMessage(knowledgeBaseIds) {
  return `${DENIED}: production retrieval is limited to: ${[...knowledgeBaseIds].join(', ')}`
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
}) {
  const allowed = new Set(allowedKnowledgeBaseIds)
  if (allowed.size === 0) throw new Error(`${DENIED}: allowed knowledge base list is empty`)

  return definitions.map(definition => {
    const execute = definition.execute
    if (definition.name === searchName) {
      return {
        ...definition,
        async execute(args, exec) {
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
          return execute(args, exec)
        },
      }
    }
    if (definition.name === readName) {
      return {
        ...definition,
        async execute(args, exec) {
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
