# D15 保存门禁 OCR delegate 审核与修复

日期：2026-10-04。基线：`56198c32a52d9822c7a3338d92b0fa077d1c61bc`，分支 `codex/plugin-boundary-review`。本轮审查该基线后的本地 D15 保存回执、准入、合同、decoder 与文档；不包含生产启用。

## 覆盖与结论

使用 `ocr delegate preview --format json`、`ocr delegate rule --format json`，由当前 Agent 审查实际 diff 与调用链。原始清单 total_files=29、reviewed_files=29、skipped_files=0、coverage_rate=100%。其中工具可审 15 个文件；工具排除的 14 个文档、生成类型、声明和 Python 测试也进行了补审。新增的本报告另行核对。

机器记录：`.context/checks/d15-save-review-20261004T130020Z/{preview,rules,coverage,findings,summary}.json`。记录逐文件状态和修复后摘要；未调用 OCR LLM 或外部 reviewer。

| 严重性 | 路径/问题 | 修复与证据 |
|---|---|---|
| High | `backend/services/analytics/first_purchase/saved.py`：双回执索引未检查实际分析记录；不完整恢复或来源破坏后仍可能返回 SAVED | 同一事务快照检查指定分析版本、owner、run 与 evidence；缺失/不匹配返回 STATE_UNAVAILABLE，不重建。2 个负测。 |
| Medium | 同文件：持久化回执/provenance 通过模型默认值补齐缺失字段，掩盖损坏或不兼容 wire 合同 | 对服务持久化 JSON 与解码后标准表示进行一致性检查，拒绝缺省补齐/类型归一化。5 个负测。 |

两项均已修复。没有剩余已确认的本轮代码缺陷；这不关闭尚未执行的跨版本、生产策略、UI 与现场门禁。

## 本次真实验证

- 修复前：两个保存测试文件中 7 个新负测全部失败，35 deselected；`regression-before.log`。
- 修复后：`python -m pytest --noconftest -q backend/tests/test_analytics_first_purchase_save_api.py backend/tests/test_analytics_first_purchase_save_receipts.py`，42 PASS，2 个依赖弃用警告；`regression-after.log`。
- 共享 bounded pytest 入口执行保存 API、回执、恢复、分析、source、native 六文件，78 PASS / 0 SKIP；`bounded-backend.log`，原始报告 `.context/checks/20261004T130817818165Z/summary.json`。
- 固定 Node 24.19.0、pnpm 11.7.0、Python 3.14.4 下运行 `node scripts/dsh-b0/pipeline.mjs --check --python /absolute/python3.14`：退出 0，Python 665 PASS，Node 各阶段合计 1506 PASS / 1 SKIP（包含 clean 重跑），完整类型检查、合同与 clean rebuild 通过；`b0.log`。
- 唯一 Node skip 是未提供独立 HTML 示例包的既有条件用例，不能解释为该真实示例已验收。Python 警告为依赖弃用提示。
- `node scripts/dsh-b0/first-purchase-analysis-contract.mjs --check`、边界清单 `--check`、受影响 Python Ruff、`git diff --check` 通过。OpenAPI SHA-256：`3b45ef6df28219827343f9b1bcc0c6c8c35f46dd05790b340ed1f266c9a702b4`。

SQLite 损坏负测仅作用于隔离小夹具。没有读取真实 DuckDB、修改 DSH 上游、浏览器/真实模型/WSL 验收或生产动作。下一步是固定新旧服务源码的兼容与 forward-fix 矩阵，T3/T7 继续 PARTIAL，生产保存继续 NOT_AVAILABLE。
