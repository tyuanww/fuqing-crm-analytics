# 服务包与配对验证 OCR 审核（2026-10-05）

## 覆盖与结论

按 [open-code-review-delegate](/Users/hutou/.agents/skills/open-code-review-delegate/SKILL.md) 执行，OCR CLI 1.12.11 只负责 workspace 文件选择与规则解析，当前 Agent 完成源码、合同和文档审核。基线为 `codex/plugin-boundary-review@809a9367`，保留原未提交成果。

| 统计 | 结果 |
|---|---|
| total_files / reviewed_files | **21 / 21** 原始变更路径 |
| OCR 选中 / 补审排除项 | **11 / 10**（9 个文档、1 个 Python 测试） |
| skipped_files / coverage_rate | **0 / 100%** |
| 确认 / 修复 / 未关闭的本轮缺陷 | **2 / 2 / 0** |

按 `(path,status)` 逐项记账，清单为 `.context/checks/service-artifact-review-20261005/checklist.json`；同目录保留 `preview.json`、`rules.json`、`findings.json` 与 `review-summary.json`。本报告是审核后的新增记录，也已核对内容与引用。

## 已修复发现

1. **High / security — `scripts/crm-calibration/package-service.mjs`**：Git 默认应用 replacement objects；隔离 Git 仓在原 SHA 上实际返回替换提交的代码，破坏 `service_source` 的精确归属。元数据及源码读取统一禁用 replacement；配对 seed 的子进程沿用相同环境。没有改任何真实仓的 Git 配置或 refs。
2. **Medium / bug — `scripts/crm-calibration/service-process.fixture.mjs`**：`stop()` 的 `events.once(exit)` 会在 AbortError 时提前失败并清除 SIGKILL 定时器，忽略 SIGTERM 的自有进程仍可能占用端口。改为共享 cleanup Promise，等待进程退出和管道关闭后写日志；取消不提前终止回收。

两项回归均先失败后通过。原始日志 `regression-red.log` 为 **0 PASS / 2 FAIL**，`regression-green.log` 为 **2 PASS / 0 FAIL**。第二项使用实际 loopback HTTP 进程并让它忽略 SIGTERM，修复后约 3 秒完成强制回收；测试即使失败也只回收自己创建的进程。

## 修复后实际验证

```sh
export PATH=/Users/hutou/homebrew/opt/node@24/bin:/Users/hutou/homebrew/bin:$PATH
.context/checks/service-package-pair-20261005/build-venv/bin/python \
  scripts/run_backend_tests_bounded.py \
  backend/tests/test_crm_service_packages.py \
  backend/tests/test_crm_service_contracts.py \
  backend/tests/test_service_artifact_compatibility.py
```

- **25 PASS / 0 SKIP**，实际包入口内部 **10 个 Node 集成/回归场景**；日志 `focused-final.log`。
- 固定旧 `56198c32` / 新 `a50bd424` 的实际包，在两个新 venv 离线安装精确 wheel 后再次 **9/9 PASS**；命令沿用[配对证据](./dsh-g0-service-artifact-pair-20261005.md)，仅 output 改为 `.context/checks/service-artifact-review-20261005/pair`，退出码 0。
- 新 `pair/receipt.json` SHA-256：`d27b6f63edf6358c06156fd645ed7285fd11e6ea96c64040a4d06fd7b69070d0`。7 个验证器摘要对应修复后文件；两份 archive/manifest 与上一轮相同，因为此次修复只改变验证器，不改变包内业务或 bootstrap。
- Ruff 四个相关 Python 文件、三份 JS 入口语法与 `git diff --check` 通过。没有重新运行完整 B0、远端 CI、WSL、浏览器、真实模型或业务数据验收。

所有临时服务、合成小库和 venv 均由测试拥有并回收；没有修改 DSH 上游、默认 profile 或真实 DuckDB。

## 提交与下一步

用户已明确授权审核、维修及无问题后本地 commit；提交检查点已完成，按授权走正常 hooks，提交结果和准确 SHA 以 Git/STATUS 后续记录为准。没有 push、Release 或杭州操作。

首次提交被文档 ground-truth hook 拒绝：配对表的“来源缺失”一行没有附近的显式证据标记。已补该实际观测的 `detect-old-write` 名称和“已验证”说明，未修改或绕过 hook；失败日志为 `commit.log` / `ground-truth-failure.log`。

本次未关闭产品发布门禁：两份服务包仍是本机 synthetic candidate，`release_ready=false`；旧服务可写降级继续 BLOCKED。下一步绑定 artifact/依赖回执与目标主机证据，沿用既有 journal，再完成 WSL/生产身份/时限与完整候选验收。T3/T7/T15 仍 PARTIAL；物理分仓在 G0/stop-go 后。
