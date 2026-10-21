import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('./open-hangzhou-dsh.sh', import.meta.url), 'utf8')

test('production browser helper pins the current runtime and DSH web port', () => {
  assert.match(source, /runtime_file="\$\{SHINEMAGE_DSH_RUNTIME:-\/srv\/shinemage\/dsh\/current\/runtime\/browser-private\.json\}"/)
  assert.match(source, /\[ "\$\{runtime_file\}" = "\/srv\/shinemage\/dsh\/current\/runtime\/browser-private\.json" \]/)
  assert.match(source, /launch\.netloc\) != \("http", "127\.0\.0\.1:4328"\)/)
  assert.doesNotMatch(source, /127\.0\.0\.1:6677/)
})

test('production browser helper keeps the launch credential off stdout', () => {
  assert.match(source, /ssh -q -o BatchMode=yes -o ConnectTimeout=8/)
  assert.match(source, /open "\$\{public_url\}"/)
  assert.match(source, /认证参数未打印/)
  assert.doesNotMatch(source, /(?:echo|printf)[^\n]*\$\{launch_url\}/)
})
