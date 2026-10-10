# ShineMage 远程仓 post-merge 事实（2026-10-10）

这是 PR #112 合并后对主仓远端的只读复核。它补充并连接 2026-10-10 早先的[远程仓与主仓分支盘查](./shinemage-remote-repository-inventory-20261010.md)，不覆盖早先快照，也不授权删除分支、关闭 PR、发布或部署。

## 当前主线

- 仓库：<https://github.com/tyuanww/fuqing-crm-analytics>
- 默认分支：`main`，当前远端 SHA 为 `0e1eb8e8a00bcdc6c2aaca3b1457f95973dd7061`。
- PR [#111](https://github.com/tyuanww/fuqing-crm-analytics/pull/111) 仍是已合并的插件集成提交，merge commit 为 `1855477afa346617662ea4ff6e292e5b52f22206`。
- PR [#112](https://github.com/tyuanww/fuqing-crm-analytics/pull/112) 已于 `2026-10-10T06:59:26Z` 合并，merge commit 就是当前 `main` 的 `0e1eb8e8a00bcdc6c2aaca3b1457f95973dd7061`。
- PR #112 的 `CI` workflow（run `38032189091`）成功；合并后的 `main` `CI` push workflow（run `38032845642`）成功。两者只表示各自工作流通过，不扩大为真实业务、生产或发布验收。
- 当前打开的 PR 是 Dependabot #101–#110；没有新的 ShineMage 集成 PR。

## 分支、插件仓与发布边界

本次 GitHub branches API 查询遇到 TLS handshake timeout，因此没有把本次查询写成完整的分支数量或删除状态。`codex/shinemage-final`、`codex/docs-maintenance-closeout` 和其他候选分支继续按早先盘查保留；删除仍是 `NOT_RUN`，需要单独的目标清单和授权。

九个独立插件远程仓及上一份可读 CI 观察仍以[早先盘查](./shinemage-remote-repository-inventory-20261010.md)为准。本次没有把普通 content pack 改写为正式 `dsh-plugin-pack/v1` 或 `dsh-plugin-candidate/v1`，也没有重查 `dsh-shine-crowd-action` 的超时项。

最新 GitHub Release 仍为 `dsh-0.20.0.0-r3`。主仓当前仍只维护 DSH pin、profile、跨插件合同、组合验证和交付文档；SDK 分发、正式物理分仓清理、生产切换和真实业务验收保持各自原状态。

## 复核命令

本记录由以下只读入口取得：

```text
gh repo view tyuanww/fuqing-crm-analytics
gh api repos/tyuanww/fuqing-crm-analytics/git/ref/heads/main
gh api repos/tyuanww/fuqing-crm-analytics/branches --paginate
gh pr list --state open
gh pr list --state merged
gh run list
gh release list
```

本次 `branches` 请求因 TLS handshake timeout 未完成；恢复网络后应单独重跑并生成新的带日期快照。

没有读取真实业务数据、生产文件或凭据。
