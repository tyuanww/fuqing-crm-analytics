import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const author = process.argv[2];
const { selectionForAI } = await import(pathToFileURL(join(author, 'src/client/html-source-selection.mjs')));
const { editablePageNodes } = await import(pathToFileURL(join(author, 'src/client/html-selection-bridge.mjs')));
const { createCockpitAIClient } = await import(pathToFileURL(join(author, 'src/client/cockpit-ai-client.mjs')));
const spec = JSON.parse(readFileSync(0, 'utf8'));
const title = editablePageNodes(spec.package, spec.binding_manifest).find(node => node.tag === 'h1');
if (!title) throw new Error('The actual client did not expose a safe title selection.');
const requests = [];
const retry = process.argv[3] === 'retry';
const client = createCockpitAIClient({ base: 'http://isolated.invalid', fetchImpl: async (_url, init) => {
  const submitted = JSON.parse(init.body);
  requests.push(submitted);
  if (retry && requests.length === 1) throw new Error('isolated response loss');
  return Response.json({ ...submitted, status: 'WAITING', filename: 'page-package.json', transport: 'native-tools',
    session_id: 'session-cockpit-native-ai-' + submitted.id.slice(3), bound: true });
} }, { openNative: async () => {} });
await client.begin('page', spec.page_id, spec.version, selectionForAI(spec.package, title), '修改选中的标题');
if (retry) await client.begin('page', spec.page_id, spec.version, selectionForAI(spec.package, title), '修改选中的标题');
client.dispose();
if (!requests.length) throw new Error('The actual client did not submit an AI request.');
process.stdout.write(JSON.stringify(retry ? requests : requests[0]));
