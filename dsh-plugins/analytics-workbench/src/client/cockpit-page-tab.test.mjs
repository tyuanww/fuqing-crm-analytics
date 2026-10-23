import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('cockpit page tab uses the isolated HTML preview instead of raw srcdoc', async () => {
  const source = await readFile(new URL('./cockpit-page-tab.tsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ HtmlPreview \} from '\.\/cockpit-page-editor\.tsx'/);
  assert.match(source, /<HtmlPreview pkg=/);
  assert.match(source, /allowScripts=\{Boolean\(current\.package\.js\)\}/);
  assert.doesNotMatch(source, /srcDoc=\{current\.package\.html\}/);
});
