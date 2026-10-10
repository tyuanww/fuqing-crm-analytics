# 项目状态（Project Status）
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 杭州生产恢复与 UI 热补丁（2026-10-09）

杭州 current 仍为 VERSION 0.20.0.0；本地 A/B/C 候选未部署。生产恢复、品牌与知识库入口修复的范围、回退和未完成真实模型验收见[现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)。不得把该现场记录当作本次插件候选验收。

## 当前快照（2026-10-10，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

| 项 | 状态 |
|---|---|
| Git | 当前集成分支 codex/shinemage-abc-local-candidate，本地 HEAD `850976f2`；相对 origin/main 领先 92、落后 0。候选远程分支 `codex/shinemage-final` 同一 SHA，PR #111 仍 OPEN、未合并。未跟踪的 security-audit-skill/ 是独立目录，不纳入提交。 |
| 插件解耦 | 插件构建要求显式绝对上游、build-tools 和输入包；已移除主仓 .context 回退。CRM/看板/知识与 Workbench 的边界证据保持独立记录。 |
| 本地验证 | 固定 Node 24、Python 3.14；定向 release/protocol/SDK/map/HTML 与边界检查已通过。完整推送前矩阵按正常 hook 执行，真实跳过原因保留。 |
| 产品 | PARTIAL；SDK 分发 BLOCKED；release_ready=false。 |
| 真实验收 | 真实 WSL2/terminal/browser、真实模型/业务、生产切换、standalone 页面包和正式分发仍按各自输入保持 NOT_RUN。PR preflight、B0、全量测试和前端检查通过；Docker smoke 因 Docker Hub 授权接口连续 504 失败，merge-gate 随之失败。 |

## 本轮施工计划

1. 候选远程分支和 PR #111 已建立；不直接合并本地 main，不改写历史。
2. PR 远程 preflight、B0、全量测试、前端、lint、依赖和合同检查已通过；Docker smoke 仍受 Docker Hub 504 外部阻塞。
3. delegated code review 已覆盖 403/403 个可审文件，发现的 2 个 High 与 1 个 Medium 已修复并复验；当前停在合并 PR 之前。
4. 保持 DSH 上游 477b4f420553e8a52c2fbccc464d7561b239c443、VERSION、SDK BLOCKED、产品 PARTIAL 和所有未执行门禁原样。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。旧候选、失败证据和历史状态只作证据，不能代替当前验收。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->
