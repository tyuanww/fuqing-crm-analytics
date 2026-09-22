# CRM 知识与指标候选插件

固定 SDK：DSH 0.1.6-alpha.2，Node 24，Python 3.14+。独立插件，包含合成资料源及默认未连接的看板 GSV HTTP 适配，通过 analytics-workbench 的可选 `cockpit.crm` 插槽展示引用，不修改 DSH 上游或比赛事实合同。构建依赖只读复用已准备好的固定 checkout，不下载或自动安装。

本包依赖当前工作区中的 `backend/`、`scripts/crm-calibration/` 和 `knowledge/crm/`，当前不支持脱离仓库单独发布。

## 注册的工具

| 工具 | 作用 |
|---|---|
| `query_crm_dashboard_gsv` | 用户认可的现看板 GSV 总额、日趋势；绑定账号后只读调用原指标服务；与合成净额候选分开 |
| `query_crm_dashboard_purchases` | 看板GSV分子下的AOV/AUS及正额订单/对应买家覆盖，需新版聚合接口和Host；一组真实窗口已独立只读核对并通过现役真实账号/模型验收，范围见交付记录 |
| `query_crm_dashboard_readiness` | 当前连接下各指标来源具备程度与 A/B/C 分类；只读元数据，不返回明细 |
| `query_crm_dashboard_membership` | 成交时会员溢价；缺快照/事件时不可用，不使用当前 is_member |
| `query_crm_dashboard_net_gsv` | 扣实际成功退款的净额GSV，与看板GSV分列；必须带退款截止日，缺事件时不可用 |
| `query_crm_dashboard_snapshot` | 服务端查询并保存可信的不可变销售快照，供用户确认保存分析及加入驾驶舱 |
| `query_crm_metrics_v1` | 销售表现、老客回购、派样后复购；全部经过只读适配 → 计算器 |
| `crm_knowledge_explain` | 知识包定义、证据、冲突和离线依赖关系；说明合成验证状态 |
| `crm_metrics_capabilities` | 可执行查询与未接入的真实资料能力 |
| `query_crm_knowledge_graph`（可选 graph-tools 模块） | 当前 CRM 账号被授权教材的 Neo4j 一跳关系、分块/页码、文档版本和审核状态 |
| `query_crm_knowledge_sources` | 在授权教材中检索原文分块；须已连接 CRM |
| `expand_crm_knowledge_citation` | 按分块 ID 展开引用；每次重查账号权限和文档版本 |

工具参数没有 SQL、数据库路径或凭据。合成工具的 `source_id` 仍仅允许 `synthetic-crm-metrics`，拒绝真实库；金额为分。看板工具返回元的十进制字符串和整数分，不扣退款、不返回尚未校准的旧客单价/会员溢价。未知、不可用和权限来源均保留。教材检索/图查询按 CRM 登录用户名映射到私有 grants，不把共享 retrieve key 当账号隔离。候选 preset 隔离 `weknora_search`；现役 preset 未改。

`crm_metrics_capabilities` 分为 `synthetic_candidate` 与 `dashboard` 两部分；`LOGIN_BOUND` 表示当前对话已有内存授权，每次查询仍须向 CRM 验证登录。解释 GSV/退款/实收时，`crm_knowledge_explain` 返回 `preferred_real_gsv` 与 `target_candidate`。解释 AUS/AOV 时补充 `preferred_operational_definition`：真实运营默认以当前看板GSV为金额分子，净额候选仍单列；分母覆盖及真实验收未完成时不冒称可取真实数。

## 看板 GSV 连接边界

请求示例（只含业务条件）：

```json
{"start_date":"2026-07-01","end_date":"2026-07-05","channel":"全店","exclude_low_price":false}
```

日期为上海时区自然日，含首尾，最多90天。全店不传 `channel`；剔除低价按现前端的四个渠道重复传递 `exclude_channels`，渠道别名和聚合交给现服务处理。工具依次 GET `/api/v1/auth/me`、`/api/v1/metrics/overview`、`/api/v1/metrics/trend`，固定 GSV，不接受任意 URL、SQL、退款截止日或账号覆盖。

