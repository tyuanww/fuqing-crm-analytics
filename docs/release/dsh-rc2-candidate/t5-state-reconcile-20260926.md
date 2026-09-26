# T5 durable state and reconcile evidence（2026-09-26）

实现提交：3df2a263 及候选工作树本轮的 `scripts/release/state.mjs` stale-lock ownership hardening。

本轮完成：

- state.json 增加 release_tag 绑定，阶段和事件写入完整 journal；
- reconcileState 将远端决策写入本地 journal，但不会静默采用远端状态；
- 新增 pnpm dsh reconcile <state> <remote> 入口；
- 子进程在 idempotent 写入 IN_PROGRESS 后被 SIGKILL，resume 能报告 action_required 和 unknown operation；
- 修复 phase_status=COMMITTED 与远端 release status=DRAFT 的错误冲突。

验证：Node24 aggregate release tests 49/49 PASS；synthetic CLI reconcile 输出 RECONCILED/NOOP，并在 state journal 中留下 RECONCILE 事件；stale lock 只允许显式确认且拒绝活动进程/替换锁。真实 GitHub API、上传 429/进程中断的远端组合、CI 并发和杭州现场 resume 尚未运行；T5 保持 PARTIAL。
