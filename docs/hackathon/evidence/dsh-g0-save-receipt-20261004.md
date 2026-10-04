# G0 D15：保存身份、持久回执与只读 reconcile

2026-10-04，`codex/plugin-boundary-review`，基于本地审核提交 `56198c32` 的下一步增量。本轮没有 push、上线、真实模型、真实业务库或数据迁移。

## 实际实现边界

- owner 仍为首购分析服务。`save_with_receipt()` 是 G0 的服务内部存储接口，不是已放行的公开保存 API；调用方必须提供已由服务解析的 `FirstPurchaseTrustedSource`。candidate 摘要只负责关联，不能证明准入或 freshness。
- 保存身份版本 `analytics-first-purchase-save-identity/v1` 要求显式 schema、`action_id`、`candidate_digest`、`correlation_id`。receipt v1/API `1.0.0` 还绑定 `idempotency_key`、权限 owner、来源 run/evidence、analysis/version 与不含文件路径的 `durable_state_key`。
- 分析记录、action 和幂等键两个唯一索引复用现有 SQLite 事务/幂等表；全部一起提交或回滚。相同 key 不允许换 action，相同 action 不允许换 key，candidate/correlation/请求内容变化拒绝为 409。没有第二个发布 journal。
- `POST /api/v1/analytics-first-purchase/save-receipts/reconcile` 为只读查询，携带身份 JSON 与 `Idempotency-Key`，重新检查当前 read/save 权限。已提交返回 `SAVED`；没看见已提交回执返回 `SAVE_UNKNOWN / RECEIPT_NOT_FOUND`，**不等于确定未执行**，不创建新 action 或重跑查询。不可用状态返回 503；不拿 UNKNOWN 冒充成功。
- 查询不需要 RunStore，故任务已退出后仍可从保存 owner 独立核对。返回 `Cache-Control: no-store`；无公开 D15 写 route，旧 v1 请求不能夹带 identity、owner 或 save eligibility。
- 旧 saved-analysis/cockpit v1 与 SQLite schema 1 保留。标题 forward-fix 新建版本，旧回执仍指向原 v1，profile 回退不撤销服务数据。此处未证明两个服务二进制间的迁移窗口。

## 本次验证

Raw：`.context/checks/d15-save-receipt-20261004/`。

- 新 `test_analytics_first_purchase_save_receipts.py` **13 项**：身份/来源绑定、独立重开查询、只读 UNKNOWN、四类身份冲突、请求/撤权/跨用户隔离、非法/旧合同拒绝、并发幂等、半份损坏回执拒绝，以及三个真实子进程 SIGKILL 点。
- 三个 SIGKILL 点：第一个身份索引写后、两索引完成但 COMMIT 前、COMMIT 后响应前。前两点没有记录残留；后一点新进程直接找回原回执；随后同一请求/键仅有 1 条分析和 2 条身份索引。
- 共享 `scripts/run_backend_tests_bounded.py` 实际运行上述新测试及既有 save_recovery/analysis/native 共 **44 PASS**；报告 `.context/checks/20261004T114547779972Z/summary.json`，日志 `bounded-backend.log`。2 条固定框架弃用提示，无资源/功能失败。
- `first-purchase-analysis-contract.mjs --write --python /tmp/dsh-b0-python314-0200/bin/python`：离线 OpenAPI、生成类型和 TypeScript 正反类型检查 **PASS**，未打开 DB/socket/服务。OpenAPI 摘要 `d3c0f2e69924f407e4e3da77bbf848ec52b87de40e3bd987c62b4db9a7732a0d`。
- 机器边界登记为 analysis-service 拥有，16 条领域/平台合同。首次正式 B0 因新生成 route 尚未同步 inventory 而 fail-closed，已刷新并审核差异；保留失败 `b0.log`，后续运行结果写入 `b0-after-boundaries.log`。
- 修复 drift 后正式 `B0_BUILD_UPSTREAM=<固定 rc2> node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python314-0200/bin/python` **退出 0**：Python **636 PASS**；Node 各阶段合计 **1506 PASS / 1 SKIP**，为执行次数（包含 clean 重跑），不是去重测试数。全部离线合同、边界、插件 full typecheck 与 clean rebuild 通过，原始统计 `b0-summary.json`。唯一 SKIP 是未配置 `COCKPIT_EXAMPLE_PACKAGE` 的独立 HTML 实例测试，不记为已验证。
- Ruff、`git diff --check`、本轮文档链接检查通过。框架弃用/React 测试环境提示保留在日志中，未删除测试或改工具链消除提示；B0 未包含真实浏览器/模型/WSL/远端 CI 验收。

## 仍待完成

以下为本阶段结束时状态；同日后续本地服务准入/严格 decoder 已推进，见[下一步证据](./dsh-g0-save-admission-20261004.md)，不回写本文件历史测试结果。

首期保存继续 `NOT_AVAILABLE`：还需版本化结果/provenance/freshness、服务端候选准入、受控公开保存 adapter、严格插件 decoder/UI、timing/UNKNOWN 运维窗口、跨服务版本兼容，以及完整 candidate/canary/现场门禁。本次存储与只读查询通过不关闭这些任务，也不声明整个 D15 已完成。
