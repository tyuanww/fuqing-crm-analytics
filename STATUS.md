# 项目状态 (Project Status)
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 当前快照（2026-09-30，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

| 项 | 状态 |
|---|---|
| Git 基线 | 产品 VERSION 为 `0.20.0.0`；`dsh-0.20.0.0-r1` immutable Release 已发布，源 SHA 为 `073c576c8d75d6ab16e2bac48b2cc99adf4a68bf`，DSH 上游 SHA 为 `477b4f420553e8a52c2fbccc464d7561b239c443`；main CI、exact-SHA preflight、evidence 和 publication workflow 均通过。 |
| 产品 | **PARTIAL**；r3 已在杭州 current 运行并完成 DSH/CRM/B0 loopback smoke，但完整浏览器、真实模型、WAL 兼容、operator gate、10x backpressure、真实业务 UAT 和回退演练仍未完成。 |
| DSH | 官方上游固定为 `477b4f42`（0.1.7-rc.2），不修改上游源码；杭州 current 仍为 `/srv/shinemage/dsh/releases/dsh-0.19.0.0-r3`，`dsh-0.20.0.0-r1` 已通过 Tailscale 只读复核并保留在 incoming，尚未 activate。 |
| CRM | 杭州 backend `127.0.0.1:18093`、frontend `127.0.0.1:18094` 健康；backend 镜像固定为 `sha256:bbcea629…`，容器内 DuckDB 为 `1.5.6`；真实库未读取。 |
| WeKnora | 页面 `127.0.0.1:18090`、API `127.0.0.1:18092` 健康；数据卷与登录由 WeKnora 自身管理。 |
| 公网入口 | `www.tyuan.chat`、`app.tyuan.chat`、`page.tyuan.chat`、`board.tyuan.chat`、`learn.tyuan.chat` 经 Cloudflare Tunnel；HTTP 已强制跳 HTTPS。 |
| 安全响应头 | 全域 HSTS 6 个月；`learn` 使用 Permissions-Policy 和 CSP Report-Only，暂不启用 preload/includeSubDomains。 |
| 数据与备份 | 生产 DuckDB 保留在杭州 `/srv/shinemage/data`，D 盘备份已校验；`incoming` 只读保留，不进 Git。 |

### 当前本地 rc2 候选门禁（2026-10-03 审查修复）

- 本次从公共仓库 `main@d4261aa3` 开始，保留 13 个本地提交及原工作树修改。DSH 仍固定 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，VERSION 未变。用户已授权审核通过后本地提交；候选在独立 `codex/plugin-boundary-review` 工作树，提交结果以 Git 为准。未 push、发布或修改杭州。
- 上一轮八阶段 preflight、102/102 测试及 candidate 回执只证明其绑定的旧 SHA；**本次修改后正式 preflight 尚未重跑**。最终候选必须从 clean reviewed SHA 重建，不复用旧 PASS。
- 本轮修复 OCR-01–07：runtime 私有副本与原始包 integrity、插件最终包安全/入口校验、receive 恢复、跨 tag 身份与精确 Git tree 扫描。专项回归 **123/123 PASS**；真实固定上游 prepare、现有 build-tools audit、离线 runtime 构建，以及 workbench/shine-brand pack 通过。详见 [修复与规划审核证据](docs/hackathon/evidence/dsh-g0-review-fixes-20261003.md)。本机包是 Darwin arm64 验证产物，不是 WSL2 上线包。
- 大型拆分计划已全文复核：统一 G0 → 首期 workspace 试点 → stop/go → 物理分仓的顺序，保留独立 CRM/知识库插件与官方 DSH 底座目标。T1 已完成边界设计、10 包机器清单、唯一构建 DAG 与漂移检查；T15 已把 pin/build-tools 归入 kit，并验证 brand/query 独立 build/test/pack。board-components 的固定 tarball/公开类型已替换 6 条源码引用，workbench 独立重建/pack 通过；CRM 的 5 条源码/类型引用仍开放。T2/T17 精确宿主、签名/SBOM、canary/rollback 与远端 receive/reconcile 仍 `PARTIAL`/`NOT_RUN`。
- 同日上一阶段验证（不是下方新增改动的全量重跑）：48 项锁定依赖的隔离环境中，共享合成 backend **2922 PASS / 77 SKIP / 71 deselect**，Vue build 与 **223/223**，release 专项 **119/119**，最终 B0 pipeline **PASS**（Python **618/618**；Node 各阶段合计 **1370 PASS / 1 SKIP**，含 clean 重跑）。实际 8 插件 build、两叶子隔离包、workbench clean rebuild 通过；详见 [边界与隔离构建证据](docs/hackathon/evidence/dsh-g0-boundaries-20261003.md)。
- 图表解耦本轮证据、命令、包 SHA、测试结果与剩余项见 [图表解耦记录](docs/hackathon/evidence/dsh-g0-board-components-20261003.md)。产物均是本地构建/临时 Git 夹具，不是新 Release；VERSION、DSH pin 与生产 profile 未改变。
- 本轮没有重跑完整原生 DSH profile 生命周期、WSL2/WAL、真实 HTTP SLI、浏览器/模型或业务 UAT；B0 Loader/合成服务测试不替代上述门禁。杭州状态沿用上方注明日期的现场快照，未作新的上线判断。
- 提交前 OCR 全范围审核及修复见 [解耦审核](docs/hackathon/evidence/dsh-g0-decoupling-review-20261003.md)：恢复误写的验证矩阵，堵住 TypeScript import-equals 的依赖漏检。本次 Node 回归 **176/176**、图表后端 **43/43**；后续仍先处理 CRM 的 5 条内部引用。

