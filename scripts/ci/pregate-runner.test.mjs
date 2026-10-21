import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const exec = promisify(execFile)
const runner = fileURLToPath(new URL('./pregate-runner.sh', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pregate-runner-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const log = join(root, 'commands.log')
  const node = join(root, 'node')
  const python = join(root, 'python')
  await writeFile(node, `#!/usr/bin/env bash
if [ "\${1:-}" = "-p" ]; then
  printf '%s\\n' "\${FAKE_NODE_MAJOR:-24}"
  exit 0
fi
printf 'node:%s\\n' "$*" >> "\${FAKE_LOG}"
`);
  await writeFile(python, `#!/usr/bin/env bash
if [ "\${1:-}" = "-c" ]; then
  printf '%s\\n' "\${FAKE_PYTHON_VERSION:-3.14}"
  exit 0
fi
printf 'python:%s PYTHONPATH=%s\\n' "$*" "\${PYTHONPATH:-}" >> "\${FAKE_LOG}"
`);
  await chmod(node, 0o755)
  await chmod(python, 0o755)
  return { root, log, node, python }
}

function run(f, files, extraEnv = {}, cwd = repoRoot) {
  return exec('bash', [runner, ...files], {
    cwd,
    env: {
      ...process.env,
      PREGATE_NODE: f.node,
      PREGATE_PYTHON: f.python,
      FAKE_LOG: f.log,
      ...extraEnv,
    },
  })
}

test('mixed runner validates the fixed runtimes and executes both language groups', async t => {
  const f = await fixture(t)
  const { stdout, stderr } = await run(f, ['sample.test.mjs', 'test_sample.py'], {
    PYTHONPATH: '/preloaded',
  })
  assert.equal(stdout, '')
  assert.equal(stderr, '')
  const commands = (await readFile(f.log, 'utf8')).trim().split('\n')
  assert.match(commands[0], /^node:--test --test-concurrency=1 sample\.test\.mjs$/)
  assert.match(commands[1], /^python:-m pytest -q test_sample\.py PYTHONPATH=/)
  assert.match(commands[1], new RegExp(repoRoot.replaceAll('/', '\\/')))
  assert.match(commands[1], /:\/preloaded$/)
})

test('mixed runner fails before Node execution on the wrong Node major', async t => {
  const f = await fixture(t)
  await assert.rejects(
    run(f, ['sample.test.mjs', 'test_sample.py'], { FAKE_NODE_MAJOR: '25' }),
    error => error.code === 2 && /PREGATE_NODE_VERSION: expected 24\.x, got 25\.x/.test(error.stderr),
  )
  await assert.rejects(readFile(f.log, 'utf8'), error => error.code === 'ENOENT')
})

test('mixed runner fails before Node execution on the wrong Python minor', async t => {
  const f = await fixture(t)
  await assert.rejects(
    run(f, ['sample.test.mjs', 'test_sample.py'], { FAKE_PYTHON_VERSION: '3.13' }),
    error => error.code === 2 && /PREGATE_PYTHON_VERSION: expected 3\.14, got 3\.13/.test(error.stderr),
  )
  await assert.rejects(readFile(f.log, 'utf8'), error => error.code === 'ENOENT')
})

test('mixed runner rejects unsupported selected files', async t => {
  const f = await fixture(t)
  await assert.rejects(
    run(f, ['notes.txt']),
    error => error.code === 1 && /unsupported pregate test file: notes\.txt/.test(error.stderr),
  )
  await assert.rejects(readFile(f.log, 'utf8'), error => error.code === 'ENOENT')
})

test('mixed runner fails closed outside a Git worktree', async t => {
  const f = await fixture(t)
  await assert.rejects(
    run(f, ['sample.test.mjs', 'test_sample.py'], {}, f.root),
    error => error.code === 2 && /PREGATE_REPOSITORY_ROOT_UNAVAILABLE/.test(error.stderr),
  )
  await assert.rejects(readFile(f.log, 'utf8'), error => error.code === 'ENOENT')
})

// Value: protects=pregate rejects an empty selection instead of reporting success; fails_when=the zero-file fail-closed guard is removed; why_new=the existing runner tests exercise only populated or invalid selections; seam=none; no_claim=test selection completeness (runner only; gstack owns discovery)
test('mixed runner rejects an empty selection before reporting success', async t => {
  const f = await fixture(t)
  await assert.rejects(
    run(f, []),
    error => error.code === 2 && /PREGATE_FILES_REQUIRED/.test(error.stderr),
  )
  await assert.rejects(readFile(f.log, 'utf8'), error => error.code === 'ENOENT')
})
