# PR #121 正式组合包交付（2026-10-12）

本页记录当前正式作者包进入主仓 B0 的远端组合交付。它只覆盖 artifact 身份、接收器回执和 PR CI；不生成 candidate/journal，也不改变真实宿主、服务目标、业务或发布门禁。

## 组合 artifact

WorkBench 暂存分支 `codex/ci-composition-inputs-20261011` 以提交 `e9bfc77653019f656ada2b679c56d4d525fb0dd5` 更新 Workbench、CRM、Knowledge 三份当前 formal pack 的 manifest、tarball 和 inventory。staging run [38218001878](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38218001878) SUCCESS，artifact 为 `shinemage-sealed-composition-20261011`，ID `11732716479`，704587 bytes，GitHub digest `sha256:552aa4d122aa84418c6874798fef7c6024f5052ee8c331535036d5f85a5ea486`，有效期至 `2026-10-26T07:29:17Z`。

下载 ZIP 后本机 SHA-256 为 `552aa4d122aa84418c6874798fef7c6024f5052ee8c331535036d5f85a5ea486`。主仓 receiver 生成九份包、两份 profile 的固定输入，回执锁摘要为 `be215557e46c78c6c15b738e1a15dd22281770bee438f30960fbf0de3f4437eb`，`host=NOT_RUN`、`remote_ci=NOT_RUN`、`release_ready=false`。

主仓变量 `SHINEMAGE_PACK_ARTIFACT_REPOSITORY`、`SHINEMAGE_PACK_ARTIFACT_ID`、`SHINEMAGE_PACK_ARTIFACT_SHA256` 已更新到上述 repository、ID 和 digest；读取 Secret 仍只由 GitHub Actions 使用，值未入库。

## PR CI

PR [#121](https://github.com/tyuanww/fuqing-crm-analytics/pull/121) head `ad5630174ae086abf135b8fbdb9319623ef09b4d` 的 CI run [38217097817](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38217097817) attempt 2 SUCCESS：`b0-contract-build`、`test`、`lint`、`changes / changes`、`merge-gate` 均成功；路径矩阵中不适用的五项保持 SKIPPED。B0 日志为 `862 passed, 23 warnings, 41 subtests passed`，并明确记录 `B0 main checks passed`。

第一次 attempt 因主仓三个变量仍指向旧 artifact `11710265230`，Workbench manifest `0af61dab…` 与当前锁 `900004009…` 不一致而失败；旧 artifact 未继续使用。修正暂存输入、变量后重跑通过。

当前 PR 可合并状态为 `MERGEABLE` / `CLEAN`，但本页不执行合并。candidate/journal、service binding、目标 terminal/browser/recovery、真实 CRM/WeKnora/模型/UAT、standalone、SDK 分发和 DSH 升级仍按 STATUS 保持未关闭。
