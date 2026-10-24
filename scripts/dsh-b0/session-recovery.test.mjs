import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { zstdCompress, zstdDecompress } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSessionRecoveryMatrix } from './session-recovery.mjs';
import { TOOLCHAIN } from '../release/toolchain.mjs';

const exec = promisify(execFile), compress = promisify(zstdCompress), decompress = promisify(zstdDecompress);
const runtimeVersion = TOOLCHAIN.sdk_version;

test('existing output is refused without touching its contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-guard-'));
  try {
    await writeFile(join(root, 'retain'), 'existing');
    await assert.rejects(runSessionRecoveryMatrix({ output: root, rc2Modules: '/missing' }), /EEXIST/);
    assert.equal(await readFile(join(root, 'retain'), 'utf8'), 'existing');
  } finally { await rm(root, { recursive: true }); }
});

test('missing runtime is FAIL with fresh-process evidence, never PASS/NOT_RUN', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-missing-'));
  try {
    const result = await runSessionRecoveryMatrix({ output: join(root, 'result'), rc2Modules: join(root, 'absent') });
    assert.equal(result.status, 'FAIL'); assert.equal(result.executions.length, 1);
    assert.notEqual(result.executions[0].exit_code, 0);
  } finally { await rm(root, { recursive: true }); }
});

test('pinned official cold reader/writer recovers an incomplete zstd frame', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit built upstream required',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-real-'));
  try {
    const result = await runSessionRecoveryMatrix({ output: join(root, 'result'), runtimeVersion,
      rc2Modules: join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai') });
    assert.equal(result.status, 'PARTIAL');
    assert.equal(result.rows[0].status, 'PASS'); assert.equal(result.rows[1].status, 'NOT_RUN');
    assert.equal(result.executions.length, 4);
  } finally { await rm(root, { recursive: true }); }
});

test('a wrong expected runtime version fails before creating session storage', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit built upstream required',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-version-'));
  try {
    const result = await runSessionRecoveryMatrix({ output: join(root, 'result'), runtimeVersion: '0.0.0-unexpected',
      rc2Modules: join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai') });
    assert.equal(result.status, 'FAIL');
    assert.match(result.error, /RECOVERY_RUNTIME_VERSION/);
    assert.equal(result.executions.length, 1);
    assert.deepEqual(await readdir(result.executions[0].root), ['.owned-session-recovery']);
  } finally { await rm(root, { recursive: true }); }
});

test('candidate recovery accepts explicit candidate and baseline runtime versions', {
  skip: (!process.env.B0_BUILD_UPSTREAM || !process.env.B0_RECOVERY_BASELINE_UPSTREAM)
    && 'explicit built candidate and baseline checkouts required',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-candidate-'));
  try {
    const result = await runSessionRecoveryMatrix({
      output: join(root, 'result'),
      rc2Modules: join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai'),
      rc1Modules: join(process.env.B0_RECOVERY_BASELINE_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai'),
      runtimeVersion,
      baselineVersion: '0.1.7-rc.2',
    });
    assert.deepEqual(result.runtime_versions, { candidate: runtimeVersion, baseline: '0.1.7-rc.2' });
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.rows.map(row => row.status), ['PASS', 'PASS', 'PASS', 'PASS']);
    assert.equal(result.rows[1].id, 'baseline-write-candidate-read-append');
    assert.equal(result.rows[2].id, 'candidate-write-baseline-read');
  } finally { await rm(root, { recursive: true }); }
});

test('unknown corpus is rejected before creating output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-corpus-guard-'));
  try {
    const output = join(root, 'must-not-exist');
    await assert.rejects(runSessionRecoveryMatrix({ output, rc2Modules: '/missing', corpus: 'all' }), /RECOVERY_CORPUS_UNSUPPORTED/);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true }); }
});

