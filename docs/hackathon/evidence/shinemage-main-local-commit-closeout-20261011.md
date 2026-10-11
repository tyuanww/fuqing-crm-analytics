# ShineMage 主仓本地分组交付（2026-10-11）

本轮按已授权的本地交付目标推进，从 `5390667cc990fa558b0445aa455b086d325a6c77` 的现有未提交内容逐组审查、验证和提交。记录时点的代码及边界清单 HEAD 为 `d36c567e831145b52365176ca3f90f6c3dfc510a`，分支 `codex/shinemage-abc-local-candidate`，暂存区为空。证据与当前说明随后分别提交；本页不会把这个时点改写为未来提交的验收。机器记录见[validation JSON](shinemage-main-local-commit-closeout-20261011-validation.json)。

## 实际提交及检查边界

| 组 | 提交 | 目的 |
|---|---|---|
| 01 | `24381f0c` | refactor(profiles): assemble explicit independent plugin packs |
| 02 | `caa48b3a` | test(crm): consume fixed packages through main-owned public contracts |
| 03 | `40c7a1f9` | test(plugins): verify fixed leaf package composition |
| 04 | `902690c2` | test(workbench): move public package behavior consumers to main |
| 05 | `a789b108` | test(workbench): bind author CI and main-owned contract checks |
| 06 | `3e7ed6ac` | test(plugins): isolate installed kit and formal package ownership |
| 07a | `dfab3951` | fix(domain): reject aliased producer output files |
| 07 | `7b95d6d7` | refactor(domain): consume sealed author inputs and preserve legacy producers |
| 08 | `7452e775` | refactor(contracts): verify sealed public author exports |
| 09 | `0a28dab4` | refactor(release): consume formal packs in release preflight |
| 10 | `ac9abcd7` | chore(inputs): prepare pinned composition packs for local and CI consumers |
| 11 | `619693ab` | chore(ci): select and run migrated package validation stages |
| 12 | `d36c567e` | chore(boundaries): refresh generated plugin ownership inventory |

各组使用明确路径暂存并保留正常提交钩子；提交路径、暂存字节及其他任务文件的保留核对见原始回执。OCR 只负责选择文件和规则，主 Agent 完成审查；工具默认排除的测试另行补查，外部模型没有执行。每组检查按自己的输入和层级记账，不累计为全量 PASS。中间提交的工作流接线需等 CI 组完成，不能将中间 HEAD 宣称为完整流水线就绪。

## 本轮验证

- profile／固定包入口、公共 CRM/知识行为、leaf/几何消费、Workbench 客户端、作者来源与已安装 kit 均有各自的当前字节验证；作者私有测试的计数仍归固定作者 CI。
- 合同读取器 28 PASS／0 FAIL／0 SKIP；由于当前子进程清理代码与旧正向记录不同，另实际执行 17 个生成器／测试组，全部退出 0，stage 输入未变。
- 发布包装配／接收／服务门禁的 53 项合成回归通过；发布工作流接线的 1 项在 CI 组单独验证。不是实际发布或生产激活。
- 固定组合准备的 9 项守卫通过；九份实际正式包和两份原 profile 在新的独占输出内校验、准备成功，没有执行包代码。
- CI 组的 28 项真实入口坏输入检查、34 项共享路径选择检查分别通过；静态边界生成核对和 12 项边界测试通过。
- 本轮未重新执行全量 B0、上游准备／SDK 全量审计或旧包宿主验收。此前完整 B0 和宿主记录继续属于各自历史输入，不重标为本轮整支提交或新组合的通过。

## 历史留存与失败

原有 92 份 2026-10-11 证据逐字节保留：46 份 Markdown、46 份 JSON；169 个本地链接目标存在，1178 条仍可读取的原始材料摘要引用全部匹配。该核对不重跑历史命令，也不把早期 NOT_RUN、失败或旧通过数改成当前结论。

原始目录：`/Users/hutou/.codex/tasks/shinemage-main-commit-closeout-20261011-ogm1vxo5`。首轮沙箱／投影／包装脚本失败、旧结果拒绝复用和一次缺提交说明导致的 Git 拒绝都保留；修正只补必要步骤，没有覆盖历史失败。曾怀疑的新路径漏选在完整读取通用规则后确认为误报，未留冗余产品改动。

## 尚未执行

当前主仓的新 hosted CI、原 CRM/Knowledge 精确 peer 校准、当前组合的新 candidate/journal 及同对象服务／目标／浏览器／恢复、真实模型和 CRM/WeKnora/UAT、正式分发与独立 DSH 升级仍各自收尾。旧插件副本因保留守卫和静态扫描继续存在；未获删除授权，也没有据此宣称主仓只含 DSH。

本轮没有 push、创建／更新 PR、合并、发布或部署，没有改 peer、DSH pin 或 VERSION（0.20.0.0）。`security-audit-skill/` 不属于本任务，未检查或纳入提交。产品 PARTIAL，SDK 分发仍按适用门禁 BLOCKED，release_ready=false。
