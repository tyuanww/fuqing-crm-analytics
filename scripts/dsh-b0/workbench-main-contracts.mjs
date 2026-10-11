/** The three existing backend/query checks remain main-owned during source retirement. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function runWorkbenchMainContracts({ environment = process.env } = {}) {
  const lock = JSON.parse(await readFile(join(root, 'config/workbench-author-evidence.lock.json'), 'utf8'));
  const env = { ...environment };
  delete env.NODE_TEST_CONTEXT;
  const rows = [];
  for (const check of lock.main_owned_checks) {
    const pattern = `^(?:${check.patterns.map(escape).join('|')})$`;
    const args = ['--test', '--test-reporter', 'spec', '--test-concurrency=1', '--test-name-pattern', pattern, check.file];
    const run = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    assert.ok(!run.error && run.status === 0, `WORKBENCH_MAIN_CHECK_EXIT: ${check.file}`);
    const counts = Object.fromEntries([...(String(run.stdout) + '\n' + String(run.stderr)).matchAll(/^[ℹ#] (tests|pass|fail|skipped|todo|cancelled) (\d+)$/gm)].map(row => [row[1], Number(row[2])]));
    assert.equal(counts.pass, check.expected_pass, `WORKBENCH_MAIN_CHECK_COUNT: ${check.file}`);
    for (const name of ['fail', 'todo', 'cancelled']) assert.equal(counts[name], 0, `WORKBENCH_MAIN_CHECK_${name}`);
    rows.push({ file: check.file, patterns: check.patterns, ...counts, exit_code: run.status,
      filtered_tests_owner: 'independent Workbench core CI; filtering is not local execution of those tests' });
  }
  return { schema: 'shinemage-workbench-main-contracts/v1', groups: rows, source_retirement: 'three original contract test files still retained', real_model: 'NOT_RUN', release_ready: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await runWorkbenchMainContracts()));
