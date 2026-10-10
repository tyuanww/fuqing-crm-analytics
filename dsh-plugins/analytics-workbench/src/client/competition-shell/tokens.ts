import { competitionColor, competitionFont, competitionMaterial, lightColor, lightMaterial, antdSeedToken, antdTheme, lightAntdTheme } from './content-theme.generated.ts';
export { competitionColor, competitionFont, competitionMaterial, antdSeedToken, antdTheme } from './content-theme.generated.ts';
/** DESIGN.md brand tokens mapped to Ant Design seed names. Not a Vue theme.ts import. */

export const PRODUCT_NAME = '伸美 AI 增长董事会';
export const PRODUCT_NAME_EN = 'SHINE MAGE';
export const PRODUCT_TAGLINE = '把分散经营信号变成可执行洞察';

export const BRAND_ASSET_URLS = Object.freeze({
  logo: '/b0/brand/logo.png',
  mark: '/b0/brand/mark.svg',
  outfit: '/b0/brand/outfit.ttf',
  outfitLicense: '/b0/brand/outfit-ofl.txt',
  /** Declared D37 path. File is not bundled yet; do not treat this URL as a loaded font. */
  notoSansSc: '/b0/brand/noto-sans-sc.woff2',
  notoSansScLicense: '/b0/brand/noto-sans-sc-ofl.txt',
});

export const BRAND_DIGESTS = Object.freeze({
  logoPng: '21b8273703b9015027b572cb830b8bb01e9fc406c39b14ec7c228fbcdcaf4000',
  markSvg: '1bcd095360e42081429d23972e25f8d4a831a241df565d920c020d27aab8f4a8',
  outfitTtf: 'fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade',
  notoSansSc: null,
});

export const competitionMotion = Object.freeze({
  focusBreath: '2400ms ease-in-out',
  fast: '160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  standard: '240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
});

export const competitionCssVars = Object.freeze({
  '--sm-bg': competitionColor.background,
  '--sm-bg-top': competitionColor.backgroundTop,
  '--sm-purple': competitionColor.brandPrimary,
  '--sm-purple-hover': competitionColor.brandPrimaryHover,
  '--sm-purple-pressed': competitionColor.brandPrimaryPressed,
  '--sm-lilac': competitionColor.brandSecondary,
  '--sm-signal': competitionColor.brandAccent,
  '--sm-ink': competitionColor.ink,
  '--sm-on-accent': competitionColor.inkOnAccent,
  '--sm-copy': competitionColor.copy,
  '--sm-muted': competitionColor.muted,
  '--sm-danger': competitionColor.danger,
  '--sm-line': competitionMaterial.line,
  '--sm-line-strong': competitionMaterial.lineStrong,
  '--sm-glass': competitionMaterial.glass,
  '--sm-overlay': competitionMaterial.overlay,
  '--sm-nav': competitionMaterial.nav,
  '--sm-nav-active': competitionMaterial.navActive,
  '--sm-font-body': competitionFont.body,
  '--sm-font-display': competitionFont.display,
  '--sm-font-mono': competitionFont.mono,
  '--sm-focus': competitionColor.brandAccent,
  '--sm-focus-offset': '2px',
  '--sm-type-body': '16px/24px',
  '--sm-type-title': '600 28px/36px',
  '--sm-type-title-narrow': '600 22px/30px',
  '--sm-space-1': '8px',
  '--sm-space-2': '12px',
  '--sm-space-3': '16px',
  '--sm-space-4': '20px',
  '--sm-space-5': '24px',
  '--sm-radius-control': '12px',
  '--sm-touch': '44px',
  '--sm-logo-width': '177px',
  '--sm-logo-width-compact': '140px',
  '--sm-logo-ratio': '249 / 45',
  '--sm-logo-pad': '8px',
  '--sm-filter-brand-inverse': 'brightness(0) invert(1)',
  '--sm-motion-fast': competitionMotion.fast,
  '--sm-motion-standard': competitionMotion.standard,
  '--sm-motion-focus-breath': competitionMotion.focusBreath,
});

export const competitionTokens = Object.freeze({
  productName: PRODUCT_NAME,
  productNameEn: PRODUCT_NAME_EN,
  tagline: PRODUCT_TAGLINE,
  color: competitionColor,
  font: competitionFont,
  material: competitionMaterial,
  motion: competitionMotion,
  cssVars: competitionCssVars,
  assets: BRAND_ASSET_URLS,
  antd: antdTheme,
  breakpoint: Object.freeze({ phone: 375, phoneCompact: 390, tablet: 768, laptop: 1280, desktop: 1440 }),
});

/**
 * D39 library host mapping. Components consume these roles; generated pages
 * receive a value copy via generate-context and must not import this selector set.
 */
