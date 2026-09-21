# 项目状态 (Project Status)
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。公开仓库 main 为 **64eb6e0（#37）**。本轮工作树 `codex/crm-analysis-board` 整合分析组板、指标收尾与图谱 ACL，VERSION **0.14.0.0**。不沿用旧仓 main，不并入 `codex/cockpit-inline-edit`。产品仍 PARTIAL。详见[整合记录](docs/crm-calibration/crm-integration-2026-09-21.md)。

## 当前快照（2026-09-21，三候选本地整合）

| 项 | 状态 |
|---|---|
| 已合代码基线 | **64eb6e0（公开仓库 #37）**，前序 #36 驾驶舱 / #35 文档 / #34 CRM。旧私有历史未合入。 |
| 本轮交付 | 工作树 `codex/crm-analysis-board`：分析检索/编辑/分享/组板，readiness/membership/net-gsv，图谱 ACL，含引用分析的文档权限接线。6677 未切换。 |
| VERSION / 产品 | 候选 **0.14.0.0**。产品 **PARTIAL**，原全量 Goal **PAUSED**。loopback，不上公网。 |
| DSH 基座 | **0.1.6-alpha.2（ddefc45f）**，不改上游。 |
| 现役 | 6677 仍加载公开 #36/`7575d07` 之后的 0.13.0.0；CRM 18093 / WeKnora 18092 / Neo4j 17474 / 原 8000 未切换到本工作树。 |
| 原始数据 | 约131GB归档DuckDB不进Git；本轮测试使用合成夹具、独立私有 SQLite，以及既有短窗口只读复算记录（不新读归档）。 |

## 本轮施工计划

### 三候选整合（本工作树，未合入）
- 分析：历史检索分页、标题/说明 PATCH、账号分享/撤销、独立 `crm-board/v1`，服务端填金额。
- 指标：dashboard-readiness / membership / net-gsv；缺会员时点或退款事件返回不可用。GSV/AOV/AUS 10 组真实只读复算记录保留。
- 图谱：关系质量账本、文档版本/分块哈希、CRM 账号文档 grants；查询/检索/引用展开每次重查。账本分母 1163=已核实43+已拒绝7+待核对1113。
- 接线：仅当分析含可信查询链路的知识引用时检查文档 grants；分享者能读不等于接收者能读。纯销售指标分析不绑教材。候选 preset 隔离共享 `weknora_search`；现役 preset 未改。
- Git 发布走 `/ship`；6677 现役未切换。验证命令与分层证据见整合记录。

### 已合公开主线（#34–#37）
- #34 可信快照→私有分析→驾驶舱引用，单个已确认短窗口真实账号/模型通过，不代签本人 UAT。
- #36/#37 驾驶舱交互与文档；完整 HTML 编辑旅程与用户文件 UAT 仍开放。

### 仍开放且不由本轮代签
- 合入 main、6677 加载本候选、本人 UAT、真实模型重测。
- 成交时会员身份、成功退款流水、可按退款截止日重算的全店首购、派样资格；利润 ROI 另需成本。
- 图谱 1113 条待核对关系；抽取时未保存的原文哈希与同版本证明。
- P13、逐格式真实模型编辑、扫描 PDF OCR、复杂 Office 及 PDF 浮动菜单。
- 原生侧栏 veto、openPlazaRole、Noto 字体及正式壳 B3 仍按原账本。

### 已有交付与产品边界
一期产物柜、看板布局/回退已合。S2-C1/#136、R-1/#153、人群行动/#166 的历史证据在 [TODOS](docs/hackathon/TODOS.md#m1-核心交付)。G1–G6/U1 的 2026-09-16 记录不重开。T13 有界合成复测；diag.fixed_cohort 仍 UNSUPPORTED。未知金额 WATERFALL 仍 422。

## 当前施工边界

不改 DSH 上游、不引入第二个 Agent Loop；ONLYOFFICE 仅作用户授权的隔离文档服务。不新增 SQL 工具或泛化比赛问数合同。不启动真实 ETL、不碰归档库、不停无关端口。公网、真实消息、模型/凭据迁移和现役切换分别授权。

本地与 CI 按 [验证入口](docs/operating/verification.md)，未跑/skip 不算通过。行为规则见 [AGENTS](AGENTS.md)，视觉见完整 [DESIGN](DESIGN.md)，历史见 [STATUS-HISTORY](docs/history/STATUS-HISTORY.md)。
