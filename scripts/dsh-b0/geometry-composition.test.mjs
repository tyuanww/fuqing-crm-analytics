/** Author-owned private geometry coverage; the pipeline first binds this evidence to the current formal pack. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkbenchAuthorEvidence } from '../ci/workbench-author-evidence.mjs';

test('the fixed Workbench author CI covers its private geometry composition assertions', async () => {
  const evidence = await readWorkbenchAuthorEvidence({
    archivePath: process.env.WORKBENCH_AUTHOR_CI_ARCHIVE,
    python: process.env.FQ_B0_PYTHON,
  });
  assert.ok(evidence.core_files.includes('src/board-spec/geometry-composition.test.mjs'),
    'WORKBENCH_GEOMETRY_AUTHOR_COVERAGE_REQUIRED');
});
