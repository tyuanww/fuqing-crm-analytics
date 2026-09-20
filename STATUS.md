# 项目状态 (Project Status)
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。 本轮交付分支 `codex/cockpit-ui-ux-ship` 基于公开仓库 `origin/main` / `106717e6`，仅移植驾驶舱候选，不带入旧私有历史；原 `codex/cockpit-ui-ux` 工作树保留。包含可恢复删除、标题精简、整个面板移动/缩放、全屏与静态 HTML 选区编辑；已完成复审修复及合成验证；按用户选择补充真实模型选区评估，通过后创建 PR。尚未推送、合并或切换现役，真实模型及用户文件 UAT 未验收，产品仍 PARTIAL。详见[本轮记录](docs/hackathon/COCKPIT-UI-UX-2026-09-20.md)。

## 当前快照（2026-09-20，图谱接入）

| 项 | 状态 |
|---|---|
| 本地 Git 基线 | **96ba94a（新公开仓库 #11）**，来源旧仓库 `7c20bc4f`（#217）；旧历史保留本地。 |
| 本轮交付 | CRM 指标 #11 已合入 `96ba94a`，CI 与合成 HTTP/宿主验收通过；依赖升级联合候选及 TypeScript 7 阻断见[收尾记录](docs/maintenance/dependency-closeout-2026-09-20.md)，尚未切现役。 |
| VERSION / 产品 | **0.13.0.0**，驾驶舱交互与静态 HTML 选区编辑候选；产品仍 **PARTIAL**，原全量 Goal **PAUSED**。loopback，不上公网。 |
| DSH 基座 | **0.1.6-alpha.2（ddefc45f）**，不改上游。 |
| 现役 | 6677已接CRM登录与GSV，真实模型GSV及文档检索已通过；首次图谱接入仅更新CRM preset，MiniMax实际调用通过。切主仓、保留历史的重启及清理按本机部署回执分别验收。 |
| 原始数据 | 约131GB归档DuckDB不进Git，不复制、改写或全表扫描；本轮新测试使用合成夹具，真实图谱仅查询已部署教材。 |

## 本轮施工计划

### 下一轮优先级：诊断证据 → AOV → AUS（隔离候选，未发布）

- 新工作分支 `codex/crm-metrics-next`，不修改现役服务。#217 的主仓构建切换、新对话图谱/登录/GSV验收及本轮旧工作树清理已完成，私有回执保留。
- P0：main 首轮 CI 的 `EXECUTION_UNKNOWN` 根因未确认。补充有界、无原始异常文本的 worker 观测诊断和失败测试回执；不放宽失败条件，不以重试冒充修复。
- P1：新增看板同过滤单次聚合接口和 `query_crm_dashboard_purchases`，返回 AOV、AUS 及未知订单/买家覆盖；金额分子沿用看板 GSV，净额版单列。原看板页面未迁移。 验收顺序：合成边界与合同/宿主测试 → 代码审查及发布检查 → 按实际授权部署 → 已确认真实窗口对账。真实 AOV/AUS 当前仍未验收。
- P2：图谱重点口径核对与原文版本证据。P3：退款/会员身份等源资料核实后再接净额、会员溢价、复购/LTV。P4：持久引用和多人资料权限。
- 追加确认：零元订单和仅零元购买者不计AOV/AUS分母，单列统计；负额和缺失标识仍阻断相应均值。详情见 [本轮施工记录](docs/crm-calibration/metrics-next.md)。

### 图谱查询与部署固化

