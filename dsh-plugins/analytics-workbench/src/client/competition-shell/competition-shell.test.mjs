import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { competitionColor, competitionFont, antdSeedToken, competitionThemeFor } from './tokens.ts';

const dir = fileURLToPath(new URL('.', import.meta.url));
const stylesPath = join(dir, '../styles.ts');

async function source(name) {
  return readFile(join(dir, name), 'utf8');
}

test('competition shell exports the A6 contract names with the locked AntD provider', async () => {
  const index = await source('index.ts');
  for (const name of [
    'ThemeProvider', 'LayoutSlot', 'CompetitionShell', 'BrandMark', 'BrandNav', 'WelcomeHero',
    'PageTitle', 'ErrorState', 'ShellDialog', 'StatusBanner', 'EvidenceBlock', 'ConditionChips',
    'useCompetitionTheme', 'antdTheme', 'antdSeedToken', 'competitionTokens', 'LAYOUT_SLOT_NAMES',
  ]) {
    assert.match(index, new RegExp(name));
  }
  assert.doesNotMatch(index, /from 'antd'|from "antd"/);
  const provider = await source('ThemeProvider.tsx');
  assert.match(provider, /from 'antd\/es\/config-provider'/);
  assert.doesNotMatch(provider, /ConfigProvider\?:/);
});

test('brand tokens follow DESIGN.md and keep original asset URLs', async () => {
  const tokens = await source('tokens.ts');
  assert.equal(competitionColor.background, '#09050D');
  assert.equal(competitionColor.brandPrimary, '#805D9D');
  assert.match(tokens, /rgba\(255, 255, 255, 0\.10\)/);
  assert.equal(competitionColor.brandSecondary, '#D3C3E8');
  assert.equal(competitionColor.brandAccent, '#F2FFDC');
  assert.equal(competitionColor.ink, '#FEFCFF');
  assert.equal(competitionColor.danger, '#FF7D91');
  assert.match(tokens, /21b8273703b9015027b572cb830b8bb01e9fc406c39b14ec7c228fbcdcaf4000/);
  assert.match(tokens, /\/b0\/brand\/logo\.png/);
  assert.match(tokens, /brightness\(0\) invert\(1\)/);
  assert.equal(antdSeedToken.controlHeight, 44);
  assert.match(competitionFont.body, /Noto Sans SC/);
  assert.match(tokens, /--sm-focus/);
  assert.match(tokens, /LIBRARY_THEME_MAP/);
  assert.doesNotMatch(competitionFont.body, /Alibaba PuHuiTi/);
  assert.doesNotMatch(tokens, /frontend-vue3\/src\/theme/);
});

test('competition CSS covers welcome/nav/title/error/dialog and reduced motion', async () => {
  const css = await source('css.ts');
  assert.match(css, /sm-welcome/);
  assert.match(css, /sm-brand-nav/);
  assert.match(css, /sm-page-title/);
  assert.match(css, /sm-error-state/);
  assert.match(css, /sm-shell-dialog/);
  assert.match(css, /min-height: var\(--sm-touch\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /max-width: 390px/);
  assert.match(css, /max-width: 768px/);
  assert.match(css, /sm-fhl-status/);
  assert.match(css, /sm-fhl-generate/);
  assert.doesNotMatch(css, /data-testid="fhl-generate"/);
  assert.match(css, /--sm-focus/);
  assert.doesNotMatch(css, /linear-gradient\([^)]*#805D9D[^)]*\)/);
  assert.doesNotMatch(css, /noto-sans-sc\.woff2/, 'do not 404-claim Noto is bundled');
});

test('native chrome export const css is not painted with Vue brand literals', async () => {
  const stylesSource = await readFile(stylesPath, 'utf8');
  const css = stylesSource.slice(stylesSource.indexOf('export const css'), stylesSource.lastIndexOf('`;'));
  assert.doesNotMatch(css, /#09050D|#805D9D|#F2FFDC/);
  assert.doesNotMatch(css, /Outfit|Alibaba PuHuiTi/);
  assert.match(stylesSource, /competitionShellCss/);
});

test('layout slots include A6 mount points and do not register native DSH keys', async () => {
  const layout = await source('LayoutSlot.tsx');
  assert.match(layout, /'welcome', 'nav', 'title', 'error', 'dialog', 'ask', 'analyses', 'cockpit', 'actions'/);
  assert.doesNotMatch(layout, /sidebar\.brand|tool\.call\.toolview|conversation\.input/);
  const chrome = await source('BrandChrome.tsx');
  assert.match(chrome, /模型、权限与文件设置仍走原生 DSH 入口/);
});

test('rc1 cockpit interaction states are complete in both light and dark modes', async () => {
  const states = [
    '--sm-surface', '--sm-surface-raised', '--sm-control-bg', '--sm-control-bg-hover',
    '--sm-control-bg-pressed', '--sm-control-line', '--sm-control-line-hover',
    '--sm-purple-hover', '--sm-danger', '--sm-danger-soft', '--sm-notice-bg',
    '--sm-selected-bg', '--sm-highlight-bg', '--sm-focus', '--sm-focus-width',
    '--sm-focus-offset', '--sm-disabled-opacity',
  ];
  const dark = competitionThemeFor('dark').cssVars, light = competitionThemeFor('light').cssVars;
  for (const token of states) {
    assert.equal(typeof dark[token], 'string', `dark ${token}`);
    assert.equal(typeof light[token], 'string', `light ${token}`);
    assert.notEqual(dark[token], '', `dark ${token}`);
    assert.notEqual(light[token], '', `light ${token}`);
  }
  assert.notEqual(dark['--sm-bg'], light['--sm-bg']);
  assert.notEqual(dark['--sm-ink'], light['--sm-ink']);
  assert.notEqual(dark['--sm-control-bg'], light['--sm-control-bg']);

  const workspace = await readFile(join(dir, '../cockpit-workspace-style.ts'), 'utf8');
  const visualEditor = await readFile(join(dir, '../html-visual-editor-chrome.mjs'), 'utf8');
  for (const css of [workspace, visualEditor]) {
    assert.match(css, /:hover:not\(:disabled\)/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /:disabled/);
    assert.match(css, /var\(--sm-focus\)/);
    assert.match(css, /var\(--sm-danger\)/);
    assert.doesNotMatch(css, /#09050D|#805D9D|#D3C3E8|#F2FFDC|#FEFCFF|#FF7D91/i);
  }
  assert.match(workspace, /\.cockpit-error\s*\{[^}]*var\(--sm-danger-soft\)/s);
  const provider = await source('ThemeProvider.tsx');
  assert.match(provider, /data-sm-color-scheme=\{mode\}/);
});
