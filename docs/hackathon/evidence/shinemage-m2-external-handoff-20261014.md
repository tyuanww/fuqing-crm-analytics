# M2 剩余外部条件交接清单（2026-10-14）

这份清单只列当前本地无法代替完成的条件。它不要求用户理解 DSH、alpha2 或供应链内部实现；每项条件到位后，按对应的验收步骤继续推进即可。

| 任务 | 需要提供或确认的条件 | 条件到位后执行 | 当前状态 |
|---|---|---|---|
| M2-05 页面无障碍 | 已使用 Tailscale Windows x64 目标和 source-owned 页面包 | Windows headed、Chrome AX、Tab/Enter、高对比度和 Narrator 会话 1 已留存；远程通道没有语音录音，读屏听读回执仍待人工记录 | `WINDOWS_A11Y_PARTIAL` |
| M2-06 真实业务 UAT | 隔离 CRM 测试账号、可回收测试数据、允许的写入范围和权限负测范围 | 只在 candidate runtime 执行 CRM 保存、权限失败、恢复和人工业务复核；不写 live 业务数据 | `READONLY_PASS / WRITE_NOT_RUN` |
| M2-07 SDK 供应链 | 最终 immutable SDK artifact 及 SHA、完整 SBOM、publisher identity、签名与 verifier、撤销/轮换证明、干净机器 | 按最终 SHA 重做 SBOM/attestation，执行干净机器安装、升级、回退和签名验证 | `BLOCKED` |
| M2-08 正式发布 | 正式 release/activation 批准、release reference、15 分钟 SLI 目标和 canary/rollback 窗口 | 运行 release preflight、目标接收、SLI、canary、rollback；不自动切换 live | `NOT_RUN` |
| M2-09 DSH 升级候选 | 明确授权在杭州目标启动隔离 alpha2 candidate runtime；不切换 live、不发布 | 用可审计 runner 完成 headed browser、重启后 history/board 回读，再单独评审主仓适配 | `TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN` |

## 当前不需要用户做的事情

- 不需要修改主仓默认 profile 或 journal。
- 不需要把 CRM service binding 写入默认组合 profile。
- 不需要提供生产凭据到仓库、文档或聊天。
- 不需要同意 DSH 主仓版本切换；M2-09 会先保持 rc2，候选验收和主仓切换分开。

## 执行约束

- 代码、脚本、配置或测试有改动时，先执行 `open-code-review-delegate`，修复后再本地提交。
- 纯证据和文档更新只做事实校验和本地提交。
- release、activation、真实 CRM 写入、canary、rollback 和主仓 pin 切换始终保持独立授权。
