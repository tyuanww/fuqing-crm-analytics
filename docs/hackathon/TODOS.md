# TODOS

施工顺序与禁区看仓库根 [STATUS.md](../../STATUS.md)。当前以本文件 **M1 核心交付**接续；Git 交付、产品验收与历史短 PR 分别记账，不另建平行 `todo.md`。七阶段历史账本：[产品验收与发布准备](./PRODUCT-READINESS-2026-09-10.md)。[总待办](./PLAN-CLOSEOUT-2026-09-05.md)和原 [11 工作包](./AUTOPLAN-IMPLEMENTATION-TASKS-2026-09-05.md)是规划编号，不代替当前任务卡。

## M1 核心交付

## M2 收尾任务卡与维修规则

以下任务卡只覆盖 M1 之后仍开放的验收、供应链和发布门禁。每张卡独立推进、独立验证、独立本地提交；没有满足前置条件时保持 `NOT_RUN` 或 `BLOCKED`，不使用历史回执补齐当前证据。

### 维修原则

- **边界清楚**：领域规则留在领域层，服务、宿主、文件和网络通过明确的端口/适配器接入；不把发布控制、业务逻辑和验收脚本揉成一个入口。
- **依赖向内**：组合、candidate 和 journal 依赖稳定合同，具体 DSH、服务和目标适配器依赖合同；不让业务插件反向依赖主仓内部路径或真实数据。
- **一个原因一个改动**：每张卡只解决一个完整目的，不为假设需求增加抽象，不通过复制旧实现绕过缺口。
- **先证据后结论**：输入、来源、摘要、测试范围、未执行项和失败原因都要留证；合成、隔离和历史结果不能写成真实业务或生产通过。
- **小步本地提交**：代码、合同、证据和入口文档按职责拆分；提交格式使用 `type(scope): description`。默认只做本地 commit，不自动 push、部署、切换或删除。
- **代码卡强制审查**：任何卡一旦修改代码、脚本、配置合同或测试，完成实现后必须运行 `ocr delegate preview`、`ocr delegate rule` 和逐文件审查；High/Critical 必须修复或明确阻塞，审查覆盖全部 reviewable files 后才能本地提交。纯文档卡不触发代码 OCR，但仍需链接、格式和事实核验。

### 任务卡

| ID | 任务 | 当前状态 | 前置条件 | 完成标准 | 提交边界 |
|---|---|---|---|---|---|
| M2-01 | 九包组合 candidate 合同 | `FORMAL_CANDIDATE_REGISTERED / RELEASE_GATES_OPEN` | 隔离 candidate、当前九包输入和主仓登记授权 | 主仓 `config/candidates/shinemage-composition-20261013/` 已登记 `dsh-composition-candidate/v1`、两份候选 profile、九 pack 摘要和 journal seq 1–5；candidate digest `125c8e53…` 可回读 | `chore(sprint): Sprint 120 register formal composition candidate snapshots` |
| M2-02 | 服务绑定与兼容回执 | `FORMAL_BINDING_REGISTERED / CRM_UNBOUND_BY_CONTRACT` | candidate 合同要求 page profile 绑定 service gate，CRM profile 保持组合边界 | page profile 快照已写入 `analytics-first-purchase` binding、source SHA 和 `LOCAL_COMPATIBLE` 回执；CRM profile 按组合合同保持无绑定，默认 source profile 未被污染 | 同上；登记证据见 `docs(acceptance): record formal candidate registration` |
| M2-03 | WSL2 目标（当前按测试+生产授权） | `TARGET_PREFLIGHT_PASS / USER_AUTHORIZED_TEST_PROD` | candidate-bound browser、激活和发布仍按独立门禁；云服务器迁移另行 | Linux x86_64 / WSL2、Python 3.14.4、Node/zstd、权限和精确 13-wheel preflight 已通过；现役服务 stale lock 已受保护修复；用户已确认当前目标同时承担测试与生产验收 | `docs(acceptance): record production target authorization` |
| M2-04 | source HTTP → terminal → browser → recovery | `TERMINAL_PASS / BROWSER_PASS` | M2-01、M2-02、M2-03 | 同一新 candidate 在同一目标完成四段链路；每段 receipt 绑定 candidate，重试幂等、失败可恢复、临时资源回收 | source 子阶段见 `docs(acceptance): record composition source target`；terminal 子阶段见 `docs(acceptance): record composition terminal target`；browser seq 5 与三种 viewport 回执见 `docs/hackathon/evidence/shinemage-m2-04-candidate-browser-preflight-20261013.md` |
| M2-05 | 真实页面与浏览器验收 | `PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS / STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL` | 真实 `COCKPIT_EXAMPLE_PACKAGE` 和可用目标 | headed 桌面、移动视口、读屏、键盘焦点、高对比度和 standalone 页面均有真实证据 | 已提交 source-owned `free-page/v1` 页面包 `fcee92a9`（SHA-256 `e2ed8f1c…`）；固定上游的真实 Chromium standalone 探针 7 项 PASS，并补充 6 项自动化 AX/键盘/forced-colors 模拟检查。candidate-bound headed browser 已完成桌面/平板/移动截图、console 核验、隐藏 input 复核和 Aside Computer Use 的 26 步人工 Tab 焦点观察，已到达 `连接 CRM` 与 `CRM 分析` 入口，详见[候选未命名 input 复核](evidence/shinemage-m2-05-candidate-input-triage-20261014.md)与[Aside Computer Use 焦点读取](evidence/shinemage-m2-05-cua-screen-read-20261014.md)。真实读屏器和 Windows 高对比度仍待执行 |
| M2-06 | 真实模型/CRM/WeKnora/UAT | `CANDIDATE_REAL_MODEL_PASS / CRM_READONLY_PASS / WEKNORA_READONLY_PASS / SYNTHETIC_PERSISTENCE_PERMISSION_RECOVERY_PASS / LIVE_TOOL_SURFACE_EMPTY` | candidate provider 凭据已由用户在 Models 页面手工配置，CRM 当前对话已手工绑定；live 标准会话工具面仍为空 | candidate 真实模型、WeKnora 只读检索和 CRM GSV 7/7 日结构化查询已通过；alpha2 合成保存、权限边界和恢复回归 165/165 通过（35 + 130）；真实 CRM 保存、权限失败、恢复、人工业务复核和 live 标准会话仍 `NOT_RUN / NOT_EXPOSED`，详见[alpha2 合成保存、权限与恢复证据](evidence/shinemage-m2-06-synthetic-persistence-20261014.md) | `docs(acceptance): record candidate real business UAT` |
| M2-07 | SDK 供应链门禁 | `BLOCKED / OFFLINE_INVENTORY_PARTIAL / DEPENDENCY_GRAPH_PASS / RUNTIME_GRAPH_PASS / SBOM_LOCAL_PROJECTION_PASS / CLEAN_HOME_INPUT_PASS / COMPACT_ARCHIVE_BOUND_PASS / COMPACT_CLEAN_HOME_PASS / OPAQUE_OWNER_PROVENANCE_PASS / FULL_ARCHIVE_SECRET_SCAN_BLOCKED` | 最终候选 artifact 和发布者身份 | SBOM、发布者身份、最终签名、验签、撤销验证、干净机器安装和回退均通过 | alpha2 缩减闭包清单包含 364 packages、33 module scopes、1 unidentified manifest、CycloneDX 364 components；匹配 Node 24.19.0 重跑 OSV 后为 `NO_KNOWN_ADVISORIES`；两个固定 lockfile 离线解析出 2,400 个节点、3,899 条外部依赖边、4,158 条 workspace/local 边、0 条未解析依赖；再按 closure 实际 manifest/symlink 关系复核出 1,101 条运行依赖边、0 条运行时未解析依赖，并生成 364 组件、364 dependency entries、0 个缺失引用的本地 CycloneDX projection；alpha2 checker 在全新临时 HOME 下返回 `READY`，主仓 rc2 checker 对 alpha2 SHA drift 正确拒绝。compact closure archive 完成 pack/receive，archive-bound audit 为 0 个 secret findings、18 个 opaque/native gaps，archive-bound OSV 为 222/222 complete、`NO_KNOWN_ADVISORIES`，接收后全新 HOME checker 也返回 `READY`；18 个 opaque 对象已完成 owner、manifest SHA、文件 SHA 和类型矩阵，其中 9 个 bundled/workspace 对象没有 registry integrity；完整 2.38 GB development archive 仍有 70 个 fail-closed secret-pattern review 命中和 827 个 coverage gaps，不能当正式发布包。正式分发 SBOM、registry 回读、publisher identity、opaque/native 语义审计、revocation、最终签名/验签和干净机器安装/回退仍未验证，`release_ready=false`。opaque 来源矩阵见[compact closure opaque/native 来源矩阵](evidence/shinemage-m2-07-opaque-provenance-20261014.md)，compact archive 见[compact SDK archive-bound 验收](evidence/shinemage-m2-07-compact-archive-bound-20261014.md)，依赖图见[alpha2 SDK 离线依赖图](evidence/shinemage-m2-07-dependency-graph-20261014.md)，本地 SBOM 见[SDK 本地 SBOM 投影](evidence/shinemage-m2-07-sbom-local-projection-20261014.md)，干净 HOME 复核见[alpha2 SDK 干净 HOME 输入复核](evidence/shinemage-m2-07-clean-home-input-check-20261014.md)，完整 archive 审计见[完整 SDK archive secret/content audit](evidence/shinemage-m2-07-full-archive-secret-audit-20261014.md)，opaque/native 清单见[SDK opaque/native 内容清单](evidence/shinemage-m2-07-opaque-content-inventory-20261014.md)，OSV 结果见[alpha2 候选 OSV 查询](evidence/shinemage-m2-07-alpha2-osv-20261014.md)，库存与边界见[alpha2 候选离线供应链清单](evidence/shinemage-m2-07-alpha2-supply-chain-inventory-20261014.md)及此前[SDK 供应链门禁当前复核](evidence/shinemage-m2-07-supply-chain-gate-recheck-20261013.md) |
| M2-08 | release / activation / canary / rollback | `INTERNAL_PREFLIGHT_PASS / TARGET_WSL2_HTTP_PASS / NOT_RUN` | M2-04 至 M2-07 关闭，且取得发布授权 | immutable artifact、CI、release review、目标接收、生产激活、canary 和 rollback 全部有同一版本证据 | 在 clean reviewed commit `a148ea77…` 上完成 rc2 内部 preflight：prepare/audit/build/runtime/release/test/receive/evidence 全部通过，release contract tests `549 PASS / 0 FAIL / 0 SKIP`；随后在授权杭州 Linux x86_64 / WSL2 UID 65534 目标以 sealed synthetic 输入完成 10/10 source HTTP 冷安装、权限、SIGKILL 重放和冷恢复。仍缺 15 分钟 SLI、最终供应链门禁和正式 release authorization，因此 activation/canary/rollback 仍 `NOT_RUN`。详见[M2-08 rc2 正式 preflight](evidence/shinemage-m2-08-formal-preflight-20261014.md)、[M2-08 WSL2 目标补验](evidence/shinemage-m2-08-wsl2-target-20261014.md)与[release 门禁复核](evidence/shinemage-m2-08-release-gate-recheck-20261014.md)，不自动部署 |
| M2-09 | 独立 DSH 升级候选 | `CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / SDK_PREPARED_PASS / SDK_CLOSURE_PASS / SDK_CONTENT_AUDIT_PARTIAL / FORMAL_PACK_SOURCE_PROVENANCE_PASS / PROFILE_COMPATIBILITY_PASS / COMBINED_BROWSER_PASS / CANDIDATE_RECOVERY_PASS / ALPHA2_PLUGIN_CONSUMPTION_CLOSURE_PASS / TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN / MAIN_PIN_ADAPTATION_DEFERRED / MAIN_PIN_UNCHANGED` | 新官方 DSH 版本/commit 和隔离 runtime | 新旧 runtime、SDK、插件适配、兼容矩阵、恢复矩阵和回退条件齐全；授权后再切换 | 官方 `dsh-v0.2.1-alpha.2` / `d7432673…` 已在 ignored checkout 安装、native/host build、14 文件 468 测试和三组候选 persistence 主行恢复中通过；九包隔离构建 9/9、自测 9/9（286 项）通过；tracked candidate 已完成来源锁定、Cordis peer 对齐和 20 项组合集成；9/9 pack、2 份 profile 与 composition lock 已复核为同一 commit 的完整消费闭包。本机隔离候选补齐 Web dist 后，使用真实 gstack Chromium fallback 完成页面、预置历史、插件页和 owned-host 重启后的历史回读；稳定后 console errors 为空，重启瞬间的 WebSocket 重连告警保留在证据中。alpha2 开发 SDK 在 Darwin arm64 隔离准备目录中完成固定 source/lock、host/client build、build-tools install 和 source-clean，`check.mjs` 返回 `READY`；随后完成 archive/receive 与 alpha2 缩减闭包投影：`closure_sha256=6d27be92…`、30,611 entries、335 packages，内容审计 26,222 文件、0 findings、18 个 binary/native coverage gaps。所有回执仍为 `supply_chain=NOT_VERIFIED`、`release_ready=false`。主仓适配审计确认 rc2 锁文件、默认验证入口和正式 Cordis 合同仍与 alpha2 隔离闭包分开；正式目标 browser/recovery、主仓适配、切换与 release/activation 仍未执行，详见 `docs/hackathon/evidence/shinemage-m2-09-sdk-closure-20261014.md`、`docs/hackathon/evidence/shinemage-m2-09-sdk-preparation-20261014.md`、`docs/hackathon/evidence/shinemage-m2-09-main-pin-adaptation-review-20261014.md`、`docs/hackathon/evidence/shinemage-m2-09-alpha2-consumption-closure-20261014.md` 与 `docs(acceptance): record DSH upgrade deferred recheck`；不混入当前发布候选 |
| M2-10 | 证据与状态收口 | `PASS / RELEASE_GATES_REMAIN_OPEN` | 每张已执行任务卡的原始回执和本地提交 | 十张任务卡均有状态、证据、下一步和本地提交可追溯；产品仍 `PARTIAL`，未完成门禁保持原状态 | `docs(status): close acceptance task card` |

每张任务卡完成后都要记录：输入身份、实际命令、退出码、原始证据位置、未执行项、风险边界和本地 commit。卡片没有完成时，不勾选下一张依赖卡；产品仍保持 `PARTIAL`、`release_ready=false`。

### 2026-10-12 独立作者仓合并与目标前置阻塞

十个独立作者仓 PR #1 已普通 merge，合并后的各自 main CI 全部 SUCCESS，详情见[合并快照](evidence/shinemage-author-merge-and-candidate-preflight-20261012.md)。隔离目录已基于当前 Workbench formal pack 和既有 `first-purchase-source-http-local` 服务绑定准备 candidate `facb83f3…` / journal seq 2；主仓 profile 与正式 journal 未写入。唯一可连接的 `100.93.46.46` 属于生产入口，用户确认没有另一台非生产 WSL2，所以 source／terminal／browser／recovery 保持 NOT_RUN。产品 PARTIAL、SDK BLOCKED、`release_ready=false`。


### 2026-10-14 DSH 候选正式组合补验

M2-09 候选已补齐正式 pack/profile 输入和 synthetic 组合 browser：9 个 plugin pack、2 份 profile inputs 由候选 toolchain 真实读取器复核；alpha2 native shell 使用正式 Workbench page pack 完成隔离 session/history/board 启动与关闭，`model_calls=0`、`contains_real_data=false`。代码适配提交 `01b753e5` 已按 `open-code-review-delegate` 审查 8/8 文件并本地提交，固定 Node 24 下相关回归 `119 PASS / 0 FAIL / 0 SKIP`。主仓 rc2 pin/live、正式 profile/journal、release/activation、正式目标 browser/recovery 均保持原状态。

### 2026-10-14 DSH 候选目标 browser/recovery 补验

同一授权目标完成 alpha2 正式 page pack browser 和 owned-host restart recovery：首轮 fresh checkout 缺 `build:lib:client`，在临时 checkout 补建后 source clean；目标 browser、synthetic history/board、restart recovery 全部 PASS。临时 4329/runtime 已回收，live 4328/4332/4336 未修改。M2-09 后续只剩主仓 peer/toolchain release-scoped 适配与切换授权。

### 2026-10-13 授权生产目标前置通过

用户明确授权杭州生产入口同时承担当前测试与生产目标，后续再迁移云服务器。目标前置回执 `SERVICE_TARGET_PREFLIGHT_PASS`，现役服务陈旧 supervisor lock 已在无 owner 条件下受保护清理并恢复 `active/running`；在目标前置阶段，当前 composition candidate 尚未接入，terminal、browser、recovery 和 activation 保持 `NOT_RUN/BLOCKED`。详见[授权生产目标前置预检](evidence/shinemage-production-target-preflight-20261013.md)。

source HTTP 子阶段随后已在同一目标用当前 candidate 完成 10/10 PASS，服务内 SIGKILL/冷恢复、输入和临时资源清理均有 candidate-bound receipt，隔离 journal seq 3；该回执本身不覆盖 terminal/browser。详见[当前组合 source HTTP 目标验收](evidence/shinemage-composition-source-http-target-20261013.md)。

随后在同一目标使用九包组合 candidate 完成 terminal drill：roster/工具加载、合成原生对话、受控重启和进程丢失后的 durable session 恢复共 5/5 PASS，组合 journal seq 4 已追加。该回执只覆盖 synthetic model 与临时 profile/runtime；candidate-bound browser 随后以 seq 5 完成，真实模型/CRM/WeKnora/UAT、供应链、activation、canary、rollback 和 release gate 仍未关闭。详见[当前组合 terminal 目标验收](evidence/shinemage-composition-terminal-target-20261013.md)。

随后对用户授权的真实入口 `https://app.tyuan.chat/` 做了只读 headed browser 观察：组合 bundle 约 15 秒后加载完成，桌面、平板和移动 viewport 均显示真实工作台导航与工作区内容，控制台错误为空。该结果只关闭 live browser 子项，不接入 candidate journal，也不替代 standalone、读屏、键盘焦点和高对比度验收；candidate-bound browser 另有 seq 5 回执。详见[授权生产入口 live browser 观察](evidence/shinemage-live-browser-20261013.md)。

随后复核 M2-05 的 standalone 输入：初始 `COCKPIT_EXAMPLE_PACKAGE` 未设置，路径不存在；该缺口已由本地提交 `fcee92a9` 补齐并加固 source-owned 页面包，在固定工具链的真实 Chromium 探针中完成 7 项 PASS。standalone 包与本地浏览器子项已有证据；candidate-bound headed browser 的 Tab 观察仍为 partial，读屏、人工键盘焦点和 Windows 高对比度继续保持未完成。详见[standalone 页面包 preflight 与 follow-up](evidence/shinemage-m2-05-standalone-package-preflight-20261013.md)。

随后对 DSH、page、CRM 和 WeKnora loopback 入口做了只读状态码前置核验：认证入口返回 401，page 根路径返回 404，WeKnora Web shell 返回 200；没有调用真实模型、读取 CRM/WeKnora 数据或执行 UAT。详见[真实业务 UAT 前置核验](evidence/shinemage-real-business-uat-preflight-20261013.md)。

用户随后再次确认当前杭州入口同时作为测试与生产目标，云服务器迁移后置。该决定解除目标环境缺口，不改变 candidate-bound browser、standalone、真实业务 UAT、SDK、activation、canary、rollback 或 `release_ready=false` 的独立门禁。详见[当前测试与生产目标授权记录](evidence/shinemage-production-target-authorization-20261013.md)。

随后用户在 Aside 完成登录并运行真实业务 UAT：DeepSeek-V41-Flash 对 WeKnora 的只读检索与来源引用通过，`board.tyuan.chat/audience` 的真实 CRM 聚合看板在重试 503 后加载通过；新建标准模式会话没有暴露 `query_crm_dashboard_gsv`，模型拒绝编造调用；插件详情只显示 UI 组件运行中，没有 CRM provider tool surface，保存/权限失败/恢复/人工业务复核仍未运行。M2-06 更新为 `PARTIAL_REAL_UAT / CRM_TOOL_NOT_EXPOSED`，详见[真实模型、WeKnora 与 CRM UAT 实跑](evidence/shinemage-real-business-uat-20261013.md)。

