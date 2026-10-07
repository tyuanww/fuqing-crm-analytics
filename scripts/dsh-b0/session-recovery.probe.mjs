/** Fresh-process exercise of the official compiled persistence API, synthetic only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertToolCorpus, toolRecoveryTurn } from './session-recovery-tool-corpus.mjs';
import { assertRichCorpus, richRecoveryTurn, richRecoveryHeader, richDescriptor } from './session-recovery-rich-corpus.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks));
assert.equal(Number(process.versions.node.split('.')[0]), 24);
assert.ok(['create', 'read', 'append'].includes(input.operation));
const corpus = input.corpus ?? 'text';
assert.ok(['text', 'tool', 'rich'].includes(corpus), 'RECOVERY_CORPUS_UNSUPPORTED');
assert.ok(isAbsolute(input.modules) && isAbsolute(input.root));
assert.equal(await realpath(input.root), input.root, 'RECOVERY_ROOT_SYMLINK');
assert.ok((await lstat(input.root)).isDirectory());
assert.equal(await readFile(join(input.root, '.owned-session-recovery'), 'utf8'), 'synthetic-only/v1\n');
const packages = {};
for (const name of ['cordis', 'dsh-session', 'dsh-session-persistence-jsonl', ...corpus === 'rich' ? ['dsh-subagent'] : []]) {
  const directory = join(input.modules, name);
  const pkg = JSON.parse(await readFile(join(directory, 'package.json')));
  if (name !== 'cordis') assert.equal(pkg.version, input.version, 'RECOVERY_RUNTIME_VERSION');
  const entry = join(directory, pkg.main);
  packages[name] = { version: pkg.version, sha256: createHash('sha256').update(await readFile(entry)).digest('hex'),
    module: await import(pathToFileURL(entry).href) };
}
const { Context } = packages.cordis.module;
const { SESSION_FORMAT_VERSION } = packages['dsh-session'].module;
const ctx = new Context();
let handle;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  await ctx.plugin(packages['dsh-session-persistence-jsonl'].module.default, {
    root: join(input.root, 'sessions'), compression: 'zstd',
  });
  const id = 'owned-synthetic-recovery';
  const header = corpus === 'rich' ? richRecoveryHeader(id, SESSION_FORMAT_VERSION)
    : { id, version: SESSION_FORMAT_VERSION, createdAt: 1000, isSeeded: false };
  handle = input.operation === 'create'
    ? await ctx.sessionPersistence.create(header)
    : await ctx.sessionPersistence.open(id, input.operation === 'read' ? 'read' : 'write');
  if (corpus === 'rich') assert.deepEqual(handle.header, header, 'RECOVERY_RICH_HEADER');
  if (input.operation !== 'read') {
    const prior = (await handle.read()).events;
    if (input.operation === 'append') {
      if (corpus === 'rich') assertRichCorpus(prior);
      else if (corpus === 'tool') assertToolCorpus(prior);
    }
    const turn = prior.filter(event => event.type === 'turn/start').length + 1;
    const seq = prior.length;
    let append;
    if (corpus === 'rich') append = richRecoveryTurn(turn, seq);
    else if (corpus === 'tool') append = toolRecoveryTurn(turn, seq);
    else append = [
      { type: 'turn/start', seq, time: seq + 1, data: { turn } },
      { type: 'user/message', seq: seq + 1, time: seq + 2, surfaceOp: 'append', data: {
        id: `owned-user-${turn}`, role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: `Synthetic persisted turn ${turn}` }],
      } },
      { type: 'step/start', seq: seq + 2, time: seq + 3, data: { turn, step: 1 } },
      { type: 'assistant/message', seq: seq + 3, time: seq + 4, surfaceOp: 'append', data: {
        turn, step: 1, message: { id: `owned-assistant-${turn}`, role: 'assistant',
          source: { kind: 'model', provider: 'mock', model: 'mock' },
          content: [{ type: 'text', text: 'Synthetic persisted answer' }] },
        stream: [
          { type: 'chunk', time: seq + 3, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
          { type: 'text-chunks', time0: seq + 3, index: 0, dt: [], texts: ['Synthetic persisted answer'] },
          { type: 'chunk', time: seq + 4, chunk: { type: 'block-end', index: 0,
            block: { type: 'text', text: 'Synthetic persisted answer' } } },
          { type: 'chunk', time: seq + 4, chunk: { type: 'finish', reason: { kind: 'stop' } } },
        ],
      } },
      { type: 'step/end', seq: seq + 4, time: seq + 5, data: { turn, step: 1 } },
      { type: 'turn/end', seq: seq + 5, time: seq + 6, data: { turn, reason: { kind: 'completed' } } },
    ];
    await handle.append(append);
    await handle.flush();
  }
  const { events } = await handle.read();
  let metadata;
  if (corpus !== 'text') {
    if (corpus === 'tool') assertToolCorpus(events);
    else assertRichCorpus(events);
    // Restore through the official session surface as well as comparing persistence bytes.
    // This does not run an Agent Loop, tool or model.
    const restored = packages['dsh-session'].module.Session.create(id, structuredClone(events), handle.header);
    assert.deepEqual(restored.deriveMessages(), events.filter(event =>
      ['user/message', 'assistant/message', 'tool/result'].includes(event.type))
      .map(event => event.type === 'user/message' ? event.data : event.data.message));
    if (corpus === 'rich') {
      assert.deepEqual(restored.header, header, 'RECOVERY_RICH_RESTORED_HEADER');
      const { foldSubagentDescriptor, delegationDepthOf } = packages['dsh-subagent'].module;
      assert.deepEqual(foldSubagentDescriptor(events), richDescriptor(), 'RECOVERY_RICH_DESCRIPTOR');
      // Pure official helper only. This object is not a running agent or an authorization grant.
      const depth = delegationDepthOf({ session: restored, options: { subagentDepth: 0 } });
      assert.equal(depth, 2, 'RECOVERY_RICH_DEPTH_RESET');
      metadata = { header: restored.header, descriptor: foldSubagentDescriptor(events), delegation_depth: depth };
    }
  }
  process.stdout.write(JSON.stringify({ status: 'PASS', operation: input.operation,
    runtime_version: input.version, format_version: SESSION_FORMAT_VERSION, count: events.length,
    digest: hash(events), prefix_digest: hash(events.slice(0, input.prefix ?? events.length)),
    packages: Object.fromEntries(Object.entries(packages).map(([name, { module: _module, ...row }]) => [name, row])),
    events, ...(metadata ? { metadata } : {}),
  }) + '\n');
} finally {
  await handle?.close(); await ctx.fiber.dispose();
}