- 教材自动图已生成，不代表全图语义正确。新增受限Neo4j查询，按WeKnora retrieve key逐次鉴权，返回分块/页码和核对状态；3条会员溢价关系核实、3条误连隔离，原始图保留。
- 现役新会话选择“CRM 知识与指标”，MiniMax已实际调用图谱及口径工具。profile生成命令固化具体host入口和显式Python；清理旧工作树前须释放持有旧模块的实例，保留运行目录、对话历史、输出哈希、备份与回退说明。
- 知识包中旧C线实现状态保留为历史快照；文件指纹变化后标“验证过期”，不再错误宣称代码未实现。线上图谱、离线定义、合成计算、真实业务验收分开报告。
- 追加确认：真实AUS/AOV分子沿用当前看板GSV，净额候选单列。现接口的明细行均值不能当AOV，完整买家与未知身份、成交时会员历史仍待接入。
- 已审查14个代码/配置文件及6份文档，未发现合并阻断项。合成后端2762通过、77跳过、0失败；CRM专项Node 69通过、原生Host 19通过，覆盖有重叠，不相加。远端CI与本机切换另按实际提交验收。
- 复现及限制见[图谱部署](docs/crm-calibration/graph-deployment.md)和[真实指标清单](docs/crm-calibration/metric-readiness.md)。仍未完成全图审核、其他指标真实UAT和持久引用。

### 历史交付：CRM 指标、知识与原生对话登录（0.12.0.0，已合 #216）

以下保留 #216 交付时的候选和未验收边界；本机当前运行状态以上述快照为准。

- 独立插件支持当前对话连接 CRM 与现看板 GSV 兼容查询；凭据仅驻留 Host 内存，不进入模型工具参数。GSV 沿用已确认旧口径，不能再次扣退款。
- `crm-metrics/v1` 的销售、老客回购、派样跟踪仅使用受控合成源。216 节点、356 条边是离线依赖图，不代表 WeKnora/Neo4j 已上线。公开能力及边界见 [交付说明](docs/crm-calibration/public-release.md)。
- 共享完整合成后端：2762 passed、77 skipped、零失败，共11组；候选另有84项后端、54项Node、18项原生Host及Ruff/合同/类型/构建通过，层级重叠不相加。编译后的React/AntD组件覆盖错误重试、断开与会话切换，93文件指纹核对通过。
- 真实账号与模型查询、完整D019映射、现役挂载、旧服务迁移、私有ACL及图服务仍未验收。当前只返回来源与 `query_ref`，保存分析/驾驶舱持久化引用未接通。

### 上轮历史：统一 AI 产物修改（0.11.0.0，已合 #215）

以下保留上一轮施工与验收记录；其中候选、PR待办及运行状态均按当轮时间理解，不作为本轮CRM验收。

- Ship 新验证：合成后端2678 passed/77 skipped/71 deselected；完整B0另含567项Python及所选Node/编译后DOM/契约/类型/构建/干净重建通过，两层有重叠，不相加计数；补齐httpx依赖声明和两条损坏候选回归。本次跳过追加审查，见[Ship记录](docs/hackathon/COCKPIT-SHIP-2026-09-20.md)。
- 前轮按用户指定的OCR delegate完成42/42代码文件审查（0跳过，覆盖100%），不调用外部模型；新增修复保存回执重试误清除后续修改、文档服务失败后永久锁定、损坏Office压缩包被接受。完整B0通过：565项Python及所选Node/编译后DOM/契约/类型/构建/干净重建；该审查轮没有重跑真实浏览器或模型，见[Delegate审查记录](docs/hackathon/COCKPIT-DELEGATE-REVIEW-2026-09-20.md)。
- 前轮R1–R7已保留：页面权限重查、候选过期恢复、Office回执身份核对、旧草稿误确认修复、明确冲突回执及AI任务分页/并发幂等；562项Python与Word实际浏览器路径为前轮证据。外部OCR仍是18/42完成、24项超时，不能改记成外部审查成功；详见[修复记录](docs/hackathon/COCKPIT-REVIEW-REPAIRS-2026-09-20.md)。
- 接续同一隔离工作树，HTML/Word/表格/CSV/PDF连接DSH原生对话；以指定版本副本、固定候选、只读预览、显式确认和CAS回执闭环保存，不引入第二Agent Loop。
- 真实浏览器的六条候选路径、丢失保存响应恢复、独立版本落盘已通过；模型输出为明确的合成验收夹具。真实原生模型因未配置凭据返回MISSING_CREDENTIAL，真实AI修改未验收，P13不冒报通过。
- 业务绑定HTML只允许AI改CSS；OCR及复杂Office兼容仍开放。本次按用户要求跳过追加代码审查；未触碰WeKnora主仓、未切换6677。详见[AI本地验收](docs/hackathon/COCKPIT-AI-EDIT-2026-09-20.md)和[使用说明](docs/operating/cockpit-ai-edit.md)。

