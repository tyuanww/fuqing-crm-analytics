# ShineMage 远程仓 post-merge r4 事实（2026-10-11）

这是 PR #118 合并后的只读复核。`r3` 记录保留为历史快照；本记录只记录新的远端主线事实，不覆盖旧回执。

## 当前主线

- 仓库：<https://github.com/tyuanww/fuqing-crm-analytics>
- 默认分支：`main`，当前远端 SHA 为 `4859d13663284b7eb5ecf8614db9275d77061d27`。
- PR [#118](https://github.com/tyuanww/fuqing-crm-analytics/pull/118) 已于 `2026-10-10T16:08:41Z` 合并，标题为 `docs: sync post-merge main facts after PR 117`。
- 合并后的 `main` CI workflow（run `38066459376`）成功。`changes`、`test`、`lint` 和 `merge-gate` 通过；不适用的路径 job 保持 skipped。该结果只证明主仓文档合并后的 GitHub 工作流通过，不扩大为真实业务、生产或正式分发验收。
- PR #111–#118 已合并；当前打开的主仓 PR 仍是 Dependabot #101–#110，没有新的 ShineMage 集成 PR。

## 插件与发布边界

- 主仓继续维护 DSH pin、profile、跨插件合同、组合验证和交付文档；九个独立插件仓的 PR、CI 和 Release 状态另见[远程插件收口复核](./shinemage-plugin-remote-closeout-20261010.md)。
- 九个独立插件仓的 PR #1 仍开放，最近 fixed-inputs CI 已成功，尚无 GitHub Release；未授权时不合并这些 PR。
- SDK 分发仍为 `BLOCKED`，产品仍为 `PARTIAL`，`release_ready=false`。本记录没有生成 candidate/journal，没有执行正式目标验收、生产切换、发布或部署。
- 普通插件 content pack 不自动等于正式 `dsh-plugin-pack/v1` 或 `dsh-plugin-candidate/v1`。

## 复核命令与回执

```text
gh api repos/tyuanww/fuqing-crm-analytics/git/ref/heads/main
gh pr view 118 --repo tyuanww/fuqing-crm-analytics --json number,state,mergedAt,mergeCommit,url
gh pr checks 118 --repo tyuanww/fuqing-crm-analytics
gh run view 38066459376 --repo tyuanww/fuqing-crm-analytics --json databaseId,status,conclusion,workflowName,event,headSha,createdAt,updatedAt,url
gh pr list --repo tyuanww/fuqing-crm-analytics --state open --limit 30 --json number,title,headRefName,baseRefName
```

本记录只读取 GitHub 仓库状态，没有读取真实业务数据、生产文件或凭据，也没有修改远程分支。
