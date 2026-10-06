# 首购结果时效暂缓：实现与本地验收

2026-10-06，分支 `codex/plugin-boundary-review`，实现从 clean `0a481f25c5bd4329fa074f12c5f2832978560263` 开始。用户明确“陈旧和过期，暂时不考虑”，本轮落实为服务端显式策略，不再等待生产时效阈值确认。

## 实际变更

- `FirstPurchaseSavePolicy(..., None, None, check_freshness=False)` 关闭结果年龄判断；既有四参数调用默认继续检查。缺策略、含糊开关或关闭时仍配置阈值均不能静默放行。
- 结果及落盘来源记为 `NOT_CHECKED / DISABLED_BY_POLICY`，保留生成时间与策略版本，阈值和截止时间为 null，不宣称 FRESH。
- 服务合同、严格插件 decoder 与生成 OpenAPI/TypeScript 同步。客户端不能上传开关改变保存资格；身份撤销、候选准入、来源完整性、幂等和 SAVE_UNKNOWN 恢复保留。
- 已核对[当前计划](../../plans/shinemage-plugin-platform-split.md)、[任务账本](../TODOS.md)与运行说明：均已移除“必须先确认生产陈旧/过期期限”的阻塞；历史测试和选择保留原范围。

## 本轮实际验证

日志根目录：`.context/checks/service-save-time-policy-20261006/`。均为 synthetic fixture、临时小型 SQLite 和本次拥有的 loopback 进程。

| 命令 / 范围 | 结果 | 证据 |
|---|---|---|
| 固定服务 Python 3.14，`scripts/run_backend_tests_bounded.py`，save_api / save_receipts / save_recovery / analysis / crm_identity 五个测试文件 | **163 PASS**，2 个既有 warning | `regression/summary.json`、`regression/group-001.xml` |
| 固定 B0 Python，`pytest --noconftest -W error::ResourceWarning -q -o addopts='-ra --strict-markers' backend/tests/test_analytics_first_purchase_save_api.py` | **71 PASS**，1 个 Starlette/httpx 弃用 warning；与上述用例重叠，不累加 | `b0-api.log` |
| Node 24，`node --test --test-concurrency=1 --test-name-pattern='^first-purchase archive' scripts/crm-calibration/service-package.test.mjs`，CRM_SERVICE_PYTHON 指向固定服务解释器 | **2 PASS / 0 SKIP**，实际 archive 分别开启/关闭检查，在最小依赖环境运行 | `package.log` |
| Node 24，`node --test --test-concurrency=1 scripts/release/plugin-service-evidence.test.mjs scripts/release/service-artifact-evidence.test.mjs scripts/release/service-target-evidence.test.mjs` | **70 PASS / 0 SKIP**；门禁 fixture 不是 WSL 实机 | `gates.log` |
| `node scripts/dsh-b0/first-purchase-analysis-contract.mjs --check --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python` | 离线合同及 TypeScript PASS | `contract.log` |
| 固定 Ruff 校验本轮 4 个 Python 文件；`git diff --check` | PASS | `ruff.log`、`review-summary.json` |

新增覆盖包括：一年/十年前的结果可按显式无时效策略保存；NOT_CHECKED 不能伪装成 FRESH；无策略、撤权、候选不匹配与来源不全仍拒绝；写锁内从关闭切回开启时重新校验；提交前/后 SIGKILL 后正确回滚或精确回放。真实 HTTP 测试响应同时送入插件 decoder 验证。

实际包测试的两种模式使用同一 archive：79470 B，SHA-256 `2a1d2349a4fc344adedcbaf41976457c27c6a978e69d4ca4466329fb4dbcab1f`；manifest `1997b7f8bb0c4773370ffb98c4125e37f59968d26517cfaac4fbebe994762426`。这是工作树测试包，临时目录与进程由测试回收，**不是 clean release candidate**。每种模式也执行原 CRM identity adapter 的 5 项观测，未使用真实账号或凭据。

OpenAPI 内容摘要：`6209894f434fa0cadb746b46400064dbcec6eee8a80279423f2d1b8db52725ee`。后端共享 runner 的输入摘要：`688b11c164db72ddfa3e0469a81cb33e028fe717ef44d10349dd2a14ea6cf202`。

## 审核与边界

按 `open-code-review-delegate` 使用确定性 preview/rule，由当前 Agent 审核；无需外部模型。原始 16 个文件加本页共 **17/17** 已覆盖，包含工具默认排除的文档、后端测试与生成类型，未跳过；未确认新的阻塞缺陷。详细清单和源码摘要保存在 `review-summary.json`。

首次正常 commit 被文档 ground-truth hook 拦截：本页提到任务账本时没有使用该检查器识别的证据表达。已核对实际差异并补上账本/计划链接；初次日志保留在 `commit.log` 与 `ground-truth-initial.log`。不修改或绕过 hook。

本轮没有修改 DSH、升级依赖、访问真实数据、登录真实 CRM、发布或切换杭州服务。默认 app/profile 仍未配置生产保存 provider，UI 仍 NOT_AVAILABLE。结果年龄暂缓不取消登录/session 有效性、HTTP 超时或 UNKNOWN 恢复。

新枚举可能被旧服务/插件拒绝。启用前须绑定匹配合同的消费者，保留兼容服务与 durable state，不能把 profile 回退理解为状态降级。新的 clean 双包/候选绑定、目标 WSL、浏览器和真实身份接入均 **NOT_RUN**；旧 WSL 回执只属于原固定字节，测试 driver 的新摘要也须进入新证据。T3/T7 和完整生产准入仍 **PARTIAL**。
