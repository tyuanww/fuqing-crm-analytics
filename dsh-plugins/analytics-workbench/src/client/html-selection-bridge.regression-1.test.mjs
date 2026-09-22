import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { insertBeforeBodyEnd } from './insert-before-body-end.mjs';
import { editableTextNodes, selectionSrcdoc } from './html-selection-bridge.mjs';

// Regression: ISSUE-001 — minified `$&` in the selection script became `</body>`, so the iframe threw SyntaxError and never published cockpit.targets.
// Found by /qa on 2026-09-22
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-09-22.md

const insertion = '<script>if(q&&w.get(q)===$&&A($)){x="$\'";y="$`";z="$$"}</script>';

function scriptBody(html) {
  const match = String(html).match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, 'injected script missing');
  return match[1];
}

test('dollar sequences in an injected script stay literal', () => {
  const html = '<html><body><p>48,903</p></body></html>';
  const broken = html.replace('</body>', insertion + '</body>');
  const safe = insertBeforeBodyEnd(html, insertion);
  assert.match(broken, /<\/body>&/);
  assert.throws(() => new Function(scriptBody(broken)), /Unexpected token/);
  assert.match(safe, /<p>48,903<\/p><script>if\(q&&w\.get\(q\)===\$&&A\(\$\)\)\{x="\$'";y="\$`";z="\$\$"\}<\/script><\/body>/);
  new Function(scriptBody(safe));
  assert.equal(insertBeforeBodyEnd('<p>48,903</p>', insertion), '<p>48,903</p>');
});

test('selection and node-graph srcdocs inject through the function replacer', () => {
  for (const file of ['html-selection-bridge.mjs', 'html-node-graph-bridge.mjs']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(source, /insertBeforeBodyEnd\(/);
    for (const call of source.matchAll(/\.replace\(\s*(['"])<\/body>\1\s*,\s*([^)]*)/g)) {
      assert.match(call[2].trim(), /^(\(|function)/, `${file} still passes a string to String.replace`);
    }
  }
  const pkg = { html: '<h1 data-shine-node="a">48,903</h1>', css: '', js: '', resources: [],
    node_map: [{ node_id: 'a', kind: 'static_element', selector: '[data-shine-node="a"]' }] };
  const edit = selectionSrcdoc(pkg, { channel: 'nonce', pageId: 'page_a', version: 1, nodes: editableTextNodes(pkg), editing: true });
  for (const match of edit.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(match[1]);
});

function loadEsbuild() {
  const upstream = process.env.B0_BUILD_UPSTREAM;
  if (!upstream) return null;
  try {
    const web = createRequire(join(upstream, 'apps/web/package.json'));
    const vite = createRequire(web.resolve('vite/package.json'));
    return vite('esbuild');
  } catch {
    return null;
  }
}

test('minified selection script still parses after injection', { skip: loadEsbuild() ? false : 'B0_BUILD_UPSTREAM esbuild unavailable' }, async () => {
  const esbuild = loadEsbuild();
  const dir = mkdtempSync(join(tmpdir(), 'qa-selection-'));
  const outfile = join(dir, 'bridge.mjs');
  await esbuild.build({
    absWorkingDir: new URL('.', import.meta.url).pathname,
    entryPoints: ['html-selection-bridge.mjs'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    minify: true,
    outfile,
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outfile).href);
  const pkg = { html: '<h1 data-shine-node="a">48,903</h1>', css: '', js: '', resources: [],
    node_map: [{ node_id: 'a', kind: 'static_element', selector: '[data-shine-node="a"]' }] };
  const src = mod.selectionSrcdoc(pkg, { channel: 'nonce', pageId: 'page_a', version: 1, nodes: mod.editableTextNodes(pkg), editing: true });
  const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length >= 2);
  for (const code of scripts) {
    assert.doesNotMatch(code, /<\/body>&/);
    new Function(code);
  }
  assert.match(scripts.join('\n'), /\$&&/);
});
