# CRM、知识插件与合成服务边界

本页描述 2026-10-04 本地候选，不代表杭州已升级。DSH 固定 0.1.7-rc.2。CRM 包保留身份 `@shine-mage/dsh-crm-knowledge`，版本为 `0.0.0-crm.1`；知识包独立为 `@shine-mage/dsh-knowledge@0.0.0-candidate.1`。真实 CRM 登录、资产保存及 WeKnora 的账号权限沿用原接口；这里的两项合成服务只处理公开 synthetic fixture，不读取业务数据库，不接受文件路径、SQL 或凭据。

## 谁需要什么

- 插件运行：Node 24、固定 DSH SDK、各自可选的服务地址。CRM 仅消费指标客户端，知识仅消费知识客户端；两包没有业务实现导入。不需要 Python，不查找主仓目录，不运行子进程。
- 合成查询服务：Python 3.14 与独立依赖锁、synthetic fixture；独立包以 `service.py` 启动，主仓的 `backend.crm_metrics_app:create_crm_metrics_app` 保留兼容入口。
- 公开知识解释服务：Python 3.14、独立依赖锁及 6 份允许的公开 JSON；不依赖指标引擎或 DuckDB。两项服务已生成独立应用候选包，见[独立服务包](./crm-service-packages.md)；不等于镜像、平台依赖或生产发布验收。
- 独立查询和知识地址可以由两个进程维护。插件不启动、重启或关闭它们。服务停止时仅相应能力返回不可用。

## 配置新 profile

先由服务 owner 在隔离环境准备服务，再生成新的 profile 文件：

```sh
node scripts/crm-calibration/prepare-profile.mjs \
  --output /absolute/new-private-profile \
  --plugin /absolute/installed/crm \
  --knowledge-plugin /absolute/installed/knowledge \
  --metrics-origin http://127.0.0.1:18101 \
  --knowledge-origin http://127.0.0.1:18102
```

这两个端口只是示例，生成器不连接它们。只选 `--plugin` 即为 CRM profile；只选 `--knowledge-plugin` 即为知识 profile。工具所属包未选时不注册工具；包已选但省略服务地址时，相应合成能力返回 `NOT_AVAILABLE / SERVICE_NOT_CONFIGURED`，已有真实 CRM 登录/看板工具保留。传入知识 origin 或 graph 配置却未选择知识包会报 `CRM_PROFILE_KNOWLEDGE_PLUGIN_REQUIRED`。地址只允许明确 IPv4/IPv6 loopback HTTP origin，不接受用户信息、路径、query 或 fragment；不会把模型参数当作服务地址。

输出 `crm-profile-assets/v3`，分别记录每个包的身份、版本、入口摘要、组合指纹以及服务配置状态 `CONFIGURED_NOT_RUN`。模块按各自包指纹绑定，知识包更新不会改变 CRM 的模块指纹；Agent 的 CRM、知识解释、图谱与页面工具使用独立 Cordis 条目，不再生成聚合 `tools.mjs`。这是配置证据，不是不可变包的发布签名或运行验收。

生成器拒绝旧合包、错身份/peer、错组合合同、私有/缺失导出及链接文件。旧 `--python` 参数返回 `CRM_PROFILE_PYTHON_REMOVED`。旧 v2 profile 与旧包一起保留，迁移时安装两个新候选并生成新 profile，再完成授权的宿主加载/受控重启；不覆盖旧 profile，也不能把新知识包追加到旧合包上而重复注册工具。

## 可选身份合同

公开知识解释不依赖 CRM。私有教材工具通过 `shinemage-knowledge-access/v1` 请求当前会话 lease：用户名、取消信号、有效性检查与引用记录回调；不获得 CRM 密码或令牌。该合同由 CRM 身份 owner 维护，双方编译带源摘要的本地生成声明，不导入对方实现。

当前提供方是 CRM Host；没有提供方、版本不符、会话未连接时分别返回 `IDENTITY_PROVIDER_NOT_AVAILABLE`、`IDENTITY_CONTRACT_MISMATCH`、`NOT_CONNECTED`。请求结束时再次核对原 lease/提供方；断开、Host 卸载和知识模块卸载都会丢弃迟到结果，引用只能写入同一个仍有效的授权账本。知识模块不提供独立登录 UI，也不证明任意不可信插件的进程隔离。