候选通过 DSH 原生对话输入区的 **连接 CRM** 按钮登录。连接成功后，这个按钮显示分析图标和 **CRM分析**。账号和密码经同源受保护 HTTP 路由提交给可信 Host，Host 调用已有 CRM `/auth/login`，只将成功凭据保存在当前进程的私有闭包内，并绑定当前 DSH 对话。密码不作为工具参数、RPC 事件或消息发送给模型；令牌不回传浏览器、不写环境变量、profile、日志或磁盘，也不注入子进程。

- Host 配置仅有 `baseUrl`（默认 `http://127.0.0.1:8000`，仅允许 HTTP 回环源）和 `dataKind`（默认 real）。模型不能覆盖。
- 浏览器路由要求 DSH 原生认证、精确 Origin、POST JSON 和专用请求头；不能通过普通跨站表单授权。
- 每个对话单独连接，最长8小时；对话删除、登录失效、断开或 Host 卸载会取消在途查询并销毁内存授权。服务重启需重登。
- 断开只清除本插件的授权，不调用会使同账号其他页面退出的 CRM `/auth/logout`。
- 没有登录时返回 `NOT_CONNECTED`。现有 CRM 提供账号级校验，没有按渠道细分授权；这不是多租户权限系统。
- 登录限制：15秒、8KiB响应/请求、每次最多2个并行登录、20个有效连接；上游错误正文不转发。

概览与趋势以整数分核对，不一致就返回 `UNAVAILABLE`；未返回日期保留在 `dates_not_returned`，不补0。数据水位、退款截止日均为 `null`，`backend_version_verified=false`；`dashboard-gsv/observed-v1` 是审计口径标识，现 API 未提供可校验的运行版本。两次请求不是事务快照，不承诺快照一致性。401/403、忙碌、警告、超时、取消、重定向和错误内容均停止查询，不读取归档、不自动重试，不返回原始响应或凭据。

## AOV/AUS 候选接口

`query_crm_dashboard_purchases` 使用同样的业务参数和对话登录，先校验 `/auth/me`，再调用 `/api/v1/metrics/dashboard-purchases`。金额、正额有效订单、对应买家及缺口来自同次聚合；零元订单和仅零元买家单列。未知标识、空/负金额使对应均值为空并返回原因。不会读取旧 `avg_order_value`，也不把新老客人数相加当买家总数。

上线此候选需要同时更新CRM后端与CRM插件Host，并保留既有runtime受控重启；只替换preset不能给旧Host增加 `queryPurchases` 能力。重启后需用户在页面重新连接CRM，再对账。接口不存在时明确不可用，不降级查合成数据。部署状态及真实账号/模型验收以[本轮交付记录](../../docs/crm-calibration/crm-assets-release-2026-09-21.md)为准。

## 保存分析、检索、分享与组板

1. 当前对话连接 CRM 后，请求“查询销售指标并生成快照”，明确日期、渠道和剔除低价条件。
2. 打开 **CRM 分析 → 查询快照**，核对过滤、GSV、AOV/AUS、覆盖缺口与查询时间，再选择“保存分析”并确认标题。
3. 在“已保存分析”按标题、说明或编号查找，超过最近 20 条用“更早的记录”续页；打开后可改标题/说明，金额、分母、口径和原始快照不可改。重新查数产生新快照。
4. 分享只填写对方 CRM 账号（`FQ_CRM_PASSWORDS` 中已有的用户名），可撤销；对方在「已保存分析」中只读查看。撤权后该账号现有登录也不能再读。不生成公开链接。
5. 在“指标组板”选择已保存分析中的 GSV/AOV/AUS/订单/买家，安排布局和展示属性；保存、取消、版本冲突后刷新重开。每个组件绑定快照、指标和筛选条件，浏览器与模型都不能提交业务金额。
6. 在“已保存分析”选择“加入驾驶舱”并确认；重开“驾驶舱引用”仍显示原结果。

后端须显式配置 `FQ_CRM_ANALYSIS_STATE_DIR=/absolute/private/directory`（目录预先存在、当前进程所有、权限 0700）与 `FQ_CRM_ANALYSIS_DATA_KIND=real|synthetic`。SQLite 文件权限 0600；已有来源标签不可改成另一种资料。部署必须与 Host 的 `dataKind` 一致。未配置返回 `STATE_NOT_CONFIGURED`，不创建默认存储。含知识引用的分析另需 `FQ_CRM_GRAPH_ACL_FILE=/absolute/private/graph-acl.json`（文件权限 0600，格式见[图谱部署](../../docs/crm-calibration/graph-deployment.md)）；无引用的纯销售分析不读该文件。

