# CRM 查询归属接缝：实现与 OCR 审修

日期：2026-10-06。起点：`codex/plugin-boundary-review@95b78e8f` 干净工作树。
范围：显式合成场景的 CRM 身份 → 原生查询内核 → 同账号保存；不修改 DSH 上游、生产 profile 或真实数据。

## 实际变更

- 保存服务增加只读 `POST /api/v1/analytics-first-purchase/session-identity`，空请求、严格 identity/v1 回应。现有账号 allowlist 和当前管理员权限继续由 CRM HTTP resolver 校验；额外 query 权限须由服务 owner 显式 `allow_query=True`，默认关闭。
- 原生查询 factory 新增显式 `identity_mode="crm-session"`，经已有 Host bridge/CRM lease 读取当前 session 的身份，凭据不传给 workbench 或模型。默认 B0 synthetic 模式保留；CRM 模式拒绝旧资产写入口。
- owner、permission scope 和保存来源沿用同一账号；不映射 synthetic-demo。持久 session 不能被另一个账号重绑；同账号查询内核重启重放原 request，仍返回同一 run。
- 状态 GET 和无任务取消不创建会话，只有显式 prompt 受理才创建。服务故障暂停原队列；明确未登录/撤权与不可用分开，失败不冒充撤权。
- 离线 OpenAPI/TypeScript、微型能力合同副本、边界 inventory、CI 入口和实施文档同步。新增一个服务合同，跨插件新增引用仅属于集成测试。

## 当前验证

日志目录：`.context/checks/first-purchase-native-crm-20261006/`。下表均为本轮实跑；未重用旧包或杭州结果。

| 检查 | 结果 | 日志 |
|---|---|---|
| 13 个受影响后端文件：RunStore、worker、原生运行、首购 HTTP、CRM、保存/恢复及新增身份/HTTP 链 | **294 PASS**，无 skip；pytest 报告 1 条 warning | `backend-reviewed.log` |
| CRM relay、严格身份观察、保存 model/client/gateway | **26 PASS / 0 SKIP** | `node-final.log` |
| 编译后的保存卡片 jsdom | **1 PASS**；不是 headed 浏览器 | `dom-final.log` |
| 实际独立服务包生成/安全解包、仓库外最小依赖运行、两种时效保存/恢复、边界拒绝 | **11 PASS / 0 SKIP** | `service-package-final.log` |
| 静态边界检查 | **9 PASS**；11 包、630 源文件、31 跨包引用、19 合同 | `boundaries.log` |
| workbench 与 CRM 插件 Node24/固定 rc2 类型检查和构建 | **PASS** | `workbench-build-final.log`、`crm-build.log` |
| 离线合同、CRM 类型、副本、Ruff、差异检查 | **PASS** | 命令如下 |

后端命令（固定 Python 3.14.4；Node24 在 PATH）：

```sh
/tmp/dsh-b0-python.qW3lHO/venv/bin/python -m pytest --noconftest -q -W error::ResourceWarning \
  backend/tests/test_analytics_jobs.py backend/tests/test_analytics_access.py \
  backend/tests/test_analytics_native_runtime.py backend/tests/test_analytics_worker.py \
  backend/tests/test_analytics_first_purchase_http.py backend/tests/test_analytics_first_purchase_native.py \
  backend/tests/test_analytics_first_purchase_native_identity.py backend/tests/test_analytics_first_purchase_crm_identity.py \
  backend/tests/test_analytics_first_purchase_save_api.py backend/tests/test_analytics_first_purchase_save_receipts.py \
  backend/tests/test_analytics_first_purchase_save_recovery.py backend/tests/test_analytics_first_purchase_save_ui.py \
  backend/tests/test_analytics_first_purchase_native_crm_http.py

node --test dsh-plugins/analytics-workbench/test/first-purchase-native-identity.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-save-model.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-save-client.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-save-gateway.test.mjs \
  dsh-plugins/crm-knowledge/test/first-purchase-relay.test.mjs
node --test dsh-plugins/analytics-workbench/test/first-purchase-save-dom.test.mjs
node --test --test-concurrency=1 scripts/crm-calibration/service-package.test.mjs
node --test scripts/dsh-b0/plugin-boundaries.test.mjs
node scripts/dsh-b0/plugin-boundaries.mjs --check
node scripts/dsh-b0/first-purchase-analysis-contract.mjs --check --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python
/tmp/fuqing-fastapi141-v2-venv/bin/python scripts/crm-calibration/generate_contract.py --check
node scripts/crm-calibration/generate_types.mjs --check
git diff --check
```

构建/DOM 的 `B0_BUILD_UPSTREAM` 使用当前 workbench 已绑定的 public checkout；CRM 构建使用本工作树固定 checkout，二者均钉在 `477b4f420553e8a52c2fbccc464d7561b239c443`，没有改 SDK 链接。
实际包测试的 `CRM_SERVICE_PYTHON` 为本工作树 `.context/checks/service-package-pair-20261005/build-venv/bin/python`；本轮核对 FastAPI 0.141.1、Pydantic 2.13.5、DuckDB 1.5.6。包内首购服务仍为 13 个固定依赖，不含 DuckDB；查询 worker 只使用 JSON 合成快照。