## 公开服务合同与兼容窗口

| 领域 | 固定合同 | 路径 | owner |
|---|---|---|---|
| 合成指标 | `crm-metrics-service/1.0.0` | `/api/v1/crm-metrics/capabilities`、`/query` | CRM 服务 |
| 公开知识解释 | `crm-knowledge-service/1.0.0` | `/api/v1/crm-knowledge/capabilities`、`/explain` | 知识服务 |

每次请求和响应核对 `X-ShineMage-Contract`。当前仅接受精确 API 1.0.0；服务软件本身可单独发布补丁而保持该 API。协议变化须有新的兼容证据，不能仅换 header 冒称兼容。该 header 是版本协商，不是身份认证；此公开合成接口只供隔离 loopback，不用于替代真实 CRM/文档权限 API。

Python 领域 schema → 离线 OpenAPI/DSH schema/TS 类型；插件携带生成物，原始合同和生成器的 SHA-256 用于漂移核验。运行时复用官方 DSH schema 校验器，另检查 synthetic/source/query 身份；知识结果不得宣称真实业务通过或授权外发。响应上限 2 MiB、默认总超时 30 秒，禁止重定向、不自动重试、不回退 Python/缓存/真实数据源。错误只返回稳定原因，不回显服务正文或地址。

公开 API 的错误响应在 OpenAPI/生成类型中统一为 `ServiceError`：必需 `status=UNAVAILABLE`、`code`，可选 `message`。两项服务声明 403（Origin 拒绝）、409（合同身份不匹配）和 422（请求不符）；指标服务另有 400（指标/合成来源拒绝）。不使用 FastAPI 默认的 `detail`/输入回显格式。

旧 `/api/v1/crm-metrics/explain` 在主仓 factory 中保留为兼容 adapter，旧本地消费者暂时仍可不传合同 header。独立指标包只提供 capabilities/query，要求合同 header，使用单独生成的 `crm-metrics-service.openapi.json`；新插件 HTTP 类型也对应此严格入口。新插件只消费知识服务的 explain 路径。删除旧 adapter 的条件：旧消费者全部迁移且独立候选回退通过后，按服务 API 版本策略移除；本轮未删除旧接口或 CLI。

## 验证与未完成项

离线生成与检查：

```sh
/absolute/locked-python3.14 scripts/crm-calibration/generate_contract.py --check
node scripts/crm-calibration/generate_types.mjs /absolute/plugin-kit/build-tools --check
CRM_METRICS_PYTHON=/absolute/locked-python3.14 \
  node --test dsh-plugins/crm-knowledge/test/tools.test.mjs \
  dsh-plugins/crm-knowledge/test/service-http.integration.mjs
node --test dsh-plugins/crm-knowledge/test/service-client.test.mjs \
  dsh-plugins/knowledge/test/service-client.test.mjs \
  dsh-plugins/crm-knowledge/test/profile.test.mjs
```

`CRM_METRICS_PYTHON` 只供跨服务测试夹具选择解释器，不再是插件运行配置。夹具启动两个本次拥有的临时 loopback 服务，使用空白 HOME/TMP 与绝对 PYTHONPATH；结束只停止这两个子进程。B0 覆盖单包构建、实际 tarball 安全解包后加载和未配置服务时的降级；不证明完整 DSH profile 生命周期。

独立服务应用与 CRM/知识插件的本地拆包已验证，见[插件拆分证据](../hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。源码仍在 workspace；物理分仓、平台依赖冷安装、真实 CRM API 兼容窗口、D15 保存/UNKNOWN 回放矩阵、精确宿主/WAL、供应链与 canary/回退仍开放。此只读合成合同没有引入 durable save，profile 回退不被声明为数据库回滚。取消会终止插件的 HTTP 等待，不宣称能强行中止服务端已开始的只读计算；服务端持久任务的取消/恢复另由 T7/T17 验证。
