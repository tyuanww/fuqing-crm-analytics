# DSH rc2 Quickstart

本地开发、CI 和杭州接收使用同一份不可变 artifact。开发默认保留 DSH 原生对话和工具合同，`shine-brand` 默认关闭；插件失败时回退到 native loop。

```bash
# 需要 Node 24、pnpm 11.7.0、Python 3.14+；不安装生产依赖
pnpm dsh doctor
pnpm dsh test
pnpm dsh verify --scope local
# 已经有固定 runtime bundle 时，才运行这两个只读发布检查：
DSH_UPSTREAM_RUNTIME_BUNDLE=/absolute/pinned/runtime.tar.zst \
  pnpm dsh doctor --release
DSH_UPSTREAM_RUNTIME_BUNDLE=/absolute/pinned/runtime.tar.zst \
  pnpm dsh preflight --check --python /absolute/path/to/python3.14 \
  --tag dsh-preflight-<short-sha>
# 首次候选没有 runtime bundle 时，直接运行正式 preflight；它会在 runtime 阶段生成固定包
pnpm dsh preflight --python /absolute/path/to/python3.14 \
  --source-sha "$(git rev-parse HEAD)" \
  --tag dsh-preflight-<short-sha>
# 正式 preflight 成功后，输出目录里的 runtime 可供独立 offline release 复核
DSH_UPSTREAM_RUNTIME_BUNDLE=/path/to/upstream-runtime.tar.zst \
  pnpm dsh release --offline --tag dsh-0.19.0.0-candidate
```

`pnpm dsh doctor --release` 是已有 runtime bundle 时使用的只读发布前置检查，会一次报告 Node/pnpm/Python、clean worktree、zstd、固定 upstream、runtime bundle、evidence 目录和版本 pin，并给出稳定错误码；它不联网、不读取真实 DuckDB、不生成 artifact。首次候选没有 runtime 时，不应把它当作正式构建的前置步骤；正式 `pnpm dsh preflight` 会在固定 upstream 上准备依赖、构建插件并生成 runtime。`pnpm dsh preflight --check` 复用同一检查器，额外检查插件入口和空的输出目录，只适合复核已有 runtime，不生成候选包。

正式 `pnpm dsh preflight` 会在 tag 前执行固定上游准备、全部生产插件构建、完整 runtime secret/deny-name 扫描和 release contract tests；它不创建 tag、draft、asset 或 GitHub Release。命令按 `prepare → build → runtime → release → test → receive → evidence` 输出阶段事件、耗时和产物目录，失败时给出稳定错误码。CI 的 `dsh-release-evidence` 必须绑定这个 exact-SHA preflight，并复用它生成的 runtime tarball。`pnpm dsh release --offline` 会在 `.context/release-evidence/<tag>/` 生成 pre-manifest、source tarball、固定 rc2 runtime tarball、release manifest、`SHA256SUMS` 和脱敏 CI evidence；它要求 runtime bundle 已由固定上游 checkout 构建，不上传 asset、打 tag或发布 GitHub Release。发布前必须有干净 reviewed commit、成功 preflight/evidence、publication sidecar 和独立授权。`pnpm dsh status <state-file>`、`resume <state-file>`、`why-blocked` 用于恢复和解释阻断；`rollback` 默认只显示现场 runbook，不猜测 systemd 命令。

杭州部署时，Tailscale 只用于 SSH 控制面和传输小型 publication/attestation sidecar。大体积 source/runtime 包由杭州主机直接从 immutable GitHub Release 下载：运行 `deploy/wsl/fetch-release.sh` 后再执行 `install-release.sh`。fetch 支持断点续传、重试、临时文件、SHA-256 校验和 `release-fetch.v1.json` 回执；不要从 Mac 通过 `scp`/`rsync` 中转 runtime 包，也不要在生产执行 `git pull` 或现场编译。

`pnpm dsh verify --scope local` 只验证本地 synthetic compatibility/backpressure，全部通过时返回 `0`；默认 `pnpm dsh verify` 或 `pnpm dsh verify --scope release` 是发布门禁：只要 rc1/rc2、15 分钟 HTTP SLI 或真实 backpressure 证据未运行，就打印 `RELEASE_BLOCKED` 并以退出码 `2` 结束。local 绿色结果不能替代 release gate。

未接通的保存、导出和真实发送能力显示 `NOT_AVAILABLE` 及原因，不写入伪成功回执。
