import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/sdk-inputs.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('built Host root requires isolated capabilities; tool fails closed without native context', async () => {
  const ui = await import(pathToFileURL(join(root, 'lib/index.js')).href);
  assert.throws(() => ui.apply({}), /explicit isolated capabilities/);
  assert.deepEqual(ui.inject, ['agents', 'sessions', 'sessionController', 'sessionQuery', 'tools']);
  const host = await import(pathToFileURL(join(root, 'lib/tool.js')).href);
  const registered = [];
  host.apply({ tools: { register: tool => { registered.push(tool); } } });
  assert.equal(registered.length, 1);
  const [tool] = registered;
  assert.equal(tool.name, 'analytics_b0_query');
  const args = { query: 'channel_repeat_rate' };
  await assert.rejects(tool.execute(args, { signal: new AbortController().signal }), /no bound execution context/);
  await assert.rejects(tool.execute({ query: 'sql' }, { signal: new AbortController().signal }));
});
