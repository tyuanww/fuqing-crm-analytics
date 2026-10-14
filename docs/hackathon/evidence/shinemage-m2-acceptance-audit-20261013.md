# M2 任务卡当前审计（2026-10-13）

这份矩阵把当前隔离 candidate、journal、目标回执、live browser 观察和真实业务前置核验放在同一张账上。它是状态审计，不是发布授权，也没有改变主仓 profile、现役 DSH 或生产数据。

| 卡片 | 当前状态 | 下一条件 |
|---|---|---|
| M2-01 | `FORMAL_CANDIDATE_REGISTERED / RELEASE_GATES_OPEN` | 候选 browser 已有 seq 5；继续收口剩余发布门禁 |
| M2-02 | `FORMAL_BINDING_REGISTERED / CRM_UNBOUND_BY_CONTRACT` | 保持 CRM profile 按组合合同无绑定，继续收口 UAT 与发布门禁 |
| M2-03 | `TARGET_PREFLIGHT_PASS / USER_AUTHORIZED_TEST_PROD` | candidate 已登记到主仓 journal；激活和发布另按门禁授权 |
| M2-04 | `TERMINAL_PASS / BROWSER_PASS` | standalone/accessibility 与剩余 release gates |
| M2-05 | `PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS / STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL` | 真实读屏、人工完整键盘焦点、Windows 高对比度 |
| M2-06 | `CANDIDATE_REAL_MODEL_PASS / CRM_READONLY_PASS / WEKNORA_READONLY_PASS / LIVE_TOOL_SURFACE_EMPTY` | 保存、权限失败、恢复和人工业务复核；live 标准会话工具面仍 `NOT_EXPOSED / NOT_RUN` |
| M2-07 | `BLOCKED` | 上游替换、来源归档、发布者身份、SBOM、签名、撤销和干净机器 |
| M2-08 | `NOT_RUN` | M2-04 至 M2-07 关闭并取得发布授权 |
| M2-09 | `CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / FORMAL_PACK_SOURCE_PROVENANCE_PASS / PROFILE_COMPATIBILITY_PASS / COMBINED_BROWSER_NOT_RUN / TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN / MAIN_PIN_UNCHANGED` | 先修复 CRM/Knowledge 的 Cordis peer 兼容性并重新生成 profile；再使用真实浏览器并在重启后回读数据，最后决定主仓 peer/toolchain 适配与切换 |
| M2-10 | `PASS / RELEASE_GATES_REMAIN_OPEN` | 各卡继续独立收口，外部门禁变化后刷新矩阵 |

当前正式 candidate journal 已到 seq 5：candidate intent、candidate prepared、source HTTP target observation、terminal host observation 和 browser host observation。另有 headed Tab 焦点部分观察，但没有为它追加 journal 事件。主仓正式 profile/journal 已登记，`release_ready=false`、activation `NOT_RUN`。本次文档复核没有新增代码改动；此前页面包、探针和 DSH 兼容矩阵代码已分别完成审查并本地提交。本轮没有 push、没有生产切换；受保护的 `security-audit-skill/` 保持未跟踪。

用户已确认杭州入口同时承担当前测试与生产验收，云服务器迁移后置；该决定解除 M2-03 的目标环境阻塞，但不改变真实业务、供应链和正式发布门禁。详见[当前测试与生产目标授权记录](shinemage-production-target-authorization-20261013.md)。

真实 UAT 已有分层实跑：live 标准会话的 WeKnora 来源观察与 CRM 只读看板重试加载 PASS，但工具面仍缺少 `query_crm_dashboard_gsv`；隔离 candidate 在用户手工保存 provider 凭据并绑定 CRM 当前对话后，真实模型、WeKnora 只读检索和 CRM GSV 7/7 日结构化查询 PASS。保存、权限失败、恢复和人工业务复核保持 `NOT_RUN`。详见[真实模型、WeKnora 与 CRM UAT 实跑](shinemage-real-business-uat-20261013.md)和[候选真实 UAT 证据](shinemage-m2-06-candidate-real-uat-20261013.md)。


## 2026-10-14 M2-09 证据纠偏

复核发现此前记录的 alpha2 formal pack/profile、组合 browser 和授权目标 browser/recovery 不能作为正式验收证据。formal preparation 使用了被 Git 忽略的 candidate workspace，回执中的 source_dirty=false 只反映外层仓库状态，不能证明候选包来源已被当前提交树锁定；旧打包器因此被修复。native-composition-browser-probe.mjs 只启动 HTTP backend/native host 并等待 stdin，没有真实 headed 浏览器、页面导航或 console 监听；其 console_errors=[] 是未观察到，而不是浏览器实测。restart 只确认宿主返回重启响应，没有在新进程中读回 history/board。目标运行还复用了 synthetic backend，因此目标 browser/recovery 也降为 NOT_RUN。旧 JSON、日志和提交保持原样，作为历史尝试留存；本次结论以本节和修复后的来源门禁为准。


## 2026-10-14 tracked candidate pack

tracked candidate workspace 提交 da1b49d35a571c79cff36a69bea0e2e933fac532 已生成 9/9 个 alpha2 pack，回执全部绑定该提交且 source_dirty=false。来源证明已通过；CRM/Knowledge 的 Cordis peer 仍为 4.0.2，与 alpha2 runtime 4.0.5-alpha.1 不匹配，候选 profile compatibility 保持 BLOCKED。browser/recovery 尚未执行。


## 2026-10-14 M2-09 peer compatibility

candidate commit 1bb2646523a7c1cd5aa04d11080617a373af7147 将 CRM/Knowledge 的 Cordis peer 从 4.0.2 对齐到 4.0.5-alpha.1。候选 CRM/Knowledge 测试分别为 108/108、32/32，使用新 pack/profile 的 CRM/Knowledge/page 组合集成为 20/20。来源证明与 profile compatibility 已通过；真实 browser、owned-host recovery 和主仓 pin 切换仍未执行。


## 2026-10-14 M2-09 本机 browser/recovery 补验

本轮在 tracked alpha2 candidate 上补齐隔离 Web dist，并通过真实 gstack Chromium fallback 完成页面导航、Preview Notice、延后模型配置、预置历史会话和插件库存观察；稳定后控制台无错误。owned-host 重启后浏览器重新加载，预置历史仍可见；重启瞬间的 `ERR_INCOMPLETE_CHUNKED_ENCODING` 与一次 WebSocket 重连告警作为恢复过程证据保留，稳定后清空日志复查无错误。board 仍由 synthetic backend 预置，未把它写成浏览器 UI 的 board readback。回执见 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-browser-recovery-20261014.json`。

M2-09 更新为 `CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / FORMAL_PACK_SOURCE_PROVENANCE_PASS / PROFILE_COMPATIBILITY_PASS / COMBINED_BROWSER_PASS / CANDIDATE_RECOVERY_PASS / TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN / MAIN_PIN_UNCHANGED`。正式目标 browser/recovery、真实业务 UAT、主仓 rc2 pin 适配、release/activation 仍未执行。
