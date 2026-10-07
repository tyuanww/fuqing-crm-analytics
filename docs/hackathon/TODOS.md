# TODOS

施工顺序与禁区看仓库根 [STATUS.md](../../STATUS.md)。当前以本文件 **M1 核心交付**接续；Git 交付、产品验收与历史短 PR 分别记账，不另建平行 `todo.md`。七阶段历史账本：[产品验收与发布准备](./PRODUCT-READINESS-2026-09-10.md)。[总待办](./PLAN-CLOSEOUT-2026-09-05.md)和原 [11 工作包](./AUTOPLAN-IMPLEMENTATION-TASKS-2026-09-05.md)是规划编号，不代替当前任务卡。

## M1 核心交付

2026-09-13 用户确认“核心版本优先交付、扩库完善后置”。目标是问数后 AI 优先使用定制组件自由组板，板内按选定范围修改；首批六类不是最终上限。M1／产品仍 PARTIAL；原全量 App Goal 保持 PAUSED。本节承接原本地施工记录，不把旧冻结实现反推成最终需求。

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
- [ ] T15 剩余：插件/服务物理分仓、指标/知识服务的目标平台安装、invariant、供应链门禁；首购服务 WSL 合成安装已通过，但不代签其他服务。kit 仍以相邻 workspace 路径消费，迁移前改成固定开发依赖并验证独立仓根目录构建。整体仍 PARTIAL。
- [x] T3/T7/T15 首购服务独立应用包子项（2026-10-04）：同包生成 OpenAPI、13 项固定依赖、仓库外实际 HTTP 保存/重启回放与 forward-fix；共享后端 17 PASS（含 7 个包集成场景），已验证 FIFO/合同生成副作用拒绝。见[服务包证据](./evidence/dsh-g0-analysis-service-package-20261004.md)。仅同版本本机 synthetic，不关闭下方精确旧/新包和主机门禁。
- [x] T3/T7/T15 精确服务包配对子项（2026-10-05）：旧 `56198c32` / 新 `a50bd424` 两个实际 archive，各自离线 hash wheel 冷安装 13 项依赖，Darwin arm64 **9/9**；共享后端 **25 PASS**（包内 8 个集成场景）与 SIGTERM 回收通过。见[配对证据](./evidence/dsh-g0-service-artifact-pair-20261005.md)。新回执尚未被现有激活门禁消费，不替代 WSL/供应链/身份验证。
- [x] 服务包 OCR delegate（2026-10-05）：原始 **21/21** 路径全覆盖，Git replacement 与取消回收两个缺陷修复；修复后共享后端 25 PASS（内部 10 个包场景）、固定双包 9/9。见[审核证据](./evidence/dsh-g0-service-artifact-review-20261005.md)。
- [x] T3/T7/T13/T21 本机服务包回执接线（2026-10-05，`82c1f5cd` 后增量）：`plugin verify-service` 将原候选、源码回执、两份实际包与依赖记录绑定原 journal；新门禁 29 PASS、release suite 199 PASS，实际 CLI 重试幂等及 3 项篡改拒绝通过。见[接线证据](./evidence/dsh-g0-service-artifact-gate-20261005.md)。不关闭目标主机或生产门禁。
- [x] 服务包接线 OCR delegate（2026-10-05）：原始 15/15 路径和两份修复文件已审；已验证 journal 前置/并发历史、FIFO 与日志回显四项负测先失败后通过，完整 release suite 206 PASS，实际双包 CLI 重试通过。见[审核证据](./evidence/dsh-g0-service-artifact-gate-review-20261005.md)。
- [x] T3/T15 目标主机预检子项（2026-10-06，`1b443646` 后未提交增量）：`plugin service-preflight` 只读校验 manifest 摘要、WSL2/Python、离线 wheel 清单/平台/ABI/Requires-Python；24 PASS，release suite 206 PASS，实际包在 Mac 正确 BLOCKED。见[证据](./evidence/dsh-g0-service-target-preflight-20261006.md)；不关闭真实 WSL、安装、身份与恢复门禁。
- [x] 目标主机预检 OCR delegate（2026-10-06）：原始 11/11 覆盖，安装格式/标签与依赖约束两类问题已修；6 项复现负测修复后通过，专项 35 PASS、release suite 206 PASS，实际 wheel 无误拒绝。见[审核记录](./evidence/dsh-g0-service-target-preflight-review-20261006.md)。
- [x] T3/T15 目标平台依赖准备子项（2026-10-06，`79434033` 后）：已只读核验杭州 WSL2/x86_64/Python 3.14.4，按实际标签在本地准备 13 个固定 Linux wheel，并复核官方 SHA-256；见[证据](./evidence/dsh-g0-service-target-platform-20261006.md)。准备阶段未安装；后续实测见下一项。
- [x] T3/T7/T15 首购服务 WSL 合成验收子项（2026-10-06）：复用固定双包，现有低权限账号的两个独立 venv 离线冷安装、真实 HTTP 保存/权限/冲突、SIGKILL 后幂等恢复、旧版只读与未知 schema 拒绝等 **14/14**；修正测试夹具目录权限，前次失败保留。成功轮次 10 个、失败轮次 1 个临时进程与安装目录均已回收，生产入口监听/PID 不变。见[证据](./evidence/dsh-g0-service-target-acceptance-20261006.md)。不关闭生产身份、供应链或 DSH 宿主验收。
- [ ] T2/T17 剩余：Windows/WSL、rc1→rc2/torn-frame、浏览器/client、shell/tool union 与目标平台 runtime；本机十项不代签这些验收。同进程任意插件隔离不承诺。
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
- [ ] 新候选其余准入证据与 G0 stop/go：当前包浏览器、完整跨版本 corpus、真实身份/模型/UAT、签名/SBOM、生产 activation/canary/rollback；不继承旧候选的 HTTP/browser 事件。
- [ ] 旧工作树差异与分仓前置按[并行边界](./evidence/dsh-g0-worktree-triage-20261007.md)推进：public 138 条均有当前/历史已提交 blob，不重复提交；HTML 34 文件待语义审查，kit 固定开发依赖和信任验证独立推进；共享候选/journal 顺序收口。

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
