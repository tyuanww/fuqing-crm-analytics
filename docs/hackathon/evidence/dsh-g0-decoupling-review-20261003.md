# 解耦提交前 OCR 审核（2026-10-03）

结论：本次构建层解耦符合已批准方向；两个确认问题已修复，当前没有未关闭的提交阻断项。T15/产品仍 PARTIAL，审核通过只放行本地提交，不放行 Release 或杭州激活。

## 审核范围与方法

使用用户指定的 open-code-review-delegate。OCR 1.12.11 只执行 preview/rule，当前 Agent 审核，不调用外部模型。起点为公共工作树 main@d4261aa338ff4ed5543866b8c63cdba627e49518；累计未提交改动含前置 release 修复、kit 与图表解耦，相互依赖，因此一起复核。

- 原始 preview：total_files=137；reviewable_files=95，reviewed_files=95，skipped_files=0，coverage_rate=100%。
- OCR 默认排除的 42 项全部补审：Markdown、类型、锁文件、补丁、Python 消费者测试及删除/迁移项。累计 reviewed_files=137，skipped_files=0。
- 本报告为审核新增的说明文件，单独检查内容与引用；不伪装成原 preview 输入。
- 逐文件 `(path,status)` 清单、初始/修复后摘要、规则和 findings JSON 保留于 `.context/checks/ocr-decoupling-20261003/`。
- 原 public main 保留所有修改。提交候选使用同一 HEAD 的独立 `codex/plugin-boundary-review` 工作树，不 reset/stash/切换原分支。

## 确认发现与修复

| 级别 | 位置 | 问题与修复 |
|---|---|---|
| Medium | `docs/operating/verification.md:1` | 原验证矩阵被 kit README 误写覆盖。按图表施工前保存的 tracked patch 恢复完整矩阵，再加入本轮图表说明，保留真实隔离/验证入口。 |
| Medium | `scripts/dsh-b0/plugin-boundaries.mjs` | TypeScript `import x = require(...)` 未纳入 AST 扫描，能漏检跨插件源码依赖。补齐 ExternalModuleReference，并覆盖 value/type-only 两种形式。 |

隔离夹具在修复前复现 `Missing expected rejection`，修复后边界测试 9/9 通过；失败日志未删除。未因发现首个问题而停止其他文件审查。锁文件/补丁/几何源与原位置逐字节比较；固定版本未改，领域包摘要不变。生成边界清单通过当前源码的完整再计算检查，不能手工改成 PASS。

## 本次实际验证

环境为已有 Node 24.19.0、pnpm 11.7.0，以及完整锁定的隔离 Python 3.14.4。没有读取真实 DuckDB、启动生产 DSH、连接杭州或调用真实模型。

| 命令/范围 | 本次结果 | 日志 |
|---|---|---|
| `node --test scripts/release/*.test.mjs scripts/dsh-b0/package-inputs.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs scripts/dsh-b0/legacy-geometry-exports.test.mjs scripts/dsh-b0/clean-build.test.mjs scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/compatibility-matrix.test.mjs dsh-plugins/board-components/test/geometry.test.mjs` | 176 PASS，0 FAIL，0 SKIP；包括真实 pnpm pack/deploy、两个隔离 leaf 构建与受控包 | `node-regression.log` |
| `python scripts/run_backend_tests_bounded.py backend/tests/test_board_funnel.py backend/tests/test_board_waterfall.py` | 43 PASS，2 warnings；合成小库 | `backend-geometry.log` |
| 上次 B0 输入摘要比对 | 审核开始时仅 verification 和边界检查器/负测发生本轮修改；其余构建/业务输入与上一轮最终 B0 证据一致 | `working-tree-inputs.json` 与本次 checklist |

上述日志相对 `.context/checks/ocr-decoupling-20261003/`。上一轮完整 B0 的 618 Python / 1408 Node PASS、1 SKIP 留在 [图表解耦记录](dsh-g0-board-components-20261003.md)，不是本轮重新执行的全量成绩。本轮未改业务或构建产物，不为文档与 AST 门禁修复重复运行全套。

## 下一步与剩余风险

提交后继续 CRM 的 5 条 workbench 内部引用：页面工具、页面族、主题 tokens、cockpit slot，先核对领域归属与公开合同；业务代码不进入 dev kit。精确 DSH 宿主、invariant、session/WAL、服务保存矩阵、签名/SBOM、canary/回退和远端门禁仍按现有计划推进。当前无热插拔、物理多仓或上线完成的结论。
