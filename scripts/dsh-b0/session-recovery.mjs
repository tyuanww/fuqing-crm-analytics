/** Real reader/writer matrix. Creates new owned state; never accepts existing session data. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, cp, mkdir, readFile, readdir, writeFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { zstdCompress } from 'node:zlib';
import { TOOL_CORPUS_ID, TOOL_EVENTS_PER_TURN } from './session-recovery-tool-corpus.mjs';
import { RICH_CORPUS_ID, RICH_EVENTS_PER_TURN } from './session-recovery-rich-corpus.mjs';

const exec = promisify(execFile), compress = promisify(zstdCompress);
const probe = fileURLToPath(new URL('./session-recovery.probe.mjs', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => JSON.stringify(value, null, 2) + '\n';

export async function runSessionRecoveryMatrix({ output, rc2Modules, rc1Modules, corpus = 'text',
  runtimeVersion = '0.1.7-rc.2', baselineVersion } = {}) {
  assert.equal(Number(process.versions.node.split('.')[0]), 24);
  assert.ok(['text', 'tool', 'rich'].includes(corpus), 'RECOVERY_CORPUS_UNSUPPORTED');
  const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
  assert.equal(typeof runtimeVersion, 'string', 'RECOVERY_RUNTIME_VERSION_REQUIRED');
  assert.match(runtimeVersion, exactVersion, 'RECOVERY_RUNTIME_VERSION_REQUIRED');
  assert.ok(baselineVersion === undefined || rc1Modules, 'RECOVERY_BASELINE_MODULES_REQUIRED');
  const oldVersion = baselineVersion ?? '0.1.7-rc.1';
  assert.equal(typeof oldVersion, 'string', 'RECOVERY_BASELINE_VERSION_REQUIRED');
  assert.match(oldVersion, exactVersion, 'RECOVERY_BASELINE_VERSION_REQUIRED');
  if (rc1Modules) assert.notEqual(oldVersion, runtimeVersion, 'RECOVERY_VERSIONS_MUST_DIFFER');
  const legacy = runtimeVersion === '0.1.7-rc.2' && oldVersion === '0.1.7-rc.1';
  const currentLabel = legacy ? 'rc2' : 'candidate', oldLabel = legacy ? 'rc1' : 'baseline';
  const counts = { text: [6, 12], tool: [TOOL_EVENTS_PER_TURN, TOOL_EVENTS_PER_TURN * 2],
    rich: [RICH_EVENTS_PER_TURN + 1, RICH_EVENTS_PER_TURN * 2 + 1] };
  const [eventCount, appendedCount] = counts[corpus];
  assert.ok(isAbsolute(output) && isAbsolute(rc2Modules));
  if (rc1Modules) assert.ok(isAbsolute(rc1Modules));
  await mkdir(output, { mode: 0o700 }); // EEXIST is intentional: no reuse/overwrite.
  output = await realpath(output); // macOS /var aliases are legitimate; mkdir already refused an existing leaf.
  const rows = [], executions = [];
  const schemas = { text: 'dsh-owned-session-recovery/v1', tool: 'dsh-owned-session-recovery/v2', rich: 'dsh-owned-session-recovery/v3' };
  const result = { schema_version: schemas[corpus], scope: 'compiled-official-persistence-synthetic',
    runtime_versions: { candidate: runtimeVersion, baseline: rc1Modules ? oldVersion : null },
    rows, executions, corpus: corpus === 'tool'
      ? 'completed tool-call/result turns, success/error/meta and restored message surface; media/delegation NOT_RUN'
      : 'completed user/assistant turns with streamed text; tool/media/delegation NOT_RUN',
    ...(corpus === 'tool' ? { corpus_id: TOOL_CORPUS_ID, tool_execution: 'NOT_RUN', model_execution: 'NOT_RUN' } : {}),
    production_data: 'NOT_RUN', host_lifecycle: 'NOT_RUN', release_ready: false };
  if (corpus === 'rich') Object.assign(result, { corpus_id: RICH_CORPUS_ID,
    corpus: 'image/file references, relay/notice attribution, child header/descriptor/depth, reasoning/replay metadata',
    tool_execution: 'NOT_RUN', model_execution: 'NOT_RUN', delegation_execution: 'NOT_RUN',
    attachment_storage: 'NOT_RUN', attachment_rendering: 'NOT_RUN' });
  const fresh = async name => {
    const root = join(output, name); await mkdir(root, { mode: 0o700 });
    await writeFile(join(root, '.owned-session-recovery'), 'synthetic-only/v1\n', { mode: 0o600, flag: 'wx' });
    return root;
  };
  async function run(root, operation, old = false, prefix) {
    const input = { root, operation, modules: old ? rc1Modules : rc2Modules,
      version: old ? oldVersion : runtimeVersion, prefix, corpus };
    const index = executions.length;
    let stdout = '', stderr = '', exitCode = 0;
    try {
      const running = exec(process.execPath, [probe], { cwd: root, timeout: 30000, killSignal: 'SIGKILL',
        maxBuffer: 128 * 1024, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: root, TMPDIR: root } });
      running.child.stdin.on('error', () => {}); running.child.stdin.end(JSON.stringify(input));
      ({ stdout, stderr } = await running);
    } catch (error) {
      exitCode = Number.isInteger(error.code) ? error.code : -1;
      stdout = error.stdout ?? ''; stderr = error.stderr ?? String(error.message);
      if (error.signal) stderr += `\nterminated:${error.signal}`;
    }
    await writeFile(join(output, `process-${index}.stdout`), stdout, { mode: 0o600, flag: 'wx' });
    await writeFile(join(output, `process-${index}.stderr`), stderr, { mode: 0o600, flag: 'wx' });
    executions.push({ index, operation, version: input.version, root, exit_code: exitCode,
      stdout_sha256: hash(stdout), stderr_sha256: hash(stderr) });
    if (exitCode !== 0) throw Error(`RECOVERY_CHILD_FAILED:${index}:${stderr.slice(-2000)}`);
    return JSON.parse(stdout);
  }
  async function inventory(root) {
    const files = {};
    async function walk(relative = '') {
      for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
        const name = join(relative, entry.name); assert.ok(!entry.isSymbolicLink(), 'RECOVERY_STATE_SYMLINK');
        if (entry.isDirectory()) await walk(name);
        else { assert.ok(entry.isFile()); files[name] = hash(await readFile(join(root, name))); }
      }
    }
    await walk(); return files;
  }
  try {
    const root = await fresh('torn');
    const initial = await run(root, 'create'); assert.equal(initial.count, eventCount);
    const files = await inventory(root);
    const logs = Object.keys(files).filter(name => name.endsWith('.jsonl.zstd')); assert.equal(logs.length, 1);
    const path = join(root, logs[0]), baseline = await readFile(path);
    const frame = await compress(Buffer.from(JSON.stringify({ type: 'turn/start', seq: eventCount, time: eventCount + 1, data: { turn: 2 } }) + '\n'));
    await appendFile(path, frame.subarray(0, frame.length - 3));
    const torn = await readFile(path);
    const read = await run(root, 'read'); assert.equal(read.digest, initial.digest);
    assert.deepEqual(await readFile(path), torn, 'RECOVERY_READ_CHANGED_TORN_TAIL');
    const repaired = await run(root, 'append', false, eventCount);
    assert.equal(repaired.prefix_digest, initial.digest); assert.equal(repaired.count, appendedCount);
    const cold = await run(root, 'read'); assert.equal(cold.digest, repaired.digest);
    assert.deepEqual((await readFile(path)).subarray(0, baseline.length), baseline);
    rows.push({ id: `${currentLabel}-torn-final-frame-recovery`, status: 'PASS', committed_events: eventCount, recovered_events: appendedCount,
      prefix_digest: initial.digest, injected_bytes: frame.length - 3, read_only_preserved_bytes: true,
      initial_file_sha256: hash(baseline), repaired_file_sha256: hash(await readFile(path)) });
    if (rc1Modules) {
      const cross = await fresh('cross-version');
      const old = await run(cross, 'create', true); assert.equal(old.count, eventCount);
      // Owned synthetic snapshot demonstrates code rollback with OLD state only.
      const saved = join(output, 'old-state-snapshot'); await cp(cross, saved, { recursive: true, errorOnExist: true });
      const before = await inventory(cross), newer = await run(cross, 'read');
      assert.equal(newer.digest, old.digest); assert.deepEqual(await inventory(cross), before);
      const appended = await run(cross, 'append', false, eventCount);
      assert.equal(appended.prefix_digest, old.digest); assert.equal(appended.count, appendedCount);
      assert.equal((await run(cross, 'read')).digest, appended.digest);
      rows.push({ id: `${oldLabel}-write-${currentLabel}-read-append`, status: 'PASS', old_format: old.format_version,
        new_format: appended.format_version, committed_events: eventCount, recovered_events: appendedCount });
      const preRollback = await inventory(cross);
      let downgrade;
      try {
        const back = await run(cross, 'read', true);
        downgrade = back.digest === appended.digest && back.count === appended.count
          ? { status: 'PASS', outcome: 'LATEST_EVENTS_READ', count: back.count }
          : { status: 'BLOCKED', outcome: 'STALE_GENERATION', count: back.count, expected_count: appended.count };
      } catch (error) {
        downgrade = { status: 'BLOCKED', outcome: 'RUNTIME_REFUSED', reason: error.message };
      }
      assert.deepEqual(await inventory(cross), preRollback, 'RECOVERY_OLD_READER_MUTATED_NEW_STATE');
      rows.push({ id: `${currentLabel}-write-${oldLabel}-read`, ...downgrade, state_unchanged: true });
      assert.equal((await run(saved, 'read', true)).digest, old.digest);
      rows.push({ id: `${oldLabel}-preserved-state-rollback`, status: 'PASS', count: old.count,
        boundary: `does not contain ${currentLabel} writes; new state must be retained for forward-fix` });
    } else rows.push({ id: `${oldLabel}-${currentLabel}-cross-version`, status: 'NOT_RUN',
      reason: `explicit ${oldLabel} compiled modules required` });
    result.status = rows.every(row => row.status === 'PASS') ? 'PASS' : 'PARTIAL';
  } catch (error) { result.status = 'FAIL'; result.error = String(error.message); }
  await writeFile(join(output, 'session-recovery.json'), encode(result), { mode: 0o600, flag: 'wx' });
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), positional = [], options = {}, seen = new Set();
  const flags = { '--corpus': 'corpus', '--runtime-version': 'runtimeVersion', '--baseline-version': 'baselineVersion' };
  for (let index = 0; index < args.length; index++) {
    if (Object.hasOwn(flags, args[index])) {
      const flag = args[index];
      assert.ok(!seen.has(flag), 'RECOVERY_ARGUMENT_DUPLICATE');
      assert.ok(args[index + 1] && !args[index + 1].startsWith('-'), 'RECOVERY_ARGUMENT_VALUE_REQUIRED');
      seen.add(flag); options[flags[flag]] = args[++index];
    } else {
      assert.ok(!args[index].startsWith('-'), 'RECOVERY_ARGUMENT_UNSUPPORTED'); positional.push(args[index]);
    }
  }
  assert.ok(positional.length === 2 || positional.length === 3, 'RECOVERY_ARGUMENT_COUNT');
  const [output, rc2Modules, rc1Modules] = positional;
  const result = await runSessionRecoveryMatrix({ output, rc2Modules, rc1Modules, ...options });
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'FAIL' ? 1 : result.status === 'PASS' ? 0 : 2;
}
