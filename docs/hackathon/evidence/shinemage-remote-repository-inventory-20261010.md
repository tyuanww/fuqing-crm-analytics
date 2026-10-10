# ShineMage 远程仓与主仓分支盘查（2026-10-10）

这是 2026-10-10 对 GitHub 远端的只读盘查，服务于主仓合并后的文档收口和清理决策。它记录远端当时看到的事实，不授权删除分支、关闭 PR、发布或部署。

## 主仓

- 仓库：<https://github.com/tyuanww/fuqing-crm-analytics>
- PR [#111](https://github.com/tyuanww/fuqing-crm-analytics/pull/111) 已于 `2026-10-10T03:15:40Z` 合并到 `main`，merge commit 为 `1855477afa346617662ea4ff6e292e5b52f22206`。
- `codex/shinemage-final` 仍指向候选提交 `650552e7bde94a682772ffd2218904187460ac69`，暂作为回滚/证据引用保留。
- `main` 受保护；Dependabot 分支和 `codex/dsh-rc2-candidate`、`codex/fix-dependabot-fastapi141` 等旧候选/修复分支仍存在，未因本轮盘查删除。
- PR #111 的最终 `CI` 与 `DSH rc2 release preflight` 回执为成功；合并后的 `main` push CI 也成功。旧失败运行仍保留在 GitHub 历史中。

## 独立插件远程仓

以下九个仓均存在于 `tyuanww` 组织下，均为私有仓，默认分支为 `main`：

| 插件 | 远程仓 |
|---|---|
| analytics-workbench | <https://github.com/tyuanww/dsh-analytics-workbench> |
| crm-knowledge | <https://github.com/tyuanww/dsh-crm-knowledge> |
| knowledge | <https://github.com/tyuanww/dsh-knowledge> |
| shine-board | <https://github.com/tyuanww/dsh-shine-board> |
| shine-brand | <https://github.com/tyuanww/dsh-shine-brand> |
| shine-crowd-action | <https://github.com/tyuanww/dsh-shine-crowd-action> |
| shine-funnel | <https://github.com/tyuanww/dsh-shine-funnel> |
| shine-query | <https://github.com/tyuanww/dsh-shine-query> |
| shine-waterfall | <https://github.com/tyuanww/dsh-shine-waterfall> |

本次只核对仓库存在性和远端页面，不把独立仓普通 content pack 写成正式 `dsh-plugin-pack/v1` 或 `dsh-plugin-candidate/v1`。八个仓的最近一次可读 Actions 回执为成功；`dsh-shine-crowd-action` 的单次 API 查询遇到 TLS handshake timeout，因此该仓的本轮 CI 状态记为 `NOT_RECHECKED`，不能用这份记录宣称九仓 CI 全部重新通过。

## 发布历史与清理边界

远端仍保留历史 release/tag。它们是审计和回滚材料，不随候选分支清理删除。`codex/shinemage-final` 是已合并候选分支，只有在证据归档、恢复路径和用户授权都确认后，才可单独删除。

本记录由 `gh pr list`、`gh api repos/tyuanww/fuqing-crm-analytics/branches`、`gh run list`、`gh repo view` 和 `gh release list` 生成；没有读取业务数据、生产文件或凭据。
