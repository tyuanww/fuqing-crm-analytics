import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  WeknoraClient,
  createTools,
  resolveConfig,
} from './weknora-package/dist/index.js'
import { createScopedWeKnoraTools } from './weknora-production-scope.mjs'

export const name = 'shinemage-weknora-retrieval'
export const inject = ['tools']

const PROJECT_KNOWLEDGE_BASE_IDS = Object.freeze([
  '1c4627e2-dfc1-48ca-aeef-2c00b53da5f8',
])

export function apply(ctx) {
  const keyPath = fileURLToPath(new URL('./retrieve.key', import.meta.url))
  const apiKey = readFileSync(keyPath, 'utf8').trim()
  if (!apiKey) throw new Error('WEKNORA_RETRIEVAL_KEY_UNAVAILABLE')
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
  const definitions = createScopedWeKnoraTools({
    definitions: createTools(client, config),
    client,
    allowedKnowledgeBaseIds: PROJECT_KNOWLEDGE_BASE_IDS,
  })
  for (const definition of definitions) ctx.tools.register(definition)
}
