# M2-10 证据与状态收口（2026-10-13）

> 这是历史审计记录。文中早期 alpha2 target browser/recovery PASS 叙述已经被后续证据纠偏撤销；当前十张任务卡的 disposition 以[2026-10-14 M2 收口账本](shinemage-m2-closeout-20261014.md)和 `STATUS.md` 为准。历史回执保留用于追溯，不作为当前 release 或 target 验收证据。

本轮核对 M2 任务卡、机器审计矩阵、STATUS/TODOS、本地提交链与 candidate 真实 UAT 证据的一致性，并补记 M2-05 standalone 页面包与浏览器证据，不改变任何运行时、profile、journal、发布或生产状态。

## 一致性检查

实际读取 `docs/hackathon/evidence/shinemage-m2-acceptance-audit-20261013.json`，结果：

- `cards` 共 10 张，ID 覆盖 `M2-01` 至 `M2-10`，无重复或缺失；
- 每张卡都有当前 `status`、`evidence` 和 `next`；
- M2-01/02 已登记正式 candidate/profile 快照；page profile 带 service binding，CRM profile 按组合合同无绑定；
- M2-03 保持目标前置通过；
- M2-04/05/06/07/08/09 当前分别为 terminal/browser `PASS`、standalone 页面包与本地 Chromium 子项通过但 candidate 无障碍仍部分观察、candidate 真实模型/CRM/WeKnora 只读通过但 live 工具面为空、供应链 `BLOCKED`、release `NOT_RUN` 和 DSH `ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / FORMAL_PACK_PASS / COMBINED_BROWSER_PASS / TARGET_BROWSER_PASS / TARGET_RECOVERY_PASS / MAIN_PIN_UNCHANGED`；
- M2-10 本身记录本审计矩阵，未把产品发布状态误写为通过；
- 全局状态仍为 `product=PARTIAL`、`release_ready=false`、`activation=NOT_RUN`、`code_changes_this_audit=true`、`production_data=READ_ONLY_REDACTED / NO_MUTATION`；代码修复已完成本地审查和提交，不改变发布门禁状态。

同时执行：

```sh
jq empty docs/hackathon/evidence/shinemage-m2-acceptance-audit-20261013.json
git diff --check
```

两项均退出 0。此前代码审查覆盖 30 个可审查文件，其中 7 个代码文件和 23 个 JSON；页面包、浏览器探针与 DSH 兼容矩阵代码改动由 `open-code-review-delegate` 逐文件审查，最终改动文件全部覆盖，修复后测试复验通过。页面包/合同/渲染定向测试为 `48 PASS / 0 FAIL`，source-owned standalone Chromium 探针为 `7 PASS / 0 errors`，standalone AX/键盘/forced-colors 自动化补测为 `6 PASS`，默认合成分支为 `6 PASS / 0 errors`，DSH 兼容矩阵为 `5 PASS / 0 FAIL / 0 SKIP`；本轮独立 DSH 候选完成 native/host build、14 文件 `468 PASS / 0 FAIL` 和三组候选 persistence 主行 PASS；九包在 ignored 候选 toolchain 中隔离构建 9/9、自测 9/9（286 项）通过，跨版本 persistence 三组和九包组合 lifecycle 均 PASS，但主仓 peer/固定 toolchain 仍锁 rc2，候选正式 pack/profile、synthetic 组合 browser 与授权目标 browser/recovery 已完成；`git diff --check` 和 pre-commit 均通过。本轮候选 toolchain 适配代码提交 `01b753e5` 已完成 OCR delegate 8/8 审查并本地提交。当前本地提交链包含页面包代码提交 `91f880b5`、探针加固提交 `fcee92a9`、DSH 兼容矩阵提交 `39cdb9c3`、候选运行时证据提交 `b9ab4a50`、`18d86e31` 和跨版本参数化提交 `a7c895e9`；本轮新增的跨版本验证由代码提交 `a7c895e9` 与后续 docs-only 证据共同记录，剩余开放项仍由真实读屏、人工键盘、Windows 高对比度、M2-06 未执行写路径、M2-07 供应链门禁、M2-08 发布门禁以及 M2-09 的主仓 pin 适配、正式组合 browser/recovery 验收决定。

## M2-10 结论

