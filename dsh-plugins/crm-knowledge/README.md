# CRM 知识与指标候选插件

固定 SDK：DSH 0.1.6-alpha.2，Node 24，Python 3.14+。独立插件，包含合成资料源及默认未连接的看板 GSV HTTP 适配，不修改 analytics-workbench/competition 或 DSH 上游。构建依赖只读复用已准备好的固定 checkout，不下载或自动安装。

本包依赖当前工作区中的 `backend/`、`scripts/crm-calibration/` 和 `knowledge/crm/`，当前不支持脱离仓库单独发布。

## 注册的工具

| 工具 | 作用 |
|---|---|
| `query_crm_dashboard_gsv` | 用户认可的现看板 GSV 总额、日趋势；绑定账号后只读调用原指标服务；与合成净额候选分开 |
| `query_crm_metrics_v1` | 销售表现、老客回购、派样后复购；全部经过只读适配 → 计算器 |
| `crm_knowledge_explain` | 知识包定义、证据、冲突和离线依赖关系；说明合成验证状态 |
| `crm_metrics_capabilities` | 可执行查询与未接入的真实资料能力 |
| `query_crm_knowledge_graph`（可选 graph-tools 模块） | 受限教材 Neo4j 一跳关系、当前来源分块、人工核对及误连隔离 |

工具参数没有 SQL、数据库路径或凭据。合成工具的 `source_id` 仍仅允许 `synthetic-crm-metrics`，拒绝真实库；金额为分。看板工具返回元的十进制字符串和整数分，不扣退款、不返回尚未校准的旧客单价/会员溢价。未知、不可用和权限来源均保留。知识仅来自本工作区的公开合成包，尚未接私有文档 ACL，不可据此导入受限真实资料。

`crm_metrics_capabilities` 分为 `synthetic_candidate` 与 `dashboard` 两部分；`LOGIN_BOUND` 表示当前对话已有内存授权，每次查询仍须向 CRM 验证登录。解释 GSV/退款/实收时，`crm_knowledge_explain` 返回 `preferred_real_gsv` 与 `target_candidate`。解释 AUS/AOV 时补充 `preferred_operational_definition`：真实运营默认以当前看板GSV为金额分子，净额候选仍单列；分母覆盖及真实验收未完成时不冒称可取真实数。

## 看板 GSV 连接边界

请求示例（只含业务条件）：

```json
{"start_date":"2026-07-01","end_date":"2026-07-05","channel":"全店","exclude_low_price":false}
```

日期为上海时区自然日，含首尾，最多90天。全店不传 `channel`；剔除低价按现前端的四个渠道重复传递 `exclude_channels`，渠道别名和聚合交给现服务处理。工具依次 GET `/api/v1/auth/me`、`/api/v1/metrics/overview`、`/api/v1/metrics/trend`，固定 GSV，不接受任意 URL、SQL、退款截止日或账号覆盖。

候选通过 DSH 原生对话输入区的 **连接 CRM** 按钮登录。账号和密码经同源受保护 HTTP 路由提交给可信 Host，Host 调用已有 CRM `/auth/login`，只将成功凭据保存在当前进程的私有闭包内，并绑定当前 DSH 对话。密码不作为工具参数、RPC 事件或消息发送给模型；令牌不回传浏览器、不写环境变量、profile、日志或磁盘，也不注入子进程。

- Host 配置仅有 `baseUrl`（默认 `http://127.0.0.1:8000`，仅允许 HTTP 回环源）和 `dataKind`（默认 real）。模型不能覆盖。
- 浏览器路由要求 DSH 原生认证、精确 Origin、POST JSON 和专用请求头；不能通过普通跨站表单授权。
- 每个对话单独连接，最长8小时；对话删除、登录失效、断开或 Host 卸载会取消在途查询并销毁内存授权。服务重启需重登。
- 断开只清除本插件的授权，不调用会使同账号其他页面退出的 CRM `/auth/logout`。
- 没有登录时返回 `NOT_CONNECTED`。现有 CRM 提供账号级校验，没有按渠道细分授权；这不是多租户权限系统。
- 登录限制：15秒、8KiB响应/请求、每次最多2个并行登录、20个有效连接；上游错误正文不转发。

概览与趋势以整数分核对，不一致就返回 `UNAVAILABLE`；未返回日期保留在 `dates_not_returned`，不补0。数据水位、退款截止日均为 `null`，`backend_version_verified=false`；`dashboard-gsv/observed-v1` 是审计口径标识，现 API 未提供可校验的运行版本。两次请求不是事务快照，不承诺快照一致性。401/403、忙碌、警告、超时、取消、重定向和错误内容均停止查询，不读取归档、不自动重试，不返回原始响应或凭据。

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
