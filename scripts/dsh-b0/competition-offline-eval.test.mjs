/** Main-owned synthetic backend eval; no Workbench source or compiled plugin input. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('offline python eval suite', t => {
  const run = spawnSync(process.env.PYTHON || 'python3',
    ['-m', 'backend.services.analytics.competition_diagnosis.eval'], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, PYTHONPATH: root,
        PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' },
    });
  assert.ifError(run.error);
  assert.equal(run.status, 0, `offline eval failed: ${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.planner, 'OFFLINE_STUB');
  assert.ok(Number.isSafeInteger(report.total) && report.total > 0,
    'offline eval must execute at least one case');
  assert.equal(report.t13_real_model, 'NOT_RUN');
  assert.deepEqual(report.failed, []);
  assert.equal(report.passed, report.total);
  t.diagnostic(JSON.stringify(report));
});
