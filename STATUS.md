# 项目状态（Project Status）
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 杭州生产恢复与 UI 热补丁（2026-10-09）

杭州 current 仍为 VERSION 0.20.0.0；本地 A/B/C 候选未部署。生产恢复、品牌与知识库入口修复的范围、回退和未完成真实模型验收见[现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)。不得把该现场记录当作本次插件候选验收。

## 当前快照（2026-10-10，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

| 项 | 状态 |
|---|---|
| Git | PR #111、#112、#113、#114、#115 均已合并；本次清理文档的合并提交为 `4ac2b7ef`，实时主线以远端 `main` 和 GitHub CI 为准。三个已合并候选远程分支已按授权删除，本地旧分支引用和 stale `origin/*` tracking 引用仍单独保留待整理。原集成树的 `security-audit-skill/` 是独立目录，不纳入主仓。详见[最新 post-merge 远端事实](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r2-20261010.md)和[本次清理证据](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 插件解耦 | 插件构建要求显式绝对上游、build-tools 和输入包；已移除主仓 .context 回退。CRM/看板/知识与 Workbench 的边界证据保持独立记录。 |
| 独立仓 | 九个插件已有独立远程仓；八个最近可读 CI 回执成功，`dsh-shine-crowd-action` 本轮因 TLS 查询超时未重查，详见[远程仓盘查](docs/hackathon/evidence/shinemage-remote-repository-inventory-20261010.md)。主仓继续维护 DSH 集成合同、profile、组合验证和历史副本，主仓副本清理与正式物理分仓仍未收口。普通 content pack 不等于正式 dsh-plugin-pack/candidate。 |
| 本地验证 | 固定 Node 24、Python 3.14；定向 release/protocol/SDK/map/HTML 与边界检查已通过。推送钩子按路径计划执行适用检查，真实跳过原因保留。 |
| 产品 | PARTIAL；SDK 分发 BLOCKED；release_ready=false。 |
| 真实验收 | 真实 WSL2/terminal/browser、真实模型/业务、生产切换、standalone 页面包和正式分发仍按各自输入保持 NOT_RUN。PR #111 的最终 preflight、B0、全量测试、前端、lint、依赖、合同、Docker smoke 和 merge-gate 均通过；`ground-truth-lint` 按既定条件跳过。 |
| 合并检查 | PR #115 的 `CI`、`merge-gate` 和合并后 `main` 的 `CI` push workflow 均成功；这只是文档/代码合并检查，不是真实业务、生产或正式分发验收。具体 run ID 见 PR #115 和[最新 post-merge 远端事实](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r2-20261010.md)。 |
| 清理 | 11 个已归档候选源目录及其 worktree 已按授权删除，11 个归档包和 SHA-256 清单保留；三个已合并远程候选分支已删除。T14、RC2、公共 main、SDK/证据归档和 `security-audit-skill/` 保持不动。详见[本次清理证据](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |

## 本轮施工计划

1. PR #111、#112、#113、#114、#115 已合并到远端 `main`；本次清理文档的合并提交为 `4ac2b7ef`。三个已合并候选远程分支已完成归档、恢复路径核对和单独授权后的删除；本地分支引用的后续整理仍单独记账。
2. **PR #111 的** preflight、B0、全量测试、前端、lint、依赖和合同检查在最终提交上通过；`ground-truth-lint` 按既定条件跳过。本轮沿用 PR #111 的合并回执，未重跑这些检查；旧失败运行保留为历史，不改写为当前失败。
3. 主仓与九个独立插件仓的职责、单插件更新路径、DSH 升级路径和清理顺序已写入维护手册；源码副本、candidate、正式分发和生产激活仍按各自门禁记账。
4. 保持 DSH 上游 `477b4f420553e8a52c2fbccc464d7561b239c443`、VERSION、SDK BLOCKED、产品 PARTIAL 和所有未执行门禁原样。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。旧候选、失败证据和历史状态只作证据，不能代替当前验收。

以下自动统计块保留为历史抓取，不作为本轮 PR 全量测试计数；当前合并检查结果以本节上方、PR #111/#112/#113/#114/#115 以及最新 post-merge `main` 的 CI 回执为准。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->