M2-10 的证据与状态收口完成，状态为 `PASS / RELEASE_GATES_REMAIN_OPEN`。这只证明当前十张任务卡的事实、证据文件和未完成边界可追溯；M2-01/02 已登记，M2-05/06/07/08 的独立门禁仍开放，也不授予 release、activation、canary、rollback 或生产切换。


## 2026-10-14 DSH 候选组合补验

M2-09 的候选正式 pack/profile 输入和 synthetic 组合 browser 已补齐：9 个 pack、2 份 profile 输入通过真实读取器，候选 alpha2 native shell 使用正式 page pack 完成隔离 session/history/board 启动与关闭，`model_calls=0`、`contains_real_data=false`。候选 toolchain 适配代码提交 `01b753e5` 已完成 `open-code-review-delegate` 8/8 覆盖和本地提交；固定 Node 24 下相关回归 `119 PASS / 0 FAIL / 0 SKIP`。这只更新 M2-09 的候选证据，不改变 `product=PARTIAL`、`release_ready=false`、`activation=NOT_RUN`，也不授予主仓 pin/live 切换、正式目标 browser/recovery、canary 或 rollback。


## 2026-10-14 DSH 候选目标验收补验

M2-09 已在授权杭州目标完成 alpha2 正式 page pack browser 与 owned-host restart recovery。首次 fresh checkout 缺少 client build，补跑 `build:lib` 后上游 source clean，目标临时 4329 browser、synthetic history/board、restart recovery 均 PASS；目标 live 4328/4332/4336 未修改，临时目录已删除。当前仍不改变 `product=PARTIAL`、`release_ready=false`、`activation=NOT_RUN`，主仓 peer/toolchain 适配与 DSH 切换仍需独立 release-scoped 审查和授权。


## 2026-10-14 M2-09 证据纠偏

本轮复核撤销上一节对 alpha2 target browser/recovery 的“完成”表述：实际探针没有打开真实浏览器，也没有在重启后回读数据；候选 formal pack/profile 来自 ignored workspace，目标还复用了 synthetic backend。M2-09 当前保持候选 runtime、静态矩阵、隔离适配、跨版本和组合 lifecycle 的既有结果，但 formal pack 来源证明、组合 browser、目标 browser/recovery 重新记为 BLOCKED / NOT_RUN。修复后的来源门禁和 25 项打包回归已通过；主仓 rc2 pin/live、release/activation 状态不变。


## 2026-10-14 tracked candidate pack

tracked candidate 提交 da1b49d35a571c79cff36a69bea0e2e933fac532 已生成 9/9 alpha2 pack，来源回执均绑定同一提交且 source_dirty=false。来源门禁已关闭；CRM/Knowledge 的 Cordis 4.0.2 与 alpha2 runtime 4.0.5-alpha.1 不匹配，profile compatibility、browser/recovery 和主仓适配仍保持未关闭。


## 2026-10-14 peer compatibility

tracked candidate commit 1bb2646523a7c1cd5aa04d11080617a373af7147 完成 Cordis peer 对齐；CRM/Knowledge 候选测试 108/108、32/32，候选组合集成 20/20。M2-09 来源证明与 profile compatibility 已通过，browser/recovery、主仓适配和 release/activation 仍保持未关闭。


## 2026-10-14 M2-09 本机真实浏览器与恢复

tracked candidate 补齐隔离 alpha2 Web dist 后，使用 gstack Chromium fallback 实际打开候选页面，完成预置历史会话、插件页和稳定期 console 观察；owned-host 重启后重新加载页面，历史标题和内容仍可见。重启瞬间的 chunked encoding 与 WebSocket 重连告警已保留，稳定后复查无 console error。该回执只关闭本机候选 browser/history recovery 子项；board 仍是 synthetic backend 预置，未宣称浏览器 UI readback。证据为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-browser-recovery-20261014.json`。

M2-09 当前为 `CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / FORMAL_PACK_SOURCE_PROVENANCE_PASS / PROFILE_COMPATIBILITY_PASS / COMBINED_BROWSER_PASS / CANDIDATE_RECOVERY_PASS / TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN / MAIN_PIN_UNCHANGED`；不改变 `product=PARTIAL`、`release_ready=false`、`activation=NOT_RUN`，也不授予主仓适配、DSH 切换、release、canary 或 rollback。
