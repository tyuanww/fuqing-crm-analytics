# TODOS

施工顺序与禁区看仓库根 [STATUS.md](../../STATUS.md)。当前以本文件 **M1 核心交付**接续；Git 交付、产品验收与历史短 PR 分别记账，不另建平行 `todo.md`。七阶段历史账本：[产品验收与发布准备](./PRODUCT-READINESS-2026-09-10.md)。[总待办](./PLAN-CLOSEOUT-2026-09-05.md)和原 [11 工作包](./AUTOPLAN-IMPLEMENTATION-TASKS-2026-09-05.md)是规划编号，不代替当前任务卡。

## M1 核心交付

2026-09-13 用户确认“核心版本优先交付、扩库完善后置”。目标是问数后 AI 优先使用定制组件自由组板，板内按选定范围修改；首批六类不是最终上限。M1／产品仍 PARTIAL；原全量 App Goal 保持 PAUSED。本节承接原本地施工记录，不把旧冻结实现反推成最终需求。

### 2026-09-24 DSH RC1 与产物收件箱候选

工作树 `codex/dsh-017-rc1`，VERSION `0.18.0.0`，固定 DSH `0.1.7-rc.1`；候选插件不修改 DSH 上游。收件箱、原生 HTML 接入、确认保存和单卡片局部 patch 已完成代码与隔离门禁；产品仍 PARTIAL。

- [x] Artifact Inbox 持久化、幂等去重、候选确认/丢弃及正式页面隔离。
- [x] 自由 HTML、原生 `write/edit/present`、事件/轮询统一登记到收件箱。
- [x] 收件箱 UI、候选预览/确认、结构化样式与局部 patch 守卫。
- [x] B0 完整 pipeline、构建、类型检查和插件测试通过；清理目录有界且自动回收。
- [ ] 真实浏览器级收件箱→预览→局部编辑→保存旅程；当前缺 Playwright headless 二进制。
- [ ] 本人 UAT、远端 CI、合并和正式发布。

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
- [x] #133：仓库专属 [ship-pr](../../.agents/skills/ship-pr/SKILL.md) 已纳管。
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
