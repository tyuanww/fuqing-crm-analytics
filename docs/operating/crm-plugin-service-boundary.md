# CRM 插件与合成服务边界

本页描述 2026-10-04 本地候选，不代表杭州已升级。DSH 固定 0.1.7-rc.2，包身份仍为 `@shine-mage/dsh-crm-knowledge`。真实 CRM 登录、资产保存及 WeKnora 的账号权限沿用原接口；这里的两项新服务只处理公开 synthetic fixture，不读取业务数据库，不接受文件路径、SQL 或凭据。

## 谁需要什么

- 插件运行：Node 24、固定 DSH SDK、可选的服务地址。不需要 Python，不查找主仓目录，不运行子进程。
- 合成查询服务：Python 3.14 与独立依赖锁、synthetic fixture；独立包以 `service.py` 启动，主仓的 `backend.crm_metrics_app:create_crm_metrics_app` 保留兼容入口。
- 公开知识解释服务：Python 3.14、独立依赖锁及 6 份允许的公开 JSON；不依赖指标引擎或 DuckDB。两项服务已生成独立应用候选包，见[独立服务包](./crm-service-packages.md)；不等于镜像、平台依赖或生产发布验收。
- 独立查询和知识地址可以由两个进程维护。插件不启动、重启或关闭它们。服务停止时仅相应能力返回不可用。

## 配置新 profile

先由服务 owner 在隔离环境准备服务，再生成新的 profile 文件：

```sh
node scripts/crm-calibration/prepare-profile.mjs \
  --output /absolute/new-private-profile \
  --plugin /absolute/installed/crm \
  --metrics-origin http://127.0.0.1:18101 \
  --knowledge-origin http://127.0.0.1:18102
```

这两个端口只是示例，生成器不连接它们。省略某项时，对应合成能力返回 `NOT_AVAILABLE / SERVICE_NOT_CONFIGURED`，已有真实 CRM 登录/看板工具保留。地址只允许明确 IPv4/IPv6 loopback HTTP origin，不接受用户信息、路径、query 或 fragment；不会把模型参数当作服务地址。

输出 `crm-profile-assets/v2`，记录文件 digest 与服务配置状态 `CONFIGURED_NOT_RUN`。旧 `--python` 参数返回 `CRM_PROFILE_PYTHON_REMOVED`，要求生成新 profile；不覆盖旧 profile 或假装已经迁移。旧 profile 用旧包仍按旧方式运行，不能只替换包文件后假定合成能力自动恢复。

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
  dsh-plugins/crm-knowledge/test/profile.test.mjs
```

`CRM_METRICS_PYTHON` 只供跨服务测试夹具选择解释器，不再是插件运行配置。夹具启动两个本次拥有的临时 loopback 服务，使用空白 HOME/TMP 与绝对 PYTHONPATH；结束只停止这两个子进程。B0 覆盖单包构建、实际 tarball 安全解包后加载和未配置服务时的降级；不证明完整 DSH profile 生命周期。

独立服务应用打包/资源清单已完成本地隔离验证；源码仍在现 workspace，物理分仓、平台依赖冷安装、CRM/知识插件最终拆包、真实 CRM API 兼容窗口、D15 保存/UNKNOWN 回放矩阵、精确宿主/WAL、供应链与 canary/回退仍开放。此只读合成合同没有引入 durable save，profile 回退不被声明为数据库回滚。取消会终止插件的 HTTP 等待，不宣称能强行中止服务端已开始的只读计算；服务端持久任务的取消/恢复另由 T7/T17 验证。
