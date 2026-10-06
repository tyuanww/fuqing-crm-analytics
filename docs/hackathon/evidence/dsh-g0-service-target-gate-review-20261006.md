# WSL 回执接线提交前审核（2026-10-06）

范围为 `codex/plugin-boundary-review@2a89790b` 后的 14 个未提交文件。按 open-code-review-delegate 由当前 Agent 审核，OCR 仅做文件选择和规则解析，没有调用外部 reviewer 或另一个模型。

## 覆盖与结论

`ocr delegate preview --format json` 选中 6 个代码/测试文件，另有 8 份 Markdown 因扩展名被工具排除，已全部补审。覆盖 **14/14，0 skipped，100%**。新审核记录另行检查。没有确认需要修改代码的 critical/high/medium/low 问题，不为了凑审查数量改动已正确的实现。

已检查 CLI 参数和脱敏、候选/包/回执绑定、输入与结果文件白名单、固定 runner/helper 摘要、全部场景与清理记录、journal 写锁内前置事件和重试语义。归档 Python runner 与实际现场输入逐字节一致，已读完整控制流；它不是新的通用安装器，CLI/CI 不执行它。解析器测试的伪 wheel/seed 不当作现场证据。文档明确不提升到生产身份、签名或激活通过。

| 文件组 | 覆盖 |
|---|---|
| CLI 和 candidate journal | `scripts/dsh.mjs`、`scripts/release/plugin-service-evidence.mjs` |
| 目标证据校验/测试 | `service-target-evidence.mjs`、`service-target-evidence.test.mjs` |
| fixture/历史输入 | `test-fixtures/service-target.mjs`、`test-fixtures/target-acceptance-20261006.py` |
| 8 份文档 | CHANGELOG、STATUS、TODOS、服务包说明、验证入口、拆分计划、artifact reference、目标接线证据 |

## 本次实际验证

- `node scripts/dsh.mjs test`：**243 PASS / 0 FAIL / 0 SKIP**，包含目标接线 37 项。
- 对既有实际 WSL 输入、双包及原 candidate 再运行 `plugin verify-service`：通过，仍为 seq 4 / digest `2315f80cc711b96b80420a7f79bd0294beb4b81e6df1ddde0365a84ffb031e8b`；journal 字节不变，108 个输入/证据文件内容、大小及 mtime 与原记录一致。
- JS 语法、历史 runner AST/Ruff/固定 hash、Markdown 本地链接和 `git diff --check` 通过。机器结果在下方审计目录。

原始证据：`.context/checks/service-target-gate-review-20261006/` 的 `preview.json`、`rules.json`、`checklist.json`、`review-summary.json`、`release-suite.log`、`actual-retry.json`、`evidence-recheck.json`、`document-validation.json`。

本次没有重新执行 WSL 场景、访问真实数据、启动生产服务或外发内容。已满足本地提交条件，沿用正常 hooks；准确提交号以 Git/后续 STATUS 为准。提交后按既定计划从固定 clean SHA 准备候选，生产身份/策略、时限/UNKNOWN、供应链、DSH 宿主/浏览器与物理分仓仍为开放项。
