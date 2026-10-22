# CRM 指标与分析候选插件

发布 peer：DSH `0.2.1-rc.1`、Cordis `4.0.5`，与杭州现场一致；Node 24。仓库本地回归仍使用兼容基线 `0.1.7-rc.2`，发布包必须再从杭州 0.2.1 runtime 的固定 upstream 构建并生成 provenance，本地类型检查不能替代目标版本验收。插件运行不需要 Python；服务和跨服务测试另用锁定 Python 3.14+。独立插件，包含显式配置的合成服务客户端及默认未连接的看板 GSV HTTP 适配，通过 analytics-workbench 的可选 `cockpit.crm` 插槽展示引用，不修改 DSH 上游或比赛事实合同。构建依赖只读复用已准备好的固定 checkout，不下载或自动安装。

本包保留身份 `@shine-mage/dsh-crm-knowledge`。杭州现役 side-load 为 `0.0.0-crm.3`，插件页显示 CRM Host 与客户端 `2/2` 运行中；商品新老客、RFM 快照和对应健康字段已完成真实接口检查。它只拥有 CRM 登录、指标与分析；公开知识解释和图谱工具已迁入[独立知识插件](../knowledge/README.md)。两个包各自构建、测试和打包，生产源码没有相互导入，也不引用 workbench 内部实现。CRM 只携带指标 HTTP API 1.0.0 客户端，不查找主仓目录或启动 Python。未配置合成服务时返回 `NOT_AVAILABLE / SERVICE_NOT_CONFIGURED`；真实看板登录与查询不会改查合成源。当前运行边界见[增长董事会部署回执](../../docs/hackathon/evidence/dsh-growth-board-deployment-20261022.md)。

Python 实现和知识资源的维护源仍在 workspace；两项服务已分别完成[独立应用候选打包与隔离运行](../../docs/operating/crm-service-packages.md)。物理分仓、平台依赖冷安装及精确宿主发布证据尚未完成。配置、迁移与兼容窗口见[服务边界](../../docs/operating/crm-plugin-service-boundary.md)。

## 注册的工具

| 工具 | 作用 |
|---|---|
| `query_crm_dashboard_gsv` | 用户认可的现看板 GSV 总额、日趋势、首购口径的新客/老客，以及仓库最后支付日；绑定账号后只读调用原指标服务；与合成净额候选分开 |
| `query_crm_dashboard_purchases` | 看板GSV分子下的AOV/AUS及正额订单/对应买家覆盖，需新版聚合接口和Host；一组真实窗口已独立只读核对并通过现役真实账号/模型验收，范围见交付记录 |
| `query_crm_product_customer_cohorts` | 任意已登记商品的新客、老客、会员拆分与同比；一个商品映射多个 SPU class 时按 `user_id` 去重，不把品类人数直接相加 |
| `query_crm_rfm_snapshot` | 读取杭州预计算的 RFM 8象限快照；缓存 miss 明确不可用，不在 Web 请求内现场扫描业务库 |
| `query_crm_dashboard_readiness` | 当前连接下各指标来源具备程度与 A/B/C 分类；只读元数据，不返回明细 |
| `query_crm_dashboard_membership` | 成交时会员溢价；缺快照/事件时不可用，不使用当前 is_member |
| `query_crm_dashboard_net_gsv` | 扣实际成功退款的净额GSV，与看板GSV分列；必须带退款截止日，缺事件时不可用 |
| `query_crm_dashboard_snapshot` | 服务端查询并保存可信的不可变销售快照，供用户确认保存分析及加入驾驶舱 |
| `query_crm_metrics_v1` | 销售表现、老客回购、派样后复购；全部经过只读适配 → 计算器 |
| `crm_metrics_capabilities` | 可执行查询与未接入的真实资料能力 |
| `crm_service_health` | 查看当前对话连接及 Purchases、快照、知识库、驾驶舱工具的真实状态；页面提供方未装配时明确 `NOT_AVAILABLE`，其余未知状态保持 `unknown` |

`crm_knowledge_explain` 及 `query_crm_knowledge_graph/sources`、`expand_crm_knowledge_citation` 由知识包的公开入口注册，须在 profile 中另行选择。CRM 单独安装时，这些工具不注册；`crm_service_health.knowledge_base/knowledge_explanation` 明确报告未安装或不可见，原有指标工具仍可用。

