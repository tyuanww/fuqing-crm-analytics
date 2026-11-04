// Generated from shine-brand content-theme/v1. Plugin content only; no native chrome or CSS injection.
// source_sha256: d59cebc56829e87c01cde7c63284be0e9bc6e43fe0ff42d6145297e3e49e8a74
export const competitionColor = Object.freeze({
  "background": "#09050D",
  "backgroundTop": "#0F0B17",
  "backgroundMiddle": "#120D1D",
  "backgroundBottom": "#0A0711",
  "brandPrimary": "#805D9D",
  "brandPrimaryHover": "#9877B1",
  "brandPrimaryPressed": "#674482",
  "brandSecondary": "#D3C3E8",
  "brandAccent": "#F2FFDC",
  "ink": "#FEFCFF",
  "inkOnAccent": "#201426",
  "copyStrong": "#ECE5F0",
  "copy": "#C4B8CB",
  "muted": "#9A8BA4",
  "faint": "#6F6078",
  "danger": "#FF7D91",
  "success": "#10B981",
  "warning": "#F59E0B"
} as const);
export const competitionFont = Object.freeze({
  "body": "'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  "display": "'Outfit', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  "mono": "'SFMono-Regular', 'SF Mono', Menlo, Monaco, Consolas, monospace",
  "candidateChinese": "'Alibaba PuHuiTi 3.0', 'Alibaba PuHuiTi'"
} as const);
export const competitionMaterial = Object.freeze({
  "line": "rgba(211, 195, 232, 0.12)",
  "lineStrong": "rgba(211, 195, 232, 0.24)",
  "glass": "rgba(255, 255, 255, 0.03)",
  "overlay": "rgba(5, 2, 8, 0.72)",
  "nav": "rgba(9, 5, 13, 0.90)",
  "navActive": "rgba(211, 195, 232, 0.12)",
  "dangerSoft": "rgba(255, 125, 145, 0.08)",
  "purpleSoft": "rgba(128, 93, 157, 0.12)"
} as const);
export const lightColor = Object.freeze({
  "background": "#FEFCFF",
  "backgroundTop": "#F7F2FA",
  "backgroundMiddle": "#F0E8F5",
  "backgroundBottom": "#FEFCFF",
  "brandPrimary": "#805D9D",
  "brandPrimaryHover": "#9877B1",
  "brandPrimaryPressed": "#674482",
  "brandSecondary": "#674482",
  "brandAccent": "#F2FFDC",
  "ink": "#09050D",
  "inkOnAccent": "#201426",
  "copyStrong": "#33273C",
  "copy": "#51415D",
  "muted": "#675471",
  "faint": "#81708C",
  "danger": "#AB2944",
  "success": "#10B981",
  "warning": "#F59E0B"
} as const);
export const lightMaterial = Object.freeze({
  "line": "rgba(103, 68, 130, 0.16)",
  "lineStrong": "rgba(103, 68, 130, 0.32)",
  "glass": "rgba(128, 93, 157, 0.04)",
  "overlay": "rgba(5, 2, 8, 0.72)",
  "nav": "rgba(254, 252, 255, 0.96)",
  "navActive": "rgba(128, 93, 157, 0.10)",
  "dangerSoft": "rgba(255, 125, 145, 0.08)",
  "purpleSoft": "rgba(128, 93, 157, 0.12)"
} as const);
export const antdSeedToken = Object.freeze({
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
