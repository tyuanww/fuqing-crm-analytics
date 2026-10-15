# M2 剩余外部条件交接清单（2026-10-15）

这份清单只列当前本地无法代替完成的条件。它不要求用户理解 DSH、alpha2 或供应链内部实现；每项条件到位后，按对应的验收步骤继续推进即可。

| 任务 | 需要提供或确认的条件 | 条件到位后执行 | 当前状态 |
|---|---|---|---|
| M2-05 页面无障碍 | 已使用 Tailscale Windows x64 目标和 source-owned 页面包 | Windows headed、Chrome AX、Tab/Enter、高对比度、Narrator 启动和用户同一目标人工听读均已留存；远程通道未附语音录音，但人工确认已记录 | `PASS / SCREEN_READER_AUDIO_PASS` |
| M2-06 真实业务 UAT | 已在独立 `18099` storage candidate 中完成真实快照/分析保存回读和临时 `admin1` 权限路径 | owner 分享后 reader 成功读取；owner 撤权后 reader 返回 `404/NOT_FOUND`；已做持久化复核、临时容器/状态/账号清理，并确认 live `4328`、共享 `18093` 未改变 | `PASS / REAL_SHARE_READ_PASS / REAL_REVOKE_READ_DENIED_PASS / REAL_REVOKE_PERSISTED_PASS / REAL_CLEANUP_PASS` |
| M2-07 SDK 供应链 | 最终 immutable SDK artifact 及 SHA、完整正式 SBOM、publisher identity、签名/验签与撤销证明、干净机器环境 | 按最终 SHA 重做正式 SBOM/attestation，逐项处理 rc2 的 17 个 binary/native coverage gaps，执行干净机器安装、升级、回退、签名验证和撤销验证 | `BLOCKED` |
| M2-08 正式发布 | 正式 release/activation 批准、release reference、15 分钟 SLI 目标和 canary/rollback 窗口 | 运行 release preflight、目标接收、SLI、canary、rollback；不自动切换 live | `NOT_RUN` |
| M2-09 DSH 升级候选 | 明确授权在杭州目标启动隔离 alpha2 candidate runtime；不切换 live、不发布 | 用可审计 runner 完成 headed browser、重启后 history/board 回读，再单独评审主仓适配 | `TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN` |

## 当前不需要用户做的事情

- 不需要修改主仓默认 profile 或 journal。
- 不需要把 CRM service binding 写入默认组合 profile。
- 不需要提供生产凭据到仓库、文档或聊天。
- 不需要同意 DSH 主仓版本切换；M2-09 会先保持 rc2，候选验收和主仓切换分开。
- 不需要再次人工重跑已关闭的 M2-05 或 M2-06；对应回执和清理证据已在主仓留存。

## 当前无法由本地自动补齐的条件

- M2-07 的正式发布者身份、签名权限、撤销权限和最终 immutable artifact 必须由发布责任方提供；本机没有 GPG secret key，未安装 `cosign`，不能伪造签名或把开发 archive 提升为正式 release。
- M2-08 的 release/activation 批准、15 分钟 SLI 窗口、canary 和 rollback 窗口尚未授权；测试目标通过不等于生产发布授权。
- M2-09 的正式目标 browser/recovery 需要隔离 alpha2 runtime 和可审计 runner；当前只完成隔离候选和本机 browser/recovery，主仓 rc2 pin 保持不变。

## 执行约束

- 代码、脚本、配置或测试有改动时，先执行 `open-code-review-delegate`，修复后再本地提交。
- 纯证据和文档更新只做事实校验和本地提交。
- release、activation、真实 CRM 写入、canary、rollback 和主仓 pin 切换始终保持独立授权。
