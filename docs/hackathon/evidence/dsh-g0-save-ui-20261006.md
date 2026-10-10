# 首购保存卡片与 CRM 会话接线（2026-10-06）

基线：`codex/plugin-boundary-review@ca64f9caf5316e650b044137b87c04312235751e`，开始时工作树干净。本批只在该工作树修改和本地验证；未 push、发布、操作杭州或访问真实 DuckDB。完整计划仍 PARTIAL，`release_ready=false`。

## 已交付边界

- CRM owner 提供可撤销、可选的 `shinemage-first-purchase-access/v1`，仅三个固定服务操作。凭据留在 CRM Host 内存；workbench 编译自己的生成合同，没有跨仓私有源码运行时依赖。
- Workbench 的公开 Connection handler 要求原生认证承载、可信 Origin、JSON/custom header，做长度/时限、候选与账号/run 绑定以及严格响应校验；没有通用 HTTP 代理或浏览器自行批准候选的入口。
- 首购卡片从旧 `/b0/analyses` 改走版本化保存链。显式确认前只读，原请求先保留再发送；ACK 丢失、重载、冲突与候选变化保留原标识。CRM 切换/卸载取消拥有的请求，清空旧展示。其他查询卡片继续沿用自己的合同。
- 遵守用户“陈旧/过期暂不考虑”：只展示服务端 NOT_CHECKED，不用浏览器时钟决定资格。账号有效期、候选准入和来源检查仍存在。未接通的保存、驾驶舱、导出、发送按各自状态明确禁用。

## 本次实际验证

日志目录：`.context/checks/first-purchase-save-ui-20261006/`（本机忽略目录，不是 GitHub/生产证据）。Node 24.19.0；Python 3.14.4。两插件各自复用既有 SDK 链接，均固定官方 `477b4f420553e8a52c2fbccc464d7561b239c443`，没有改动链接、上游或安装环境。

| 检查 | 当前结果 | 证据 |
|---|---|---|
| `node dsh-plugins/analytics-workbench/build.mjs <已有固定 upstream>` | Host/client 全量类型检查和构建 PASS | `build-workbench-review.log` |
| `node dsh-plugins/crm-knowledge/build.mjs` | 类型/凭据不进入 client/构建 PASS | `build-crm-review.log` |
| CRM login、relay、包、组合卸载，workbench gateway/controller，边界单测 | 51 PASS / 0 SKIP | `node-reviewed.log` |
| 编译首购卡片、原首购状态及原 channel-followup 保存卡片 | 7 PASS / 0 SKIP；真实 compiled JS + pinned React/jsdom | `dom-reviewed.log` |
| `python -m pytest -q backend/tests/test_analytics_first_purchase_save_ui.py backend/tests/test_analytics_first_purchase_save_api.py backend/tests/test_analytics_first_purchase_crm_identity.py` | 132 PASS / 1 warning；这是本轮实现阶段回归 | `backend.log` |
| 审修后重跑 `test_analytics_first_purchase_save_ui.py` | 1 PASS / 1 warning，内部 7 项观测：登录保护、NOT_CHECKED、保存、丢失 ACK/重载恢复、精确重放、标题冲突、拒绝上传 owner | `http-reviewed.log` |
| `generate_contract.py --check` / `generate_types.mjs --check` | PASS，未启动旧 CRM | `validation-final.log` |
| `plugin-boundaries.mjs --check` | PASS：11 包、626 源文件、30 边、18 合同；生产源码例外 0 | `validation-final.log` |
| Python Ruff、`git diff --check`、文档引用 | PASS | `validation-final.log` |

真实 HTTP 测试使用当前 CRM Host/工作台源码、两个自有随机 loopback 端口（mock CRM 与当前分析服务）和小型 synthetic SQLite。登录与 `/auth/me` 是合成账户，不是杭州真实账户；两个 HTTP 服务在 finally 中退出，Node probe 超时由 subprocess 回收。最终只有一份分析记录。没有启动 6677、真实模型、ETL 或旧 CRM。

## 提交前 OCR delegate

按用户已确认的自审工作方式运行 `ocr delegate preview/rule --format json`；没有调用外部 LLM 或另起 reviewer。初始 preview 27 路径（工具选中 20、过滤 7）；过滤的测试/声明/生成物同样补审，最终文档增量包含在 `ocr-final-preview.json` 和 `review-checklist.json` 中。最终 34/34 路径已审（工具选中 20、补审 14），0 跳过，覆盖率 100%；详见最终清单。

确认并修复：

| 路径 | 等级/类别 | 问题与修复 |
|---|---|---|
| `first-purchase-save-client.mjs` | medium / bug | CRM grant 失效仍残留已保存回执/来源；NOT_CONNECTED 现在清空展示。 |
| `first-purchase-save-client.mjs` | medium / bug | 未知的旧候选仍提示重试；新候选下只核对原 identity，禁用旧请求写重试。 |
| `crm-knowledge/src/first-purchase-relay.mjs` | high / security | 只扫描原始 JSON 文本会漏过转义 token 回显；现在解析后再检查，拒绝带 token 的结果进入其他插件。 |

三项负测均先失败（`review-negative-red.log`），修复后 14 项定向用例全部通过（`review-negative-green.log`），之后重建插件并通过上表受影响回归。没有把历史 B0、WSL 或别的提交测试冒充当前结果。

早期失败也保留：B0 最小 Python 缺 bcrypt 无法生成旧 CRM OpenAPI，改用已有 CRM 固定依赖解释器；CRM 构建指定了与已有 SDK 链接不同的 checkout，改用该插件原固定 SHA checkout；Host 类型导入/JSDoc 位置补齐；合成 fixture 的 UTC 日期被误切成业务日期，改用其已定义的业务窗口；redirect 响应改为显式拒绝。组合测试首次未传要求的 B0_BUILD_UPSTREAM，正确指定后 15 项通过。未升级工具链、改上游或绕过检查。

## 尚未关闭与下一步

已核对 [STATUS](../../../STATUS.md)、[任务账本](../TODOS.md)、[计划](../../plans/shinemage-plugin-platform-split.md) 和[保存准入](../../operating/first-purchase-save-admission.md)：本轮只关闭 T9/T14 本地接线子项。

- 真实 DSH 仍用 B0 固定 synthetic-demo 创建首购 run。本批没有把真实 CRM 管理员别名映射到该账号。必须先证明宿主查询 run 与 CRM 身份一致，禁止为“跑通”绕过 owner 检查。
- 当前是源代码/HTTP/jsdom 验证；新插件 clean archive、实际固定 DSH Cookie/Connection 路由、卸载/重启/WAL、headed Chrome/键盘/视口与杭州关闭时效链均 NOT_RUN。
- 生产 provider/profile、签名/SBOM/CVE 等供应链、真实形状 UNKNOWN 恢复和物理分仓仍开放；旧 clean 候选不包含本批保存 UI。生产激活继续 BLOCKED。
- 恢复使用原浏览器 intent；换浏览器或删除记录后的跨候选人工恢复未验收，不能生成新 action 掩盖未知写入。

下一步从审修后的干净 SHA 准备插件候选，并在隔离固定 DSH 中验证 CRM 身份/run 归属与实际卡片流程，再按既有候选门禁接目标证据。提交不等于推送或上线。
