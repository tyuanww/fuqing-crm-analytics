import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workspacePath = join(root, 'dsh-plugins/analytics-workbench/build-tools/pnpm-workspace.yaml');
const lockPath = join(root, 'dsh-plugins/analytics-workbench/build-tools/pnpm-lock.yaml');

test('build-tools pins the fixed brace-expansion release in both override and lockfile', async () => {
  const workspace = await readFile(workspacePath, 'utf8');
  const lockfile = await readFile(lockPath, 'utf8');
  assert.match(workspace, /['"]brace-expansion@2\.1\.4['"]:\s*2\.1\.7\b/);
  assert.match(lockfile, /brace-expansion@2\.1\.7:/);
  assert.match(lockfile, /brace-expansion:\s*2\.1\.7\b/);
  assert.doesNotMatch(lockfile, /brace-expansion@2\.1\.6/);
  assert.doesNotMatch(lockfile, /brace-expansion:\s*2\.1\.6\b/);
});
