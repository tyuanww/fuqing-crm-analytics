/** Brand-owned content tokens. Generated copies require no brand/workbench runtime. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
export const sourcePath = 'dsh-plugins/shine-brand/contracts/content-theme.v1.json';
export const consumers = [
  'dsh-plugins/analytics-workbench/src/client/competition-shell/content-theme.generated.ts',
  'dsh-plugins/crm-knowledge/src/client/content-theme.generated.ts',
];

const fields = {
  color: 'background backgroundTop backgroundMiddle backgroundBottom brandPrimary brandPrimaryHover brandPrimaryPressed brandSecondary brandAccent ink inkOnAccent copyStrong copy muted faint danger success warning',
  font: 'body display mono candidateChinese',
  material: 'line lineStrong glass overlay nav navActive dangerSoft purpleSoft',
  lightColor: 'background backgroundTop backgroundMiddle backgroundBottom ink brandSecondary copyStrong copy muted faint danger',
  lightMaterial: 'line lineStrong glass nav navActive',
};
function keys(value, names) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'CONTENT_THEME_INVALID');
  assert.deepEqual(Object.keys(value).sort(), names.split(' ').sort(), 'CONTENT_THEME_FIELDS');
}
export function renderContract(bytes) {
  const c = JSON.parse(bytes);
  keys(c, 'schema_version version owner color font material light');
  assert.equal(c.schema_version, 'shinemage-content-theme/v1');
  assert.equal(c.version, '1.0.0');
  assert.equal(c.owner, 'shine-brand');
  keys(c.light, 'color material');
  for (const [value, shape, pattern] of [
    [c.color, fields.color, /^#[0-9a-f]{6}$/i], [c.light.color, fields.lightColor, /^#[0-9a-f]{6}$/i],
    [c.font, fields.font, /^[A-Za-z0-9 ',.-]{1,256}$/],
    [c.material, fields.material, /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (?:0(?:\.\d+)?|1)\)$/],
    [c.light.material, fields.lightMaterial, /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (?:0(?:\.\d+)?|1)\)$/],
  ]) {
    keys(value, shape);
    assert.ok(Object.values(value).every(v => typeof v === 'string' && pattern.test(v)), 'CONTENT_THEME_VALUE');
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  const constant = (name, value) => `export const ${name} = Object.freeze(${JSON.stringify(value, null, 2)} as const);\n`;
  return `// Generated from shine-brand content-theme/v1. Plugin content only; no native chrome or CSS injection.\n// source_sha256: ${digest}\n`
    + constant('competitionColor', c.color) + constant('competitionFont', c.font) + constant('competitionMaterial', c.material)
    + constant('lightColor', { ...c.color, ...c.light.color }) + constant('lightMaterial', { ...c.material, ...c.light.material })
    + `export const antdSeedToken = Object.freeze({
  colorPrimary: competitionColor.brandPrimary, colorSuccess: competitionColor.brandAccent,
  colorError: competitionColor.danger, colorWarning: competitionColor.warning,
  colorInfo: competitionColor.brandSecondary, colorText: competitionColor.ink,
  colorTextSecondary: competitionColor.brandSecondary, colorTextTertiary: competitionColor.muted,
  colorBgBase: competitionColor.background, colorBgLayout: competitionColor.background,
  colorBgContainer: competitionMaterial.glass, colorBgElevated: competitionColor.backgroundMiddle,
  colorBorder: competitionMaterial.lineStrong, colorSplit: competitionMaterial.line,
  fontFamily: competitionFont.body, fontFamilyCode: competitionFont.mono,
  borderRadius: 12, controlHeight: 44, lineWidth: 1,
});
export const antdTheme = Object.freeze({ cssVar: { prefix: 'sm', key: 'competition' }, hashed: true, token: antdSeedToken });
export const lightAntdTheme = Object.freeze({
  ...antdTheme, cssVar: { prefix: 'sm', key: 'competition-light' },
  token: Object.freeze({ ...antdSeedToken,
    colorText: lightColor.ink, colorTextSecondary: lightColor.copy, colorTextTertiary: lightColor.muted,
    colorBgBase: lightColor.background, colorBgLayout: lightColor.background,
    colorBgContainer: lightColor.background, colorBgElevated: lightColor.background,
    colorBorder: lightMaterial.lineStrong, colorSplit: lightMaterial.line, colorError: lightColor.danger,
  }),
});
`;
}

export async function syncContract({ root = repository, write = false } = {}) {
  const expected = renderContract(await readFile(join(root, sourcePath)));
  for (const consumer of consumers) {
    if (write) await writeFile(join(root, consumer), expected);
    else assert.equal(await readFile(join(root, consumer), 'utf8'), expected, `CONTENT_THEME_DRIFT ${consumer}`);
  }
  return { status: 'PASS', contract: 'shinemage-content-theme/v1', consumers: consumers.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 3 && ['--write', '--check'].includes(process.argv[2]),
    'Usage: node scripts/dsh-b0/content-theme-contract.mjs --write|--check');
  console.log(JSON.stringify(await syncContract({ write: process.argv[2] === '--write' })));
}