工具参数没有 SQL、数据库路径或凭据。合成工具的 `source_id` 仍仅允许 `synthetic-crm-metrics`，拒绝真实库；金额为分。看板工具返回元的十进制字符串和整数分，不扣退款、不返回尚未校准的旧客单价/会员溢价。未知、不可用和权限来源均保留。教材检索/图查询按 CRM 登录用户名映射到私有 grants，不把共享 retrieve key 当账号隔离。独立知识插件不注册生产 WeKnora 检索；`crm-query` 的 `weknora_search` 由生产薄适配器提供，固定项目资料库 allowlist，跨库搜索和文档读取均 fail-closed。

`crm_metrics_capabilities` 分为 `synthetic_candidate` 与 `dashboard` 两部分；`LOGIN_BOUND` 表示当前对话已有内存授权，每次查询仍须向 CRM 验证登录。解释 GSV/退款/实收时，`crm_knowledge_explain` 返回 `preferred_real_gsv` 与 `target_candidate`。解释 AUS/AOV 时补充 `preferred_operational_definition`：真实运营默认以当前看板GSV为金额分子，净额候选仍单列；分母覆盖及真实验收未完成时不冒称可取真实数。

## 可选页面工具与主题合同

`free_html_page_generate` 由 workbench 的公开 `./page-tools` 入口拥有，CRM 不再携带页面解析器或重复注册工具。需要在 CRM 对话交付 HTML 时，在**新建候选 profile**中显式组合已构建的提供方：

```sh
node scripts/crm-calibration/prepare-profile.mjs \
  --output /absolute/new-private-profile \
  --plugin /absolute/installed/crm \
  --knowledge-plugin /absolute/installed/knowledge \
  --metrics-origin http://127.0.0.1:18101 \
  --knowledge-origin http://127.0.0.1:18102 \
  --page-tools-plugin /absolute/installed/workbench
```

入口校验各包身份、固定 DSH/Cordis peer、组合合同 v1、公开 export 和打包 allowlist，分别记录包指纹；只写新配置，不安装、不激活、不执行插件。省略知识插件及其 origin 即为纯 CRM profile；省略页面提供方时 CRM 查询/登录仍可用，`crm_service_health.page_delivery` 返回 `NOT_AVAILABLE` 与 `PAGE_PROVIDER_NOT_INSTALLED_OR_NOT_VISIBLE`。`AVAILABLE/NOT_RUN` 只表示工具在当前 scope 可见，不证明保存或页面 UAT 已完成。页面预览/确认仍需工作台 UI 与服务，不能只装 tools adapter 就宣称可保存。

包 `cordis.patch.yml` 先安装一个无业务副作用的裸包名 Host+Client 载体，再安装独立登录 Host。裸包名是 DSH 发现 `exports["./client"]` 的必要条件；载体使用 `registerTools=false`，不会把业务工具泄漏到所有会话。指标工具仍只由 Agent preset 的 scoped 条目注册。宿主加载时须显式传入生成的 `host.patch.yml` 和 `preset.patch.yml`；后者使用官方 `@deepseek-ai/dsh-agent-preset` 声明。旧 `preset/` 目录只作可检查描述，rc2 不会自动扫描注册。整体插件切换采用受控重启；已有会话不会因删除 preset 声明立即卸载。实际本机宿主、原生会话/WAL 和回退证据见[固定宿主验收](../../docs/hackathon/evidence/dsh-g0-pinned-host-20261004.md)，不代表杭州或真实服务通过。

主题和 slot 都编译本包自带的生成合同；主题由 `shine-brand/contracts/content-theme.v1.json` 维护，不要求运行品牌插件，不改官方 DSH 原生界面。生成物 drift 由 B0 pipeline 检查。更新完整候选须从 reviewed SHA 重建，本地 fixture pack 不是可发布版本。

## 看板 GSV 连接边界

CRM Host 默认 `baseUrl` 为 `http://127.0.0.1:8000`，适用于 rc2 独立配置；线上 `crm-query` 配置型 bundle 会用同名 Host 条目覆盖为 `http://127.0.0.1:18093`。两种配置都只接受回环地址，模型不能覆盖。

请求示例（只含业务条件）：

```json
{"start_date":"2026-07-01","end_date":"2026-07-05","channel":"全店","exclude_low_price":false}
```

日期为上海时区自然日，含首尾，最多90天。全店不传 `channel`；剔除低价按现前端的四个渠道重复传递 `exclude_channels`，渠道别名和聚合交给现服务处理。工具依次 GET `/api/v1/auth/me`、`/api/v1/metrics/overview`、`/api/v1/metrics/trend`，再可选读取 `/api/v1/metrics/cutoff`；截止日缺失不伪造数值，固定 GSV，不接受任意 URL、SQL、退款截止日或账号覆盖。

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

