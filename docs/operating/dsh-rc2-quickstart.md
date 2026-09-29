# DSH rc2 Quickstart

本地开发、CI 和杭州接收使用同一份不可变 artifact。开发默认保留 DSH 原生对话和工具合同，`shine-brand` 默认关闭；插件失败时回退到 native loop。

```bash
# 需要 Node 24、pnpm 11.7.0；不安装生产依赖
pnpm dsh doctor
pnpm dsh test
pnpm dsh verify
pnpm dsh preflight --help
# 在创建不可变 dsh-* tag 前，先用 Node 24 + Python 3.14 构建完整 pinned runtime
pnpm dsh preflight --python /absolute/path/to/python3.14 \
  --source-sha "$(git rev-parse HEAD)" \
  --tag dsh-preflight-<short-sha>
DSH_UPSTREAM_RUNTIME_BUNDLE=/path/to/upstream-runtime.tar.zst \
  pnpm dsh release --offline --tag dsh-0.19.0.0-candidate
```

`pnpm dsh preflight` 会在 tag 前执行固定上游准备、全部生产插件构建、完整 runtime secret/deny-name 扫描和 release contract tests；它不创建 tag、draft、asset 或 GitHub Release。CI 的 `dsh-release-evidence` 必须绑定这个 exact-SHA preflight，并复用它生成的 runtime tarball。`pnpm dsh release --offline` 会在 `.context/release-evidence/<tag>/` 生成 pre-manifest、source tarball、固定 rc2 runtime tarball、release manifest、`SHA256SUMS` 和脱敏 CI evidence；它要求 runtime bundle 已由固定上游 checkout 构建，不上传 asset、打 tag或发布 GitHub Release。发布前必须有干净 reviewed commit、成功 preflight/evidence、publication sidecar 和独立授权。`pnpm dsh status <state-file>`、`resume <state-file>`、`why-blocked` 用于恢复和解释阻断；`rollback` 默认只显示现场 runbook，不猜测 systemd 命令。

`pnpm dsh verify` 是发布门禁：只要 rc1/rc2、15 分钟 HTTP SLI 或真实 backpressure 证据未运行，就打印 `RELEASE_BLOCKED` 并以退出码 `2` 结束；本地 `doctor` 通过不改变这一结论。

未接通的保存、导出和真实发送能力显示 `NOT_AVAILABLE` 及原因，不写入伪成功回执。
