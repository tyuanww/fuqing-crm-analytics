import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const repositoryRoot = resolve(packageRoot, '../..')

/**
 * Parse the generated DSH tool catalog (`docs/tool-catalog.md`). Its package
 * sections render one `### \`tool_name\`` heading per registered tool, so the
 * headings are the model-facing names the shipped packages contribute.
 */
export function parseOfficialToolCatalog(source) {
  const headings = [...source.matchAll(/^### `([^`]+)`[ \t]*$/gm)].map(match => match[1])
  assert.ok(headings.length > 0, 'OFFICIAL_TOOL_CATALOG_EMPTY')
  return [...new Set(headings)].sort()
}

/**
 * Resolve a live DSH tool catalog. An explicit path wins; otherwise the
 * repository-pinned `.context` checkout used by the plugin build is accepted.
 * Returns undefined so callers can choose to skip when no checkout exists.
 */
export function findOfficialToolCatalog({ env = process.env, root = packageRoot } = {}) {
  const explicit = env.DSH_TOOL_CATALOG
  if (explicit) {
    assert.ok(existsSync(explicit), `DSH_TOOL_CATALOG_MISSING ${explicit}`)
    return resolve(explicit)
  }
  if (env.DSH_UPSTREAM) {
    const path = join(env.DSH_UPSTREAM, 'docs/tool-catalog.md')
    assert.ok(existsSync(path), `DSH_UPSTREAM_TOOL_CATALOG_MISSING ${path}`)
    return path
  }
  const repository = resolve(root, '../..')
  const candidates = []
  const toolchain = join(repository, 'dsh-plugins/plugin-kit/toolchain.json')
  if (existsSync(toolchain)) {
    const { sdk_version: sdkVersion } = JSON.parse(readFileSync(toolchain, 'utf8'))
    if (typeof sdkVersion === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdkVersion)) {
      candidates.push(join(repository, '.context/dsh-b0', `upstream-${sdkVersion}`, 'docs/tool-catalog.md'))
    }
  }
  return candidates.find(path => existsSync(path))
}

export function officialToolNamesFromFile(path) {
  return parseOfficialToolCatalog(readFileSync(path, 'utf8'))
}

export function unregisteredOfficialTools(names, registered) {
  const known = registered instanceof Set ? registered : new Set(registered)
  return [...new Set(names)].filter(name => !known.has(name)).sort()
}

export function assertOfficialToolsRegistered(names, registered) {
  const unknown = unregisteredOfficialTools(names, registered)
  assert.deepEqual(unknown, [], `UNREGISTERED_OFFICIAL_TOOL ${unknown.join(', ')}`)
}
