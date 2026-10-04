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

### 当前候选与宿主接线审核（2026-10-04）

- OCR delegate 覆盖原始变更 **30/30**（含工具排除的文档/Python 补审），修复特殊文件输入阻塞与安装内容未直接绑定 tarball 两个问题。负测先失败后通过；没有剩余已确认的本轮代码审查缺陷。见[审查记录](docs/hackathon/evidence/dsh-g0-host-journal-review-20261004.md)。
- 修复后 release suite **146 PASS / 0 SKIP**、profile/入口负测 **9 PASS / 0 SKIP**、首购保存恢复/分析/native **31 PASS**；固定官方 rc2 Web CLI 重新完成 **10/10**，CLI journal 重试幂等，所有自有宿主已回收，上游 tracked source 干净。
- 已授权本地 commit，实际提交以 Git 为准；下一步为 T3/T7 D15 保存回执与 UNKNOWN 查询。生产、目标平台、供应链和物理分仓门禁仍保留，不触发 push 或杭州切换。

### 审核前候选与宿主接线（2026-10-04，本地增量）

- 在既有固定宿主增量上增加 `pnpm dsh plugin verify-host`：candidate 携带 profile 原字节快照，核对固定 DSH、双包版本/摘要、实际 composition、会话文件与十项 v2 宿主证据后，幂等写入原 journal；不改写 candidate。默认七插件 profile 不变，首期显式选 CRM＋知识双包。
- 本轮重新执行真实官方 Web CLI **10/10 场景**，独立 CLI 写入 `CANDIDATE_HOST_VERIFIED`，重复调用保持相同 journal 和候选字节。release suite **142 PASS / 0 SKIP**。隔离源码保持已审核的 `1737adc3`，两个 tarball 与上一轮逐字节相同；验收器未提交源码另有摘要绑定，见[本轮证据](docs/hackathon/evidence/dsh-g0-host-journal-20261004.md)。
- T3/T7 新增 **5 个**真实子进程/隔离 SQLite 故障场景；含既有首购分析与原生链路共 **31 PASS**。已证明同版本提交前后崩溃、丢失响应重放、冲突/权限拒绝与 forward-fix；D15 candidate/correlation/UNKNOWN receipt 合同仍未完成，保存门禁保持 `NOT_AVAILABLE`。
- T13/T21 的本机观测接线已完成，整体仍 PARTIAL：`release_ready: false`，生产 activation、远端 reconcile、目标平台/供应链/canary 未关闭。kit 独立 dev dependency 和物理分仓仍待后续 G0/stop-go；本轮未 commit、push、发布或操作杭州。

### 上一阶段固定宿主验收（2026-10-04，本地增量）

- CRM/知识拆分与 OCR 修复已本地提交为 `1737adc3cffeb9db5fbbcee222fb044526324d40`，未 push。提交后新增固定官方 Web CLI 验收入口和 profile 加载修复；这些增量的提交状态以 Git 为准，不能冒作该 commit 内容。
- 真实 rc2 宿主此前不会加载生成的旧 preset 目录；现已增加官方 `@deepseek-ai/dsh-agent-preset` 声明补丁。固定双包 tarball 在本机官方 Web CLI 完成 **10/10 场景**：加载/组合、实际工具降级、正常重启、在途崩溃后的原生 v4 会话恢复、挂死进程回收、原生回退和恢复旧组合。父命令中断回收也通过，入口负测/profile **9 PASS / 0 SKIP**。详见[固定宿主证据](docs/hackathon/evidence/dsh-g0-pinned-host-20261004.md)。
- 移除 preset 只禁止新绑定，已有会话仍持有旧工具，整体切换按 `HOST_RESTART_REQUIRED`；任意同进程插件隔离不承诺。T2/T17 本机子项已验证；T13/T21 本机接线与 T3/T7 存储恢复的后续结果见上节。WSL/跨版本、浏览器、真实模型/业务、供应链和现场 canary 仍开放；物理分仓继续受 G0/stop-go 约束。

### 上一阶段 CRM/知识插件拆分（2026-10-04，已本地提交）

