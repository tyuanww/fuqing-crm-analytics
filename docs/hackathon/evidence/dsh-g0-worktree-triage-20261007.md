# 工作树归属与并行边界（2026-10-07）

只读比较各旧工作树的 Git 可见改动与施工分支 `codex/plugin-boundary-review` 的 commit `de89a527`。比较文件字节对应的 Git blob 及该路径的提交历史，没有 reset、stash、切换分支、删除或写入旧工作树。机器清单为 `.context/checks/worktree-triage-20261007/inventory.json`。

| 工作树 | Git 可见改动 | 字节核对 | 处理 |
|---|---:|---|---|
| `fuqing-crm-analytics-public` | 138 | 109 与当前 HEAD 相同，29 与该路径历史已提交 blob 相同 | 不重复提交；保留现状，后续按工作树 owner 的清理授权处理 |
| `dsh-html-edit-chain` | 43 | 8 与当前 HEAD 相同，1 与历史 blob 相同，34 需要语义审查 | 逐项与现实现比对，区分已有功能、旧实现和有效新增，再做独立审修提交 |
| 原始归档仓 | 3 条未跟踪 | HTML 规划、gstack 提示和独立 skill 目录 | 不纳入本轮业务修复 |
| `dsh-rc2-candidate` | 4 | HTML 验收 JSON 和三张截图 | 证据需先核对所属版本；不直接混入当前候选 |

“历史 blob 相同”证明内容已经进入施工分支历史，不代表可以直接覆盖当前版本，也不自动授权清理。34 个 HTML 文件尚未进行完整语义审查，不能据此断言全是遗漏功能。

## 可以并行的工程包

| 工作线 | 独立边界 | 依赖与禁止同时改动 |
|---|---|---|
| A 恢复修复与新候选 | `native-evidence`、bridge/tools/skills/commands、恢复测试 | 本机修复先提交，然后固定新插件 SHA；候选、journal 与目标测试端口由单一 owner 顺序操作 |
| B HTML 编辑差异审修 | `cockpit_ai`、`page_documents`、HTML editor/source-index/selection | 可在既有 HTML 工作树核对；使用自己的构建输出，不能覆盖 A 的 lib；共享 package/build 配置由集成方合入 |
| C 分仓构建前置 | plugin-kit 固定开发依赖、独立仓根目录 build/test/pack、CI 草案 | 可与 A/B 独立实现；不修改业务源码，不创建远端仓库或发布；profile/schema/journal 修改统一收口 |
| D 包信任门禁 | 签名/来源/SBOM/撤销的 verifier 与负测 | 先冻结输入合同；信任状态进入 journal/activation 的接线需等 A 的新候选，不能并发改同一状态文件 |

顺序收口：各线局部审修与提交 → 新候选固定 → 组合/WSL 终态复验及回执 → G0 stop/go → 物理分仓和独立 CI/发布。生产切换、旧资产清理与后续 DSH 升级仍按各自实际授权和门禁执行。本页是现有任务的执行边界，不扩大平台范围。
