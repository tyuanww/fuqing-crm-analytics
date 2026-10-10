# 项目状态（Project Status）
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 杭州生产恢复与 UI 热补丁（2026-10-09）

杭州 current 仍为 VERSION 0.20.0.0；本地 A/B/C 候选未部署。生产恢复、品牌与知识库入口修复的范围、回退和未完成真实模型验收见[现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)。不得把该现场记录当作本次插件候选验收。

## 当前快照（2026-10-11，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

| 项 | 状态 |
|---|---|
| Git | PR #111–#118 均已合并；当前远端 `main` 为 `4859d136`，PR #118 是 PR #117 后的主线事实同步。合并后的 `main` CI run `38066459376` 通过；实时主线以远端 `main` 和 GitHub CI 为准。三个已合并候选远程分支已按授权删除，本地旧分支引用和 stale `origin/*` tracking 引用仍单独保留待整理。原集成树的 `security-audit-skill/` 是独立目录，不纳入主仓。详见[最新 post-merge 远端事实](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)和[本次清理证据](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 插件解耦 | 插件构建要求显式绝对上游、build-tools 和输入包；已移除主仓 .context 回退。CRM/看板/知识与 Workbench 的边界证据保持独立记录。 |
| 独立仓 | 九个插件已有独立私有远程仓；本次复核显示九仓各有一个开放 PR #1、最近 fixed-inputs CI 成功、均无 GitHub Release；`dsh-shine-crowd-action` 另保留较早 full CI 失败。详见[远程仓收口复核](docs/hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)。主仓继续维护 DSH 集成合同、profile、组合验证和历史副本，正式物理分仓仍按 stop/go 约束推进。普通 content pack 不等于正式 dsh-plugin-pack/candidate。 |
| 本地验证 | 固定 Node 24、Python 3.14；定向 release/protocol/SDK/map/HTML 与边界检查已通过。推送钩子按路径计划执行适用检查，真实跳过原因保留。 |
| 产品 | PARTIAL；SDK 分发 BLOCKED；release_ready=false。 |
| 真实验收 | 真实 WSL2/terminal/browser、真实模型/业务、生产切换、standalone 页面包和正式分发仍按各自输入保持 NOT_RUN；当前 candidate 的逐项缺口见[正式准入预检](docs/hackathon/evidence/shinemage-formal-admission-preflight-20261010.md)。PR #111 的最终 preflight、B0、全量测试、前端、lint、依赖、合同、Docker smoke 和 merge-gate 均通过；`ground-truth-lint` 按既定条件跳过。 |
| 合并检查 | PR #115、#116、#117、#118 的 `CI`、`merge-gate`（适用时）和各自合并后的 `main` `CI` push workflow 均成功；PR #118 的 `changes`、`test`、`lint`、`merge-gate` 通过，不适用的路径 job 保持 skipped。这只是文档/代码合并检查，不是真实业务、生产或正式分发验收。run ID 见[最新 post-merge 远端事实](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)。 |
| 清理 | 11 个已归档候选源目录及其 worktree 已按授权删除，11 个归档包和 SHA-256 清单保留；三个已合并远程候选分支已删除。T14、RC2、公共 main、SDK/证据归档和 `security-audit-skill/` 保持不动。详见[本次清理证据](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |

## 本轮施工计划

1. PR #111–#118 已合并到远端 `main`；当前主线为 `4859d136`，PR #118 同步了 PR #117 后的主线事实。三个已合并候选远程分支已完成归档、恢复路径核对和单独授权后的删除；本地分支引用的后续整理仍单独记账。
2. **PR #111 的** preflight、B0、全量测试、前端、lint、依赖和合同检查在最终提交上通过；`ground-truth-lint` 按既定条件跳过。本轮沿用 PR #111 的合并回执，未重跑这些检查；旧失败运行保留为历史，不改写为当前失败。
3. 主仓与九个独立插件仓的职责、单插件更新路径、DSH 升级路径和清理顺序已写入维护手册；面向开发者的逐步操作见[插件更新指南](docs/operating/shinemage-plugin-update.md)。最新插件远程状态、DSH 升级候选和 SDK 门禁分别见[远程仓复核](docs/hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)、[DSH 升级盘查](docs/hackathon/evidence/shinemage-dsh-upgrade-audit-20261010.md)和[SDK 门禁矩阵](docs/hackathon/evidence/shinemage-sdk-gate-closeout-20261010.md)。源码副本、candidate、正式分发和生产激活仍按各自门禁记账。
4. 保持 DSH 上游 `477b4f420553e8a52c2fbccc464d7561b239c443`、VERSION、SDK BLOCKED、产品 PARTIAL 和所有未执行门禁原样。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。旧候选、失败证据和历史状态只作证据，不能代替当前验收。

以下自动统计块保留为历史抓取，不作为本轮 PR 全量测试计数；当前合并检查结果以本节上方、PR #111–#118 以及最新 post-merge `main` 的 CI 回执为准。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->