### 历史产物、手动添加与多格式编辑

- 补齐真实 Cordis 的 `remote.workspaceFiles` / `sidebarRight` 注入；认证 `sessionQuery` 冷读历史 present 及成功 write/edit，按物理路径去重，显示来源对话，支持分页、搜索与部分失败提示。固定上游未修改。
- 添加 HTML、Word、Excel/CSV、PDF 等文件，保存私有原件与不可变版本。历史 Office 文件通过原生分段读取后保存独立副本。手动 HTML 有真实文件来源，无伪造 session，无业务绑定。
- 用户选择本机 Docker ONLYOFFICE；固定9.4.0镜像，仅loopback端口。编辑同步、显式保存、回执未知、CAS冲突与离开保护分开处理。
- 原生 Host 重启后的合成历史发现，以及手动 HTML、Word、XLSX、CSV、文本型PDF的实际编辑和独立落盘读取已验证。PDF主工具栏正文编辑通过，浮动菜单入口仍有上游失败记录。
- 浅灰/黑字/橙色视觉沿用；窄屏标题和动作分两行，Office显示编辑状态及版本。完整结果及未执行项目见 [本地验收](docs/hackathon/COCKPIT-HISTORY-IMPORT-2026-09-20.md)，启动配置见 [本地文档服务](docs/operating/cockpit-office-local.md)。
- 本次授权 commit/push/PR；代码与版本/验收提交已推送，PR及其CI待接续；未 merge/reload；上一轮 C01–C03 的历史证据保留于 [V2交付](docs/hackathon/COCKPIT-V2-LOCAL-2026-09-19.md)。

### 仍开放且不由本轮代签的验收

- **P13**：保留原第一场真实失败，Agent Team 可见文件/Bash，未取得 free_html_page_generate 交付；后两场 **NOT_RUN**。文件入柜不代表工具注入已修复，字面替换不代表复杂 AI 编辑通过。
- 本轮完整固定 DSH 宿主浏览器使用合成会话和文件；现役6677、用户真实历史、真实模型、真实业务及用户本人视觉/UAT 未验收。扫描PDF的OCR、复杂Office兼容性及PDF浮动菜单异常仍开放。
- 工作区变化当前手动/重入刷新；未冒接不存在的宿主事件。HTML无可靠映射或动态/绑定区域只读；外链及不可读取的相对资源明确拒绝入库。
- 原生侧栏 veto、openPlazaRole、Noto 字体及正式壳 B3 仍按原账本记录，不以新局部界面覆盖旧验收限制。

### 已有交付与产品边界

一期产物柜、本页编辑壳、看板布局/回退、HTML 悬停已随 #213 合入。S2-C1/#136、R-1/#153、比赛看板入口/#155+#157、人群行动/#166、品类脱敏/#165 的历史证据保留在 [TODOS](docs/hackathon/TODOS.md#m1-核心交付)。G1–G6/U1 的2026-09-16记录不重开，不等于本轮验收。

T13 有界合成复测；diag.fixed_cohort 仍 UNSUPPORTED。T15 用户原确认保留。T16 原合成基线不是 SLO 通过；T17 用户原“缺口也算关”不写成能力通过。未知金额 WATERFALL 仍422。

## 当前施工边界

不改 DSH 上游、不引入第二个 Agent Loop；ONLYOFFICE 仅作用户授权的隔离文档服务。不新增 SQL 工具或泛化比赛问数合同。不启动真实 ETL、不碰归档库、不停无关端口。公网、真实消息、模型/凭据迁移和现役切换分别授权。

本地与 CI 按 [验证入口](docs/operating/verification.md)，未跑/skip 不算通过。行为规则见 [AGENTS](AGENTS.md)，视觉见完整 [DESIGN](DESIGN.md)，历史见 [STATUS-HISTORY](docs/history/STATUS-HISTORY.md)。
