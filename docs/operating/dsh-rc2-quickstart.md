# DSH rc2 Quickstart

本地开发、CI 和杭州接收使用同一份不可变 artifact。开发默认保留 DSH 原生对话和工具合同，`shine-brand` 默认关闭；插件失败时回退到 native loop。

```bash
# 需要 Node 24、pnpm 11.7.0；不安装生产依赖
pnpm dsh doctor
pnpm dsh test
pnpm dsh verify
pnpm dsh release --offline --tag dsh-0.18.0.1-candidate
```

`pnpm dsh release --offline` 只生成 pre-manifest 和脱敏 CI evidence，不创建 draft、上传 asset、打 tag 或发布 GitHub Release。发布前必须有干净 reviewed commit、CI evidence、publication sidecar 和独立授权。`pnpm dsh status <state-file>`、`resume <state-file>`、`why-blocked` 用于恢复和解释阻断；`rollback` 默认只显示现场 runbook，不猜测 systemd 命令。

`pnpm dsh verify` 是发布门禁：只要 rc1/rc2、15 分钟 HTTP SLI 或真实 backpressure 证据未运行，就打印 `RELEASE_BLOCKED` 并以退出码 `2` 结束；本地 `doctor` 通过不改变这一结论。

未接通的保存、导出和真实发送能力显示 `NOT_AVAILABLE` 及原因，不写入伪成功回执。