export const LIBRARY_THEME_MAP = Object.freeze({
  canvas: { token: 'competitionColor.background', css: '--sm-bg', dark: '#09050D' },
  nav: { token: 'competitionMaterial.nav', css: '--sm-nav' },
  rule: { token: 'competitionMaterial.line', css: '--sm-line' },
  body: { token: 'competitionFont.body', css: '--sm-font-body', declared: 'Noto Sans SC', loaded: false },
  display: { token: 'competitionFont.display', css: '--sm-font-display', latin: 'Outfit' },
  ink: { token: 'competitionColor.ink', css: '--sm-ink', role: 'title and high-priority copy', dark: '#FEFCFF' },
  lilac: { token: 'competitionColor.brandSecondary', css: '--sm-lilac', role: 'body/link on dark', dark: '#D3C3E8' },
  purple: { token: 'competitionColor.brandPrimary', css: '--sm-purple', role: 'emphasis only', dark: '#805D9D' },
  signal: { token: 'competitionColor.brandAccent', css: '--sm-signal', role: 'confirm/focus on dark', dark: '#F2FFDC' },
  danger: { token: 'competitionColor.danger', css: '--sm-danger', role: 'error with text', dark: '#FF7D91' },
  focus: { token: '--sm-focus', geometry: '2px outline / 2px offset' },
  control: { token: 'antdSeedToken.controlHeight', css: '--sm-touch', value: '44px' },
  radius: { token: 'antdSeedToken.borderRadius', css: '--sm-radius-control', value: '12px' },
  panel: { token: 'antdSeedToken.colorBgElevated', css: 'colorBgElevated' },
});

export type CompetitionColorScheme = 'light' | 'dark';

const lightCompetitionTokens = Object.freeze({
  ...competitionTokens, color: lightColor, material: lightMaterial,
  cssVars: Object.freeze({
    ...competitionCssVars,
    '--sm-bg': lightColor.background, '--sm-bg-top': lightColor.backgroundTop,
    '--sm-ink': lightColor.ink, '--sm-copy': lightColor.copy, '--sm-muted': lightColor.muted,
    '--sm-lilac': lightColor.brandSecondary, '--sm-danger': lightColor.danger,
    '--sm-signal': competitionColor.brandPrimary,
    '--sm-line': lightMaterial.line, '--sm-line-strong': lightMaterial.lineStrong,
    '--sm-glass': lightMaterial.glass, '--sm-nav': lightMaterial.nav, '--sm-nav-active': lightMaterial.navActive,
    '--sm-filter-brand-inverse': 'none',
    '--sm-focus': lightColor.brandSecondary,
  }),
  antd: lightAntdTheme,
});

export function competitionThemeFor(scheme: CompetitionColorScheme) {
  return scheme === 'light' ? lightCompetitionTokens : competitionTokens;
}

/** Owned override layer for DSH's official theme presenter. Never writes preferences. */
export const nativeBrandTokens = Object.freeze(Object.fromEntries(Object.entries({
  '--dsw-alias-bg-base': [lightColor.background, competitionColor.background],
  '--dsw-alias-bg-layer-1': [lightColor.backgroundTop, competitionColor.backgroundTop],
  '--dsw-alias-bg-layer-2': [lightColor.backgroundMiddle, competitionColor.backgroundMiddle],
  '--dsw-alias-border-l1': [lightMaterial.line, competitionMaterial.line],
  '--dsw-alias-border-l2': [lightMaterial.lineStrong, competitionMaterial.lineStrong],
  '--dsw-alias-brand-primary': [competitionColor.brandPrimary, competitionColor.brandPrimary],
  '--dsw-alias-label-primary': ['#111111', '#F6F3F8'],
  '--dsw-alias-label-secondary': ['#2A2A32', '#DDD6E6'],
  '--dsw-alias-state-error-primary': [lightColor.danger, competitionColor.danger],
  '--dsw-specific-sidebar-fill': ['rgba(255, 255, 255, 0.10)', 'rgba(16, 14, 22, 0.18)'],
  '--dsw-alias-bg-overlay': ['rgba(255, 255, 255, 0.28)', 'rgba(18, 13, 29, 0.55)'],
  '--dsw-font-family': [competitionFont.body, competitionFont.body],
  '--ds-font-family-code': [competitionFont.mono, competitionFont.mono],
  '--sm-native-logo-filter': ['none', 'brightness(0) invert(1)'],
}).map(([name, [light, dark]]) => [name, { light, dark }])));

export type CompetitionTokens = ReturnType<typeof competitionThemeFor>;
export type AntdSeedToken = typeof antdSeedToken;
export type AntdThemeConfig = typeof antdTheme;
