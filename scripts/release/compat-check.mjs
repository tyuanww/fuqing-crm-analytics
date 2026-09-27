/** Compatibility acceptance must exercise the pinned rc1/rc2 runtime and WAL readers.
 * This repository currently has no checked-in runtime fixture; fail closed rather than
 * manufacturing JSON and claiming an upgrade pass.
 */
export async function runCompatibilityMatrix(root, { runtimeRunner = null } = {}) {
  if (typeof runtimeRunner !== 'function') return { status: 'NOT_RUN', fixture: root, reason: 'rc1/rc2 runtime, cold-start and WAL runner is not configured', real_duckdb: 'NOT_RUN' };
  const result = await runtimeRunner(root);
  if (!result || result.status !== 'PASS') return { status: 'FAIL', fixture: root, reason: 'runtime compatibility runner failed', result };
  return result;
}
