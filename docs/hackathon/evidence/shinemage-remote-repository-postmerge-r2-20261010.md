# ShineMage 远程仓 post-merge r2 事实（2026-10-10）

这是 PR #113 合并后的只读复核，接续[上一份 post-merge 记录](./shinemage-remote-repository-postmerge-20261010.md)。上一份记录保留为 PR #112 合并后的历史快照，本记录不覆盖它，也不授权删除分支、关闭 PR、发布或部署。

## 当前主线

- 仓库：<https://github.com/tyuanww/fuqing-crm-analytics>
- 默认分支：`main`，当前远端 SHA 为 `61d8672fb7ea79030a6517aeb6e58fc393500fd6`。
- PR [#113](https://github.com/tyuanww/fuqing-crm-analytics/pull/113) 已于 `2026-10-10T09:40:29Z` 合并，merge commit 就是当前 `main` 的 `61d8672fb7ea79030a6517aeb6e58fc393500fd6`。
- PR #113 的 `CI` workflow（run `38041836253`）成功；合并后的 `main` `CI` push workflow（run `38042222893`）成功。两者只表示文档 PR 和主线工作流通过，不扩大为真实业务、生产或发布验收。
- PR #111、#112 仍为已合并的前置交付；其完整 SHA 与 CI 仍见上一份 post-merge 记录。
- 当前打开的 PR 是 Dependabot #101–#110；没有新的 ShineMage 集成 PR。

## 分支、插件仓与发布边界

本轮没有重新请求 branches API；上一次查询的 TLS handshake timeout 仍按 `NOT_RECHECKED_TLS` 保留，没有把超时改写成分支数量或删除状态。`codex/shinemage-final`、`codex/docs-maintenance-closeout` 和其他候选分支继续按早先盘查保留；删除仍是 `NOT_RUN`，需要单独的目标清单和授权。

九个独立插件远程仓及可读 CI 观察仍以[远程仓盘查](./shinemage-remote-repository-inventory-20261010.md)为准。本次没有把普通 content pack 改写为正式 `dsh-plugin-pack/v1` 或 `dsh-plugin-candidate/v1`，也没有重查 `dsh-shine-crowd-action` 的超时项。

最新 GitHub Release 仍为 `dsh-0.20.0.0-r3`。主仓当前仍只维护 DSH pin、profile、跨插件合同、组合验证和交付文档；SDK 分发、正式物理分仓清理、生产切换和真实业务验收保持各自原状态。

## 复核命令

本记录由以下只读入口取得：

```text
gh api repos/tyuanww/fuqing-crm-analytics/git/ref/heads/main
gh pr view 113 --json number,state,mergedAt,mergeCommit,url
gh pr checks 113
gh run view 38042222893 --json databaseId,status,conclusion,workflowName,event,headSha,createdAt,updatedAt,url
```

本轮没有读取真实业务数据、生产文件或凭据，也没有删除远程分支。