test('pinned official runtime retains tool pairs, error/meta and messages after torn-tail repair', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit built upstream required',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-tool-real-'));
  try {
    const output = join(root, 'result');
    const result = await runSessionRecoveryMatrix({ output, corpus: 'tool', runtimeVersion,
      rc2Modules: join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai') });
    assert.equal(result.schema_version, 'dsh-owned-session-recovery/v2');
    assert.equal(result.status, 'PARTIAL'); assert.equal(result.release_ready, false);
    assert.equal(result.rows[0].status, 'PASS'); assert.equal(result.rows[0].committed_events, 13);
    assert.equal(result.rows[0].recovered_events, 26); assert.equal(result.rows[1].status, 'NOT_RUN');
    assert.equal(result.tool_execution, 'NOT_RUN'); assert.equal(result.model_execution, 'NOT_RUN');
    assert.equal(result.executions.length, 4);
    const cold = JSON.parse(await readFile(join(output, 'process-3.stdout'), 'utf8'));
    const calls = cold.events.filter(event => event.type === 'tool/call');
    const results = cold.events.filter(event => event.type === 'tool/result');
    assert.equal(calls.length, 4);
    assert.deepEqual(results.map(event => event.data.message.toolCallId), calls.map(event => event.data.callId));
    assert.deepEqual(results.map(event => event.data.message.isError), [false, true, false, true]);
    assert.equal(results[1].data.error.code, 'SYNTHETIC_DENIED');
    assert.deepEqual(results[0].data.meta.rows, [{ count: 1 }]);
  } finally { await rm(root, { recursive: true }); }
});

test('cold tool-corpus probe rejects altered persisted tool content without repairing it', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit built upstream required',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-tool-corrupt-'));
  try {
    const output = join(root, 'result'), modules = join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai');
    const result = await runSessionRecoveryMatrix({ output, rc2Modules: modules, corpus: 'tool', runtimeVersion });
    assert.equal(result.rows[0].status, 'PASS');
    const owned = result.executions[0].root, logs = [];
    async function walk(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) await walk(join(path, entry.name));
        else if (entry.name.endsWith('.jsonl.zstd')) logs.push(join(path, entry.name));
      }
    }
    await walk(owned); assert.equal(logs.length, 1);
    // Node decodes the first frame only; the official format deliberately keeps
    // the header in that frame. Rebuild a separate event frame from the verified
    // cold-process output, then let the real reader parse the altered fixture.
    const header = await decompress(await readFile(logs[0]));
    assert.equal(JSON.parse(header.toString('utf8')).type, 'session');
    const cold = JSON.parse(await readFile(join(output, 'process-3.stdout'), 'utf8'));
    const event = cold.events.find(row => row.type === 'tool/result');
    assert.equal(event.data.message.content[0].text, '合成结果：一条');
    event.data.message.content[0].text = '篡改的合成结果';
    const tampered = Buffer.concat([await compress(header),
      await compress(Buffer.from(cold.events.map(row => JSON.stringify(row) + '\n').join('')))]);
    await writeFile(logs[0], tampered);
    const child = exec(process.execPath, [join(import.meta.dirname, 'session-recovery.probe.mjs')], {
      cwd: owned, timeout: 30000, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: owned, TMPDIR: owned },
    });
    child.child.stdin.on('error', () => {});
    child.child.stdin.end(JSON.stringify({ root: owned, modules, operation: 'read', version: runtimeVersion, corpus: 'tool' }));
    await assert.rejects(child, error => error.code === 1 && /RECOVERY_TOOL_CORPUS_CONTENT/.test(error.stderr));
    assert.deepEqual(await readFile(logs[0]), tampered);
  } finally { await rm(root, { recursive: true }); }
});

