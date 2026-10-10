# 服务兼容门禁提交前审核

日期：2026-10-04；分支 `codex/plugin-boundary-review`，基线 `d321971f`。用户授权 OCR delegate 审核、修复、通过后本地 commit，再开始独立服务包工作。没有 push、现场切换、真实数据或模型调用。

## 覆盖和发现

OCR `preview` 原始范围为 **23/23**：12 个代码/JSON、11 个补审文档，0 跳过。按 `rule` 逐路径检查输入合同、候选摘要、profile/payload 一致性、安装 journal、幂等返回前的激活/回退拒绝与文档证据。主 Agent 执行审查，未调用外部 LLM 或委派 agent。

**已修复 P1：preflight 未消费服务证据。** 新 profile 声明 `service_binding` 后，独立 release 命令要求 `--service-evidence`，但正式 preflight 没有提前校验或转发该参数，构建 runtime 后必然在 release 阶段失败。现在 `preflight` 和 `--check` 都在 readiness 检查证据，正式 release 重新核对同一路径；重复/缺值明确返回 2。本机兼容 PASS 不覆盖其他 readiness 或生产门禁。

新增实际 CLI 回归先复现缺少 `SERVICE_EVIDENCE_REQUIRED`，再验证缺证据、正确本地证据、篡改、重复参数和缺值五种输入；始终不启动构建、不生成输出。此测试使用 `.context` 中自有临时 profile/回执，结束清理，不向业务源码插入故障。

最终包含修复和本报告 **26/26** 路径，0 跳过；当前无未关闭的本轮代码发现，生产开放项仍按末节保留。

## 当前验证

Node 24.19.0 / pnpm 11.7.0；原始记录 `.context/checks/service-gate-ocr-20261004T225141/`：

| 命令 | 结果 |
|---|---|
| `ocr delegate preview --format json` / `ocr delegate rule --format json <paths>` | 工具选择与规则成功；初始/最终 preview、coverage、summary 留档 |
| `node --test --test-name-pattern='preflight checks declared service' scripts/release/cli.test.mjs` | 首次 FAIL 留在 `preflight-before.log`；修复后 PASS 留在 `preflight-after.log` |
| `node scripts/dsh.mjs test` | **170 PASS / 0 SKIP**，退出 0；`release-suite.log` |
| `node --check`、Markdown 本地链接、`git diff --check` | PASS；只验证本次改动 |

未修改业务 Python、DSH 插件或合同生成物；上一实现阶段的 B0 Python 665 PASS、Node 1508 PASS / 1 SKIP 是其当次结果，未声称本次全量重跑。正式联网八阶段 preflight、独立服务包、WSL 和生产现场仍未在本次审查中执行。

首次 commit 被 `check_review_ground_truth.py` 拒绝：四处描述测试拒绝输入的文字没有邻近的“已验证”标记。核对已有负测日志后补明确表述，正常 hook 检查通过；失败记录保留在 `commit.log`、`ground-truth-before.log`，没有使用绕过开关。

## 下一步与边界

先提交本轮已审门禁，再复用现有领域服务打包器补首购 analysis-service 的独立资源/依赖清单、隔离包检查与保存/恢复验证。最终服务包、目标主机身份/写权限、生产形状时限/UNKNOWN、DSH UI/浏览器与 WSL/canary 尚未通过；服务声明依然 `LOCAL_COMPATIBLE`、`release_ready=false`，实际激活拒绝。普通插件不新增服务依赖。

[实现阶段证据](dsh-g0-service-gate-20261004.md)保留前轮候选摘要与失败记录；[兼容合同](../../architecture/first-purchase-service-compatibility.md)和 [STATUS](../../../STATUS.md)区分代码、候选与生产状态。
