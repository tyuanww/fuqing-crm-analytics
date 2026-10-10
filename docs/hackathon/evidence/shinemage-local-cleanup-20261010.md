# ShineMage 本地历史清理证据（2026-10-10）

本次清理在主仓 `codex/shinemage-abc-local-candidate` 完成。执行前先核对归档 SHA-256、源目录存在、关联 worktree 干净；执行后重新核对归档包，并确认主仓、T14、RC2 和公共 `main` worktree 仍在。主仓当前 HEAD 为 `eb76413a8369fa9503653ab46f7ec60a974c9152`，产品仍为 `PARTIAL`，SDK 分发仍为 `BLOCKED`，`release_ready=false`。

## 本地处理

- 11 个历史候选源目录已删除，11 个关联 worktree 已解除注册。
- 归档包均保存在本机 `/Users/hutou/.codex/archives/shinemage-cleanup-20261010/`，对应 SHA-256 与成员清单见同目录 `manifest.json`。
- 11 个归档包删除后重新校验全部通过。原始证据没有改写或覆盖。
- `shinemage-t14-html-ocr`、`fuqing-crm-analytics-dsh-rc2`、`fuqing-crm-analytics-public`、主仓和未跟踪的独立 `security-audit-skill/` 未处理。

删除的候选根目录为：

`grok-html-ui-acceptance`、`grok-plugin-update-trial`、`grok-sdk-trust-closeout`、`grok-sdk-trust-evidence`、`shinemage-candidate-admission`、`shinemage-html-remaining`、`shinemage-plugin-decouple`、`shinemage-sdk-evidence`、`shinemage-probe-source-decouple-20261009`、`shinemage-docs-closeout-20261010`、`shinemage-docs-postmerge-20261010`。

## 远程处理

已合并且无开放 PR 的远程分支已删除：

- `codex/shinemage-final`，关联 PR #111
- `codex/docs-maintenance-closeout`，关联 PR #112
- `codex/docs-postmerge-20261010`，关联 PR #113、#114

`main`、`codex/dsh-rc2-candidate`、`codex/fix-dependabot-fastapi141` 和 Dependabot 分支保留。已删除远程分支留下的本地 tracking 引用及若干本地历史分支引用没有在本次动作中删除，单独记账。

机器回执保存在归档目录的 `local-deletion-receipt-20261010.json`；本证据只记录结果，不把本机绝对路径当作可移植的恢复入口。
