# DSH rc2 Quickstart

本地开发、CI 和杭州接收使用同一份不可变 artifact。开发默认保留 DSH 原生对话和工具合同，`shine-brand` 默认关闭；插件失败时回退到 native loop 是 T17 验收目标；当前 pack 成功不能证明真实宿主隔离。

<a id="dsh-quickstart-toolchain"></a>

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
# 首次候选没有 runtime bundle 时，直接运行正式 preflight；prepare 会联网准备固定依赖，audit 单独联网审计，runtime 阶段随后离线生成固定包
pnpm dsh preflight --python /absolute/path/to/python3.14 \
  --source-sha "$(git rev-parse HEAD)" \
  --tag dsh-preflight-<short-sha>
# 正式 preflight 成功后，输出目录里的 runtime 可供独立 offline release 复核
DSH_UPSTREAM_RUNTIME_BUNDLE=/path/to/upstream-runtime.tar.zst \
  RELEASE_STATE_PATH="$PWD/.context/release-state.json" \
    pnpm dsh release --offline --tag dsh-0.20.0.0-candidate
```

<a id="dsh-quickstart-clean-tree"></a>

`pnpm dsh doctor --release` 是已有 runtime bundle 时使用的只读发布前置检查，会一次报告 Node/pnpm/Python、clean worktree、zstd、固定 upstream、runtime bundle、evidence 目录和版本 pin，并给出稳定错误码与对应文档锚点；它不联网、不读取真实 DuckDB、不生成 artifact。首次候选没有 runtime 时，不应把它当作正式构建的前置步骤；正式 `pnpm dsh preflight` 会在固定 upstream 上准备依赖、构建插件并生成 runtime。`pnpm dsh preflight --check` 复用同一检查器，额外检查插件入口和空的输出目录，只适合复核已有 runtime，不生成候选包。

<a id="dsh-quickstart-upstream"></a>
固定 DSH checkout 必须与 profile 中的 upstream SHA 完全一致；不能用浮动分支、`latest` 或现场 `git pull`。

<a id="dsh-quickstart-runtime"></a>
runtime bundle 必须由固定上游 checkout 生成，文件名必须包含 `477b4f420553e8a52c2fbccc464d7561b239c443`，并通过 zstd 流校验。

<a id="dsh-quickstart-artifact"></a>
候选输出目录必须是新的可写目录；artifact、manifest、SHA256SUMS 和 state journal 使用同一候选身份，不覆盖已有证据。

<a id="dsh-quickstart-troubleshooting"></a>
遇到阻断时先复制错误码和 `ref=` 文档路径，再按链接修复；不要用 `--scope local` 绕过 release gate。

正式 `pnpm dsh preflight` 会在 tag 前执行固定上游准备、依赖安全审计、全部生产插件构建、完整 runtime secret/deny-name 扫描和 release contract tests；它不创建 tag、draft、asset 或 GitHub Release。命令按 `prepare → audit → build → runtime → release → test → receive → evidence` 输出阶段事件、耗时和产物目录，失败时给出稳定错误码。`prepare` 和 `audit` 允许联网；审计被单独拆成可重试阶段，registry 短暂不可用时保留已准备的固定 checkout，不把网络失败伪装成通过。`prepare` 会先按固定锁文件完整执行 `pnpm fetch`，预热 registry 依赖，并在独立 runtime-inputs 缓存中保存经锁文件 SHA-512 验证的原始直链 tarball；runtime 的临时 `pnpm deploy` 使用 `--ignore-scripts`，避免在已验证 checkout 之外执行上游生命周期脚本。audit 通过后，runtime bundle 使用同一 pnpm store 离线打包，避免重复访问外部 CDN。CI 的 `dsh-release-evidence` 必须绑定这个 exact-SHA preflight，并复用它生成的 runtime tarball。`pnpm dsh release --offline` 会在 `.context/release-evidence/<tag>/` 生成 pre-manifest、source tarball、固定 rc2 runtime tarball、release manifest、`SHA256SUMS` 和脱敏 CI evidence；它要求 runtime bundle 已由固定上游 checkout 构建，不上传 asset、打 tag或发布 GitHub Release，并且必须提供显式 `RELEASE_STATE_PATH`（或 `--state-path`）。发布前必须有干净 reviewed commit、成功 preflight/evidence、publication sidecar 和独立授权。`pnpm dsh receive`、`reconcile`、`status`、`resume` 共用同一绝对 state path；未提供时 fail closed。`why-blocked` 用于解释阻断；`rollback` 默认只显示现场 runbook，不猜测 systemd 命令。

杭州部署时，Tailscale 只用于 SSH 控制面和传输小型 publication/attestation sidecar。大体积 source/runtime 包由杭州主机直接从 immutable GitHub Release 下载：运行 `deploy/wsl/fetch-release.sh` 后再执行 `install-release.sh`。fetch 支持断点续传、重试、临时文件、SHA-256 校验和 `release-fetch.v1.json` 回执；不要从 Mac 通过 `scp`/`rsync` 中转 runtime 包，也不要在生产执行 `git pull` 或现场编译。

`pnpm dsh verify --scope local` 只验证本地 synthetic compatibility/backpressure，全部通过时返回 `0`；默认 `pnpm dsh verify` 或 `pnpm dsh verify --scope release` 是发布门禁：只要 rc1/rc2、15 分钟 HTTP SLI 或真实 backpressure 证据未运行，就打印 `RELEASE_BLOCKED` 并以退出码 `2` 结束。local 绿色结果不能替代 release gate。

未接通的保存、导出和真实发送能力显示 `NOT_AVAILABLE` 及原因，不写入伪成功回执。
离线 runtime 的直链依赖也必须可复现：`prepare` 保存原始 HTTPS tarball，并按固定锁文件的 SHA-512 校验；缓存键包含 URL 和 integrity。runtime 复制已准备的上游到独立临时工作副本，只在副本中绑定本地 tarball，不改写原 checkout，也不按包名重打包 `node_modules`。缺包返回 `RUNTIME_DIRECT_TARBALL_NOT_PREPARED`，篡改返回 `RUNTIME_DIRECT_TARBALL_INTEGRITY_MISMATCH`。部署使用 pnpm 11.7 的 shared-lockfile frozen 路径，只在临时副本设置 `inject-workspace-packages`，避免 legacy deploy 重新解析版本范围。`prepare` 成功后留下绑定 upstream SHA、lock/policy 摘要和工具链的本地凭证；离线阶段仅凭匹配凭证复用已检查锁文件的策略结果（`--trust-lockfile`），不替代独立 audit 或发布签名。缺失/漂移凭证分别报 `RUNTIME_PREPARATION_REQUIRED`/`RUNTIME_PREPARATION_MISMATCH`。离线 deploy 同时拦截网络连接，意外网络调用返回 `RUNTIME_OFFLINE_NETWORK_DENIED`；缺失依赖仍需回到明确允许联网的 prepare 调查，不能悄悄访问 CDN 或关闭安全审计。

`receive` 在解包前持久化 `IN_PROGRESS`，失败/中断保留 `UNKNOWN`；`resume` 的 `action_required=true` 表示仍需核对。幂等身份包含 artifact、manifest 和目标目录摘要。若目录已安装但最终回执丢失，再运行完全相同的 receive 命令会重新验证包、完整文件清单、内容摘要与 secret scan，通过才补回执；目录缺失或不一致时保持 UNKNOWN，不自动覆盖。进程崩溃留下的锁须先按 ownership/runbook 明确确认死进程，再清理本次锁。
