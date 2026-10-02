import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runHostFeasibility } from './host-feasibility.mjs';

test('synthetic host feasibility records conservative lifecycle and fallback evidence', async () => {
  const evidence = await runHostFeasibility({ keepRoot: true });
  try {
    assert.equal(evidence.schema_version, 'dsh-host-feasibility/v1');
    assert.equal(evidence.dsh.exact_host_checkout, 'NOT_RUN');
    const statuses = new Map(evidence.rows.map(row => [row.id, row.status]));
    for (const id of ['profile-load', 'native-loop-before-failure', 'plugin-loop', 'hung-plugin-containment',
      'native-loop-after-timeout', 'plugin-disabled-fallback', 'crashed-plugin-containment',
      'native-loop-after-crash', 'session-wal-replay', 'profile-digest-reconcile']) {
      assert.equal(statuses.get(id), 'SUPPORTED', id);
    }
    assert.equal(statuses.get('in-process-unload'), 'BLOCKED');
    const journal = JSON.parse(await readFile(evidence.state_path, 'utf8'));
    assert.equal(journal.schema_version, 'dsh-host-journal/v1');
    assert.ok(journal.journal.some(entry => entry.event === 'PLUGIN_TIMEOUT'));
    assert.ok(journal.journal.some(entry => entry.event === 'PLUGIN_CRASH'));
    assert.ok(journal.journal.some(entry => entry.event === 'PROFILE_RECONCILE' && entry.status === 'SUPPORTED'));
  } finally {
    // The harness owns this temporary directory; the test only keeps it long
    // enough to inspect the journal and WAL evidence above.
    const { rm } = await import('node:fs/promises');
    await rm(evidence.root, { recursive: true, force: true });
  }
});