## 商品新老客接口

`query_crm_product_customer_cohorts` 调用只读 `POST /api/v1/category/product-customer`。商品名称来自登记目录；省略 `products` 时查询全部商品，单次最多20个。日期最多90天，可显式提供对比期，否则按自然日映射到一年前，`2月29日` 回退到 `2月28日`。当前金额口径固定为 GSV，避免 GMV 结果继续使用 `gsv` 字段名。

后端按商品实时聚合订单，不先分别计算多个 SPU class 再相加人数。`current` 和 `comparison` 都包含全店、新客、老客、会员的 GSV、人数、AUS、占比和同比；结果同时返回 `data_cutoff`、`new_old_cutoff` 与 `comparison_new_old_cutoff`。新老客截止日沿用品类看板的期初月界口径，调用方必须展示两个分群截止日，不能把它们称为“今天的新老客”。

## RFM 快照接口

`query_crm_rfm_snapshot` 调用 `/api/v1/customer-health/rfm-analysis`，只读取杭州预计算缓存，不在 Web 请求内执行三段 live SQL。返回 8 个 RFM 象限加 1 个已购客 TTL，共 9 行；四组结果必须具有同一组唯一标签。结果还包含当前/去年/前年标签、仓库截止日和绑定分群内容的稳定 `snapshot_id`。

HTTP `503` 表示所选范围没有缓存或缓存基础设施不可用。调用方必须显示“RFM 未就绪”，不能改用现场计算、旧结果或其他资料源。`warehouse_cutoff` 是仓库最后支付日。

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
  --build-tools /absolute/plugin-kit/build-tools
```

从仓库根目录使用锁定 Python 3.14 运行。它执行后端定向测试、Ruff、离线合同核验、两插件的类型检查/构建/测试、合成 HTTP 与固定 SDK ToolRuntime 组合验证，日志保存在 `.context/checks/crm-candidate-<timestamp>/`。CRM 与页面提供方组合测试 `test/page-composition.integration.mjs` 由 B0 在双方构建后执行；双插件组合测试为 `test/knowledge-composition.integration.mjs`，不让单包隔离测试隐式依赖兄弟业务源码。HTTP 测试仅使用本次拥有的临时回环端口并关闭；不启动现役 HTTP/Web、profile、ETL、模型或图服务，不读取真实凭据或数据库。浏览器旅程需单独执行，默认跳过。

离线合同更新：`python3 scripts/crm-calibration/generate_contract.py`，再用 Node 24 运行 `scripts/crm-calibration/generate_types.mjs /absolute/build-tools`；`--check` 可检测漂移。

## 隔离宿主与现役的区别

`test/host.integration.mjs` 使用真实固定 Cordis 与 ToolRuntime 加载构建后的包并执行工具，不调用 LLM；取消、错误请求、卸载一起验证。#216交付时与其后本机验收分别记录，见[公开交付说明](../../docs/crm-calibration/public-release.md)及[图谱部署](../../docs/crm-calibration/graph-deployment.md)。

图谱配置见[图谱部署](../../docs/crm-calibration/graph-deployment.md)。生成器使用具体 host 文件入口与显式服务地址，输出 `crm-profile-assets/v3`；各领域是独立 Cordis 条目，不再生成聚合 `tools.mjs`。每个模块绑定自己的包指纹，更新知识包不改变 CRM 模块指纹。旧合包不接受为 v3 输入；v2/旧 profile 保留旧包，迁移须生成新 profile 并完成授权宿主验收，不能原地覆盖包后宣称完成。生成器不探测或启动服务；旧 `--python` 返回迁移提示。

## 独立登录候选

```sh
node scripts/crm-calibration/serve-login-candidate.mjs \
  --upstream /absolute/pinned-dsh-checkout \
  --port 16678
```

仅在用户明确需要交互验证时运行。每次创建独立空白工作区、profile 和对话，只监听回环端口；使用现有8000 CRM，不启动或重启它。系统浏览器接收本次 DSH 原生访问链接，输出仅包含不带凭据的地址。该候选关闭模型 provider 与遥测，因此用于登录交互验证，尚不能自动回复；真实模型选工具另行验收。运行元信息保存在本次 `.context/crm-login-candidate/run-*/runtime.json`，停止时只向其中本次 supervisor PID 发送 TERM，不停止现役进程。