真实 HTTP 集成包含：未登录拒绝、CRM 登录、原生 prompt 受理、实际 worker 计算、受控 Host 退出观察、同账号服务保存、ACK 丢失后重新打开核对、精确重放只保留一条记录、退出/重新登录、CRM 撤销 session 后拒绝新任务。三个 Python HTTP 服务、一个 Node identity receiver 和 worker 均为本次拥有的临时进程，并在测试内回收。

## 失败与修复

1. 集成探针首次错误地断言 result 顶层有 owner；实际合同位于 `provenance.permission_scope.owner_id`。修正探针后真实 HTTP 通过，没有放宽 decoder 或修改响应冒充通过。
2. 包验证先用了 B0 Python、随后误用了名称带 141 的旧 full venv，均因真实依赖版本不匹配拒绝。保留 `service-package.log`、`service-package-pinned.log`；查验实际 installed metadata 后选择现成固定环境，11 项通过。没有改锁文件或关闭依赖检查。
3. OCR 审查发现身份故障被解释为撤权。负测原来得到 FAILED，预期应为 QUEUED；见 `identity-outage-before.log`。修复为传递明确 denied 与不可用两种观察；后者暂停 dispatcher，恢复后只派发原任务一次。
4. OCR 审查发现状态 GET 创建会话。负测原来记录数为 1，预期 0；见 `context-readonly-before.log`。新增只读绑定查找，无任务取消也不建记录。修复后受影响 71 项通过，最终扩大回归 294 项通过。

## OCR delegate 覆盖

使用 `ocr delegate preview --format json` 与 `ocr delegate rule --format json <paths>`；由当前宿主 Agent 审查，不调用外部 LLM。逐项对照实际 diff/新文件及调用边界；生成件与 OCR 默认排除的测试也补审，没有跳过。原始选择/规则和逐文件摘要保留在日志目录。

以下 **29/29** 文件已核对：

```text
reviewed CHANGELOG.md
reviewed STATUS.md
reviewed backend/analytics_first_purchase_analysis_app.py
reviewed backend/analytics_first_purchase_native.py
reviewed backend/contracts/analytics-first-purchase-analysis.openapi.json
reviewed backend/contracts/analytics_first_purchase_analysis.py
reviewed backend/services/analytics/first_purchase/crm_identity.py
reviewed backend/services/analytics/first_purchase/native_identity.py
reviewed backend/services/analytics/jobs.py
reviewed backend/services/analytics/runtime.py
reviewed backend/tests/test_analytics_first_purchase_native_crm_http.py
reviewed backend/tests/test_analytics_first_purchase_native_identity.py
reviewed config/shinemage-plugin-boundaries.v1.json
reviewed docs/architecture/shinemage-plugin-boundaries.json
reviewed docs/hackathon/TODOS.md
reviewed docs/hackathon/evidence/dsh-g0-native-crm-owner-20261006.md
reviewed docs/operating/first-purchase-save-admission.md
reviewed docs/plans/shinemage-plugin-platform-split.md
reviewed dsh-plugins/analytics-workbench/src/bridge.ts
reviewed dsh-plugins/analytics-workbench/src/first-purchase-access.generated.ts
reviewed dsh-plugins/analytics-workbench/src/first-purchase-analysis-contract.generated.d.ts
reviewed dsh-plugins/analytics-workbench/src/first-purchase-native-identity.d.mts
reviewed dsh-plugins/analytics-workbench/src/first-purchase-native-identity.mjs
reviewed dsh-plugins/analytics-workbench/test/first-purchase-native-crm.probe.mjs
reviewed dsh-plugins/analytics-workbench/test/first-purchase-native-identity.test.mjs
reviewed dsh-plugins/crm-knowledge/contracts/first-purchase-access.v1.ts
reviewed dsh-plugins/crm-knowledge/src/first-purchase-access.generated.ts
reviewed dsh-plugins/crm-knowledge/src/first-purchase-relay.mjs
reviewed scripts/dsh-b0/pipeline.mjs
```

本次代码范围内两项确认缺陷已修复，未确认剩余阻塞缺陷。新增 OpenAPI 仅一条路径和两个 schema，既有 paths/schemas 无变动；旧 consumer 可继续保存，新查询模式遇到旧 provider/服务明确拒绝。

## 未关闭

T3/T9/T14 与产品继续 **PARTIAL**。本次 Host 调度接收器是测试夹具，未运行官方 DSH、浏览器/真实模型或杭州验收。查询内核重启测试保留 Host CRM grant，不代表整个 DSH Host 重启后登录自动恢复。

下一步：固定官方宿主的 CRM 登录与查询 admission、Cookie/路由、会话/重启和浏览器保存链。已核对旧 B0 gateway 在登录前调用查询权限检查，不可直接当作 CRM 登录入口；这项仍须实现/验收。随后从 clean SHA 准备插件与服务包并重绑证据，供应链、目标主机、真实业务 UAT/生产放行及物理分仓保持开放。

本轮未 push、发布、重启/切换杭州、修改 Cloudflare route 或读取真实业务库。
