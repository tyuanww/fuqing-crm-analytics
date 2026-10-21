import { fileURLToPath } from 'node:url'

import {
  WeknoraClient,
  createTools,
  resolveConfig,
} from './weknora-package/dist/index.js'
import {
  createAllowlistedWeKnoraClient,
  createScopedWeKnoraTools,
  readProductionWeKnoraKey,
  registerScopedWeKnoraTools,
} from './weknora-production-scope.mjs'

export const name = 'shinemage-weknora-retrieval'
export const inject = ['tools']

const PROJECT_KNOWLEDGE_BASE_IDS = Object.freeze([
  '1c4627e2-dfc1-48ca-aeef-2c00b53da5f8',
])

export function apply(ctx) {
  const keyPath = fileURLToPath(new URL('./retrieve.key', import.meta.url))
  const apiKey = readProductionWeKnoraKey(keyPath)
  const config = resolveConfig({
    baseUrl: 'http://127.0.0.1:18092/api/v1',
    apiKey,
    knowledgeBaseIds: PROJECT_KNOWLEDGE_BASE_IDS,
    resourceUrls: 'handle',
    requestTimeoutMs: 60000,
    maxResults: 8,
    maxChunkChars: 2000,
    tools: {
      listKnowledgeBases: false,
      search: true,
      readDocument: true,
      ask: false,
    },
  })
  const client = new WeknoraClient(config)
  const toolClient = createAllowlistedWeKnoraClient({
    client,
    allowedKnowledgeBaseIds: PROJECT_KNOWLEDGE_BASE_IDS,
  })
  const definitions = createScopedWeKnoraTools({
    definitions: createTools(toolClient, config),
    client,
    allowedKnowledgeBaseIds: PROJECT_KNOWLEDGE_BASE_IDS,
    requiredToolNames: ['weknora_search', 'weknora_read_document'],
  })
  return registerScopedWeKnoraTools(ctx, definitions)
}
