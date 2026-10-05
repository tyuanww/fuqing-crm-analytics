# 目标主机预检 OCR 审核与维修（2026-10-06）

基线 `1b443646132a8e90b002988c9635b5993ed55d4b`，工作树 `codex/plugin-boundary-review`。依用户要求执行 open-code-review-delegate：OCR 负责选文件与解析规则，当前 Agent 负责审核和维修，没有外部 LLM 调用。

## 覆盖与发现

原始 **total_files=11，reviewed_files=11，skipped_files=0，coverage_rate=100%**。OCR 选中 `scripts/dsh.mjs` 与 `service-target-preflight.py`；主 Agent 补审工具排除的 Python 测试及 8 个 Markdown（CHANGELOG、STATUS、TODOS、服务包 runbook、verification、拆分计划、release reference、实现证据）。Python 测试也取得对应 OCR 规则。没有未解释的跳过项。

| 级别 / 类型 | 文件 | 已复现问题 | 维修 |
|---|---|---|---|
| Medium / bug | `scripts/crm-calibration/service-target-preflight.py` | 只验文件名和 METADATA：WHEEL 缺失、主版本不兼容、dist-info 错名以及改名伪装平台都未被识别 | 核验唯一顶层 dist-info 身份、WHEEL 1.0、内部/文件名标签与有界元数据读取 |
| Medium / bug | 同上 | 依赖文件数量/版本等于清单，并不意味着符合每个 wheel 的 Requires-Dist；离线安装使用 `--no-deps`，无法补齐遗漏 | 按当前环境评估 active marker，核对清单版本满足约束；拒绝未支持的 active extras/URL，不误拒绝 inactive optional 依赖 |

6 项新增复现负测在修复前全部失败、修复后全部通过。两类已确认问题均已修复，本次范围没有剩余已确认的 High/Medium；这不代表生产发布条件完成。测试夹具补齐基本 WHEEL 元数据，仍不是安装成功证据。

## 本次真实验证

原始记录：`.context/checks/service-target-preflight-review-20261006/`，包括 `preview.json`、`rules.json`、逐文件 `checklist.json` 和结构化发现。Node **24.19.0** / Python **3.14.4**。

| 验证 | 结果 / 记录 |
|---|---|
| 6 项缺陷负测 | **0 PASS / 6 FAIL → 6 PASS**；`regression-red.log`、`regression-green.log` |
| `python scripts/run_backend_tests_bounded.py backend/tests/test_service_target_preflight.py` | **35 PASS / 0 FAIL / 0 SKIP**；`backend.log` |
| `node scripts/dsh.mjs test` | **206 PASS / 0 FAIL / 0 SKIP**；`release-suite.log` |
| 已核验候选 manifest + 13 个实际 wheel → 当前 CLI | 格式、依赖、Python 与本机标签均通过；Darwin arm64 正确得到 WSL2 BLOCKED；`actual-preflight.json` |
| 只读与副作用 | 14 个实际输入内容/mtime 不变；`actual-validation.json`，含执行参数；夹具 audit hook 继续拒绝写入、子进程及 socket |
| Ruff、Node 语法、差异空白 | 实际执行通过 |

本次没有安装 wheel 或启动服务，没有读取真实业务数据、模型调用或杭州操作，没有把 mock WSL 标签算作实机验收。已有包的 dirty 打包来源没有因本次修复被追认为 reviewed release。

## 交付边界

已获审核修复后本地 commit 授权，走正常 hooks，准确 SHA 以 Git 为准。冷安装、身份/状态注入、HTTP 恢复、供应链与生产切换仍未完成；`release_ready=false`，激活继续 BLOCKED。提交后开始固定目标平台依赖与离线冷安装准备。
