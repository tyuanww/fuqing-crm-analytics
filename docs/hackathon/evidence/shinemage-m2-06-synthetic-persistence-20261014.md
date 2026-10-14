# M2-06 alpha2 合成保存、权限与恢复证据（2026-10-14）

本轮在 tracked alpha2 candidate 的 `analytics-workbench` 包中复核合成保存、权限边界和恢复行为。该回执只证明候选代码在隔离测试夹具中的状态一致性，不把合成数据当作真实 CRM、WeKnora 或模型业务验收，也不执行真实业务写入。

## 输入与原始证据

- candidate workspace：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-workspace-20261014`
- candidate source commit：`1bb2646523a7c1cd5aa04d11080617a373af7147`
- upstream：`dsh-v0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c`
- package：`analytics-workbench`，Node `v24.19.0`，candidate alpha2 toolchain
- 原始日志：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-workspace-20261014/analytics-workbench/analytics-workbench.candidate-test.log`
- 日志 SHA-256：`12a22f1314ed7e889642c55be5bbfe5643e23e3811b3e523bff2b7f1d403afdb`

原始日志包含两个候选测试入口：基础 session/model/native/run-view 为 `35 PASS / 0 FAIL / 0 SKIP`，保存/页面/编辑回归为 `130 PASS / 0 FAIL / 0 SKIP`，合计 `165 PASS / 0 FAIL / 0 SKIP`，退出码为 0。相关断言覆盖：

- journal/session 恢复：恢复 request/turn/exit 不重放 prompt，刷新只恢复允许的标题，旧 session/run 响应被拒绝，持久化读取失败不暴露半成品。
- 权限与边界：权限丢失显式报告，禁止回退数据源或写入；错误 session、错误 scope、共享或整页范围拒绝进入写路径。
- 保存与恢复：D6 patch、D9 save、reopen、rollback 走隔离 HTTP；丢失回执只用同一候选重试；CAS 冲突允许丢弃；保存后的刷新失败不把已确认持久化降级为不确定。
- 草稿与离开：失败预览保留草稿并阻止离开，显式 discard 保留已保存版本，save-and-leave 不重复确认同一 PATCH。

## 结论与边界

本轮记录为 `SYNTHETIC_PERSISTENCE_PERMISSION_RECOVERY_PASS`。它关闭了 alpha2 候选的合成状态机回归子项，保留 M2-06 的真实业务门禁：真实 CRM 保存、真实 CRM 权限失败、真实 CRM 恢复、真实 WeKnora 写入（如有）、人工业务复核和 live 标准会话工具面均未执行或仍未暴露。当前 candidate 真实模型、CRM 只读查询和 WeKnora 只读检索的既有回执不受影响。

本轮没有读取或写入真实业务数据，没有读取凭据，没有启动或切换 live/current，也没有修改主仓 DSH rc2 pin、正式 profile/journal 或上游 DSH。