本轮在同一授权目标按 release marker 修正了 CRM candidate 的 peer 图：候选插件改用 `upstream/node_modules/.pnpm/node_modules/@deepseek-ai` 闭包，session-controller 与 UI 不再 pending；隔离候选在 `4332` 启动，私有 B0 bridge 在 `4336` 启动，live `4328` 未动。Aside 候选标签页已打开登录入口，登录及后续真实 UAT 等待用户操作，当前不把启动通过写成业务验收通过。详见[候选 peer 图修复与启动证据](evidence/shinemage-m2-06-candidate-peer-repair-20261013.md)。

重新打开候选标签页后，实查确认 live `app.tyuan.chat` 的 `WEIWEI` 登录状态没有传递到 `127.0.0.1:4332`；候选页仍显示“未登录”和 API Key 配置提示。本轮不复制浏览器凭据，也不把 live 会话当作 candidate UAT。M2-06 当前为 `CANDIDATE_BOOT_PASS / ASIDE_SESSION_NOT_BOUND`，详见[候选 Aside 会话边界](evidence/shinemage-m2-06-candidate-session-boundary-20261013.md)。

随后在已登录 live `app.tyuan.chat` 新建会话执行只读验收：`crm_service_health`、`query_crm_dashboard_gsv` 与 WeKnora 检索均为 `NOT_EXPOSED / NOT_RUN`，模型拒绝编造数字或来源，没有执行写操作。M2-06 更新为 `PARTIAL_REAL_UAT / CRM_TOOL_NOT_EXPOSED`，详见[live 只读模型与工具面验收](evidence/shinemage-m2-06-live-readonly-uat-20261013.md)。

随后在修复后的隔离 candidate 内创建临时 workspace/session，直接检查 CRM host 路由：HTTP `200` 返回 `connected=false`，证明候选宿主已加载 CRM host，当前 session 仍未绑定 CRM 账号。该探针未发送模型 prompt、未查询业务数据、未读取凭据。详见[candidate CRM host 路由探针](evidence/shinemage-m2-06-candidate-host-probe-20261013.md)。

随后在同一隔离 candidate 登录为 `hutou`，选择临时 `uat-probe-workspace` 并切换到“仅可查看”后重跑真实只读 UAT 请求。页面明确返回 `MISSING_CREDENTIAL`：`deepseek-official` provider 没有 `DEEPSEEK_API_KEY`，模型调用在工具发现前失败；没有输入、读取或记录凭据，也没有读取业务数据或执行写操作。该结果关闭了候选登录与只读模式观察，却保留真实模型、CRM/WeKnora 查询和后续 UAT 门禁。详见[candidate 真实模型凭据门禁](evidence/shinemage-m2-06-candidate-model-credential-20261013.md)。

随后用户在隔离 candidate Models 页面手工保存受控 provider 凭据，并在当前对话的“连接 CRM”表单手工完成 session 绑定。candidate 以“仅可查看”重跑真实只读 UAT：`crm_service_health` 返回 `LOGIN_BOUND`，`query_crm_dashboard_gsv` 按指定 2026-01-01 至 2026-01-07、全店、`exclude_low_price=false` 调用一次，来源为真实已认证 CRM 服务，返回 7/7 日点且日汇总一致；WeKnora 只读检索与来源引用通过。总额、趋势行、客户标识和原始业务行均未写入证据。M2-06 更新为 `CANDIDATE_REAL_MODEL_PASS / CRM_READONLY_PASS / WEKNORA_READONLY_PASS / LIVE_TOOL_SURFACE_EMPTY`；保存、权限失败、恢复、人工业务复核以及 live 标准会话工具面仍保持未执行，详见[候选真实 UAT 证据](evidence/shinemage-m2-06-candidate-real-uat-20261013.md)。

随后复核 M2-07 当前供应链检查器：脚本 SHA-256 仍为 `690034de…`，工作树无改动，CLI 默认离线且明确不授予 release readiness；`dependency_graph`、`embedded_components`、`registry_integrity`、`publisher_identity`、`opaque_content`、`revocation` 仍未验证。该复核没有执行 OSV、安装、签名或发布，M2-07 继续为 `BLOCKED`。详见[SDK 供应链门禁当前复核](evidence/shinemage-m2-07-supply-chain-gate-recheck-20261013.md)。

随后审计 M2-08 release/activation/canary/rollback 前置链：M2-01/02 已登记正式 candidate/profile 快照（CRM 按组合合同无绑定），M2-05 仍有页面与无障碍缺口，M2-06 的 candidate 只读模型/CRM/WeKnora 已通过但 live 工具面和保存/权限/恢复/人工业务复核仍未执行，M2-07 仍 BLOCKED，且当前记录没有正式 release/activation 授权。`release_ready=false`、`activation=NOT_RUN` 保持不变；本轮没有 push、merge、receive、激活、canary 或 rollback。详见[M2-08 release 门禁审计](evidence/shinemage-m2-08-release-gate-audit-20261013.md)。

随后复核 M2-09 DSH 升级边界（2026-10-13 初始记录）：本地 pin 仍为 `0.1.7-rc.2` / `477b4f42…`，杭州 `current` 仍为 `dsh-0.20.0.0-r3`，candidate 仍使用同一 rc2 上游；新官方 `dsh-v0.2.1-alpha.2` / `d7432673…` 已在本地 ignored checkout 完成安装、native/host build、聚焦生命周期/session 测试和三组候选 persistence 主行恢复，九包在 ignored 候选 toolchain 中隔离构建 9/9、自测 9/9（286 项）通过。主仓 peer/固定 toolchain 仍锁 rc2，组合 lifecycle 已在 ignored alpha.2 harness 通过；当日正式组合 browser/recovery 与切换未执行。2026-10-14 已补齐候选正式 pack/profile 与 synthetic 组合 browser，当前状态见上方 M2-09 任务卡及[DSH 升级候选延后复核](evidence/shinemage-m2-09-dsh-upgrade-deferred-20261013.md)。


2026-09-13 用户确认“核心版本优先交付、扩库完善后置”。目标是问数后 AI 优先使用定制组件自由组板，板内按选定范围修改；首批六类不是最终上限。M1／产品仍 PARTIAL；原全量 App Goal 保持 PAUSED。本节承接原本地施工记录，不把旧冻结实现反推成最终需求。


### 2026-10-12 PR #121 合并后 main CI 与正式组合缺口