test('pinned official runtime preserves attachment references, child metadata and depth across cold recovery', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit built upstream required',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-rich-real-'));
  try {
    const output = join(root, 'result');
    const result = await runSessionRecoveryMatrix({ output, corpus: 'rich', runtimeVersion,
      rc2Modules: join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai') });
    assert.equal(result.schema_version, 'dsh-owned-session-recovery/v3');
    assert.equal(result.corpus_id, 'attachment-delegation-metadata/v1');
    assert.equal(result.status, 'PARTIAL'); assert.equal(result.release_ready, false);
    assert.equal(result.rows[0].status, 'PASS'); assert.equal(result.rows[0].committed_events, 8);
    assert.equal(result.rows[0].recovered_events, 15); assert.equal(result.rows[1].status, 'NOT_RUN');
    for (const key of ['tool_execution', 'model_execution', 'delegation_execution', 'attachment_storage', 'attachment_rendering']) {
      assert.equal(result[key], 'NOT_RUN');
    }
    const initial = JSON.parse(await readFile(join(output, 'process-0.stdout'), 'utf8'));
    const cold = JSON.parse(await readFile(join(output, 'process-3.stdout'), 'utf8'));
    assert.deepEqual(cold.metadata, initial.metadata);
    assert.equal(cold.metadata.header.parentSession, 'owned-synthetic-parent');
    assert.equal(cold.metadata.delegation_depth, 2);
    assert.equal(cold.events.filter(e => e.type === 'subagent/descriptor').length, 1);
    const messages = cold.events.filter(e => e.type === 'user/message').map(e => e.data);
    assert.deepEqual(messages.map(m => m.source.kind), ['agent-message', 'subagent-settled', 'agent-message', 'subagent-settled']);
    const refs = messages[0].content.filter(b => ['image', 'file'].includes(b.type));
    assert.equal(refs.length, 2); assert.equal(refs[0].attachment.width, 1);
    assert.match(refs[0].attachment.attachmentId, /^[a-f0-9]{64}$/);
    assert.equal(refs[1].attachment.name, '合成资料.txt');
    assert.deepEqual(messages[2].content.filter(b => ['image', 'file'].includes(b.type)), refs);
  } finally { await rm(root, { recursive: true }); }
});

test('cold rich probe rejects changed references, descriptor or delegation header before any append', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit built upstream required',
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-rich-corrupt-'));
  try {
    const output = join(root, 'result'), modules = join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai');
    const result = await runSessionRecoveryMatrix({ output, rc2Modules: modules, corpus: 'rich', runtimeVersion });
    assert.equal(result.rows[0].status, 'PASS');
    const owned = result.executions[0].root, logs = [];
    async function walk(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) await walk(join(path, entry.name));
        else if (entry.name.endsWith('.jsonl.zstd')) logs.push(join(path, entry.name));
      }
    }
    await walk(owned); assert.equal(logs.length, 1);
    const header = JSON.parse((await decompress(await readFile(logs[0]))).toString());
    const original = JSON.parse(await readFile(join(output, 'process-3.stdout'), 'utf8')).events;
    const cases = [
      ['image identity', (_header, events) => { events.find(e => e.type === 'user/message').data.content[1].attachment.attachmentId = '0'.repeat(64); }],
      ['file bytes', (_header, events) => { events.find(e => e.type === 'user/message').data.content[2].attachment.bytes++; }],
      ['child composition', (_header, events) => { events.find(e => e.type === 'subagent/descriptor').data.agentProvider = 'other'; }],
      ['delegation depth', (value) => { value.delegationDepth = 0; }],
      ['parent identity', (value) => { value.parentSession = 'wrong-parent'; }],
    ];
    for (const [name, mutate] of cases) await t.test(name, async () => {
      const h = structuredClone(header), events = structuredClone(original); mutate(h, events);
      const tampered = Buffer.concat([await compress(Buffer.from(JSON.stringify(h) + '\n')),
        await compress(Buffer.from(events.map(e => JSON.stringify(e) + '\n').join('')))]);
      await writeFile(logs[0], tampered);
      for (const operation of ['read', 'append']) {
        const child = exec(process.execPath, [join(import.meta.dirname, 'session-recovery.probe.mjs')], {
          cwd: owned, timeout: 30000, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: owned, TMPDIR: owned },
        });
        child.child.stdin.on('error', () => {});
        child.child.stdin.end(JSON.stringify({ root: owned, modules, operation, version: runtimeVersion, corpus: 'rich' }));
        await assert.rejects(child, error => error.code === 1 && /RECOVERY_RICH_(CORPUS_CONTENT|HEADER)/.test(error.stderr));
        assert.deepEqual(await readFile(logs[0]), tampered);
      }
    });
  } finally { await rm(root, { recursive: true }); }
});
