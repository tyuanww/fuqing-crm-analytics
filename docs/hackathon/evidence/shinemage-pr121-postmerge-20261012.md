# PR #121 合并后核验（2026-10-12）

本页记录 PR #121 合入主线后的远端事实。它只覆盖合并提交、主线 CI 和当前文档入口的事实同步，不生成 candidate/journal，也不改变服务目标、真实业务、SDK 分发或发布门禁。

## 合并与主线 CI

PR [#121](https://github.com/tyuanww/fuqing-crm-analytics/pull/121) 已于 `2026-10-12T08:34:36Z` 以普通 merge 合入 `main`。

- 合并提交：`b47cf9baf328921041dfaff3e289a2af4323e1d0`
- 合并前 feature head：`d46debbd5dc86e354d9b365750b4960865f68a2f`
- 实际 main CI：[38224409545](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38224409545)
- CI head：`b47cf9baf328921041dfaff3e289a2af4323e1d0`
- CI 结论：`success`

`changes`、`lint`、`test` 和 `b0-contract-build` 成功；五个不适用的路径矩阵任务保持 `SKIPPED`。B0 记录为 `862 passed`、`41 subtests passed`、`23 warnings`，没有失败。该 CI 结果是主仓 Git/合同检查，不是目标宿主或真实业务验收。

## 当前边界

组合 artifact、九包／两 profile 输入和 PR #121 的 hosted B0 证据见[正式组合包交付](shinemage-pr121-formal-pack-delivery-20261012.md)。两份 profile 仍没有 `service_binding`，因此当前没有新 candidate/journal、服务目标、terminal/browser/recovery、真实 CRM/WeKnora/模型/UAT 或 standalone 页面包验收。SDK 分发仍 `BLOCKED`，产品仍 `PARTIAL`，`release_ready=false`。

本地 feature 工作树仍保持 `codex/shinemage-abc-local-candidate`，未自动切换到 `main`；其受保护的未跟踪 `security-audit-skill/` 不属于本次交付。