PR [#121](https://github.com/tyuanww/fuqing-crm-analytics/pull/121) 已普通 merge，合并提交为 `b47cf9baf328921041dfaff3e289a2af4323e1d0`；实际 [main CI 38224409545](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38224409545) SUCCESS。四个适用 job 成功，五个路径矩阵 job SKIPPED；B0 为 862 PASS／41 subtests PASS／23 warnings。合并后证据见[PR #121 合并后核验](evidence/shinemage-pr121-postmerge-20261012.md)。feature 工作树仍停在 `codex/shinemage-abc-local-candidate`，不会自动切换到 main。

当前九包的两份 profile 没有 `service_binding`，还没有对应新 candidate、服务／platform／terminal／browser／恢复链与 journal。真实 CRM／WeKnora／模型／UAT、standalone、SDK 分发及独立 DSH 升级保持原 stop/go，T1/T15/T19/T21 不勾完，PARTIAL、`release_ready=false`。

### 2026-10-12 PR #120 合并后 main CI 与正式组合缺口

本节记录 [PR #120](https://github.com/tyuanww/fuqing-crm-analytics/pull/120) 已普通 merge 后的事实：合并提交为 `e04caca7`，父提交为 `5943d4be` 与 `8800ebd8`，远端 main 已完成新的实际 CI。合并后证据与工件摘要见[核验记录](evidence/shinemage-postmerge-pr120-20261012.md)。feature 工作树仍停在 `codex/shinemage-abc-local-candidate`，不会自动切换到 main。

PR #121 使用暂存提交 `e9bfc776` 的上传 CI `38218001878`，新 artifact `11732716479`／digest `552aa4d1…`／704587 bytes 已实际下载并由 receiver 核对 18 成员、九包／两 profile。三项非敏感变量已更新并回读，专用只读 Secret 已配置且值不入库；工件有效期至 `2026-10-26T07:29:17Z`。PR #121 attempt 2 的 B0、test、lint、changes、merge-gate 全部 SUCCESS；首次 attempt 因旧 artifact manifest 摘要失败，失败证据保留。

[合并后 main CI 38167688143](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38167688143) SUCCESS：12 个 JUnit 文件、3315 个唯一 testcase，0 failure／0 error／80 skipped；B0 862 PASS／41 subtests PASS，23 warnings 保留。合并前六个适用 checks、rc2 preflight、两轮本地 push 失败与夹具回归仍按[原始证据](evidence/shinemage-cordis-pr120-ci-delivery-20261012.md)留存，不与合并后数字相加。

当前九包的两份 profile 没有 service_binding，还没有对应新 candidate、服务／platform／terminal／browser／恢复链与 journal。旧两包未连接宿主、旧 headed／WSL 不能抵扣。真实 CRM／WeKnora／模型／UAT、standalone、SDK 分发及独立 DSH 升级保持原 stop/go，T1/T15/T19/T21 不勾完，PARTIAL、release_ready=false。

### 2026-10-12 三仓正式插件包 CI 收口

Workbench、CRM、Knowledge 作者仓已分别加入正式 `dsh-plugin-pack/v1` 生成与独立 artifact 上传。当前 PR head 为 `3030e3f`、`dac0539`、`f623c22`，对应 CI run `38204944592`、`38204944092`、`38205510926` 全部 SUCCESS；主仓下载后逐份用 `readPluginPack` 核对 source SHA、manifest digest、tarball digest、`source_dirty=false` 与 `activation=NOT_RUN`。Knowledge 额外修复了 checkout 必须绑定 PR head，旧 run `38204944846` 的来源 `7037e0af…` 不使用。

组合锁和 Workbench 作者证据锁已由 `865cda89` 同步到当前回执。正式包 CI 已关闭作者产物这一项，仍不等于 candidate/journal、服务/目标/terminal/browser/recovery、真实 CRM/WeKnora/UAT、standalone、SDK 分发或 DSH 升级通过；`release_ready=false`。

### 2026-10-12 当前组合输入预检

基于上述三份真实 PR CI formal pack 和组合锁中的六份既有包，`scripts/ci/composition-pack-inputs.mjs` 已在固定 Node 24.19.0 / Python 3.14.4 下生成九包、两 profile 的固定输入回执，命令 exit 0。回执锁摘要为 `be215557…`，原始回执 SHA-256 为 `4a7b9cf9…`，见[预检记录](evidence/shinemage-composition-preflight-20261012.md)及机器摘要。后续隔离复核再次确认静态 composition contract 通过，但两份 profile 的 `service_binding` 仍缺失，见[后续组合预检](evidence/shinemage-composition-next-preflight-20261012.md)。该步骤只关闭包身份和输入准备，profile 仍没有 `service_binding`；宿主、服务/目标、terminal/browser/recovery、candidate/journal、真实业务、standalone、SDK 分发和 DSH 升级继续保持 NOT_RUN/BLOCKED，不能据此生成 candidate 或发布。

PR #121 的 hosted B0 已用新的组合 artifact 实际重跑成功，记录在[正式组合交付](evidence/shinemage-pr121-formal-pack-delivery-20261012.md)；这只关闭当前 GitHub CI 输入链，不改变上述 service binding、candidate/journal、宿主和发布边界。

以下保留应用／本地提交时点；其中“未推送、新 hosted CI 未跑、工件未上传”不覆盖本节。

### 2026-10-12 PR #119 合并与精确 Cordis 对接（本地提交时点）

PR #119 已普通 merge 到 `5943d4be`，实际 main CI `38151751342` SUCCESS。后端 3235 PASS / 80 SKIP / 0 FAIL / 0 ERROR、12 JUnit 无重复；B0 Python 862 PASS / 41 subtests PASS 单列。旧 preflight 与扫描失败按原字节保留，不用这些结果覆盖本次增量。

CRM `ceeff996`、Knowledge `22daa108` 已各自提交并推送精确 Cordis `4.0.4` 校准，新 Ubuntu push/PR CI 均成功，作者 PR #1 仍开放。主仓 13 路径已按授权本地应用，组合锁对接新正式回执 `4be65420…` / `1ce746b6…`，守卫保持精确版本。实际主仓四文件 42 PASS / 0 FAIL / 0 SKIP，九包/两 profile 准备成功，19 项指定源码负对照 EPERM，重复写入 EEXIST；不与隔离提案或历史结果相加。见[原始输入与实测](evidence/shinemage-cordis-formal-cutover-proposal-20261012.md)。

当前正式两包使用同字节官方 npm 依赖副本，经原生 `dsh plugin --profile web add link:<已验证解包目录>` 注册后，开启／官方卸载回退／重新注册恢复三进程、18 项断言 PASS，实际 peer 解析为 dsh-tools `0.1.7-rc.2`、Cordis `4.0.4`。新 home、会话保留、CRM 未连接状态、原生壳路由 404 和恢复后 200 均核对；七项来源负对照 EPERM，自有进程与端口已回收。缺注册的启动失败、旧包遮蔽和记录器错误保留；这不是新 npm 冷安装、真实服务或完整候选验收。

主仓 8 个代码／组合锁路径已本地提交为 `2b98baaa`，本节及相关说明／证据作为独立 docs 提交交付；未推送、新 hosted CI 未跑。旧汇总 artifact 不包含这两包，须在对应远端动作获授权后真实上传并核验。正式服务/目标/terminal/browser/恢复、真实 CRM/WeKnora/模型/UAT、standalone、SDK 分发及 DSH 升级仍开放；T1/T15/T19/T21 不勾完，PARTIAL、release_ready=false。

以下段落保留更早施工时点；旧 PR OPEN、缺 Secret、peer 4.0.2 和 CI NOT_RUN 不能覆盖本节当前事实。

### 2026-10-11 Secret 实跑与 CLI 状态接续

专用 `SHINEMAGE_PLUGIN_READ_TOKEN` 已配置，真实四类私有 receiver 均 PASS；`fc46b243` 主 CI attempt 2 已 SUCCESS，B0/merge-gate PASS。`4c28df71` 路径诊断和 `f1f1d500` SIGKILL 测试修正已正常推送，本地完整后端、前端和 B0 分别通过；不累计作者或历史计数。

`f1f1d500` preflight 的后续失败已定位为 gh 写入 `.local/state/gh/device-id`。`f861a895` 绑定现有独占临时状态目录后，`fe7cc54d` hosted 的 git-clean、上游准备和 runtime 打包实际 PASS；随后密钥扫描拒绝三处测试模拟值。`5102d7ad` 只修正这些值，receiver／模拟 HTTP／release 单次合跑 83 PASS / 0 FAIL / 0 SKIP；扫描规则、权限与原断言未改，旧 59 项不累计。下一步核对新提交的实际 CI/preflight，再按单独合并授权走适用 QA 与门禁。见[本轮接续与失败留存](evidence/shinemage-pr119-ci-secret-reconnect-20261011.md)。无需重复配置已接通的 Secret。

产品 PARTIAL、release_ready=false，原 peer/正式组合/真实业务/SDK stop/go 不变。以下缺 Secret 的描述保留此前准备时点，不覆盖本节。

### 2026-10-11 PR #119 与私有 CI 输入接续

本轮分组交付及追加修复已正常推送。`de196938` 修复结果事务的瞬时 SQLite 争用；指定 main `4859d136` 已以 `3cee76f0` 合入 feature，文件树相同，PR #119 仍 OPEN。最新完整后端 3237 PASS / 78 SKIP / 0 FAIL、12 JUnit 无重复；受影响六文件 129 PASS 与完整主仓 B0 `--check` exit 0 单列，作者私有 core 继续按自己的固定 CI 记账。OCR 当前源码 216/216 已核对，没有外部 LLM 审查；不累计历史 PASS。

私有上传 CI 已 SUCCESS，正式工件 `11704150412` 的 API digest／下载字节／18 成员一致，主仓九包／两 profile receiver 通过；三项非敏感变量已配置。仍缺用户在 GitHub 直接设置 `SHINEMAGE_PLUGIN_READ_TOKEN`。新 preflight 已越过 ancestry 检查，随后因该 secret 缺失失败；新 hosted CI 不能报总体通过。见[本轮交付与操作记录](evidence/shinemage-main-pr119-delivery-20261011.md)。下一步只配置专用四仓 Actions/Contents read secret，再按实际 PR head 重跑被阻断的检查，不复制个人 gh 登录或跳过门禁。

新 worker 服务字节不能继承旧 candidate／服务／headed／WSL2／journal；peer 校准、正式组合／目标、真实 CRM／WeKnora／模型、SDK 分发和独立 DSH 升级保持原 stop/go。T1/T15/T19/T21 不勾完，产品 PARTIAL、release_ready=false。以下本地分组段保留推送前时点，旧“未推送／未运行”不覆盖本节。

### 2026-10-11 主仓本地分组交付

本轮本地 Git 子项已完成：104 个代码／配置／测试路径按 12 个完整目的提交，边界清单另 1 笔、94 份证据另 1 笔，当前 5 份说明最后 1 笔；不压扁为一个大提交。源码与边界 `d36c567e`、证据 `39774244`，目的和逐组结果见[本地交付索引](evidence/shinemage-main-local-commit-closeout-20261011.md)。原有 92 份证据和失败同字节留存，其他任务目录不混入。

当前两锁已绑定 Workbench `6c5adc9f` 与 CRM `c4b1c91e`；默认固定包、公开合同、领域及作者 CI 消费和路径接线已提交。主仓保留平台合同／backend、组合与来源守卫、另两组旧 Workbench 断言及静态扫描，不删除旧副本。必要的当前字节检查逐组通过，本轮最终提交序列的全量 B0、新主仓 CI 和新 candidate/journal 未执行；不累计作者或历史计数。

下一步是获实际授权后推送、更新对应 PR、执行受影响 CI，再按 PR 审查／合并前 QA 流程交付。精确 peer 校准、正式组合和目标验收、真实 CRM／WeKnora／模型、SDK 分发与独立 DSH 升级继续按原门禁；T1/T15/T19/T21 父任务不勾完，产品 PARTIAL、release_ready=false。

### 2026-10-11 主仓合并后接续

以下段落保留本轮分组提交前各次施工状态；未提交／未应用结论不覆盖前一节当前本地交付。

本轮三路径审修后已按授权应用：两个运行/作者锁绑定 Workbench `6c5adc9f`、CRM `c4b1c91e`，离线 eval 转由主仓执行并拒绝空集。OCR 3/3，无开放发现；实际 reader 13 PASS、三组 1/1/3 PASS 和 9 包/2 profile 准备各自通过，计数不相加。另两组仍依赖旧 Workbench；peer 校准、Git 交付、当前 candidate 与真实业务继续开放，不勾父任务。本轮未跑完整 B0/新 CI。见[审修及本地应用记录](evidence/shinemage-three-path-main-application-20261011.md)；下方未应用提案保留准备时点。

主仓公共合同入口已按授权应用 12 路径，并修复重复终止进程组造成的错误覆盖；新入口隔离完整 B0 r2 exit 0：Python 855 PASS / 41 subtests PASS、23 warnings 保留，Node 27 组各自 0 FAIL / 9 次跳过。原 15 个生成器和 C0 hash 未改，主仓实际字节的守卫 28、路径 pytest 34、槽位 4、主题负测／漂移 2 分别通过，OCR 可审 11/11 与排除测试人工 1/1 已审，无开放发现。旧失败保留，主仓未提交，新 hosted CI 和当前组合准入未执行。见[本轮应用与实测](evidence/shinemage-public-contract-main-cutover-20261011.md)。

最新作者 Workbench 6c5adc9f、CRM c4b1c91e 的正式 pack 已在隔离目录生成、读取并逐成员核对；回执分别为 0af61dab…、4663cce0…。主仓运行包／作者证据锁仍是原绑定，9 包／2 profile 的两锁前移提案已经验证但未应用；不继承旧 candidate/journal 或宿主验收。见[最新来源正式包及下一提案](evidence/shinemage-current-author-formal-packs-20261011.md)。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

最新来源正式包的原公共组合已实际运行：9 PASS / 0 FAIL / 0 SKIP，18 个指定来源负对照 EPERM，运行前后 198 个受保护文件未变、自有进程组已退出；合成 HTTP 和官方 resolver 层级，不代表严格 peer／完整宿主或正式准入。两锁提案 OCR delegate 2/2 已审，无开放发现，主仓 apply --check exit 0，但仍未应用。主仓 PR #119 的已有 B0 是 SKIPPED，当前 dirty CI 未执行；见[本轮组合与两锁审查](evidence/shinemage-latest-formal-combination-20261011.md)。

此前合同入口隔离提案准备时点（保留原记录）：

主仓公共合同消费者已形成 12 路径隔离提案，尚未应用：固定三仓真实 CI 的 31 份材料，保留原 15 个生成器与 C0 hash；原生成器 15 次 exit 0，槽位 4 项、主题负测／漂移 2 项、守卫 28 项、路径 pytest 34 项分别通过，34 个指定来源负对照 EPERM。OCR 可审 11/11 与排除测试人工 1/1 已审，失败保留；提案对当前 dirty 基线 apply --check 通过。新主仓入口完整 B0／CI、candidate 与业务准入仍 NOT_RUN，旧副本及保留源码守卫不删。见[提案与真实日志](evidence/shinemage-public-contract-main-cutover-proposal-20261011.md)。

此前合同作者交付时点（保留原记录）：

三个作者仓的合同导出已提交推送，当前真实 Ubuntu PR CI 和 31 份工件来源均核对通过；Workbench/CRM 的 CI 字节码污染由单路径修复关闭，失败保留。原 15 个生成器在旧插件资料拒读下 15/15 exit 0，原槽位 4 项与主题负测/漂移 2 项各自通过，私有行为保留在作者检查。主仓新合同入口和锁尚未切换，旧副本与静态边界继续保留；不继承正式包、candidate/journal 或真实业务准入，PARTIAL / SDK 分发 BLOCKED / release_ready=false。 见[合同材料的实际作者交付](evidence/shinemage-generated-contracts-owner-delivery-20261011.md)。

主仓领域默认入口已按授权应用完整 r2（18 路径）：以领域作者 `e78e040e` / 真实 Ubuntu PR CI `38121126913` 核对来源和实际覆盖，保留三份显式 legacy，不再在此阶段重建领域源码或执行私有几何。已应用 r2 的隔离完整 B0 r4 exit 0，Python 855 PASS / 41 subtests PASS（23 warnings 保留）；Node 26 组各自无失败，9 次跳过保留原因。前三轮缺输入与预检 PATH 失败原样保留；随后仅清理两份文件末尾空行，语法和差异检查通过。主仓还有 15 个源码合同生成入口、保留合同/缺输入守卫及静态边界扫描，旧副本不删；新主仓 CI、当前候选/真实业务未执行，代码文档未提交，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[本轮应用与完整验证](evidence/shinemage-board-components-main-cutover-20261011.md)。

此前 Workbench 几何对接时点（保留原记录）：

Workbench 几何接续的正式输入与三路径已本地完成：`e9223289` → 真实 CI 155 文件 / 1086 PASS → 新正式回执 `871fd3bb…` → 两份当前锁 → 主仓作者覆盖入口。应用后 reader 13 项、几何 1 项分别通过，九包准备和实际绑定 exit 0；旧身份/CI及漏几何重封存负测被拒绝。只关闭该本地对接子项，不勾父任务；领域生产者、剩余源码合同、最新完整 B0/主仓 CI、当前候选与真实业务仍开放，主仓未提交。见[本轮对接](evidence/shinemage-workbench-geometry-main-bind-20261011.md)。


上一轮领域作者交付与迁移提案准备时点（保留原记录）：

主仓领域生产者迁移前置的作者 CI 回执已交付：五路径提交 `e78e040e`、PR #1 当前 Ubuntu CI `38121126913` SUCCESS，守卫 5/几何 28/producer 6/准备 4 分别通过；实际 artifact 来源与原封存输入已绑定。主仓旧 producer/私有测试尚未迁移，锁保持，不勾父任务。见[实际归属交付](evidence/shinemage-board-components-ci-ownership-delivery-20261011.md)，[此前提案](evidence/shinemage-board-components-ci-ownership-proposal-20261011.md)保留时点。 下一步已形成[18 路径完整隔离提案](evidence/shinemage-board-components-main-cutover-proposal-20261011.md)：公开消费 8 项、证据守卫 15 项、保留合同 2 项和路径参数 3 项各自通过，21 个指定来源负对照 EPERM；OCR 可审 17/17 与排除测试的人工审查完成。r2 补丁对当前主仓 --check 通过，尚未应用，完整 B0/新主仓 CI 未执行；此前四路径读取提案保留准备时点，不叠加。

board-components 远端 Git/CI 子项已交付：私有仓默认 main 为 `3855db80`，文档提交 `d5aacdb4` 的 PR #1 OPEN；真实 Ubuntu PR CI `38119670295` SUCCESS，几何 28、producer/输入 6、准备守卫 4 分别通过。下载包 1951 字节 `66d53381…` 与原封存五个成员相同，但外层摘要不同；主仓锁不改。旧生产者防覆盖的两源码增量本地 13 PASS、OCR delegate 2/2 已审，尚未提交。主仓生产者迁移、合并和正式组合准入仍开放，不勾父任务。见[远端交付](evidence/shinemage-board-components-remote-ci-20261011.md)、[本地守卫修复](evidence/shinemage-board-components-main-output-guard-20261011.md)。

上一轮领域本地 Git/clone 交付时点（保留原记录）：

board-components 本地 Git/clone 子项已完成：首次提交 `3855db80` 正好 28 路径，真实 clone 的离线安装、构建和普通内容包通过；producer/输入 6、几何 28、准备守卫 4 各自记账，17 项负对照 EPERM。远程仓/CI 与主仓领域生产者迁移仍开放，不勾父任务、不把普通内容包当正式插件准入。见[领域 Git 交付](evidence/shinemage-board-components-owner-git-delivery-20261011.md)。

上一轮领域提案准备时点（保留原记录）：

board-components 本地 owner 提案已准备：28 产品路径、原计算/类型/夹具保持，28 项几何与 5 项 producer/输入各自通过，最终包管理器准备守卫 4 项通过；1955 字节输出仍为 `22245ab9…`。Git/clone/远端 CI、主仓领域生产者迁移未执行，NOT_IN_CURRENT_BUILD 的 tsc 不改口径。见[领域提案](evidence/shinemage-board-components-owner-proposal-20261011.md)，不关闭整个 T15/T19。

默认四插件源码隔离已本地迁为固定正式归档的独立接收。业务源码、作者仓、固定上游/build-tools 不可读时 4 PASS / 0 FAIL / 0 SKIP，20 项负对照 EPERM；既有公共包行为另跑 29 PASS / 0 FAIL / 0 SKIP，固定 SDK 和合成 HTTP 的范围单列，不相加、不抵扣 Cordis 严格 npm 冲突。六项坏输入与 pipeline 已有输出拒绝通过原始结果核对。原四源码夹具逐字节保留为显式 legacy，本轮 NOT_RUN；领域生产者、私有几何投影、其余源码合同、最新完整 B0/CI、当前 candidate/journal、目标/真实业务与发布仍开放，不勾父任务、不删除旧副本。见[本轮隔离迁移](evidence/shinemage-fixed-pack-isolation-20261011.md)。

上一轮执行记录（installed-kit 默认迁移；历史隔离当时尚未关闭）：

installed-kit 默认十源码构建已本地迁到真实 kit 安装、自有严格编译夹具和固定正式包消费者；九份主仓源码及九个作者仓拒读条件下同次 13 PASS / 0 FAIL / 0 SKIP，18 个负对照均 EPERM。相邻合同 24 PASS 另记，五项坏输入及 pipeline 已有结果目录拒绝均保留原日志。原十源码夹具逐字节留为显式历史入口，本轮 NOT_RUN；领域生产者、历史隔离及剩余源码合同和旧副本继续开放，不勾父任务。本轮完整 B0、新 hosted CI、当前 candidate/journal、服务/目标/browser/真实业务与发布未执行，主仓改动未提交，SDK BLOCKED / PARTIAL / release_ready=false。见[本轮 kit 迁移](evidence/shinemage-installed-kit-pack-ownership-20261011.md)。

上一轮执行记录（正式 preflight 包装配；下列验证只覆盖该轮字节）：

正式 preflight/release 的插件装配子项已本地迁到固定正式包；七包实际装配、20 项源码拒读负对照通过。release 539 PASS、最终 workflow 41 PASS、路径/runner 82 PASS 按执行分别记账，不能累加。只读 preflight 的包输入通过，整体仍被未提交工作树及缺 runtime bundle 阻断；完整 preflight、本轮最新完整 B0、新 CI、当前 candidate/服务/目标/browser/真实业务与发布仍开放。installed-kit 及历史源码夹具和旧副本未删，不勾父任务；SDK BLOCKED / PARTIAL / release_ready=false。见[本轮包装配记录](evidence/shinemage-formal-preflight-pack-assembly-20261011.md)。

上一轮执行记录（Workbench core 归属迁移；其完整 B0 只覆盖当时字节）：

Workbench `d038f357` 完整 core Git/CI 已交付，并生成自己来源的正式 pack 回执 `9d7f6bf3…`；tarball `e41df9f5…` 与前轮同字节，组合锁 `89e2b2ea…` 只前移 Workbench 行。主仓常规 core/构建/私有 loader/clean rebuild 已消费固定作者 CI 证据，原三组业务合同仍维护；新完整本地 B0 r3 exit 0，Python 855 PASS / 41 subtests PASS、Node 24 组无失败，9 次 opt-in 跳过和 warnings 保留；路径/runner/workflow 82 PASS 单独记录。主仓改动未提交，新 hosted CI、installed-kit 与 formal preflight 源码路径、当前 candidate/journal、服务/目标/browser/真实业务及发布仍开放，不勾父任务。见[本轮接续](evidence/shinemage-workbench-core-formal-main-ownership-20261011.md)。

以下接续段保留较早执行时点；其中旧来源、未执行和未提交结论按各自证据对象理解，当前入口与身份以本节最前面的最新记录为准。

精确 Cordis `4.0.4` 的隔离修订普通包现已通过官方 npm 宿主的开启、原生关闭、恢复三进程验证：原生鉴权、合成会话保留、关闭时 CRM 路由 404、恢复后 200 且未连接。新 home/workspace、localhost 沙箱及自有进程清理均核对；旧正式包、原作者仓和 candidate/journal 不变，不能抵扣真实服务/模型或正式准入。不勾父任务；见[修订包宿主证据](evidence/shinemage-corrected-npm-host-20261011.md)。

精确 Cordis 校准提案已在隔离副本验证：CRM/Knowledge `4.0.4` 的作者严格构建和本包测试、主仓配套守卫 41 项、普通 npm 严格锁/实际安装及四入口导入通过。原作者仓/正式包/输入锁仍未改，提案未应用，不勾父任务；先按 owner 授权校准并交付干净新提交/包，再接主仓守卫。见[本轮提案](evidence/shinemage-cordis-exact-proposal-20261011.md)。

Cordis 兼容子项进一步定位为严格声明冲突：官方固定 DSH/dsh-tools 要求 `~4.0.4`，两份独立正式包要求精确 `4.0.2`，三个 npm 锁解析均 ERESOLVE 拒绝。linked 初始化不抵扣严格普通安装；r1 TLS 失败和 r2 包装分类错误保留，原日志 readback 核对后不重跑。原 peer 未改，不勾父任务；后续需 owner 合同修订、新干净提交与同包验收，见[当前证据](evidence/shinemage-cordis-strict-peer-20261011.md)。

当前迁移字节的完整本地 B0 已实际跑到结束：r2 exit 0，Python 855 PASS、41 subtests PASS；Node 23 组无失败、十次跳过按本次执行原因保留，不抵扣真实验收。r1 生成清单过期失败留存，既有生成器同步清单/说明后通过，不放宽 policy。独立 B0 Python 按原锁准备，系统环境、作者八文件和封存包/candidate/journal不改。只关闭当前本地 B0 验证子项，不勾父任务；源码阶段迁移、新 hosted CI、当前候选与真实业务仍开放，本轮未提交，见[回执](evidence/shinemage-current-b0-closeout-20261011.md)。下方此前步骤的 NOT_RUN 保留为当时事实。

主仓 profile 测试归属已迁到 `scripts/crm-calibration/profile.test.mjs`，原五项断言正文同字节，CRM 旧入口只做兼容转发。默认 B0 的实际三入口组合在源码拒读下 14 PASS，已含五项 profile；兼容入口同样五项另记，五份负对照 EPERM，不重复累加、不勾父任务。未改作者仓、正式包或 candidate/journal，本轮未提交；完整 B0、新 CI、Workbench 源码阶段及历史副本仍开放，见[本轮记录](evidence/shinemage-main-profile-test-ownership-20261011.md)。

CRM/Knowledge 的默认两项源码构建已本地迁为正式包公开行为消费：原断言不变，源码拒读下 11 PASS；相关守卫 67 PASS、原公共组合 9 PASS，分层记账。作者私有 transport/graph/relay 四文件与独立仓同字节并归作者 CI；原历史入口和缺输入守卫不删。坏输入/复用六项及源码负对照六项通过，首次夹具布局失败保留；本轮未提交，不勾父任务。完整 B0、新 CI、Workbench 源码阶段和当前 candidate 仍开放，见[本轮记录](evidence/shinemage-crm-knowledge-package-consumers-20261011.md)。

CRM/Knowledge 两份固定正式包已完成官方 add、实际 `4.0.4` 解析导入和宿主/preset 初始化补查，宿主接续六项通过；peer `4.0.2` 未改，linked 警告与 r1 清理错误保留。这里只关闭安装/初始化子项，声明正确性、完整运行兼容、当前 candidate 与真实业务仍开放，不勾父任务。产品/包/journal 无新字节，文档未提交；见[本轮证据](evidence/shinemage-crm-knowledge-host-compat-20261011.md)。

Workbench 的六个既有作者入口已接入独立仓包测试：在 loader/skills/query-skills/独立视图后补入 native-board-auth 和 lane-g。完整作者入口同次 30 文件、212 PASS / 0 FAIL / 0 SKIP，已包含新两文件的 8 项，边界 5 PASS 另记；原测试与 helper 未改，固定输入沿用前轮锁。未运行新 hosted CI，也未提交。主仓七个旧生产者入口仍保留，后续按作者仓干净提交和 CI 交付切走重复执行，不勾父任务、不删副本、不抵扣正式候选或真实业务；当前见[作者测试补齐](evidence/shinemage-workbench-author-tests-closeout-20261011.md)，此前 204 项保留在[历史四入口](evidence/shinemage-workbench-producer-ownership-20261011.md)。

原生 prompt 严格注入消费已迁到正式包，10 项原检查源码拒读通过；九入口一次实跑 66 PASS，输入/九 scope 守卫 18 PASS，分层记账不勾父任务。原正文与断言保留，剩余 compiled producer 为七入口，完整 B0/宿主及旧副本清理仍开放；本轮未提交，见[消费记录](evidence/shinemage-workbench-native-prompt-pack-20261011.md)。

编译客户端运行检查继续迁到正式包，八入口共 56 PASS，含前轮 12；相关输入与回归 105 PASS，源码专用四项另行通过。原断言保留，合成数据不复制业务 decoder/gateway。Host/私有视图及剩余源码阶段仍开放，不勾父任务、不清理旧副本；本轮实现和证据未提交，见[接续记录](evidence/shinemage-workbench-consumer-contracts-20261011.md)。

Workbench 发布客户端的 12 项 factory/生命周期检查已迁到主仓固定包消费入口，源码拒读下全部通过；新增 9 项守卫及既有回归共 97 PASS，分别记账，不勾父任务。原 Host 入口正文保留；其余私有源码阶段、正式候选、远端新 CI 和旧副本清理仍开放。代码与证据未提交；见[客户端消费证据](evidence/shinemage-workbench-client-pack-migration-20261011.md)。

最新迁移：六个叶子插件的默认常规构建/消费已转为独立正式包。主仓消费原包的品牌/槽位、能力标记、几何和公开类型，在源码拒读条件下 20 PASS / 0 FAIL / 0 SKIP；输入及既有回归 88 PASS，分别记账。历史作者输入守卫、源码隔离夹具和 Workbench/CRM/知识源码阶段仍在，默认 B0 并未完全迁移；完整 B0、远端新 CI、当前候选验收和旧副本清理仍开放。代码/证据未提交，不勾父任务；见[叶子包迁移](evidence/shinemage-leaf-pack-migration-20261011.md)。

当前补充：主仓固定包准备入口和三个 CI 工作流已接线；实际九份包的目录/ZIP 准备和三项输入导出通过，准备后的公共合同组合 9 PASS，包/profile/输入守卫 54 PASS，tooling 189 PASS，分别记账。专用读取 secret 和三项 artifact 定位变量仍缺，ZIP 未上传、新 hosted CI 与完整 B0 未跑；不勾完父任务、不删除旧副本。见[本轮接续](evidence/shinemage-ci-pack-inputs-20261011.md)。

检查续跑：ZIP 普通/`-O` 拒绝行为已验证；前端构建与 223 项单测、release 回归 41 项通过。backend 的 298 个既有 synthetic 目标由互不重叠成功组覆盖，唯一用例 3223 PASS / 78 SKIP / 0 FAIL；三次环境失败保留，服务隔离 Python 按原 pin 准备，不改包/SDK。该结果不关闭完整 B0、远端 CI、依赖/Docker 或候选门禁，不勾父任务；实现、证据及当前说明仍未提交。

最新补充：九项 CRM／知识/page tools 公共合同组合已用独立正式包在源码拒读、localhost 环境通过，实际 Cordis `4.0.4`，peer 声明不改；47 项守卫和 78 项旧夹具兼容分别通过。组合测试维护正文与合成夹具已移到主仓验收目录；旧入口保留兼容。这里只关闭公共合同子项，完整官方宿主、候选准入、默认源码 pipeline、CI 输入接通和其他组合入口仍开放。代码/证据未提交，见[固定包组合记录](evidence/shinemage-fixed-pack-composition-20261011.md)。

补充接续：CRM/知识 profile 生成器已本地支持固定正式包输入，并用现有 `crm-knowledge-rc2` profile、独立仓 CRM/知识两包完成源码拒读、禁网和防覆盖实测；38 项合同回归及 58 项 release 回归分别通过。只关闭配置准备子项，完整运行组合、整体 Cordis 兼容、正式 candidate/目标/浏览器及旧副本清理仍开放，不勾完父任务。见[本轮包输入记录](evidence/shinemage-crm-profile-pack-migration-20261011.md)。本轮新增实现和证据尚未提交。

当前本地接续：PR #119 与九个插件 PR #1 的远端当前提交适用 CI 已成功，仍待合并。主仓 HEAD `5390667c` 上的固定包开发入口迁移和 pnpm 选择修复，以及 Workbench 作者仓的两个缺失运行 peer 与构建守卫，均未提交。原七包官方安装/配置生成通过，原 Workbench 宿主导入失败；补齐 peer 后的独立诊断完成开启、原生关闭、恢复及合成会话持久化，不抵扣正式候选验收。Workbench 本地 Linux 严格构建及 196 项包测试、主仓 114 项定向开发回归通过。下一步先审查并按授权提交修复，再从干净新提交生成新的正式包和身份链；live CLI reload、默认源码 pipeline、CRM/Knowledge 完整组合、当前候选服务/目标/浏览器/正式回退及真实业务仍未关闭。candidate `591134e8…` / journal seq 3 未改。见[宿主修复证据](evidence/shinemage-official-pack-host-closeout-20261011.md)及[此前准备证据](evidence/shinemage-profile-pack-migration-20261011.md)，不勾完父任务，不删除旧副本，SDK BLOCKED / PARTIAL / release_ready=false 保持。

PR [#111](https://github.com/tyuanww/fuqing-crm-analytics/pull/111)、文档收口 PR [#112](https://github.com/tyuanww/fuqing-crm-analytics/pull/112)、post-merge 文档 PR [#113](https://github.com/tyuanww/fuqing-crm-analytics/pull/113)、post-merge r2 文档 PR [#114](https://github.com/tyuanww/fuqing-crm-analytics/pull/114)、清理状态文档 PR [#115](https://github.com/tyuanww/fuqing-crm-analytics/pull/115)、事实修订 PR [#116](https://github.com/tyuanww/fuqing-crm-analytics/pull/116)、并行收口审计 PR [#117](https://github.com/tyuanww/fuqing-crm-analytics/pull/117) 和主线事实同步 PR [#118](https://github.com/tyuanww/fuqing-crm-analytics/pull/118) 均已合并；当前远端主线为 `4859d136`，完整 SHA 和最新 post-merge CI 见[远端事实记录](evidence/shinemage-remote-repository-postmerge-r4-20261011.md)。PR #118 合并后的 `main` CI run `38066459376` 中 `changes`、`test`、`lint` 和 `merge-gate` 通过，不适用路径保持 skipped。**PR #111 的**最终 preflight、B0、全量测试、前端、lint、依赖审计、合同检查、Docker smoke 和 merge-gate 均通过，`ground-truth-lint` 按既定条件跳过；`open-code-review-delegate` 对应 PR #111，已覆盖 403/403 个可审文件，发现的 2 个 High 与 1 个 Medium 已修复并复验。SDK 分发仍 BLOCKED，产品仍 PARTIAL，release_ready=false；发布、部署和正式分发仍未执行。

主仓现在作为 DSH 集成仓，九个插件已有独立远程仓；最新 PR/CI/Release 状态见[远程仓收口复核](evidence/shinemage-plugin-remote-closeout-20261010.md)。正式物理分仓仍按 stop/go 约束推进。当前主线事实和 post-merge CI 见[最新 post-merge 远端事实](evidence/shinemage-remote-repository-postmerge-r4-20261011.md)。单插件更新的逐步操作见[插件更新指南](../operating/shinemage-plugin-update.md)，DSH 版本升级、证据留存与本机/远程清理见[维护、清理与升级手册](../operating/shinemage-maintenance-and-cleanup.md)和[本次清理证据](evidence/shinemage-local-cleanup-20261010.md)。DSH 最新公开升级候选与兼容阻塞见[升级盘查](evidence/shinemage-dsh-upgrade-audit-20261010.md)，SDK 门禁矩阵见[SDK 收口盘查](evidence/shinemage-sdk-gate-closeout-20261010.md)，当前 candidate 的正式准入缺口见[准入预检](evidence/shinemage-formal-admission-preflight-20261010.md)。11 个历史候选已完成归档和本地清理，三个已合并远程候选分支也已删除；T14、RC2、公共 main、SDK/证据归档和未跟踪的独立 `security-audit-skill/` 继续保留。

### 2026-10-08 ShineMage A/B/C 集成本地接续

最新：集成源码已本地提交 `bd647352`，新 candidate `993daf31…` / journal seq 2 已通过身份及摘要链核对，状态 **CANDIDATE_PREPARED**。只关闭此前 NOT_LINKED 的本地准备子项；针对新候选的服务/宿主、正式 CI 与激活仍未关闭，SDK BLOCKED / release_ready=false；不勾完父任务。见[本次证据](evidence/shinemage-abc-local-candidate-20261008.md)。下文保留候选准备前的执行阶段。

按既有顺序已完成固定环境、完整本地 B0（默认 8 SKIP）、三个原字节归档、服务专项 28 PASS / 0 SKIP。五项里的官方 shell/tool 已显式跑过：**12 PASS / 0 SKIP**，内部 25 场景 PASS。当前配方查询冷安装已用新回执通过：**3 PASS / 0 FAIL / 0 SKIP**，绑定 `e577f41…` / `ddb70716…`；历史 `kernel-pack-r2` 未改。standalone example 仍缺页面包。当前 ABC candidate/journal 仍 **NOT_LINKED**，正式 CI 仍 **NOT_RUN**。记录见[接续](evidence/shinemage-abc-resume-20261008.md)、[剩余准入](evidence/shinemage-abc-remaining-20261008.md)、[当前配方查询包](evidence/shinemage-abc-kernel-current-20261008.md)。不重排任务或勾掉整个 T15/T17/T18/T19；原始工作树与历史失败保留，SDK 分发和真实业务验收分别关闭。物理分仓、各仓 CI/发布与 DSH 升级继续受既有 stop/go 约束。

同日并行收尾只关闭具体子项：HTML 六项外审中五项 complete，剩余探针不再第三次续跑；固定包原生 200% 重排观察已收录。SDK `EMBED-INLINE-BYTES` 证据账本 PARTIAL，默认校验仍 NOT_VERIFIED，八条顶层门禁未新增 PASS。见[集成记录](evidence/shinemage-parallel-closeout-20261008.md)，不勾完 T5/T14/T15/T19，不改变 candidate/journal、CI 或生产准入。

SDK既有字节缺口另有实际补证：graceful-fs补丁重放一致，195/196个唯一tarball摘要匹配、202/212条安装记录按原文或固定补丁对齐；余下10条及发布者身份等父门禁保持开放，见[证据](evidence/shinemage-sdk-byte-closeout-20261008.md)。不新增任务、不勾完T5/T15/T19。

### 2026-09-26 DSH RC1、产物收件箱与杭州发布

公共 `main @ 47f49616`、VERSION `0.18.0.0`、固定 DSH `0.1.7-rc.1` 已合入并部署杭州；候选插件不修改 DSH 上游。产品仍 PARTIAL。

- [x] Artifact Inbox 持久化、幂等去重、候选确认/丢弃及正式页面隔离。
- [x] 自由 HTML、原生 `write/edit/present`、事件/轮询统一登记到收件箱。
- [x] 收件箱 UI、候选预览/确认、结构化样式与局部 patch 守卫。
- [x] B0 完整 pipeline、构建、类型检查和插件测试通过；清理目录有界且自动回收。
- [x] PR #59、main CI、杭州 CRM/DSH/WeKnora 切换、Cloudflare 入口和生产 DuckDB 备份已完成。
- [x] 隔离合成环境的 Playwright headed 旅程（页面生成/预览、数据绑定、局部编辑、保存新版本、回滚、脏数据离开保护）已通过；fixture 的生成步骤走 live adapter fallback，证据不是 Artifact Inbox 浏览器链路、生产 DSH shell 或真实业务数据。
- [ ] 完整 DSH shell/生产收件箱→预览→局部编辑→保存旅程及本人 UAT；尚未执行，不是因为缺 Chromium，而是生产壳和真实业务闭环仍需本人验收。
- [ ] 本人完整 UAT；真实模型逐格式编辑、P13、扫描 PDF OCR、复杂 Office、图谱剩余语义核对继续开放。

### 2026-09-21 HTML 卡片文案与块级 AI（本地候选）

工作树 `codex/cockpit-inline-edit`，基线公开 main `d521051c`（#38 / 0.14.0.0），候选 VERSION 0.15.0.0。[施工记录](./COCKPIT-PRESENTATION-2026-09-21.md)。

- [x] presentation 记录、手动卡片文案、页内 AI 要求与右栏统一预览。
- [x] OCR 46/46、4 处确认问题已修。
- [x] 相对公开 main `d521051c` 快进；#38 路径与本候选无重叠。
- [x] 变基后接触面复测：Node 45 passed、Python 17 passed。
- [x] 合成 backend 2873 passed / 77 skipped；B0 pipeline PASS。
- [x] 真实 MiniMax-M3 五项合成选区评估 PASS。**Completed:** v0.15.0.0（2026-09-21，代码交付）
- [ ] 本人 UAT。
- [ ] 合入后把本候选加载 6677。

### 2026-09-21 三候选整合（已合 #38）

工作树 `codex/crm-analysis-board` 成果已由 [#38](https://github.com/tyuanww/fuqing-crm-analytics/pull/38) 合入 `d521051c`，VERSION 0.14.0.0；6677 已加载该版本。CRM 18093 仍为 archive 实例。[整合记录](../crm-calibration/crm-integration-2026-09-21.md)。

- [x] 并入分析检索/分页/编辑、账号分享撤销、独立组板，保留登录/取消/逐次鉴权与组板布局修复。
- [x] 并入 dashboard-readiness / membership / net-gsv 合同、插件工具与合成测试；缺来源仍不可用。
- [x] 并入图谱账本、文档版本/分块哈希、账号 grants，以及原生 Host 卸载与候选 `weknora_search` 隔离。
- [x] 含知识引用的分析在保存/分享/读取/列表/组板/驾驶舱加入时重查当前文档权限；纯指标分析不绑教材。
- [x] 本地代码与专项测试已收口为 v0.14.0.0 候选。**Completed:** v0.14.0.0（2026-09-21，代码交付）
- [x] Git 合入与 6677 运行切换（代码 0.14.0.0；18093 仍为 archive_dashboard）。**Completed:** v0.14.0.0（2026-09-21）
- [ ] 成交时会员身份、成功退款流水、可重算首购、派样资格与成本；图谱其余 1113 条核对与抽取哈希。
- [ ] P13、逐格式真实模型编辑、真实历史/业务文件和本人 UAT；扫描 PDF OCR、复杂 Office 兼容及 PDF 浮动菜单异常。

### 2026-09-21 CRM 分析管理与可编辑组板

基于新公开仓库 main，已由 #38 合入 `d521051c`。HTML 动态卡片编辑仍在独立工作树 `codex/cockpit-inline-edit`。[本轮记录](../crm-calibration/crm-analysis-board-2026-09-21.md)。

- [x] 历史分析搜索与分页，超过最近 20 条可续页定位。
- [x] 编辑标题/说明；金额、分母、口径和原始快照不可变；重查生成新快照。
- [x] 受控分享给 `FQ_CRM_PASSWORDS` 中的明确账号，支持撤销；跨账号拒绝，撤权后旧会话不可读。不生成公开链接。
- [x] 独立 CRM 组板：选择指标、布局和展示属性；保存/取消/版本冲突/刷新重开。组件绑定快照、指标和筛选，模型不能提交金额。
- [x] 合成后端、CRM 专项 verify、编译后 React、原生 Host 与 Chrome 旅程已在本工作树跑过。**Completed:** v0.14.0.0（2026-09-21，代码交付）
- [x] Git 合入与 6677 运行切换（代码 0.14.0.0；18093 仍为 archive_dashboard）。**Completed:** v0.14.0.0（2026-09-21）
- [ ] 多人文档 ACL 已在整合候选接线；图谱全图语义审核与原文同版本、会员/退款/复购/LTV/派样来源仍开放。
- [ ] P13、逐格式真实模型编辑、真实历史/业务文件和本人 UAT；扫描 PDF OCR、复杂 Office 兼容及 PDF 浮动菜单异常。

### 2026-09-21 已合三步（CRM 分析持久化，#34）

基于新公开仓库 main `106717e6`，已由 #34 合入 `73ee74c`；[交付记录](../crm-calibration/crm-assets-release-2026-09-21.md)。原工作树成果保留。

- [x] 复用已合 #11 的 AOV/AUS，遵循正额订单/买家分母；已确认短日期窗口只读独立聚合闭合。
- [x] 可信快照 → 账号私有分析 → 驾驶舱固定引用；专项后端、Node、原生 Host、合同/类型/构建通过。
- [x] 测试浏览器使用 macOS mock keychain；P12 单次导航修复，新公开主线候选完整 B0 已通过。
- [x] 新公开主线候选完整门禁、合成浏览器 QA、提交/推送、PR #34 CI 与合并。完整后端 2810 passed/77 skipped/71 deselected；B0、Node/Host 及浏览器证据分层记录。**Completed:** v0.12.0.0（2026-09-21，代码交付）
- [x] #34 main CI 通过；保留历史/依赖环境的现役切换与旧版实际回退通过，68 个既有运行文件及文档版本/回执保留。**Completed:** v0.12.0.0（2026-09-21，运行切换）
- [x] 用户重新登录后，真实 MiniMax 完成 AOV/AUS 查询及可信快照，界面确认保存→驾驶舱引用→刷新重开及全局驾驶舱入口通过；独立 SQLite 连接回读同一记录，与只读独立聚合一致。**Completed:** v0.12.0.0（2026-09-21，单个已确认短窗口；不代签本人 UAT）

### 2026-09-20 CRM 指标、知识与原生对话登录（v0.12.0.0，已合#216）

- [x] 独立插件、当前对话内存登录授权、现看板 GSV 兼容查询、三类受控合成查询及离线知识解释已交付候选代码；功能 `3318d7f0`、版本 `9b110efe` 已普通推送。**Completed:** v0.12.0.0（2026-09-20，代码推送）
- [x] 共享完整合成后端2762 passed/77 skipped，候选84项后端/54项Node/18项原生Host及Ruff/合同/类型/构建通过；重叠层级不相加。公开说明见 [CRM交付范围](../crm-calibration/public-release.md)。
- [ ] 本条保存分析缺口已由上述新候选接续；完整D019映射、旧服务迁移、多用户私有ACL仍开放。真实GSV、文档检索和教材图谱的局部模型验收已补，见[图谱部署](../crm-calibration/graph-deployment.md)，不再整体记为未部署图服务。
- [x] #216已合 `2650b64e`，随后#217已合 `7c20bc4f`。本轮以本地Git核验合入事实，未核验远端CI；合并不等于真实业务闭环。

### 2026-09-20 历史产物与多格式编辑（v0.11.0.0，历史记录）

以下保留当轮候选验收；该轮代码现已合入 #215，不能代签本轮 CRM 验收。

- [x] 历史会话冷读、来源搜索/去重/分页、部分失败提示及手动 HTML/Word/XLSX/CSV/PDF 添加已实现，保留原件与独立版本。
- [x] 本机 Docker ONLYOFFICE 9.4.0 与 DSH 原生 Loop 副本任务接通；候选固化、只读预览、显式确认及 CAS 回执闭环已实现。使用见 [Office](../operating/cockpit-office-local.md) / [AI 修改](../operating/cockpit-ai-edit.md)。
- [x] 前轮手动编辑与合成 AI 候选浏览器证据保留；本轮共享矩阵2678 passed/77 skipped/71 deselected，B0另567项Python及所选Node/DOM/类型/契约/构建/干净重建通过，两个层级不相加。见 [Ship记录](COCKPIT-SHIP-2026-09-20.md)。
- [x] 功能 `e90af23a`、版本/验收 `5df9c315` 已普通推送至 `codex/cockpit-history-import`；hooks及Git LFS保留。**Completed:** v0.11.0.0（2026-09-20，代码推送）
- [x] 该轮已合 [#215](https://github.com/weiweity/fuqing-crm-analytics/pull/215)，基线 `db582173`；远端CI与运行验收仍按各轮证据判断。**Completed:** v0.11.0.0（2026-09-20，Git合入）
- [ ] 真实原生模型逐格式修改（当前 `MISSING_CREDENTIAL`）、P13、用户真实历史/业务文件及本人UAT仍开放；扫描PDF OCR、复杂Office兼容及PDF浮动菜单异常保留。
- [ ] 本轮现役切换未执行；产品PARTIAL，原全量Goal仍PAUSED。

### 2026-09-19 驾驶舱 V2（v0.10.0.0，已合 #214）

- [x] 接管 Grok G01–G04 累计未提交成果，保留同一 codex/cockpit-v2-kernel 工作树，基线 c0f47a24。
- [x] C01/C02：响应式壳、真实来源入柜、HTML 显式副本/精确改字、看板字段 PATCH、统一离开保护已实现。
- [x] C03：本地验证、截图与文档收尾完成，B0聚合/合成后端/隔离浏览器通过；结果见 [本轮交付](COCKPIT-V2-LOCAL-2026-09-19.md)。
- [x] 修复本地审查确认的五处缺陷，补针对性回归与真实浏览器主链。
- [x] v0.10.0.0 的三笔代码/版本提交已推送至 codex/cockpit-v2-kernel，候选 `1da06ba1`；正常 hooks 通过，按用户要求跳过追加代码审查。**Completed:** v0.10.0.0（2026-09-19）
- [x] V2 已随 [#214](https://github.com/weiweity/fuqing-crm-analytics/pull/214) 合入 `f9070431`；该Git事实不代替本轮0.11.0.0模型/业务验收。**Completed:** v0.10.0.0（2026-09-19）
- [x] 上轮已将 #214 加载至6677；真实模型/业务及用户UAT仍按各轮证据判断，不代签本轮新增功能。
- P13 原首场失败和后两场 NOT_RUN 不变，整体 PARTIAL；不重开下方历史已关账项。

### 当前停点与 Git 收尾

- [x] P1/#131：owned 启动器可靠性已合入。
- [x] P2/#132：13 文件计算事实包及 R4 数值接受规则已合入；不要重新提交原树中的旧 P2 快照。
- [x] #133：仓库专属 `ship-pr` 曾纳管；现已移除，交付按根 `AGENTS.md`、GitHub PR 门禁和实际授权执行。
- [x] P3/P4 + AI-1/#134：107文件组合包已合入 `12a21de`，PR及该main CI均通过；含已复核的S1-A解释器便携性补丁，不重复发返修卡。不是M1／S2完成。
- [x] P5文档整理：按 document-release 更新当前入口、变更记录、未完成项，由独立文档PR交付；PR合并状态以实际Git回执为准。
- [x] S2-C1/#136：同会话 `saved_boards` 已合入 `b7dbc7b`。PR CI 通过；该 main CI 首次 `b0-contract-build` 失败后重跑通过，失败记录保留。有界合成措辞复验已做；本人 UAT 与合入后运行验收仍 NOT_RUN。不是 M1／S2 完成。
- [x] R-1/#153：生成配置预检已合入 `698278e`。有界真实模型 3 次＋Chrome 预览取消通过；TABLE `show_values` NOT_OBSERVED。不是 M1／S2 完成。
- [x] 侧栏比赛看板入口/#155：已合入 `27052fab`。[#157](https://github.com/weiweity/fuqing-crm-analytics/pull/157) 将默认前端口改为 `15173`（`fce2de83`）。Chrome 已见链接。不是 M1／S2 完成。
- [x] 本地清理：空闲树/已合分支已删；15173/8000 迁到 `main-runtime` 后拆 docs-155。原仓 `HANDOVER-CODEX.md` 保留。S4/S5 文档已写。G1–G6／U1 见下方验收门槛（G3 已现场）。
- [x] 驾驶舱人群行动入口/#166：已合入 `b78beffa`。PR CI 与该 main CI 均成功。合入不等于 6677 reload 或正式 release。不是 M1 完成。
- [x] 比赛看板品类脱敏/#165：已合入 `308180fd`。界面唯一 display_name、筛选仍用原名；羊毛证据分与流失 hazard 已随 PR。Q3 overlay 已灌（订单/首购/访客）；`fill_user_rfm=0`。不是正式 release。不是 M1 完成。

S2-C1 代码已合。其余五类编辑、LINE 换数与当前模型板回退的**真实模型验收**已于 2026-09-14 在本机 6677 完成；9 月 15 日接续 S3 原型与正式壳验收，见 [首批记录](S3-ACCEPTANCE-2026-09-15.md) 与 [交叉补验](S3-CROSS-MATRIX-2026-09-15.md)。R-1 代码已合 #153；UAT 不在同一轮顺手扩修。

### 阶段接续

2026-09-15 当前增量：[R-1 生成配置错误恢复](R1-GENERATION-RECOVERY-2026-09-15.md)已合 [#153](https://github.com/weiweity/fuqing-crm-analytics/pull/153)（`698278e`）。历史“FUNNEL 422”定位为 LINE/TABLE 重叠。有界真实模型 3 次：问数通过；第一次生成因观察器把 `llm/retry` 当失败中止；重试命中 `COMPONENT_OVERLAP` 预检，FUNNEL 保留，未保存 6 块预览后 Chrome 取消。TABLE `show_values` NOT_OBSERVED。不据此关闭 S2/M1。

| 阶段 | 已有证据 | 尚需完成 |
|---|---|---|
| S0/S1 基线与装配 | Git／工具链／构建与同实例看板协议；已授权窗口的真实重载与模型连通 | 不重跑同题，不要求重新配置模型；下一次运行切换另核维护窗口 |
| S2 真实 AI 核心链 | 六类自由组板；METRIC 标题修改取消／确认 v2／刷新重开；生成快捷入口；S2-C1 已存板 catalog（#136）；2026-09-14 其余五类编辑、LINE 换数、当前模型板回退（预览→取消→重提→确认→重开）；R-1 重叠预检与 FUNNEL 保留（#153） | 不把本次运行写成 G1 勾选或 M1 DONE；TABLE `show_values` 现场未复现 |
| S3 设计与实现对齐 | 指定 Figma 矩阵通过；B3 核心分支双视口、12 次忙态恢复按钮实点已完成。窄屏覆盖导航／错误提示修复随本批代码交付，B0 完整检查与干净重建通过；真实 Chrome 通过窄屏开关、中文错误、只读拦截预检及桌面取消定点复验，当前仍 v15，未新增保存版本 | 85 历史跳转未定因，本轮未复现；取消拒绝新文案为状态回归，未重复真实落盘故障；整体 PARTIAL。详情见 [界面修复](S3-UI-REPAIR-2026-09-15.md)；不重跑完整 B3 矩阵 |
| S4 综合 QA | 候选钉死见 [S4](S4-QA-2026-09-15.md)。2026-09-16 本候选 G1–G6 现场／交接已补；G3 现场确认保存见下方门槛 | T16／触控另账。6677 现加载 0.9.0.2 journal 插件，不要用会编原仓的官方 `reload` |
| S5 交接入口 | 6677／15173／8000／18082 本轮探活；回退、合成范围、拒绝边界与三条 UAT 路径见 [S5](S5-UAT-HANDOVER-2026-09-15.md)。U1 本人 2026-09-16「通过」。G6 2026-09-16 交接确认。人群行动入口已合 #166 `b78beffa`。比赛看板品类脱敏已合 #165；文档 #169 `25ffc1f7`。Q3 overlay 已灌（订单/首购/访客）；`fill_user_rfm=0` | 4325 历史入口不作当前交付。正式 release 另账 |

9 月 13 日真实模型证据：S2-A 为 3 prompt／9 step／7 工具，GSV 仅问数一次；S2-R2受控批次为 5 prompt／11 step／6 工具，0新增问数。另一次人工中止、无完整回执的轮次不计通过。两次 remote 注入失败保留为历史，现已修复。9 月 14 日 S2-C1 有界复验 5／6 次调用，见 #136。同日在已加载原仓插件的 6677 上完成 V-A1–A5／V-B1／V-B2；本机账本 `.context/checks/va-a1-a2-20260914/RESULT.md`（不进 Git）。终态原板 v8（ROLLBACK），说明板 v2。不代签 UAT。

### S2-C1 方案 B（已合 #136）

- [x] 只读定位：UI／SQLite原板为 APPLIED/v2，未覆盖；确认动作未进入原生会话，下一轮 catalog 不含已存板状态。模型把历史 PREVIEW_READY 当当前状态，不是存储丢失。
- [x] 在目录上下文增加**同权限、同会话**的 `saved_boards` 摘要（`board_id`/title/version）。当前 owner 最多扫描 500 个 head、返回 20 条；没有独立续页游标（`next_offset` 只分页问数结果）。状态为 complete／truncated／unavailable／unknown；不可用时省略 `saved_boards`。不返回整份 facts，不跨会话泄露。
- [x] 方法包与生成快捷入口明确“已保存不是草稿；GENERATE 是另一份未保存新板”。不自动 queue/steer，不加模型 confirm 工具，不改 GENERATE 新 board 的语义。
- [x] 隔离红→绿与有界真实复验：已存 v2 出现在 catalog；确认前预览不进已保存列表；新 GENERATE 不覆盖原板；取消后原板仍为 v2。权限／会话隔离与损坏 head=`unknown` 由合成测试覆盖。本人 UAT 不能代签；合入后的 6677 运行态未切到 `b7dbc7b`。

原定位正文位于本机 `.context/checks/ai-cockpit-goal/s2-c1-investigation-m3vN9c/RESULT.md`，不作为公共可访问证据。TABLE/FUNNEL 生成 422 与越界工具尝试不在本卡扩修。

### S2 其余真实模型用例（2026-09-14 已跑，文档收口）

每例覆盖预览→取消不变→重提→确认→重开。样式步问数回执增量为 0；换数核新 `result_id`。取消新数据提案不撤销已执行查询。本机证据不进 Git。

| 类型 | 结果 |
|---|---|
| LINE 图例 | [x] `show_legend` true→false；邻块不变；未再问数 |
| BAR 标签 | [x] `show_values` true→false；410/305 不变；未再问数 |
| TABLE 列 | [x] `columns=[]→["period"]`；未编造占比 |
| TEXT 正文 | [x] 本实例无 TEXT，先 GENERATE 说明板再改正文；`source_result_id` 仍 null；未覆盖原板 |
| EVIDENCE 摘要 | [x] 只改 `summary`；8 条 evidence items 深比较相等 |
| LINE 换数 | [x] 新结果 15 点／180；仅换 LINE 来源；取消后原板仍绑 31 日结果 |
| 当前模型板回退 | [x] 预览回退 v6→取消仍 v7→确认 v8 `ROLLBACK`；catalog 认已存 head |

METRIC 标题路径仍以 S2-R2 为准，不重复计新成功。R-1 代码已合；TABLE `show_values` 与 bash 越界本轮未复现。Figma 指定矩阵于 9 月 15 日通过，不能替代正式壳验收；[首批记录](S3-ACCEPTANCE-2026-09-15.md)保留注错未命中与白屏历史，[交叉补验](S3-CROSS-MATRIX-2026-09-15.md)记录核心分支与按钮实点、85 导航异常及 88 阻断未生效的设置失败；当前只读回读为同正文 v15，原板 v9。

### M1 验收门槛

- [x] G1 真实 AI：2026-09-16 本候选 6677／DeepSeek-V41-Flash High。自然语言六类组板新板 `board_a9bdb747bd6948708d7c152db7b5b9ab`；METRIC 标题 + TEXT 正文 + EVIDENCE 摘要 + BAR `show_values=false` + LINE `show_legend=false` + TABLE `columns=["period"]` 均预览后确认到 v7。说明板仍 v15、原板仍 v9。LINE 换数／回退未重跑，不挡本条。证据 `.context/checks/g1-20260916/`（不进 Git）。
- [x] G2 数据与范围：隔离链仍以 S4 为准。2026-09-16 现场 18082：同版两预览一胜一 409；无 token／假 token 401，现用身份仍可读；跨 session context 不列出本板，错误 session 提案 404。说明板 v15／原板 v9 未动，新板 v8。证据 `.context/checks/g2-20260916/`。未 revoke 现用 token。
- [x] G3 保存恢复：2026-09-16 6677 现场。新板 TABLE 布局预览取消后 HEAD 仍 v8；确认后 **v8→v9**。陈旧 `base_version=8` layout-preview HTTP **409 `VERSION_CONFLICT`**。回退预览到 v8 出现 v10 草稿后取消，HEAD 仍 v9。未知字段 422 `INVALID_REQUEST`；TABLE 非法属性 422 `INVALID_BOARD`。说明板 v15／原板 v9 只读重开，未点生成。layout-preview 的幂等 key 未合并成同一草稿，只证明预览不落盘。证据 `.context/checks/g3-20260916/`（不进 Git）。
- [x] G4 原生体验：2026-09-16 6677 现场。分割条 ArrowLeft 调宽、收起／展开原生对话、折叠侧栏、布局方向键重叠拒绝后取消、换会话关闭驾驶舱；同一 runtime `--plugin off` 再 `on`（未 `--fresh`，不用官方 `reload`）。热插拔后现役 PID **14287**，已存板 v15／新板 v9／原板 v9。证据 `.context/checks/g4-20260916/`（含 `pid-84036/`）。不代替 G5。
- [x] G5 设计可用性：指定 Figma 矩阵仍以 S3 为准（不重跑 B3）。2026-09-16 本候选：六类目录 node-id 与 Figma 母组件五态存在；390 覆盖导航；长文／31 点折线／表分页可滚；Tab `:focus-visible`。PID **14287**／新板 v9 复核：画布 1328>650、LINE「共 31 条」、只读重开 v15／原板 v9。空下拉本 PID NOT_OBSERVED。证据 `.context/checks/g5-20260916/`。不代替 T16 容量或触控／读屏；局部通过仍不能当正式视觉通过。
- [x] G6 工程交接：2026-09-16 交接确认后，热插拔现役 PID **14287**、remainder `0d7df006`、origin/main `04f16604`、新板 **v9**。TABLE 无 show_values、401／409 拒绝、SQLite backup→restore-sandbox（未覆盖活库）仍有效。U1 已签。证据 `.context/checks/g6-20260916/`。不代替正式 release。
- [x] U1 用户本人 UAT：2026-09-16 用户对 S5 三条路径明确「通过」（分析师读说明板 v15／原板 v9，运营 6677「人群行动」且自动发送禁用，老板无新模型只读合成）。Agent 不代签；本条据用户当轮口头确认记账。

M1 DONE 要求 S0–S5、G1–G6具备对应证据；U1、Git交付、M2和原全量Goal分别记账。已知越权、错误数字、数据丢失或M1公开操作的焦点问题不能后置。

### M2 扩库完善

- [x] PROCESS／TIMELINE／WATERFALL／FUNNEL 目录、渲染与保存链及隔离浏览器分项已有。密集 FUNNEL 板已记。未知金额 WATERFALL 按合同 422。2026-09-17 用户确认完整属性／整板编辑／Figma／真数据瀑布保持缺口也算关。现稿是旧 Vue 董事会，不是 DSH／M2 扩库稿。**不是 Figma 通过、不是真数据瀑布。** 不删除实验成果。
- [x] 其他公共样式变体、完整触控／读屏器、多层极端滚动及容量性能矩阵：2026-09-17 用户确认缺口也算关。390 a11y／触控尺寸已记，不是真机读屏。不得用2000行边界测试代替性能结论。**不是容量／触控通过。**
- [x] 已知 low UX：唯一已保存板仍需下拉选择。2026-09-17 用户确认不自动打开、缺口也算关。不混入收尾。

### 协作与接班

由用户人工转发有边界任务给 Grok Build，再贴回结果，主 Agent 核对基线／差异／测试后接收；不默认另起模型或递归子 Agent。任务卡须含 cwd／branch／base与文件指纹、可写范围、验收、禁区和证据位置；共享入口、合同与 Figma 母组件单写。主 Agent 唯一维护 STATUS/TODOS并整合结果，模型配置不随开发协作工具改变。

接班读 AGENTS → STATUS → 本节 → 当前任务及必要证据；涉及视觉再完整读 DESIGN。原本地长记录已私有备份，失败证据不回写，本文件仅维护当前接续。不提交 HANDOVER、不改 DSH 上游、不碰真实大库；任意脚本、飞书真操作与公网部署另定范围。

## 已合施工队列（历史短 PR）

- [x] #116 文档入口，对齐施工边界
- [x] #117 L4.91 R3 白名单：`member_join_rate` / `ly_member_join_rate` 展示 `*100`
- [x] #118 main DSH 钉升级到 0.1.5-rc.1；本地 0.1.3 checkout 已删
- [x] #119 访客入会率 API 0-1 raw，前端水平值 `*100`
- [x] #121 GSV SSOT：`calculations.GSV_PREDICATE`，filters/metrics 生产路径不再各写一份
- [x] #122 DQ 本地告警：断言与监控失败时发出可观测本地告警，不回接飞书
- [x] #124 聊天下「生成驾驶舱」：`conversation.input.dock` 打开 overlay 并落到认可成板
- [x] #125 T13 可重放离线 eval：`result_id ≠ run_id`、拒答文案、`money_unit`。不代替真实模型复测
- [x] #126 侧栏固定入口：`sidebar.panellist` / `main` key=`cockpit`
- [x] #127 dsh-dev 收进 main：6677 从 main 起；`--plugin on/off` 插拔伸美包。市场/IM 是另装的包，不是上游
- [x] #129 驾驶舱按 BoardSpec 生成：确认写入、`result_id` 绑数字、沙箱无脚本、侧栏样例板。合入 `main` `a729ff6`（v0.8.0.0）

## 当前验收缺口（开放，需对应证据）

- [x] 首次启动保存反馈历史误报：2026-09-16 含 `--fresh` Continue 共 5 次未复现。文案是 DSH `welcomeError`，竞态在上游 `welcome-store.ts`，本仓不改。本候选关账：**未复现，不是修好**。证据 `.context/checks/first-start-misreport-20260916/`（不进 Git）。
- [x] 完整 T13：分项取证已有。2026-09-16 本候选有界复测 + 会话中途断网／401 + 小型 DuckDB 6 用户。2026-09-17 用户确认 `diag.fixed_cohort` 保持 UNSUPPORTED 也算关。131GB 未开。证据 `.context/checks/t13-20260916/`（不进 Git）。不是真实经营成板。离线 eval 不代替已记账的真实模型复测。
- [x] T15：分析师 / 运营 / 老板 S5 三条路径，2026-09-16 用户本人「通过」。不要用 4325／15173 代替运营。不是公网或真实经营验收。
- [x] T16：2026-09-16 合成基线 18082 GET 480/480，c1／c5 各 30 到达；多板；results 分页；6677 1440 五次 reload FCP 中位 92ms。未重启故非冷启动。大候选 0 行／131GB 未测。2026-09-17 用户确认基线也算关。**不是 SLO 通过**。证据 `.context/checks/t16-20260916/`（不进 Git）。
- [x] T17：2026-09-16 视口／设置／等价表；随后 Stop／compact 实跑、a11y 树／390 触控尺寸。2026-09-17 用户确认缺口也算关：真机读屏／触控 NOT_RUN、4328+18084 native Stop 未在本候选重跑（不抢 6677 锁）、DSH 壳无批准 Figma。证据 `.context/checks/t17-20260916/`、`t17-compact-stop-20260916/`、`t17-remainder-20260917/`、`t17-complete-gaps-20260917/`（不进 Git）。不是正式视觉通过。
- [x] 本机正式候选 **v0.9.0.0**：环境 127.0.0.1:6677／15173／18082／8000；G6 sqlite backup 演练已有；`--fresh` 后切回原 runtime 关键路径已核。**不上公网**。产品仍 PARTIAL。见 [LOCAL-RELEASE-2026-09-16](LOCAL-RELEASE-2026-09-16.md)。
- [x] 原 App 全量 Goal：仍 PAUSED。2026-09-17 本候选明确不恢复旧 Vue 全量 CRM。**不是 Goal 完成**；恢复须另开 Goal。
- [x] 功能包清单：[FEATURE-PACKAGES](FEATURE-PACKAGES.md)。卸一个功能应带走 UI＋合同＋对应 FastAPI，而不是只卸大插件壳。
- [x] 品牌覆盖拆到 `dsh-plugins/shine-brand`（`@shine-mage/dsh-shine-brand`）。默认随 `--plugin on` 安装仓库内品牌包；`--shine-brand off` 可单独卸。`--plugin off` 两个都关。驾驶舱 h2／logo mark 仍在 workbench。
- [x] WATERFALL 拆到 `dsh-plugins/shine-waterfall`。默认随 `--plugin on` 安装；`--waterfall off` 可单独卸。422 测试随包。几何仍随 workbench bundle。
- [x] 人群行动入口拆到 `dsh-plugins/shine-crowd-action`。默认随 `--plugin on` 安装；`--crowd-action off` 可单独卸。ActionsWorkbench 仍随 workbench bundle。
- [x] 问数／组板拆到 `dsh-plugins/shine-query` 与 `dsh-plugins/shine-board`。`--query off`／`--board off` 可单独卸。实现仍随 workbench bundle。
- [x] FUNNEL 拆到 `dsh-plugins/shine-funnel`。默认随 `--plugin on` 安装；`--funnel off` 可单独卸。几何仍随 workbench bundle。
- [x] 比赛看板继续独立 15173（`frontend-vue3`），不进 DSH 组合。页脚外链。不改 DSH 上游。不把 131GB 收进插件。

历史局部通过项见 [维修 QA](./COMPETITION-REPAIR-QA-2026-09-10.md)。完整 T13／T16／T17、M2（含其余）、首次启动已按缺口／基线／未复现收口。原 App Goal 仍 PAUSED。产品仍 PARTIAL（公网／正式 release）。功能包拆分清单已写，迁代码另授权。

## 已在 main 的证据（不要当成未完成任务）

- [x] #112 集成、#114 七项修复、#115 持久化诊断看板、**#116–#129**已合入 main；#166 人群行动入口已合 `b78beffa`（当前 HEAD 见 STATUS）。#129 为 BoardSpec 驾驶舱 v0.8.0.0。
- [x] 图表类型持久化与草稿恢复/放弃。
- [x] 原生浅/深色与业务主题、AntD 表单；完整 T17/视觉仍开放，见[视觉增量](PRODUCT-VISUAL-INTEGRATION-2026-09-10.md)。
- [x] GSV 数值诊断 → 保存 → 成板（合成源）；两条真实 DeepSeek 评测及刷新重开，见[本轮交付](DIAGNOSIS-INTEGRATION-DELIVERY-2026-09-10.md)。
- [x] 原生停止、文件权限/审批、目录与 preset、单位来源 v2、result_id/run_id 分项，见 PRODUCT-READINESS 及 COMPUTED-UNITS 文档。

自由诊断、认可后批量成板、拖拽缩放与聊天编辑、自有比赛品牌、召回候选预览及行动草稿已进入 [总计划§12](./PLAN-CLOSEOUT-2026-09-05.md)。真实人群、旧 CRM catalog 和 MCP 各按自身证据判断。

## 延期（独立授权，默认不做）

### 网址提交与访问控制

选择公网平台、访问控制并获得部署授权。用户已暂缓公网。未授权则报告阻碍，不公开免登录本机。

### 页面令牌移出 HTML

驾驶舱不再把页面接口令牌写进 HTML。浏览器只访问同一个主机名，由 6677 代转 18091。已登录 `app.tyuan.chat` 的人仍能从网页源代码看到令牌；未登录访客已经被挡住。升级前不要放宽 CORS，不要把 18091 绑到本机以外。P3，不挡当前上线。

### HTML 可视化编辑的多步撤销／重做

编辑器已有版本化候选、取消预览和版本回退；统一展示/源码/逻辑操作的会话内多步撤销／重做仍未在驾驶舱 UI 暴露。删除和移动需要可靠的逆操作，不能把重新执行旧的 AI 输出当成撤销。不挡当前驾驶舱交付。

### 认可分析的定时刷新与投递预览

单调度器 REFRESH 与 fake delivery；真实飞书投递另批。本提交版不实现 subscriptions API。

### 财务与运营专家模板

先不做自由工作流编辑器。财务缺真实成本必须 UNKNOWN。

### 多人状态库 / PostgreSQL

规划输入约 10 人、峰值 5 人分析。本地 B0 仍为 SQLite + 只读合成 DuckDB。不把换库当提速结论。不读取/复制 131GB 归档真库。

### 妙搭能力核验与 CRM 试点

只延期真实触达、外部接口和回流。发送不等于有效增长。

## Completed

- [x] 视觉与状态恢复增量进入 4325/18083；五库新备份恢复及浏览器重开通过，[快速 canary DEGRADED](PRODUCT-CANDIDATE-SWITCH-2026-09-10.md)保留既有 B0 404。**Completed:** 2026-09-10

## 2026-10-03 G0 审查修复与规划全文复核

证据：[修复与规划审核](./evidence/dsh-g0-review-fixes-20261003.md)。本卡是本轮结果，不覆盖下方历史记录。

- [x] OCR-01/02：runtime 使用私有副本、锁文件 SHA-512 原始直链缓存与 frozen deploy；上游源码不变，实际离线包和独立解包验证通过。
- [x] OCR-03/06：真实插件最终 tarball 安全扫描与入口校验；已验证敏感文件、source map、内联密钥和缺失入口被拒绝，回归见 `scripts/release/plugin-pack.test.mjs`。
- [x] OCR-04/05/07：receive UNKNOWN/校验后恢复、跨 tag 身份清理、精确 commit tree 静态扫描；本轮专项合计 123/123 PASS。
- [x] 全文审核大型拆分计划，修正依赖顺序、保存/隔离承诺、旧证据范围、无效命令与 native-first 文档冲突。
- [x] T1：边界设计、当前 11 包机器清单、唯一构建 DAG 与 8 项 AST/负测落地；本地和 CI 共用 B0 漂移检查。首轮见 [边界证据](./evidence/dsh-g0-boundaries-20261003.md)，本轮更新见 [图表解耦证据](./evidence/dsh-g0-board-components-20261003.md)。
- [x] T15 子项：pin/build-tools/补丁由 kit 独立拥有；brand/query 无 workbench 源码的 build/test/pack 通过，8 插件实际构建通过。
- [x] T15 图表子项：board-components 公开导出替换 6 条引用；固定 tarball/公开类型、旧导出兼容、workbench 独立重建与受控 pack 通过。见 [图表解耦证据](./evidence/dsh-g0-board-components-20261003.md)。
- [x] T15 CRM slot 子项：领域 v1 合同生成双方类型，CRM 不再读取 workbench 私有 slot 类型；服务/宿主验收范围不扩大。见 [增量证据](./evidence/dsh-g0-crm-slot-20261003.md)。
- [x] T15 CRM 页面/主题子项：4 条内部引用全部解除，profile 显式装配页面工具，品牌内容合同生成本地副本；CRM 无相邻插件源码的 build/test/pack 通过。见 [CRM 端证据](./evidence/dsh-g0-crm-decoupling-20261003.md)。
- [x] T15/T3 CRM 合成服务子项（2026-10-04）：插件不再启动 Python/查找主仓路径；合成指标与公开知识解释分别使用显式 HTTP API 1.0.0，缺服务明确 NOT_AVAILABLE。已验证双服务故障边界与实际 tarball 解包加载，见 [证据](./evidence/dsh-g0-crm-service-boundary-20261004.md)。
- [x] T15 服务应用包子项（2026-10-04）：指标/知识分别按明确清单生成不可变候选，逐文件绑定摘要与资源 owner；知识不再加载指标引擎或 DuckDB。实际 tarball 在仓库外、最小声明依赖 venv 中完成三种查询/解释和单服务停止验证，见[独立包入口](../operating/crm-service-packages.md)与[证据](./evidence/dsh-g0-crm-service-packaging-20261004.md)。
- [x] CRM 增量 OCR delegate 提交前审核（2026-10-04）：覆盖 87 个原有路径，修复实际错误响应与 OpenAPI/TS 类型不一致及文档漂移；修复后的 backend、CRM、B0 已重跑，见[审核记录](./evidence/dsh-g0-crm-review-20261004.md)。本地 commit 不关闭以下发布/现场门禁。
- [x] T15 CRM/知识插件拆包子项（2026-10-04）：分别构建、测试、打包与安全解包后固定 SDK 加载；profile v3 可单独或组合选择，身份 lease 在断开/Host 或知识模块卸载后拒绝迟到结果。见[插件拆分证据](./evidence/dsh-g0-crm-plugin-split-20261004.md)。
- [x] 插件拆包 OCR delegate（2026-10-04）：68/68 路径已审；修复公开知识/CRM owner 卸载后的迟到结果，三项负测先失败后通过，166 项插件与 16 项隔离/边界回归通过，见[审查证据](./evidence/dsh-g0-crm-split-review-20261004.md)。
- [x] T2/T17 本机精确宿主子项（2026-10-04）：官方 rc2 Web CLI 完成 10/10 场景和父命令中断回收；修复旧 preset 目录不会注册的接线，实测移除声明保留已有会话，整体切换采用 HOST_RESTART_REQUIRED。见[宿主证据](./evidence/dsh-g0-pinned-host-20261004.md)。
- [x] T13/T21 本机回执接线（2026-10-04）：profile 快照、候选包和固定双包组合绑定 v2 host evidence，`verify-host` 复用原 journal 幂等追加观测；真实宿主重新完成 10/10，CLI 重试不改 candidate/不追加记录。release suite 142 PASS；见[接线证据](./evidence/dsh-g0-host-journal-20261004.md)。
- [x] T3/T7 同版本存储恢复子项（2026-10-04）：新增提交前/后 SIGKILL、丢失响应重试、冲突/撤权、forward-fix 与未知 schema 拒绝，共 5 个场景；含既有分析/原生回归 31 PASS。仅证明隔离 SQLite，不关闭下方 D15 保存合同门禁。
- [x] 宿主/journal OCR delegate（2026-10-04）：原始 30/30 路径审查，修复 FIFO 阻塞与安装内容/tarball 不一致漏检；release 146、profile/负测 9、后端 31、真实宿主 10 场景重新通过。见[审核证据](./evidence/dsh-g0-host-journal-review-20261004.md)。
- [x] T3/T7 G0 回执存储与只读查询子项（2026-10-04，`56198c32` 后增量）：保存身份、候选/关联 ID、durable key 与分析同事务写入；13 个新场景验证并发、提交前/后 SIGKILL、新进程查询/回放、撤权/冲突和 forward-fix，相关 bounded 后端 44 PASS。见[回执证据](./evidence/dsh-g0-save-receipt-20261004.md)。
- [x] T3/T7 D15 本地服务准入子项（2026-10-04）：独立版本的结果/freshness/provenance、显式候选 allowlist、写锁内重验、公开保存 adapter、不可变来源及严格插件 decoder；六文件 71 PASS、完整 B0 658 Python PASS。见[准入证据](./evidence/dsh-g0-save-admission-20261004.md)，不启用生产保存 UI。
- [x] D15 保存 OCR delegate（2026-10-04）：29/29 原始路径审查，修复实际分析缺失/来源不匹配仍报 SAVED、持久化合同字段被默认值补齐的问题；已验证 7 个负测先失败后通过，相关后端 78 PASS，完整 B0 Python 665 PASS。见[审核证据](./evidence/dsh-g0-save-review-20261004.md)。
- [x] T3/T7 固定服务源码兼容子项（2026-10-04）：旧 `56198c32` / 新 `a50bd424` 完成 9/9 预期观测和 4/4 CLI 负测；已确认旧服务写 D15 状态不保留来源，明确阻断可写降级。见[兼容窗口](../architecture/first-purchase-service-compatibility.md)与[证据](./evidence/dsh-g0-service-save-compat-20261004.md)。
- [x] T3/T7 本地候选兼容门禁子项（2026-10-04）：显式 service binding 与实际回执绑定 candidate、profile/payload、安装 marker/journal；已验证阻断旧 writer、缺失/篡改与幂等重试绕过。release 169 PASS、实际 CLI 拒绝 3/3，见[门禁证据](./evidence/dsh-g0-service-gate-20261004.md)。仅 LOCAL_COMPATIBLE，现场激活仍 BLOCKED。
- [ ] T15 剩余：插件/服务物理分仓、invariant、供应链门禁；首购、指标、知识服务各自的 WSL synthetic 冷安装已实际通过，生产安装/准入仍未完成。kit 全部消费者已改用固定开发依赖，新 SDK/工具目录构建通过；预编译闭包分发、整台干净机器与 registry 信任仍开放。整体仍 PARTIAL。
- [x] T3/T7/T15 首购服务独立应用包子项（2026-10-04）：同包生成 OpenAPI、13 项固定依赖、仓库外实际 HTTP 保存/重启回放与 forward-fix；共享后端 17 PASS（含 7 个包集成场景），已验证 FIFO/合同生成副作用拒绝。见[服务包证据](./evidence/dsh-g0-analysis-service-package-20261004.md)。仅同版本本机 synthetic，不关闭下方精确旧/新包和主机门禁。
- [x] T3/T7/T15 精确服务包配对子项（2026-10-05）：旧 `56198c32` / 新 `a50bd424` 两个实际 archive，各自离线 hash wheel 冷安装 13 项依赖，Darwin arm64 **9/9**；共享后端 **25 PASS**（包内 8 个集成场景）与 SIGTERM 回收通过。见[配对证据](./evidence/dsh-g0-service-artifact-pair-20261005.md)。新回执尚未被现有激活门禁消费，不替代 WSL/供应链/身份验证。
- [x] 服务包 OCR delegate（2026-10-05）：原始 **21/21** 路径全覆盖，Git replacement 与取消回收两个缺陷修复；修复后共享后端 25 PASS（内部 10 个包场景）、固定双包 9/9。见[审核证据](./evidence/dsh-g0-service-artifact-review-20261005.md)。
- [x] T3/T7/T13/T21 本机服务包回执接线（2026-10-05，`82c1f5cd` 后增量）：`plugin verify-service` 将原候选、源码回执、两份实际包与依赖记录绑定原 journal；新门禁 29 PASS、release suite 199 PASS，实际 CLI 重试幂等及 3 项篡改拒绝通过。见[接线证据](./evidence/dsh-g0-service-artifact-gate-20261005.md)。不关闭目标主机或生产门禁。
- [x] 服务包接线 OCR delegate（2026-10-05）：原始 15/15 路径和两份修复文件已审；已验证 journal 前置/并发历史、FIFO 与日志回显四项负测先失败后通过，完整 release suite 206 PASS，实际双包 CLI 重试通过。见[审核证据](./evidence/dsh-g0-service-artifact-gate-review-20261005.md)。
- [x] T3/T15 目标主机预检子项（2026-10-06，`1b443646` 后未提交增量）：`plugin service-preflight` 只读校验 manifest 摘要、WSL2/Python、离线 wheel 清单/平台/ABI/Requires-Python；24 PASS，release suite 206 PASS，实际包在 Mac 正确 BLOCKED。见[证据](./evidence/dsh-g0-service-target-preflight-20261006.md)；不关闭真实 WSL、安装、身份与恢复门禁。
- [x] 目标主机预检 OCR delegate（2026-10-06）：原始 11/11 覆盖，安装格式/标签与依赖约束两类问题已修；6 项复现负测修复后通过，专项 35 PASS、release suite 206 PASS，实际 wheel 无误拒绝。见[审核记录](./evidence/dsh-g0-service-target-preflight-review-20261006.md)。
- [x] T3/T15 目标平台依赖准备子项（2026-10-06，`79434033` 后）：已只读核验杭州 WSL2/x86_64/Python 3.14.4，按实际标签在本地准备 13 个固定 Linux wheel，并复核官方 SHA-256；见[证据](./evidence/dsh-g0-service-target-platform-20261006.md)。准备阶段未安装；后续实测见下一项。
- [x] T3/T7/T15 首购服务 WSL 合成验收子项（2026-10-06）：复用固定双包，现有低权限账号的两个独立 venv 离线冷安装、真实 HTTP 保存/权限/冲突、SIGKILL 后幂等恢复、旧版只读与未知 schema 拒绝等 **14/14**；修正测试夹具目录权限，前次失败保留。成功轮次 10 个、失败轮次 1 个临时进程与安装目录均已回收，生产入口监听/PID 不变。见[证据](./evidence/dsh-g0-service-target-acceptance-20261006.md)。不关闭生产身份、供应链或 DSH 宿主验收。
- [ ] T2/T17 剩余（2026-10-07 校准）：WSL 固定 runtime、已声明 text/tool/rich 语料及首购 headless 场景已有下方分项证据；补 shell/tool timeout/result union、附件实际存储/渲染、live delegation 与其他组合、完整 client/UI 验收。0.2 运行兼容独立推进；同进程任意插件隔离不承诺，不再把已通过子项笼统列为 NOT_RUN。
- [x] WSL 验收记录 OCR delegate（2026-10-06）：原始 7/7 文件覆盖，进程数量/时间范围两处低风险说明已修；核对原始脚本、28 个输入与实际回执后，本地提交为 `2a89790b`，未 push。见[审核记录](./evidence/dsh-g0-service-target-acceptance-review-20261006.md)。
- [x] T3/T7/T13/T21 首购 WSL 回执接线子项（2026-10-06，已提交 `356862bf`）：沿用 `plugin verify-service` 核对既有目标回执/输入/runner/日志/清理，幂等追加原 journal。新测试 37 PASS、完整 release suite 243 PASS；真实回执进入 seq 4，重试一致，108 个输入/证据文件不变。见[接线证据](./evidence/dsh-g0-service-target-gate-20261006.md)。仍是未签名合成观测，不放行生产。
- [x] 目标回执接线提交前审核（2026-10-06）：原始 14/14 全覆盖，无新确认缺陷；本次 release suite 243 PASS，原真实回执 CLI 重试与输入/journal 保留通过。见[审核记录](./evidence/dsh-g0-service-target-gate-review-20261006.md)，按正常 hooks 本地提交，生产门禁不变。
- [ ] T3/T7/D4-C：新 clean 首购包已绑定 plugin candidate 并完成 WSL 合成验收；继续补生产身份/候选准入/状态策略、生产形状 UNKNOWN 恢复、DSH UI/浏览器与完整供应链门禁。生产 provider/profile 未启用；保存 UI 已有本地接线，但默认 NOT_AVAILABLE，实际 DSH 查询 run 的 CRM 归属和浏览器仍需验收；下方 CRM/知识插件候选不含该 service binding。
- [x] T3/T7 服务身份接口子项（2026-10-06，`c95751f8` 后本地增量）：首购 factory 接受服务 owner 的同步身份 resolver，校验凭证/不可变身份并将 provider 失败脱敏为稳定 401/403/503；策略故障拒绝写入，撤权/恢复不放宽原合同。当前回归 **74 PASS**，实际独立包场景 **1 PASS**，见[证据](./evidence/dsh-g0-service-identity-boundary-20261006.md)。未接入生产认证；新服务代码不能沿用下方旧包的 WSL 通过结论。
- [x] 身份接口审核与 clean 本机候选（2026-10-06）：OCR delegate **8/8** 无新阻塞，正常 hooks 提交 `80aba9c1`；该 SHA 源码/实际离线包各 **9/9 PASS**，新 candidate `4e49cc04…` 的服务回执进入原控制面 journal 第 3 条事件，幂等/旧目标回执拒绝通过。插件包仍为相同 `5efdbec5…` 字节，无 DSH/插件重建；同一服务包随后另做 WSL **14/14 PASS**、journal 第 4 条事件，幂等 131 文件/旧 129 文件保留通过，10 个自有进程与目录已回收。生产身份门禁未关闭，详见同一证据页。
- [x] T3/T7 时效策略子项（2026-10-06）：按用户决定暂缓陈旧/过期，显式 `check_freshness=False` 与 `NOT_CHECKED` 来源；服务、严格 decoder、生成类型同步。该实现阶段五文件 **163 PASS**、实际服务包两种模式 **2 PASS**；权限/准入/来源/幂等与 UNKNOWN 恢复保持，见[证据](./evidence/dsh-g0-save-time-policy-20261006.md)。不再等待生产时效阈值，clean 后续验收见下一项。
- [x] T3/T7/T21 时效策略 clean 候选接线（2026-10-06）：`48e7ddfc` 源码/实际离线双包各 **9/9 PASS**，当前构建及相关 **95 PASS**，同一 archive 的 CRM 合成身份与关闭时效链 **6/6 PASS**。新双包 WSL 固定场景 **14/14 PASS**、journal seq 4，重试 131 文件不变，10 个临时进程与本次远端目录回收、现役监听/PID 不变；见[证据](./evidence/dsh-g0-save-time-policy-candidate-20261006.md)。WSL 14 项不替代关闭时效/真实 CRM/浏览器验收；生产 gate 与上方 T3/T7/D4-C 保持开放。
- [x] T9/T14 保存 UI 本地接线子项（2026-10-06）：复用 CRM 会话凭据、公开版本化服务、原请求保存/核对/重试与可见禁用；两个插件构建、相关后端 132 PASS、审修后 Node 51 PASS、编译卡片 7 PASS，真实 HTTP 集成 1 PASS（7 项观测）。已核对[本轮证据](./evidence/dsh-g0-save-ui-20261006.md)，不关闭上方 T3/T7/D4-C；后续账号/run 归属接缝见下一项，实际 DSH/浏览器仍待验收。
- [x] T3/T9 CRM 查询归属本地接缝（2026-10-06）：显式模式沿用 Host bridge 与 CRM 可撤销 lease，新 run 归属真实认证的合成账号；真实 worker/HTTP 保存/ACK 恢复通过，换账号及旧 fixture 重绑拒绝。已核对[本轮证据](./evidence/dsh-g0-native-crm-owner-20261006.md)；服务故障暂停原任务，不误判撤权。
- [ ] T3/T9/T14 固定官方 DSH 的 CRM 登录/admission/查询/保存验收：本机 HTTP/Chrome 与 WSL 固定 runtime/四包的官方 HTTP 整链已有下方证据；目标桌面 headless 五场景已通过；headed/移动端/无障碍和生产形状验收仍待完成，生产 gate 不变。旧 B0 gateway 不能充当 CRM 登录入口。
- [x] 官方 Host/HTTP 子项（2026-10-06）：固定 rc2 实际加载、Cookie/Origin/CSRF、CRM 登录、原生工具 worker、保存 ACK 核对、持久 session 重启与重新登录通过，整链 1 PASS、保护测试 7 PASS。已核对[证据](./evidence/dsh-g0-official-crm-http-20261006.md)；查询仍由私有测试入口准入，不称为浏览器完成。
- [x] 官方原生命令/Chrome 子项（2026-10-06）：通过公开 slash-command 扩展接查询、只读状态、精确 run/call 取消；新 HTTP 整链 1 PASS，Chrome headless 1 PASS/5 项观测（登录前拒绝、登录、查询保存、刷新恢复、普通原生对话），命令/编译卡片 12 PASS、相关后端 35 PASS。已核对[证据](./evidence/dsh-g0-native-command-browser-20261006.md)；只关闭本地源码合成链，不关闭候选/目标机或生产 gate。
- [x] T3/T7/T21 原生命令 clean 候选子项（2026-10-06）：OCR 27/27 审修后提交 `9611589c`；新 workbench/服务包固定同一 SHA，源码/实际双包各 9/9、相关测试 106、同包合成 CRM 保存 6/6 通过。候选 `ca79774b…` 的服务回执进入 seq 3；重试 52 文件不变、旧证据 195 文件保留，旧 WSL 回执拒绝。见[候选证据](./evidence/dsh-g0-native-command-candidate-20261006.md)；新包目标/组合宿主验收 NOT_RUN，生产激活 BLOCKED。
- [x] T3/T9/T14 精确插件包宿主子项（2026-10-06）：同一 workbench 候选包与固定 CRM 包安全解包后，官方 HTTP 1 PASS、连续 Chrome 1 PASS/5 项观测，保护/model 21 PASS、受影响后端 3 PASS；包文件/SDK 链接完整性及自有进程回收通过，旧候选 83 文件/journal 未变。见[本次证据](./evidence/dsh-g0-first-purchase-artifact-host-20261006.md)。该阶段服务仍为源码夹具；后续独立服务组合见下一项，目标机或生产 gate 未关闭。
- [x] T3/T7/T9/T14 独立保存服务宿主组合子项（2026-10-07）：复用原三包，在最小离线 venv/进程启动保存服务；artifact HTTP/Chrome 各 1 PASS（浏览器 5 场景），服务同端口重启后经 Host 重放原请求，仍一条分析；workspace 回归 1 PASS、保护/model 27 PASS、后端 5 PASS。已核对[本轮证据](./evidence/dsh-g0-first-purchase-service-host-20261007.md)，437 个旧文件/journal 保留；查询内核仍是源码夹具，新包目标 WSL/生产 gate 开放。
- [x] T3/T7/T9/T14 独立查询内核包组合子项（2026-10-07）：查询 API/dispatcher/worker 从 exact `43630981` 的受限包运行，15 个依赖冷安装（含 DuckDB 1.5.6）；原三包复用。四种 Host 模式各 1 PASS、Chrome 5 场景、保护/model 30 PASS、失败回收 5 PASS；查询与保存独立重启、同请求重放不重复执行或保存。已核对[本轮证据](./evidence/dsh-g0-first-purchase-kernel-host-20261007.md)，旧 437 文件/journal 不变。只完成代码包隔离；共享 RunStore/SQLite、WSL 与生产 gate 保持开放。
- [x] T3 查询/保存存储边界本机子项（2026-10-07）：版本化来源 HTTP + 显式 resolver，保存服务不接收查询库路径；真实独立进程重启/来源下线回执恢复及官方 Host 新旧路径通过。受影响后端 226 PASS、allowlist 隔离导入 2 PASS、固定官方 Host 两模式各 1 PASS、服务归档回归 2 PASS，见[证据](./evidence/dsh-g0-first-purchase-source-http-20261007.md)。旧本机适配保留；提交前复审 23/23、当前后端 228 PASS、官方新路径 1 PASS；新 exact-SHA 双包/WSL/供应链/生产门禁仍开放。
- [x] T3/T7/T9/T14 新来源 HTTP 固定双包子项（2026-10-07）：源码审核提交 `f9726f68`，新查询/保存包从该 SHA 生成；源码/实际双包各 9/9、保护 29、回收 6、v4 HTTP/v3 同包兼容/v4 Chrome 各 1 PASS（浏览器 5 场景）。保存进程只打开自己的库，查询下线后独立重启并重放回执保持唯一记录；新 candidate `861d6ef1…` journal seq 3，重试 16 文件不变。见[证据](./evidence/dsh-g0-first-purchase-source-packages-20261007.md)。组合驱动已正常提交 `09080b77`；后续 WSL 来源/同版本恢复见下一项，生产身份与供应链未关闭。
- [x] T3/T7 新来源 HTTP 的 WSL 服务子项（2026-10-07）：同一 `f9726f68` 查询/保存 archive，实际杭州低权限隔离冷安装及来源/保存/查询离线/进程崩溃/备份恢复 **10/10 PASS**；输入保护 **7 PASS**、本机预演 **10/10 PASS**。5 个服务进程与 1 个物理 worker 已退出，临时目录已回收，现役监听/PID 不变；见[现场证据](./evidence/dsh-g0-first-purchase-source-wsl-20261007.md)。现场阶段原 journal 为 seq 3，后续接线见下一项；不等于目标 DSH 或生产通过。
- [x] T3/T7/T13/T21 新来源 HTTP 目标回执接线（2026-10-07）：原始十项 WSL 回执、固定输入/runner、查询与保存包/源码、进程日志绑定原候选 journal seq 4；新门禁 34 PASS、完整 release suite 278 PASS，真实 CLI 幂等及本机/错候选拒绝通过。见[接线证据](./evidence/dsh-g0-first-purchase-source-target-gate-20261007.md)。只关闭本地核验记账，目标 DSH/跨旧版本恢复、真实身份、供应链和生产激活仍开放。
- [x] T2/T3/T9/T14 固定 Linux runtime 的 WSL 官方 Host HTTP 子项（2026-10-07）：复用 `a049f061…` runtime 与原四包，非特权冷安装后登录/查询/保存/ACK 核对、服务/宿主正常重启和原生对话 **1 PASS**；保护 49、进程/输入 13、release 278、本机 v4 整链 1 PASS。8 个自有 PID 和临时目录回收，现役监听/PID 与原 candidate/journal seq 4 不变，见[本轮证据](./evidence/dsh-g0-first-purchase-runtime-host-20261007.md)。仅关闭目标 HTTP 组合，目标浏览器、跨版本/崩溃恢复、目标 Host 回执接线和生产 gate 仍开放。
- [x] T2/T13/T21 目标首购 runtime Host 回执接线（2026-10-07）：上一批已提交 `4d792eeb`；新封套校验绑定原服务目标事件、控制器源码、密封输入/结果清单及真实 runtime 字节，原候选追加 seq 5，重试字节/mtime 不变。新负测 33、完整 release 311 PASS，前四事件和 15 个固定输入保留，见[本轮证据](./evidence/dsh-g0-first-purchase-runtime-host-gate-20261007.md)。仅核对已有操作者观察，不重跑目标机；目标浏览器/生产身份/供应链和 activation 仍开放。
- [x] 查询归属复审（2026-10-06）：`9d1a9acf` 全部 29/29 文件已核对；修复运行中身份瞬时故障被误写 UNKNOWN，94 项后端与 15 项 Node 回归通过，见[本轮证据](./evidence/dsh-g0-native-crm-review-20261006.md)。上述官方宿主整链保持开放。

- [x] T3/T7 现有 CRM 身份适配子项（2026-10-06，本地增量）：可选 loopback `/api/v1/auth/me` adapter，显式现有账号与当前管理员授权、无密码/token 缓存、撤权/超时/畸形响应拒绝；五文件 **134 PASS**，实际包 **1 PASS** 含 5 项身份观测。见[证据](./evidence/dsh-g0-crm-identity-adapter-20261006.md)。审修后正常 hooks 提交 `7edf7710`；该 clean SHA 源码/实际离线包各 **9/9 PASS**，同一 archive 的 adapter **5/5 PASS**，固定包 `26b07aa7…`。新 plugin candidate/journal 与真实 CRM/WSL 接入未验收，不开启生产保存。
- [x] T3/T7 clean 首购服务本机候选（2026-10-06）：从审核提交 `2be518e5` 生成双包，打包来源均 clean；源码 **9/9**、实际离线包/HTTP **9/9**，控制面重验及旧 WSL 回执误用拒绝通过，见[证据](./evidence/dsh-g0-service-clean-candidate-20261006.md)。该准备阶段的 plugin journal/WSL 为 NOT_RUN；后续独立实测见下一项，不继承旧包目标结论。
- [x] T3/T7/T13/T21 clean 首购候选与新包 WSL 接线（2026-10-06）：插件 `78779206` 重新构建并绑定服务 `2be518e5`，本轮相关测试 **100 PASS / 0 SKIP**；同一服务双包在杭州隔离环境 **14/14 PASS**，目标回执进入 journal seq 4，重试与 129 文件不变通过。临时进程 10/10 回收，现役监听/PID 不变，见[本轮证据](./evidence/dsh-g0-service-candidate-binding-20261006.md)。合成 A64 准入不代表生产候选获准保存，生产 gate 不变。
- [x] clean 首购绑定提交前 OCR delegate（2026-10-06）：原始 **4/4** 文档补审，修正服务包与插件证据的归因；本次门禁测试 **70 PASS / 0 SKIP**，真实 CLI 重验及 129 文件不变通过，见同一证据页。未重复执行远端验收；后续进入身份/候选准入子项。
- [x] 完整候选增量 OCR delegate（2026-10-06）：`2a89790b..0a183b6f` **22/22** 覆盖，两处文档状态已修；251 个不同用例通过，既有 bundle/journal 重验及 120 文件不变通过，见[审核证据](./evidence/dsh-g0-candidate-full-review-20261006.md)。本次不放行生产，随后准备 clean 首购候选。
- [ ] T13/T21：生产 activation journal、远端 receive/reconcile 与现场恢复；本机 `LOCAL_HOST_VERIFIED` 不替代这些门禁。
- [x] T2/T13/T17/T21 clean CRM/知识本机候选（2026-10-06）：源码 `9902bdd9` 的正式 preflight **8/8 PASS**、release suite **244 PASS**；两份独立包与实际官方宿主 **10/10 PASS**，各自 journal seq 3 重试不改文件，5 个临时宿主退出。见[验收证据](./evidence/dsh-g0-clean-candidate-20261006.md)。生产与目标 WSL runtime 仍 NOT_RUN。
- [ ] 完整候选签名/SBOM/CVE、canary/rollback 与远端门禁；不把上述本机包和回执视为可上线，仍按 G0/stop-go 决定物理分仓。

- [x] T2/T3/T14/T15 同一候选的目标桌面 headless 浏览器子项（2026-10-07）：连接恢复后，固定 runtime/原四包在实际 WSL2、UID 65534 完成官方 Host **1 PASS / 5 场景 PASS**；修复 locale 与临时浏览器缺 CJK 字库，中文截图核对完成。保护 **47 PASS / 4 SKIP / 0 FAIL**；原 15 输入与 journal seq 5 保留，未接入新 browser event。见[目标证据](./evidence/dsh-g0-first-purchase-target-browser-wsl-20261007.md)，此前[连接失败](./evidence/dsh-g0-first-purchase-target-browser-20261007.md)保留。仅关闭此 synthetic 子项，headed/移动端/无障碍、在途/跨版本、供应链与生产 gate 仍开放。

- [x] T2/T13/T21 目标浏览器回执接线（2026-10-07）：既有 WSL headless 五场景以独立 browser schema 接入原候选 seq 6，引用 seq 5 runtime Host；共用 immutable runtime/包/进程校验，完整 release **345 PASS / 0 SKIP**（新门禁 34）。真实 CLI 重试字节/mtime 不变，错父事件拒绝，前五事件/15 输入保留，见[本轮证据](./evidence/dsh-g0-first-purchase-browser-gate-20261007.md)。只核验已有观察，未重跑杭州；生产、跨版本与完整 UI gate 保持开放。

- [x] 2026-10-07 Host/browser 门禁审修：OCR 28/28；拒绝矛盾 pytest 日志、补 B0 browser 清单、修正文档。release 348 PASS，保护 52 PASS / 4 SKIP；原 seq 6/15 输入保留，见[审核证据](./evidence/dsh-g0-first-purchase-host-browser-review-20261007.md)。只关闭本批审修，不关闭目标在途/跨版本或生产 gate。

- [x] T2/T7 目标恢复前置核验（2026-10-07）：审修已提交 `b6cecdb6`；三次只读 SSH 核对工具/端口、现役 `dsh-0.20.0.0-r3`、rc1 `46a7f68b` tracked clean 和执行入口，固定恢复输入清单见[前置证据](./evidence/dsh-g0-first-purchase-recovery-preflight-20261007.md)。该阶段只关闭输入发现；后续实际运行见下一项。
- [x] T2/T7 目标恢复观测子项（2026-10-07）：原四包/runtime WSL 首购在途 SIGKILL、持久前缀/幂等/原生回退整链 1 PASS；rc2 截断与 rc1↔rc2 文本回合 4/4，旧新保存服务 forward-fix 14/14。原 15 输入、journal seq 6 与 185 远端 payload 保持，291 文件取回校验、临时进程/目录回收、生产快照不变，见[本轮证据](./evidence/dsh-g0-first-purchase-recovery-wsl-20261007.md)。不代表任务已从 UNKNOWN 恢复到终态。
- [x] P1 / T2/T7 恢复请求投影的本机源码修复：官方异步读取、并发事件去重与生命周期处理落地；Node 66、后端 50、官方 Host 终态整链 1 PASS。中断任务 FAILED/EXECUTION_UNKNOWN、释放活动名额、无重复派发，见[修复证据](./evidence/dsh-g0-native-journal-recovery-fix-20261007.md)。前批恢复演练已提交 `de89a527`。
- [x] T2/T7 新插件候选现场终态验收：`3ffbd2a2` 新插件 / `a490457c…` 候选复用原 CRM、服务和 runtime；本机固定包 1 PASS，杭州来源 10/10、Host 终态 1 PASS，见[本轮证据](./evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md)。显式 v2 允许插件/服务独立 SHA，旧 `861d6ef1…` 的 UNKNOWN 事实保持。
- [x] T2/T7 终态回执门禁（2026-10-07）：新增明确 terminal schema，原 `a490457c…` 候选封存 WSL 回执通过 `plugin verify-host` 接入 seq 5，引用服务目标 seq 4，保持旧 HTTP/browser 合同。完整 release 391 PASS（含新门禁 37），实际错父拒绝、重试不写、619 文件保持，见[本轮证据](./evidence/dsh-g0-first-purchase-terminal-gate-20261007.md)。只关闭该观察接线，本批经 OCR delegate 审查随本次提交交付，未重跑现场。
- [x] 新候选浏览器现场子项（2026-10-07）：`a490457c…` 原四包/runtime 在杭州 WSL2 Chrome headless 5/5、官方 Host 1 PASS（78.00 秒），一条分析/一个 worker，截图中文可读；620 本机文件及 journal 保持，510 远端输入保持、临时目录回收、生产不变。见[证据](./evidence/dsh-g0-first-purchase-current-browser-20261007.md)；不是旧候选 browser PASS，也不是完整视觉/无障碍验收。
- [x] 当前候选浏览器回执 journal 适配（2026-10-07）：显式 v2 关联终态 seq 5，独立来源/控制器/原 archive 与清单/五场景/清理核对后接入 seq 6；完整 release 429 PASS（含新门禁 38），实际错父拒绝、重试不写、1318 文件保持，见[门禁证据](./evidence/dsh-g0-current-browser-gate-20261007.md)。v1 不变，不重跑杭州、不放行生产；OCR delegate 21/21 审修后随本次提交交付，提交前新跑 release 429 PASS。
- [x] T3/T7 结果年龄事项收口（2026-10-07）：采用历史快照 + 保存时校验，移除待定阈值要求；保留 wire/旧回执兼容，不新增到期系统，不取消身份/请求超时。见[收口证据](./evidence/dsh-g0-snapshot-policy-closeout-20261007.md)。
- [x] T2/T7 工具语料本机第一步：显式 `--corpus tool`，固定 rc2 四冷进程 13→26 事件，tool/result/error/meta 与消息投影通过，相关测试 11 PASS；[证据](./evidence/dsh-g0-session-tool-corpus-20261007.md)。本机阶段跨版本 NOT_RUN；后续杭州验证见下项。media/delegation 仍开放，本批已提交 `aebf4e38`。
- [x] T2/T7 工具语料杭州子项：固定 runtime、提交 `aebf4e38` 控制器，四项 4/4 PASS、10 冷进程；48 证据文件核对，输入/生产不变、自有目录回收。见[现场证据](./evidence/dsh-g0-session-tool-wsl-20261007.md)。只证明该工具语料；编译闭包、完整 corpus/业务准入继续开放，journal 未追加。
- [x] T2/T7 附件引用/委派元数据语料子项（2026-10-07）：显式 rich/v3，本机 18 PASS，杭州四矩阵 4/4、10 冷进程，header/descriptor/depth/消息来源保留；49 文件回收核对与临时目录清理完成。见[本轮证据](./evidence/dsh-g0-session-rich-corpus-20261007.md)。工作树增量未提交；附件服务/渲染、真实子代理执行、其他事件组合和编译来源仍开放。
- [x] T5/T19 release 来源绑定子项（2026-10-07）：source SHA 接入安装和 publish 验签，错误结构/digest/原始错误拒绝；release suite 434 PASS、真实 GitHub runtime 正确 SHA 通过且错误 SHA/包拒绝。四个叶子插件隔离构建/测试/打包 4/4 PASS。见[证据与剩余门禁](./evidence/dsh-g0-attestation-binding-20261007.md)。旧 rc1 编译来源、插件签名/SBOM/CVE/撤销和独立 kit 分发仍开放，本批未提交，不放行生产。
- [ ] 新候选其余准入证据与 G0 stop/go：完整跨版本 corpus、真实身份/模型/UAT、签名/SBOM、生产 activation/canary/rollback；不继承旧候选的 HTTP/browser 事件。
- [x] T2/T15 本机补证（2026-10-07）：固定 rc1 新源码/锁文件完成官方 host/native 构建，三语料 12 场景/30 冷进程通过，99839 个输入保持；kit 私有源码包/只读预检与实际解包构建完成，相关 21 PASS。见[本轮证据](./evidence/dsh-g0-rc1-rebuild-kit-20261007.md)。仍未关闭新输入 WSL 验证、旧完整闭包签名、kit 独立安装/SDK 分发和 T5/T19。
- [x] T15 首个消费者独立安装子项（2026-10-07）：前批已提交 `cc1d8497`；shine-brand 改用 kit 公开包导出，真实 pnpm 新 store 离线安装后无相邻 kit 构建/测试通过；workspace 适配器与 B0/preflight 同步，34 项相关回归及 53 项 release CLI/核心通过。见[当前增量](./evidence/dsh-g0-kit-install-wsl-rebuild-20261007.md)。其余消费者、SDK/工具全新机器安装、签名/registry 与物理分仓仍开放；该后续代码尚未提交。
- [x] T2 新构建 WSL 子项（2026-10-07）：固定官方 rc1 SHA/锁在独有目录以 nobody 冻结安装并执行 host/native 构建，text/tool/rich 12 场景、30 冷进程通过；98040 个构建输入保持，133 个结果文件取回核验。见[现场记录](./evidence/dsh-g0-kit-install-wsl-rebuild-20261007.md)。新可追踪输入的 WSL 验证不再待办；历史签名/供应链、未覆盖事件组合和真实业务准入仍开放。
- [x] T15 全部 kit 消费者安装子项（2026-10-07）：10 个构建消费者使用精确开发依赖/public exports，实际离线安装后无相邻源码构建/测试 10/10；88 项相关回归、追加 HTTP 覆盖后 kit 15 项、CLI/release 73 项通过。修复跨插件测试耦合，领域包摘要不变，见[本轮证据](./evidence/dsh-g0-kit-all-consumers-20261007.md)。SDK/工具闭包分发、整台干净机器、签名和物理分仓仍开放；未提交或操作杭州。
- [x] T15 kit 首次 SDK 准备子项（2026-10-07）：已安装 kit 在全新 HOME/Corepack/store 中获取固定官方源码并构建 SDK，26 个入口 READY；新输入下 10/10 消费者构建/测试、15 项套件、16 项保护测试和 67 项相关回归通过。修复 Node 公共 CA 输入和旧测试 Git index 写入，123781 个输入记录及旧证据保持，见[本轮证据](./evidence/dsh-g0-kit-bootstrap-20261007.md)。只关闭本机新依赖目录准备；预编译闭包/签名/registry、新机器/新入口 WSL 与物理分仓仍开放。
- [x] T15 kit 审修与同平台迁移子项（2026-10-07）：前批经 OCR 审修正常 hooks 提交 `90d5012d`；迁移 SDK/工具/Corepack 后禁用原路径和外网，10/10 消费者构建/测试、15 项套件通过，两份各 124231 条输入记录保持。见[迁移证据](./evidence/dsh-g0-kit-relocation-20261007.md)。只关闭 Mac 支持构建路径迁移；安全归档、平台闭包/签名与全新机器/WSL 分发仍开放。
- [x] T15 开发 SDK 本地归档往返子项（2026-10-07）：严格 blob/链接清单、pin/平台/准备记录和摘要限额，真实 812 MB 包接收后 10/10 消费者构建/测试；相关 38 PASS、16 项归档负测和 25 subtests PASS，原输入/证据/候选保持。见[本轮证据](./evidence/dsh-g0-kit-sdk-archive-20261007.md)。仅受控本地开发，已本地提交 `78175422`；秘密扫描/签名与跨平台/WSL 仍开放，未发布。
- [x] T15 SDK 内容审计入口与首轮来源分类（2026-10-07）：同一归档 115224 文件/8987 链接核对，55 个疑似命中和 553 个覆盖缺口，实际 **BLOCKED**；不豁免 vendor/test，不把来源相同当作安全通过。归档负测 17 PASS/25 subtests、审计/边界 18 PASS，见[证据](./evidence/dsh-g0-kit-content-audit-20261007.md)。该勾选只关闭审计入口与报告，不关闭秘密或供应链门禁；随本次审修提交收录。
- [x] T15 同平台 SDK 缩减与消费（2026-10-07）：2.20 GB → 227.7 MB，固定摘要；旧 SDK/仓库依赖不可读、外网禁用时 10/10 消费者构建与选定测试通过，原完整 SDK 路径也 10/10，通过 35 项防护/边界验证。最终审计 0 命中/17 覆盖缺口仍 PARTIAL，见[证据](./evidence/dsh-g0-kit-sdk-closure-20261007.md)。该勾选只关闭本地 Mac 构建/测试范围，随本次审修提交收录。
- [x] T15 缩减 SDK 提交前 OCR 审修（2026-10-07）：原 32/32 文件完成审核，补充本轮审修记录；封闭整条声明链接链，两个绕出清单再返回的负测先失败后通过。修复后 38 项防护、17 项归档/25 subtests、缩减与完整 SDK 各 10/10 消费者通过；内容审计仍 0 命中/17 缺口 PARTIAL。见[审修证据](./evidence/dsh-g0-kit-sdk-review-20261007.md)，本地提交，不发布或部署。
- [x] T15 缩减格式同平台安全归档/接收（2026-10-07）：从 `d9770b9c` 继续，共用归档器和显式双摘要，真实安装 kit 打包 63.75 MB、接收后原 SDK 不可读条件下 10/10 消费者通过。归档 27 PASS/41 subtests、相关防护 38 PASS，修复链接解析和源目录输出保护；17 项不透明内容完成来源/归属盘点但不豁免。见[本轮证据](./evidence/dsh-g0-kit-sdk-compact-transport-20261007.md)。随本次供应链审修本地提交收录，仍 PARTIAL。
- [x] T15 SDK 清单/漏洞实查（2026-10-07）：固定同一 closure，生成 360 包的 CycloneDX 清单；实际查询 222 个版本，命中 10 个版本/42 条不同公告。相关测试 50 PASS；17 项不透明文件补 npm tarball/固定源码字节核对，1 包签名密钥过期仍待审。见[供应链证据](./evidence/dsh-g0-kit-sdk-supply-chain-20261007.md)。只关闭检查入口和本次盘查，分发仍 BLOCKED；随本次审修本地提交收录。
- [x] T15 归档/供应链提交前 OCR 审修（2026-10-07）：原始 13/13 + 新记录，共 14 文件；修复请求预算、查询进度和 HTTP 流释放，三项负测先失败后通过。本次 53 项 Node、27 项归档/41 subtests 与同包只读解析通过；pnpm 11.11.0 候选被拒，11.28.2 来源/27 包查询通过但兼容构建未运行。见[审修、剩余任务与初衷核对](./evidence/dsh-g0-kit-sdk-supply-review-20261007.md)，本批本地提交，SDK 分发仍 BLOCKED。
- [x] T15 pnpm 11.28.2 插件开发侧候选（2026-10-07）：454 个缓存成员来源匹配；新旧版各 10/10 消费者、16 PASS / 0 SKIP，原图表包摘要/消费者锁不变；相关 25 PASS。空 store 冻结安装 111 包与实际安装后的严格类型检查通过。见[本轮证据](./evidence/dsh-g0-kit-pnpm-candidate-20261007.md)。只关闭本机候选兼容，默认 pin/新 SDK/WSL/供应链未关闭；后续 OCR 修复缺 SDK 的绿色跳过，重新各 17 PASS / 0 SKIP，见[审修](./evidence/dsh-g0-kit-pnpm-review-20261007.md)，随本次本地提交收录。
- [x] T15 官方/插件 manager 拆分及默认迁移（2026-10-07）：从 `7efb5207` 继续，v2 保留官方 11.7.0，自有工具使用 11.28.2；13 包、prepare/pipeline/CI/回执来源对齐，新目录 SDK 实际 READY（552.808 秒）。旧 kit/SDK 保留，新 kit 拒绝旧身份。见[本轮证据及消费者结果](./evidence/dsh-g0-kit-manager-split-20261007.md)。本批经局部审查、20 项专项验证后按授权本地提交；只关闭本机开发工具链范围。
- [x] T15 v2 SDK 同平台缩减分发子项（2026-10-07）：前批已提交 `fd3ed8b6`；本轮仅携带插件 pnpm 11.28.2，实际 64.97 MB 包接收后禁用原 SDK/外网并只读消费，10/10 消费者、17 PASS，防护 56 PASS，接收拒绝 4/4。新字节 0 命中/17 缺口，222 个版本查完为 7 个版本/29 条公告；17 文件重核来源，仍 BLOCKED。首轮可选依赖悬空链接与新副本精确恢复单列，见[本轮证据](./evidence/dsh-g0-kit-sdk-v2-distribution-20261007.md)。本轮代码/测试/文档经限定范围审查后随本次本地提交收录；只关闭本机新包往返与盘查。
- [x] T15 v2 SDK WSL 子项（2026-10-08）：全新依赖环境准备 256.411 秒、完整/缩减 pack/receive 通过；原 SDK 不可读、禁外网、只读输入下十消费者 **20 PASS / 0 SKIP**。修复跨平台验收误要求重打 gzip 与原包同 SHA，保留原领域包和三份消费锁。首轮 6/10 失败与恢复分别保留，见[本轮证据](./evidence/dsh-g0-sdk-wsl-immutable-inputs-20261008.md)。只关闭开发 SDK 目标平台子项，不是全新机器或生产验收。
- [x] T15 来源信任细化（2026-10-08）：五包摘要/签名及篡改负测通过；真实 npm verifier 按发布时间接受历史有效密钥，17/17 文件来源字节重核。固定 0.2.0-rc.2 不能自动修复公告；七个精确依赖修复候选只完成查询，见[本轮证据](./evidence/dsh-g0-sdk-upstream-trust-20261008.md)。不等于整体信任放行。
- [x] T2/T15 官方升级候选盘查（2026-10-08）：重新读取全部25 releases/26 tags与30个npm CLI版本，精确核对三个新 release 和默认 master；29条公告仍在其原始锁，**BLOCKED_UPSTREAM_RELEASE**。26 bindings/29实际import/12slot静态矩阵与两profile的4个拒绝/通过断言完成，未安装未修复候选、不改现用pin。见[候选证据](./evidence/dsh-g0-sdk-upgrade-candidate-20261008.md)。勾选只表示本次盘查完成，不能作为升级或分发放行。
- [x] T3/T15 指标/知识服务 WSL 冷安装（2026-10-08）：同一两包分别14/13项精确Linux wheel，2/2离线冷安装、15/15 HTTP与保护观测通过；新验证器12项边界通过。首次SIGTERM缺凭据失败保留，恢复只更新验证器、重新冷安装，4进程回收及生产监听/PID/current保持；135个取回证据逐项校验。见[目标证据](./evidence/dsh-g0-crm-services-target-20261008.md)。不是生产部署、任意代码隔离或journal准入门禁。
- [x] 前两组 OCR delegate 审修（2026-10-08，已提交 `5bf2bc77`）：`1dae6de7`的14份代码及17份排除文件补查，3项验收器问题修复；已验证原FAIL与当前bounded20 PASS、领域输入12/AST边界12/HTML合同25、清单检查。提交时新版runner WSL为NOT_RUN，旧2/2与15/15仍属固定历史执行。见[本次证据](./evidence/dsh-g0-parallel-followup-ocr-review-20261008.md)，不关闭供应链/生产门禁。
- [x] T3/T15 OCR修后runner的WSL复验（2026-10-08）：`5bf2bc77`原字节在新自有namespace复用原指标/知识archive与14/13固定wheel，2/2冷安装、15/15 HTTP/保护观测通过；73项新证据、135项旧证据和新旧39输入摘要核对。4服务进程回收、unit停止，生产current/5组监听PID及原candidate/journal/pin保持；见[当前现场证据](./evidence/dsh-g0-crm-services-target-ocr-wsl-20261008.md)。WSL未另做恶意路径/漂移/信号竞态注入，不能将上一轮本地20项称为现场套件；供应链与生产准入保持开放。
- [ ] T15 SDK 分发剩余项：当前固定 DSH 上游的 7 个受影响版本/29 条公告仍由官方 release 未修复阻塞；最新 alpha/default master 亦未解除，不重复安装来证明同一缺口。完整准备环境中的官方旧 manager 另保留审查，不能用缩减包未携带来证明其安全。补完整 SBOM/发布者身份/最终签名/撤销、不透明内容安全与整台干净机器验收。上述历史密钥日期疑点和 v2 WSL 开发 SDK 已关闭，不重复列为 NOT_RUN。官方升级独立推进；物理分仓按 stop/go。完整 checkout 保留用于 SDK 维护，不把全量审计加入每次业务插件更新。
- [x] 旧 HTML 工作树语义盘查与最小修复（2026-10-08）：43/43 覆盖，34 语义项已归类；两个源码文件的五类行为/测试问题修复，正式 build、35/111/2 前端、51+5 后端通过。见[本轮证据](./evidence/dsh-g0-html-semantic-integration-20261008.md)。public 138 条均有历史/当前 blob；旧树保留，不重复整文件合并。
- [x] T15 分仓前作者入口（2026-10-08）：显式审核kit/领域tar，独立开发父目录生成锁并实际frozen离线安装，发布manifest精确声明保持；三份synthetic夹具包内固定摘要并与原owner字节做drift核对，不再向上读主仓。formal build、35/111/2前端、25合同、package-inputs12、十消费者20 PASS/0 SKIP及AST边界12通过。审查确认祖先symlink绕过后真实FAIL→PASS，独立复核关闭；运行包8成员不含kit/夹具/作者入口。见[作者证据](./evidence/dsh-g0-plugin-author-inputs-20261008.md)与[综合审修](./evidence/dsh-g0-parallel-followup-review-20261008.md)。只关闭固定SDK下开发入口，不等于SDK分发信任、物理分仓或完整产品发布。

- [x] T2/T17 官方shell/tool本机合同子项（2026-10-08）：真实官方Context/ToolRuntime/bash/jobs/timeout-policy，11 tests与25内部场景PASS、0skip；45输入保持，14命令/15PGID回收，真实超时/中断/主进程退出后代负测通过。默认jobs超时promotion不是kill、policy不是同进程硬中止，见[本次合同](./evidence/dsh-g0-shell-tool-contract-20261008.md)。Web/模型/WAL/WSL/Windows与编译artifact身份仍未关闭，整体PARTIAL。
- [x] T15 当前 HTML 包本机宿主子项（2026-10-08）：8 成员 `285f882a…` 与574份独立作者源码一致，固定官方 rc2 + headless Chrome **17/17 PASS**，实际 candidate 文件经收取/预览/确认为v4；空会话首 tab、卸载取消、raw-block范围、完整document外壳和资源替换已修复。正式 build/typecheck、35/129/2 前端、25合同、10原生接线、56后端与32专项通过，renderer独立7项通过；输入漂移/成员、Git隔离和清理负测登记现有入口。见[新包证据](./evidence/dsh-g0-html-host-acceptance-20261008.md)。真实模型、headed/移动/读屏、该包WSL和生产未运行；不将合成writer当作真实模型验收，整体PARTIAL。
- [x] T10/T16 调度器失败回收子项（2026-10-08）：真实复现首失败后继续派发、提前返回和空rejection问题并修复；本地HTTP请求有界且读完响应，相关21 PASS/0 SKIP，新五项回归登记B0。见[本次证据](./evidence/dsh-g0-backpressure-drain-20261008.md)。不关闭业务容量、15分钟SLI或十次插件更新。
- [x] T5/T19/T15 固定SDK组成与管理器身份子项（2026-10-08）：26,195文件归属、361组件incomplete BOM及三项拒绝通过；pnpm11.28.2的provenance/发布身份、六项负测/禁网复验通过，17不透明项有限属性检查完成。67证据和30,546输入记录保持，见[补证](./evidence/dsh-g0-sdk-trust-remaining-20261008.md)。整体SDK BLOCKED，完整SBOM/其他发布身份/撤销/native安全/最终签名未关闭；不重复已完成的整版本OSV查询或SDK prepare。

- [x] 2026-10-08 宿主/工具批次提交前OCR：38文件完整核对，确认的fsmonitor、中断/截止时间与iframe等待问题修复；正式shell12/25、HTML17及真实SIGINT/SIGTERM清理、后端56通过。原始失败留存，见[本轮审修](./evidence/dsh-g0-host-tool-ocr-review-20261008.md)；本地提交收录，不放行SDK或生产。

## 2026-09-30 rc2 DX triage follow-up

以下任务来自 `docs/plans/dsh-rc2-environment-promotion.md` 的 DevEx TRIAGE 评审，先登记，不把未实现项写成已完成：

- [x] **DX1 (P1, IMPLEMENTED — local docs PASS)** — 统一 README、`docs/README.md` 与 rc2 Quickstart 的事实和安装入口；以 STATUS/closeout 为 SSOT，明确 Node24、Python3.14、immutable artifact、禁止 `git pull`/现场编译。证据：`README.md`、`docs/README.md`、`docs/operating/dsh-rc2-quickstart.md`；`git diff --check` 通过。杭州/新 Release 仍按现场门禁，未在本项宣称完成。
- [x] **DX2 (P1, IMPLEMENTED — readiness synthetic PASS / release BLOCKED)** — 增加只读 `pnpm dsh doctor --release` 分层检查；覆盖 Node/pnpm/Python、clean tree、zstd、固定 upstream、插件入口、runtime bundle、evidence 目录、磁盘和版本 pin。证据：`scripts/release/readiness.mjs`、`scripts/release/cli.test.mjs`；缺 runtime/dirty tree 返回稳定错误码，未联网、未读真实 DuckDB、未生成 artifact。
- [x] **DX3 (P1, IMPLEMENTED — local PASS / release BLOCKED)** — 增加 `pnpm dsh verify --scope local|release`；local 只报告本地合同与 synthetic 证据，默认/release 继续 fail-closed 要求 WSL2/WAL、15 分钟 SLI 和 host HTTP。证据：`scripts/release/cli.test.mjs`；`verify --scope local` 返回 0，release scope 返回 2。
- [x] **DX4 (P1, IMPLEMENTED — check PASS/blocked; formal build NOT_RUN)** — 为真实 `pnpm dsh preflight` 增加 `--check`、prepare/build/runtime/release/test/receive/evidence 阶段事件、产物路径和稳定错误码。证据：`scripts/release/preflight.mjs`、`scripts/release/readiness.mjs`、`scripts/release/cli.test.mjs`；环境错误在联网构建前暴露。正式联网构建、WSL2 和远端证据仍 `NOT_RUN`。
- [x] **DX5 (P2, IMPLEMENTED — synthetic evidence PASS; formal run NOT_RUN)** — 在 `release-preflight.json` 中记录 TTHW、阶段耗时、阻断原因、重试次数和 PASS/PARTIAL/NOT_RUN 覆盖；阶段失败仍保留稳定错误码日志。证据：`scripts/release/preflight-bundle.mjs`、`scripts/release/preflight.mjs`；正式联网 candidate 的实际 12–25 分钟时钟和远端阻断阶段仍 `NOT_RUN`。
- [x] **DX6 / T21 (P1, IMPLEMENTED — candidate PARTIAL)** — 增加 `pnpm dsh plugin candidate`，复用现有 profile/release journal 生成本地 pack digest、DSH pin、capability、profile diff 状态、canary/rollback 状态和下一步 receive/verify 命令；不得隐式上传、重启、切换杭州或读取真实 DuckDB。候选回执已采用 intent → pending → 原子 rename → `CANDIDATE_PREPARED` 顺序，并校验 canonical plugin path；安全锁文件修复后需在 clean reviewed commit 上重新生成，canary/rollback/远端 receive 仍 `NOT_RUN/NOT_AVAILABLE`。证据：`scripts/release/plugin-candidate.mjs`、`docs/hackathon/evidence/dsh-g0-plugin-candidate-20261002.md`、`docs/hackathon/evidence/dsh-g0-open-code-review-20261002.md`。
- [x] **DX7 / T22 (P1, IMPLEMENTED — docs PASS)** — 统一 README、STATUS、docs/README 与 rc2 Quickstart 的当前事实，并新增三步插件作者 Quickstart，明确 DSH pin、package contract、本地验证和 candidate handoff；历史段落仍标注，未宣称现场 UAT。证据：`README.md`、`docs/README.md`、`docs/operating/dsh-plugin-author-quickstart.md`、`docs/operating/dsh-rc2-quickstart.md`、`docs/hackathon/evidence/dsh-g0-dx-triage-20261002.md`。
- [x] **DX8 / T23 (P2, IMPLEMENTED — readiness summary PASS)** — `readiness`/`doctor --release` 现在在末尾输出阻断数量、去重错误码和每个错误码的 Quickstart/reference 锚点；保留逐项 remedy、退出码和 fail-closed 门禁，不联网、不安装、不新增状态源。证据：`scripts/release/readiness.mjs`、`scripts/release/cli.test.mjs`、`docs/hackathon/evidence/dsh-g0-dx-triage-20261002.md`。


## 2026-10-14 M2-09 证据纠偏

复核后，上一轮 alpha2 formal pack/profile、组合 browser 和杭州目标 browser/recovery 的 PASS 不再作为正式证据：候选包来自 ignored workspace；browser probe 没有真实浏览器页面操作；restart 没有重启后的 history/board 回读；目标运行复用了 synthetic backend。修复后的打包器已要求 source manifest 与 HEAD 逐字一致，并检查完整未跟踪状态。旧回执与日志保留为历史尝试，M2-09 当前状态已降为 FORMAL_PACK_SOURCE_PROVENANCE_BLOCKED / COMBINED_BROWSER_NOT_RUN / TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN，下一步是建立 tracked candidate、重新生成 pack/profile，再进行真实浏览器和恢复回读验收。


## 2026-10-14 M2-09 tracked candidate pack

已建立 tracked candidate workspace，提交为 da1b49d35a571c79cff36a69bea0e2e933fac532。修复后的 packer 生成 9/9 个 alpha2 plugin pack，所有回执 source_sha 绑定该提交且 source_dirty=false；回执与汇总位于 .context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-packs-20261014/preparation.json。该步骤只关闭来源证明，CRM/Knowledge 仍声明 Cordis 4.0.2，候选 runtime 为 4.0.5-alpha.1，因此 profile compatibility 仍 BLOCKED；browser/recovery 仍 NOT_RUN。


## 2026-10-14 M2-09 peer compatibility

tracked candidate commit 1bb2646523a7c1cd5aa04d11080617a373af7147 将 CRM/Knowledge 的 Cordis peer 对齐到 4.0.5-alpha.1。候选 CRM 测试 108/108、Knowledge 测试 32/32，使用候选 profile/pack 的 CRM/Knowledge/page 组合集成 20/20；9/9 pack 与 2 份 profile 输入均由真实读取器准备。M2-09 的来源证明与 profile compatibility 已通过，browser/recovery 仍 NOT_RUN，主仓 rc2 pin/live 未切换。

## 2026-10-14 M2-09 本机真实浏览器与恢复

tracked candidate 补齐隔离 alpha2 Web dist 后，gstack Chromium fallback 实际打开候选页面，完成预置历史和插件页观察；owned-host 重启后重新加载，预置历史仍可见。稳定后控制台无错误；重启瞬间的 chunked encoding 与 WebSocket 重连告警保留为过程证据。board 仍是 synthetic backend 预置，未宣称浏览器 UI readback。M2-09 的本机候选 browser/history recovery 子项已关闭，正式目标 browser/recovery、主仓 pin 适配、切换和 release/activation 仍未执行。证据：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-browser-recovery-20261014.json`。
