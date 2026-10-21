import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const plugin = fileURLToPath(new URL('..', import.meta.url));
const client = join(plugin, 'src/client');

test('the only production cockpit entry is the native main panel', async () => {
  const index = await readFile(join(client, 'index.tsx'), 'utf8');
  assert.doesNotMatch(index, /cockpit-composition|CockpitComposition|ActivateCockpitComposition/);
  assert.equal((index.match(/name:\s*'main',\s*key:\s*COCKPIT_PANEL_ID/g) ?? []).length, 1);
  assert.match(index, /name:\s*'sidebar\.panellist',\s*id:\s*COCKPIT_PANEL_ID/);
  for (const file of [
    'cockpit-composition.tsx',
    'cockpit-composition.mjs',
    'cockpit-composition.d.mts',
    'cockpit-composition.test.mjs',
    'cockpit-composition-dom.test.mjs',
  ]) {
    await assert.rejects(access(join(client, file)), error => error?.code === 'ENOENT', file);
  }
});

test('the full-screen cockpit does not mount a second composer or hide native session ownership', async () => {
  const index = await readFile(join(client, 'index.tsx'), 'utf8');
  const main = await readFile(join(client, 'cockpit-main-panel.tsx'), 'utf8');
  const workspace = await readFile(join(client, 'cockpit-workspace.tsx'), 'utf8');
  assert.doesNotMatch(index, /typeof process\s*===|process\.env/);
  assert.doesNotMatch(`${index}\n${main}\n${workspace}`, /<textarea[^>]+(?:composer|session)/i);
  assert.doesNotMatch(`${main}\n${workspace}`, /data-composer-seat|data-conversation-scroll/);
  assert.match(index, /goConversation/);
  assert.match(main, /goConversation/);
});