## 本轮施工计划

> r3 现场收尾记录见 [r3 收尾记录](docs/release/dsh-rc2-candidate/closeout-20260930.md)；r1 的 immutable Release、fetch receipt 和杭州 current 状态以本页与 runbook 为准。下方较早段落保留历史候选与未部署时的证据语境；不要用其“尚未执行”字样覆盖 2026-09-30 的事实。

- 截至 2026-09-29 的历史候选快照：rc2 候选验证账本见 [verification-20260927](docs/release/dsh-rc2-candidate/verification.md)；T2–T12 gate 见 `docs/release/dsh-rc2-candidate/`；固定上游 checkout、dsh-dev、B0 clean rebuild、PR #61 CI 和当时的 main CI 均通过；真实模型、131GB DuckDB、rc2 冷验证、杭州 route/重启和真实 HTTP backpressure 当时仍 `NOT_RUN`。当前 r3 事实见 [收尾记录](docs/release/dsh-rc2-candidate/closeout-20260930.md)。
- 本机候选 worktree 不含 DuckDB/WAL 文件；这里只使用 synthetic fixture 和隔离小库，杭州生产数据状态不由本地文件推断。PR #84 合并提交 `a9da9161` 的 `dsh-0.19.0.0-candidate` 曾在 Mac 隔离目录完成 build/receive/doctor；该快照在后续 main 提交后仅作历史证据，正式包必须从最终 reviewed SHA 重建，未上传或写入杭州现役目录；目标仍只有 Python 3.12.3，未满足项目 Python 3.14+ 冷运行时要求。
- 历史 merged-main internal artifact 仍使用 provisional tag `dsh-0.18.0.1-main-00823ff5`；source SHA `00823ff533b4cc32861cc70e3f8bda5d374f3b14`、app tarball SHA-256 `b11c4b43436eb06f1821c1891121b690e5488effa0c75d421f285e051c8fbf35`、manifest SHA-256 `4642f4614d81b6f2f8777485793b20f2c140eb3523efa46475831fe4398d36d7`、entries `1676`；pinned upstream `477b4f42` git-archive tarball SHA-256 `ddc0cb7b74c938e097f918f44e88e67a83bdde555db18f49cb7a3c9740744e32` 已在隔离 `/tmp` 生成，尚未上传或绑定 publication sidecar；manifest 以 `.context/release-evidence/dsh-0.18.0.1-main-00823ff5/release-manifest.v1.json` 为唯一来源；接收目录为一次性 synthetic 临时目录，未创建 draft/tag/release。`0.18.0.2` 及其 pre-review 包只保留为历史证据；`0.19.0.0` 的 `a9da9161` 候选快照已完成本地 checksum/receive，后续 main 提交使其失效；最终包以仓库外的不可变 manifest/CI evidence 为准，仍为 internal-only-partial。

- Artifact Inbox 数据层、自由 HTML 候选保存、原生 `write/edit/present` 接收、轮询和单卡片局部 patch 已合入并在杭州运行。
- 历史 PR #61 与合并后 main CI 已完成；Tailscale SSH host preflight 与 CRM+DSH/page loopback healthcheck 已通过；本候选的 PR/CI、杭州 CRM/DSH/WeKnora 切换、Cloudflare 入口和安全收尾仍按现场门禁处理；本地与生产均不改 DSH 上游。
- 隔离合成环境的 Playwright headed 旅程已通过（页面生成/预览、局部编辑、保存新版本、回滚和脏数据离开保护）；该 fixture 的生成步骤走 live adapter fallback，不能当作浏览器级 Artifact Inbox intake 证据。完整 DSH shell/生产收件箱旅程与本人 UAT 尚未执行，真实模型逐格式编辑、P13、扫描 PDF OCR、复杂 Office、图谱剩余语义核对仍未完成，不能记为产品全量通过。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。生产服务、真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。无宿主实时事件时，原生 HTML 发现依赖驾驶舱打开后的有界轮询和手动刷新，这是平台能力边界。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->
