# Tailwind 4 迁移评估

日期：2026-10-23（北京时间）。

## 当前状态

前端仍使用 Tailwind `3.4.19`。应用直接引用 `src/styles/tailwind.css`，使用 `@tailwind` 指令、`@apply`、JavaScript 主题配置和 `safelist`。

`npm audit --omit=dev` 为 `0` 个漏洞。`npm audit --omit=optional` 从 `8` 个降为 `7` 个开发依赖漏洞，其中 `5` 个 high、`2` 个 moderate。本轮已安全更新 `brace-expansion` 和 `postcss-selector-parser`。剩余报告来自 Tailwind 3 的 `chokidar`、`fast-glob`、`micromatch`、`braces`、`postcss-nested` 和 `postcss-selector-parser` 依赖链。

`tailwindcss@3` 的最新版本仍是 `3.4.19`。`npm audit` 只提供 `tailwindcss@4.3.3` 的破坏性修复，因此剩余漏洞不能通过 rc2 收尾中的补丁升级关闭。生产构建不包含这条开发依赖链。

## 决策

本轮不迁移 Tailwind 4。迁移会改变 PostCSS 插件、CSS 入口语法、配置加载和 `safelist` 表达方式，需要独立完成视觉和 CSS 回归。

迁移前必须验证以下合同：

1. 因 `preflight` 关闭，Naive UI 保持当前 reset 行为。
2. 自定义 `stripe` 与 `brand` token 仍可使用。
3. 商品表动态生成的 `tw-*` class 仍能生成样式。
4. 从启动目录加载配置的 PostCSS 合同仍成立。

## 验证

`npm run build` 通过。`npm run test:unit` 为 `30` 个文件、`226` 项测试通过。`npm audit --omit=dev` 为 `0` 个漏洞。

本记录收口的是风险分类和安全补丁，不把 `7` 个开发依赖报告写成零漏洞，也不把构建通过写成 Tailwind 4 已迁移。