- 上一轮 OCR 修复已本地提交为 `ff7fc5fc0fa0295969fe789bc0bd7983a670c73a`。本轮从该干净基线继续 `codex/plugin-boundary-review`，完成本地拆分、OCR 审查修复和验证；本地提交以 Git 为准，未 push、发布或操作杭州，VERSION 与固定 DSH 未变。
- CRM 包保留身份 `@shine-mage/dsh-crm-knowledge`，候选版本 `0.0.0-crm.1`；知识工具迁入 `@shine-mage/dsh-knowledge@0.0.0-candidate.1`。两包无相互业务源码导入，可分别构建/打包；profile v3 独立装配每个模块，拒绝把旧合包和新知识包混装。公开解释不需要 CRM，私有教材当前通过可撤销身份合同使用 CRM Host，不共享密码/令牌。
- 本轮统一验证入口通过：后端定向 **206 PASS**、Node **160 PASS / 0 SKIP**；额外页面组合纳入全插件回归 **162 PASS / 0 SKIP**。真实 CLI 已分别生成 CRM-only、knowledge-only、含页面的组合 profile，均仅 CONFIGURED_NOT_RUN。最终 B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1473 PASS / 1 SKIP**，含 clean 重跑）；独立 tarball 与失败修复记录见[插件拆分证据](docs/hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。
- 本次 OCR delegate 覆盖 68/68 原始变更路径，修复卸载后公开知识和 CRM 工具迟到成功的问题；修复后双包构建、受影响插件 **166 PASS / 0 SKIP**、隔离打包/边界 **16 PASS / 0 SKIP**。详见[本次审核证据](docs/hackathon/evidence/dsh-g0-crm-split-review-20261004.md)；上段 B0/后端数字属于拆分实现阶段，未冒作本次修复后重跑。
- T15 本地插件拆包子项完成，整体仍 PARTIAL。提交后的精确宿主本机证据见上节；T3/T7 保存/UNKNOWN 回放、供应链/canary/现场回退和 clean reviewed candidate 仍开放，物理分仓在批准的 G0/stop-go 之后。本轮没有浏览器、真实模型/数据或杭州 UAT，新包没有上线。

### 上一轮本地 rc2 候选门禁（2026-10-03 审查修复）

- 本次从公共仓库 `main@d4261aa3` 开始，保留 13 个本地提交及原工作树修改。DSH 仍固定 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，VERSION 未变。前置审核修复为 `f55908df`，独立分支为 `codex/plugin-boundary-review`；原 public main 未切换或清理。本次提交收拢其后的 CRM slot、页面/主题、服务边界与独立应用包成果及 OCR 修复，准确提交号以本分支 Git 历史为准。未 push、发布或修改杭州。
- 上一轮八阶段 preflight、102/102 测试及 candidate 回执只证明其绑定的旧 SHA；**本次修改后正式 preflight 尚未重跑**。最终候选必须从 clean reviewed SHA 重建，不复用旧 PASS。
- 本轮修复 OCR-01–07：runtime 私有副本与原始包 integrity、插件最终包安全/入口校验、receive 恢复、跨 tag 身份与精确 Git tree 扫描。专项回归 **123/123 PASS**；真实固定上游 prepare、现有 build-tools audit、离线 runtime 构建，以及 workbench/shine-brand pack 通过。详见 [修复与规划审核证据](docs/hackathon/evidence/dsh-g0-review-fixes-20261003.md)。本机包是 Darwin arm64 验证产物，不是 WSL2 上线包。
- 大型拆分计划已全文复核：统一 G0 → 首期 workspace 试点 → stop/go → 物理分仓的顺序，保留独立 CRM/知识库插件与官方 DSH 底座目标。T1 已完成边界设计、10 包机器清单、唯一构建 DAG 与漂移检查；T15 已把 pin/build-tools 归入 kit，并验证 brand/query 独立 build/test/pack。board-components 的固定 tarball/公开类型已替换 6 条源码引用，workbench 独立重建/pack 通过；CRM 的 slot、页面与主题私有源码引用均已解除，生产源码例外为 0；合成服务 HTTP 边界与独立应用打包已推进，细目见下方 2026-10-04 记录；真实服务合同与物理分仓仍开放。T2/T17 精确宿主、签名/SBOM、canary/rollback 与远端 receive/reconcile 仍 `PARTIAL`/`NOT_RUN`。
- 同日上一阶段验证（不是下方新增改动的全量重跑）：48 项锁定依赖的隔离环境中，共享合成 backend **2922 PASS / 77 SKIP / 71 deselect**，Vue build 与 **223/223**，release 专项 **119/119**，最终 B0 pipeline **PASS**（Python **618/618**；Node 各阶段合计 **1370 PASS / 1 SKIP**，含 clean 重跑）。实际 8 插件 build、两叶子隔离包、workbench clean rebuild 通过；详见 [边界与隔离构建证据](docs/hackathon/evidence/dsh-g0-boundaries-20261003.md)。
- 图表解耦本轮证据、命令、包 SHA、测试结果与剩余项见 [图表解耦记录](docs/hackathon/evidence/dsh-g0-board-components-20261003.md)。产物均是本地构建/临时 Git 夹具，不是新 Release；VERSION、DSH pin 与生产 profile 未改变。
- 本轮没有重跑完整原生 DSH profile 生命周期、WSL2/WAL、真实 HTTP SLI、浏览器/模型或业务 UAT；B0 Loader/合成服务测试不替代上述门禁。杭州状态沿用上方注明日期的现场快照，未作新的上线判断。
- 提交前 OCR 全范围审核及修复见 [解耦审核](docs/hackathon/evidence/dsh-g0-decoupling-review-20261003.md)：恢复误写的验证矩阵，堵住 TypeScript import-equals 的依赖漏检。本次 Node 回归 **176/176**、图表后端 **43/43**；后续 CRM 增量与该已提交审核分开记录。

- 上一阶段 CRM slot 增量：领域 v1 JSON → 双方本地生成合同，源码例外 **5→4**。本轮完整 B0 **PASS**（Python **618/618**；Node 阶段合计 **1413 PASS / 1 SKIP**），CRM host/client 构建与编译后 UI **9/9** 通过。证据见 [CRM slot 解耦](docs/hackathon/evidence/dsh-g0-crm-slot-20261003.md)；未提交增量不冒充 `f55908df` 内容。

- 最新 CRM 端：workbench 生产源码例外 **4→0**，页面工具归公开入口并由 profile 显式组合，主题归品牌领域合同。单包 build/test/pack 与 CRM 全部合成回归 **135/135** 已通过；最终 B0 **PASS**（Python **618 PASS**；Node 阶段合计 **1425 PASS / 1 SKIP**），7 份产物 clean rebuild 一致。实际 CRM 单包/含页面候选 profile 配置生成通过，未加载宿主；结果见 [CRM 端解耦证据](docs/hackathon/evidence/dsh-g0-crm-decoupling-20261003.md)。本轮仍未提交，未推进生产。

### 上一阶段 CRM 服务调用解耦（2026-10-04，本地未提交）

- 在原有 45 个未提交文件基础上继续实现，保留 `codex/plugin-boundary-review@f55908df` 与旧修改；本轮没有 commit、push、Release 或杭州操作。
- CRM 插件已移除相对主仓路径和 Python 子进程调用。合成指标与公开知识解释分别通过显式 HTTP origin 和领域 API 1.0.0 调用，服务未配置/版本不符/断连时明确 NOT_AVAILABLE；已有真实 CRM 登录、账号权限和看板工具保留。独立知识 ASGI app 与旧 metrics/explain 兼容 adapter 并存，服务实现和知识资源仍在现仓。
- profile 改为 `crm-profile-assets/v2`，不再要求 Python；旧 `--python` 返回迁移提示，只生成新 profile。新请求头约束已进入 OpenAPI/生成类型，不把版本协商当作认证。配置生成仅是 CONFIGURED_NOT_RUN。
- 当前 CRM 回归 **146 PASS / 0 SKIP**，后端定向 **67 PASS**；实际双服务进程与单服务停止、独立 build/test/pack、最终 tarball 安全解包后固定 SDK 加载已通过。详细命令、最终 B0、失败记录及文件清单见 [本轮证据](docs/hackathon/evidence/dsh-g0-crm-service-boundary-20261004.md)。
- T15/T3 仍 PARTIAL：服务独立打包、CRM/知识插件最终拆包、真实服务版本窗口、D15 保存/UNKNOWN 回放矩阵、精确宿主/WAL、签名/SBOM/CVE、canary/回退和杭州上线未完成；上轮 OCR 只覆盖其原始源码快照。

### CRM/知识服务独立应用包（2026-10-04，审核前阶段记录）

- 继续在 `codex/plugin-boundary-review@f55908df` 的现有工作树修改，既有未提交成果保留。指标与知识服务各有明确文件/资源 allowlist、独立依赖锁、API/软件版本和不可变 `.tar.zst`；只打包公开 synthetic 输入，知识服务不再加载指标引擎或 DuckDB。旧 factory/CLI adapter 保留，独立指标入口不再提供知识解释。
- 实际包已在仓库外、仅含声明依赖的临时 venv 中完成 3 种指标查询、知识解释、OpenAPI 核对与单服务停止验证；篡改/缺资源/链接/额外文件/错误依赖/secret 均拒绝，输出目录不可覆盖。最终 artifact 摘要与实际 HTTP 测试中的包一致，详见[服务包证据](docs/hackathon/evidence/dsh-g0-crm-service-packaging-20261004.md)和[运行入口](docs/operating/crm-service-packages.md)。
- 本轮真实验证：服务包 **4/4** 集成场景；共享全量合成后端 **2936 PASS / 77 SKIP / 71 deselect**；CRM **146 PASS / 0 SKIP**；B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1435 PASS / 1 SKIP**，含 clean 重跑）。离线合同/类型、Ruff、边界清单和差异检查通过。失败的首次包断言与过期 inventory 日志保留，不作为当前通过证据。
- T15 只新增“服务应用独立打包/资源清单”子项完成。下一步是 CRM/知识组合插件的最终拆包；服务物理分仓、平台依赖冷安装、真实 CRM 合同、D15 保存/UNKNOWN、精确宿主/WAL、签名/SBOM/CVE、canary/回退仍开放。候选 `release_ready=false`，没有 commit、push、远端 CI、Release 或杭州切换；不把已配置 CI 当成已经远端通过。

### CRM 增量提交前审核（2026-10-04，当前结果）

- 用户授权 OCR delegate 审核、修复后本地 commit。本轮覆盖原有全部 87 个未提交路径：OCR 61/61，另补审 26 个默认排除的文档、生成物、测试和删除项；同宿主对抗性复核没有额外发现。完整记录见[CRM 提交前审核](docs/hackathon/evidence/dsh-g0-crm-review-20261004.md)。
- 修复 API 错误合同：实际 400/403/409/422 使用 `status/code`，现在 OpenAPI 与生成类型同步声明 `ServiceError`，不再误报 FastAPI 默认 `detail`。新增 3 项回归先复现失败再通过；同步服务打包进度与 Ruff 版本文字。
- 修复后本轮重跑：完整合成 backend **2939 PASS / 77 SKIP / 71 deselect**；CRM **146 PASS / 0 SKIP**；B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1435 PASS / 1 SKIP**，含 clean 重跑）。16 项服务 API 测试、实际服务包隔离运行、离线合同/类型、Ruff、边界清单均通过。下方及上方历史阶段的“未提交”和包 SHA 仅描述当时快照，不是新提交的 release 证据。
- 本轮审核无未关闭 P0/P1；产品仍 PARTIAL。CRM/知识插件最终拆包、真实数据/API、完整宿主/WAL、冷安装和供应链/回退仍待完成。没有远端 CI、push、Release 或杭州操作；正式候选须从 clean reviewed SHA 重建。

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
