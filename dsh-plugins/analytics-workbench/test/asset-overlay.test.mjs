/** Producer source guards retained separately from published-client runtime checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const overlaySource = await readFile(new URL('../src/client/asset-overlay.tsx', import.meta.url), 'utf8');
const mockOverlaySource = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8');
const focusSource = await readFile(new URL('../src/client/focus.ts', import.meta.url), 'utf8');

test('HTTP overlay and mock overlay share the native dialog Tab trap', () => {
  assert.match(focusSource, /export function trapDialogTab/);
  assert.match(overlaySource, /onKeyDown=\{trapDialogTab\}/);
  assert.match(mockOverlaySource, /onKeyDown=\{trapDialogTab\}/);
  assert.match(overlaySource, /handleDialogClose/);
  assert.match(overlaySource, /closedby/);
  assert.match(overlaySource, /OverlayErrorBoundary/);
  assert.match(overlaySource, /resetKey=\{openTick\}/);
  assert.match(mockOverlaySource, /key=\{openTick\}/);
  assert.match(mockOverlaySource, /openTick = \(draft.openTick \|\| 0\) \+ 1/);
  assert.match(overlaySource, /data-dsh-native-chrome="1"/);
  assert.match(overlaySource, /gridColumn: '1 \/ -1'/);
});

test('layout pointer source keeps global finish/move handlers', () => {
  assert.match(overlaySource, /window\.addEventListener\('pointerup', finish\)/);
  assert.match(overlaySource, /window\.addEventListener\('pointermove', move\)/);
  assert.doesNotMatch(overlaySource, /onPointerMove=\{/);
});
