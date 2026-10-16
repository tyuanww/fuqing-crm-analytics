# M2-09 alpha2 插件消费锁与 pack 闭包（2026-10-14）

本轮完成 tracked alpha2 candidate 的隔离消费闭包复核。输入只来自候选 checkout 和 ignored `.context/checks` 证据目录，不修改主仓 rc2 pin、正式 profile/journal、live/current 或上游 DSH。

## 输入与复核

- candidate source commit：`1bb2646523a7c1cd5aa04d11080617a373af7147`
- candidate inputs：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-inputs-peer-20261014`
- prepared closure：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-prepared-peer-20261014`
- composition lock：`candidate-composition.lock.json`，lock SHA-256 `53b85e28681e338bdab2d9817e51245af680c5f930e3b6dd79cbd8f2f4168f90`
- upstream runtime：`dsh-v0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c`

复核结果：

| 项目 | 结果 |
|---|---|
| profile | 2 份，profile SHA 与 lock 一致 |
| plugin pack | 9/9，所有 `source_sha` 为 `1bb2646…` |
| tarball | 9/9 文件大小和 SHA-256 与 pack manifest、preparation receipt 一致 |
| runtime peer | dsh-tools `0.2.1-alpha.2`，Cordis peer/runtime `4.0.5-alpha.1` |
| source state | 所有 pack `source_dirty=false` |
| host / remote CI | `NOT_RUN / NOT_RUN` |
| release readiness | `false` |

这一步记录为 `ALPHA2_PLUGIN_CONSUMPTION_CLOSURE_PASS`。它说明候选的来源、profile、manifest、pack 和 lock 已形成可回读的同一闭包；不表示主仓已经切换到 alpha2，也不表示 SDK 供应链、发布者身份、签名、撤销、目标 browser/recovery 或 release/activation 已通过。

## 后续边界

主仓仍固定使用 DSH `0.1.7-rc.2` / `477b4f42…`，默认验证入口和正式 Cordis `4.0.4` 合同不改。下一步只在取得独立适配授权后，审查一个可回退的主仓适配提交；M2-07 继续 `BLOCKED / OFFLINE_INVENTORY_PARTIAL`，M2-08 继续 `NOT_RUN`。