接口：`/api/v1/metrics/dashboard-snapshots`、`crm-analyses`（含搜索、PATCH、shares、knowledge-citations）、`crm-boards`、`crm-cockpit-references`、`crm-library`。所有请求沿用认证账号；写入必须带稳定 `Idempotency-Key`。保存、分享和组板只传来源 ID、标题/说明、布局和展示属性，由服务端取事实。模型仅能生成快照。浏览器不能提交金额、owner 或知识来源 ID。

含知识引用的分析：引用只能来自当前对话已连接 CRM 后的图谱/检索/展开工具结果。Host 按会话账本绑定；保存请求中的伪造来源字段被拒绝。分享、读取、列表、驾驶舱加入和组板每次按当前账号重查文档 grants。分享者能读不等于接收者能读。文档撤权后，旧 token、缓存和幂等回执不能恢复访问。纯销售指标分析没有知识引用时不检查教材权限。

确认响应丢失时按原请求重试；并发编辑返回 `VERSION_CONFLICT`，刷新后基于最新版本继续。同一快照只能保存一个标题，同一分析只能固定一次。每账号快照/分析/引用/组板上限为 2000/1000/500/200，回执上限 10000；分析搜索每页最多 20 条并可续页。分享对象必须是现有 CRM 账号，每条分析最多 20 个授权。

当前依赖固定结果，不承诺数据库事务快照或已校验水位。分析分享仍是账号级授权；若分析绑定了教材引用，接收者还须具备对应文档 grants。不覆盖 Word/HTML 多人权限。现役与真实验收以[整合记录](../../docs/crm-calibration/crm-integration-2026-09-21.md)为准。

## 本地复验

使用本机已准备的 SDK checkout 与锁定 build-tools：

```sh
python3 scripts/crm-calibration/verify.py \
  --node /absolute/node24 \
  --upstream /absolute/pinned-dsh-checkout \
  --build-tools /absolute/analytics-workbench/build-tools
```

从仓库根目录运行。它执行后端定向测试、Ruff、离线合同核验、类型检查、插件构建、CLI、合成 HTTP 和真实 ToolRuntime 验证，日志保存在 `.context/checks/crm-candidate-<timestamp>/`。HTTP 测试仅使用本次拥有的临时回环端口并关闭；不启动现役 HTTP/Web、profile、ETL、模型或图服务，不读取真实凭据或数据库。

离线合同更新：`python3 scripts/crm-calibration/generate_contract.py`，再用 Node 24 运行 `scripts/crm-calibration/generate_types.mjs /absolute/build-tools`；`--check` 可检测漂移。

## 隔离宿主与现役的区别

`test/host.integration.mjs` 使用真实固定 Cordis 与 ToolRuntime 加载构建后的包并执行工具，不调用 LLM；取消、错误请求、卸载一起验证。#216交付时与其后本机验收分别记录，见[公开交付说明](../../docs/crm-calibration/public-release.md)及[图谱部署](../../docs/crm-calibration/graph-deployment.md)。

本机接入现状及可复现生成入口见[图谱部署](../../docs/crm-calibration/graph-deployment.md)。生成器使用具体 host 文件入口和每个 preset 的显式 Python 配置，避免固定上游的包子入口 client 发现问题及隔离环境缺少解释器变量的问题。旧包 patch 保留兼容记录，不作为已验证的登录UI部署入口。

## 独立登录候选

```sh
node scripts/crm-calibration/serve-login-candidate.mjs \
  --upstream /absolute/pinned-dsh-checkout \
  --python /absolute/python3.14 \
  --port 16678
```

仅在用户明确需要交互验证时运行。每次创建独立空白工作区、profile 和对话，只监听回环端口；使用现有8000 CRM，不启动或重启它。系统浏览器接收本次 DSH 原生访问链接，输出仅包含不带凭据的地址。该候选关闭模型 provider 与遥测，因此用于登录交互验证，尚不能自动回复；真实模型选工具另行验收。运行元信息保存在本次 `.context/crm-login-candidate/run-*/runtime.json`，停止时只向其中本次 supervisor PID 发送 TERM，不停止现役进程。
