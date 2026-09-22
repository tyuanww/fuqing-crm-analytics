# 项目状态 (Project Status)
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。公开仓库 main 为 **3bc2841（#50）**，VERSION **0.16.0.2**。现役 6677 已加载该插件构建。产品仍 PARTIAL。

## 当前快照（2026-09-22，驾驶舱原生 HTML 0.16.0.2）

| 项 | 状态 |
|---|---|
| 已合代码基线 | **3bc2841（公开仓库 #50）**，前序 #49 / 0.16.0.1。旧私有历史未合入。 |
| 本轮交付 | 对话用 `free_html_page_generate` 交 HTML。工作台放入可编辑驾驶舱，并在对话右侧产物栏打开。步骤见 [操作说明](docs/operating/cockpit-native-html.md)。选区压缩后可点选。GSV 带首购新老客和仓库最后支付日。 |
| VERSION / 产品 | 公开 main **0.16.0.2**。产品 **PARTIAL**，原全量 Goal **PAUSED**。 |
| DSH 基座 | **0.1.6-alpha.2（ddefc45f）**，不改上游。 |
| 现役 | 6677 加载 `crm-public-release` 的 0.16.0.2 插件；控制登记与 runtime 留在原仓。CRM 18093 仍为 `crm-assets-public` 的 archive_dashboard，本轮未重启。 |
| 原始数据 | 约131GB归档DuckDB不进Git；测试使用合成夹具与独立私有 SQLite。 |

以下 2026-09-21 记录是 0.15 施工留档，不是 0.16.0.2 的当前计划。

## 本轮施工计划

### HTML 卡片文案与块级 AI（本工作树）
- PagePackage 增加 presentation overlay：身份目标、显示文字、受限样式；筛选后按身份重应用。
- OCR 46/46 复核后 4 处已修。变基后接触面 Node 45 passed、Python 17 passed；源码选区 7 passed。
- 合成 backend 2873 passed / 77 skipped / 71 deselected；B0 pipeline PASS。
- 真实 MiniMax-M3 五项合成选区评估 PASS（3 改字 + 2 越界拒绝）；6677 未重启。证据 `.context/checks/cockpit-native-eval/`。
- 本人 UAT 与把本候选加载 6677 另授权。

### 已合公开主线（#34–#38）
- #38 分析检索/编辑/分享/独立组板，readiness/membership/net-gsv，图谱 ACL。6677 已加载代码；18093 仍为旧 archive 实例。
- 图谱账本分母 1163=已核实43+已拒绝7+待核对1113。纯销售指标分析不绑教材。
- #34 单个已确认短窗口真实账号/模型通过，不代签本人 UAT。#36/#37 完整 HTML 编辑旅程与用户文件 UAT 仍开放。

### 仍开放且不由本轮代签
- 本候选合入后的 6677 加载、本人 UAT。
- 成交时会员身份、成功退款流水、可按退款截止日重算的全店首购、派样资格；利润 ROI 另需成本。
- 图谱 1113 条待核对关系；抽取时未保存的原文哈希与同版本证明。
- P13、逐格式真实模型编辑、扫描 PDF OCR、复杂 Office 及 PDF 浮动菜单。
- 原生侧栏 veto、openPlazaRole、Noto 字体及正式壳 B3 仍按原账本。

### 已有交付与产品边界
一期产物柜、看板布局/回退已合。S2-C1/#136、R-1/#153、人群行动/#166 的历史证据在 [TODOS](docs/hackathon/TODOS.md#m1-核心交付)。G1–G6/U1 的 2026-09-16 记录不重开。T13 有界合成复测；diag.fixed_cohort 仍 UNSUPPORTED。未知金额 WATERFALL 仍 422。

## 当前施工边界

不改 DSH 上游、不引入第二个 Agent Loop；ONLYOFFICE 仅作用户授权的隔离文档服务。不新增 SQL 工具或泛化比赛问数合同。不启动真实 ETL、不碰归档库、不停无关端口。公网、真实消息、模型/凭据迁移和现役切换分别授权。

本地与 CI 按 [验证入口](docs/operating/verification.md)，未跑/skip 不算通过。行为规则见 [AGENTS](AGENTS.md)，视觉见完整 [DESIGN](DESIGN.md)，历史见 [STATUS-HISTORY](docs/history/STATUS-HISTORY.md)。
