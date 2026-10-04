# G0 D15：版本化来源、候选准入和受控保存

2026-10-04，`codex/plugin-boundary-review`，HEAD `56198c32` 后的本地未提交增量；承接[上一轮回执存储](./dsh-g0-save-receipt-20261004.md)。未修改 DSH 上游、生产配置、真实数据库或版本 pin。

## 实现

- analysis-service 拥有结果/provenance API 1.0.0 与 freshness；服务策略显式设置候选摘要 allowlist 和毫秒窗口，无生产默认值。RunStore 在同一事务读取冻结结果和终态生成时间，历史 as_of 不当作生成时间。
- 新只读 inspect、显式准入的 save-receipts 写接口及保存来源读取；保留旧 reconcile。配置 D15 provider 的服务拒绝旧 POST analyses 绕过门禁。
- 写锁内重验权限/策略/结果/时间，结果和来源同事务提交；精确命令重放仍核验当前身份，可在 RunStore/准入策略移除后取回原回执。保存来源随标题 forward-fix 保留，SQLite schema 1 和旧 saved-analysis/cockpit/native-receipt v1 不变。
- 插件独立严格 decoder 消费真实服务响应；已验证 provider/consumer probe 拒绝未知版本、额外/缺失字段、伪造资格、错候选、错误有效期、PINNED 混用、ratio=90、UNKNOWN 冒充 SAVED。未接入/启用保存 UI。

接口、准入责任和恢复动作见[操作说明](../../operating/first-purchase-save-admission.md)。

## 本轮验证

Raw：`.context/checks/d15-save-admission-20261004/`。所有运行只使用 synthetic fixture、临时 RunStore/SQLite 和本次拥有的子进程。

- 首次针对新 API 运行：10 PASS / 6 FAIL，保留 `api-first.log`。失败是新断言把既有 `error.code` 当作顶层 code；核对实际错误合同后修复测试，未削弱服务拒绝条件。
- 首次加入实际响应的插件 decoder 和新 SIGKILL 场景后，新旧两个文件 33 PASS（`api-with-codec.log`）；这是中间结果，不替代最后一轮。
- 正式共享后端：Node 24 PATH 下，`/tmp/fuqing-fastapi141-v2-venv/bin/python scripts/run_backend_tests_bounded.py` 执行 save_api/save_receipts/save_recovery/analysis/source/native 六个首购文件，**71 PASS / 0 SKIP**，2 条既有框架弃用提示，26.45 秒，峰值 RSS 0.21 GB。报告：`.context/checks/20261004T121331042149Z/summary.json`；日志 `bounded-backend.log`。
- 新 API 文件 22 个场景：时间阈值与时钟回退、预览后撤候选/撤权/换结果、读权限但无保存权限、默认关闭/旧接口绕过、非法 proof、等待锁后过期或撤权、来源不完整、原子性、forward-fix、并发、旁证损坏、实际 ASGI HTTP 文档跨语言 decoder，以及三个真实 SIGKILL 点（旁证前、旁证后 COMMIT 前、COMMIT 后）。
- 进程恢复实际验证 1 条分析与 3 条幂等/来源记录全有或全无；COMMIT 后丢失响应，新进程在无 RunStore、无策略时重放得到同一 receipt。原有三点回执存储故障和 v1 恢复也在六文件中重跑。
- 离线 `first-purchase-analysis-contract.mjs --write --python /tmp/dsh-b0-python314-0200/bin/python`、严格 TypeScript 正反例和 Ruff 已通过；不启动 HTTP/DB/旧 CRM。边界 inventory 已刷新为 11 包、610 JS/TS 文件、29 条跨包引用、206 处字面路径/124 种路径、17 条合同。
- 完整 B0：`B0_BUILD_UPSTREAM=<公共仓已构建固定 rc2> node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python314-0200/bin/python` **退出 0**。Python **658 PASS**，23 条既有弃用提示，80.43 秒；Node 各阶段合计 **1506 PASS / 1 SKIP / 0 FAIL**（含 clean 重跑，为执行次数而非去重数量）；全部离线合同、领域边界、插件 full typecheck 和 clean rebuild **PASS**（547 源文件，3528447 字节）。唯一 SKIP 为未配置 `COCKPIT_EXAMPLE_PACKAGE` 的独立 HTML 示例，未冒充通过；日志 `b0.log`，统计 `b0-summary.json`。
- 最终 OpenAPI 摘要 `3b45ef6df28219827343f9b1bcc0c6c8c35f46dd05790b340ed1f266c9a702b4`，生成/类型日志 `contract.log`。Ruff 与 `git diff --check` 通过。B0 不包含本轮真实 Chrome、DeepSeek、WSL 或远端 CI。

## 尚未关闭

D15/T3/T7 整体仍 PARTIAL。只完成本地服务写入门禁与消费合同，不代表 UI、生产准入或真实业务已放行。仍需当前/下一版服务兼容与 forward-fix 矩阵、生产形状 timing/UNKNOWN 窗口、候选供应链/canary/目标平台门禁、DSH 原生结果卡到确认保存/恢复的 UI 接线与真实浏览器验收。杭州、WSL、真实模型、业务 UAT、远端 CI 均 NOT_RUN。本轮未 commit、push、Release 或部署；物理分仓仍按 G0/stop-go 顺序推进。
