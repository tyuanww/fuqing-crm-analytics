# DSH rc2 release artifact reference

本页是 DSH rc2 发布工具的命令和输入输出参考。产品版本为 `0.20.0.0`，DSH 固定为 `0.1.7-rc.2`，上游 SHA 为 `477b4f420553e8a52c2fbccc464d7561b239c443`。离线命令段描述接收合同；`dsh-0.20.0.0-r1` 是当前 immutable Release，杭州 current 仍为上一份已运行版本，现场切换以 runbook 和最新 receipt 为准。

## 命令入口

根目录 `package.json` 将 `pnpm dsh` 映射到 `node scripts/dsh.mjs`。运行时要求 Node 24.x；锁文件使用 pnpm 11.7.0。

根目录 `package.json` 的 `version` 保持 npm 三段 projection（当前为 `0.20.0`），以兼容 npm 工具链；候选发布产品版本以根目录 `VERSION` 的四段值 `0.20.0.0` 为准，artifact manifest 和发布门禁均读取 `VERSION`。

| 命令 | 作用 | 成功/阻断行为 |
|---|---|---|
| `pnpm dsh --help` | 打印命令列表和退出码 | 无命令时退出码为 2 |
| `pnpm dsh --version` | 输出产品版本和固定 DSH upstream SHA | 只读 |
| `pnpm dsh doctor` | 检查 Node 主版本、四段产品版本、rc2 pin 和 release schema | 任一检查失败退出 2 |
| `pnpm dsh doctor --release` | 在已有固定 runtime bundle 时只读检查 Node/pnpm/Python、clean worktree、zstd、固定 upstream、runtime bundle、evidence 目录和版本 pin | 缺项给出稳定错误码并退出 2；不联网、不生成 artifact；首次候选无 runtime 时直接运行正式 `preflight` |
| `pnpm dsh dev [args...]` | 将参数转发给 `scripts/dsh-dev/cli.mjs` | 只操作当前工作树登记的开发实例，不探测杭州 |
| `pnpm dsh test` | 运行 `scripts/release/*.test.mjs` | 测试失败退出非零 |
| `pnpm dsh release --offline [--dry-run] [--tag TAG] [--config PATH]` | 在干净 checkout、已构建固定 rc2 runtime bundle 的前提下生成 pre-manifest、source tarball、runtime tarball、manifest、`SHA256SUMS` 和 CI evidence index | 必须提供 `DSH_UPSTREAM_RUNTIME_BUNDLE`; 只写 `.context/release-evidence/<tag>/`，不联网、不打 tag、不创建 Release |
| `pnpm dsh receive --artifact FILE --manifest FILE --destination DIR [--max-entries N] [--max-bytes N]` | 校验并安全解包一个 release artifact | 目标目录必须不存在；默认最多 10000 个条目、512 MiB 展开后字节数，失败时拒绝接收 |
| `pnpm dsh verify --scope local` | 运行本地 doctor、synthetic compatibility/backpressure | 本地合同通过返回 0；不代表生产可发布 |
| `pnpm dsh verify [--scope release]` | 运行发布级 doctor、synthetic compatibility/backpressure 并检查发布门禁 | 当前真实 WSL2/HTTP/15 分钟 SLI 未完成时退出 2 并打印 `RELEASE_BLOCKED` |
| `pnpm dsh preflight --check --python ABS --tag TAG` | 在已有 runtime bundle 时只读检查正式 preflight 的工具链、固定 upstream、插件入口、runtime bundle 和输出目录 | 检查失败在构建前退出 2，不联网、不生成 artifact；正式 `preflight` 会自行生成 runtime |
| `pnpm dsh reconcile STATE REMOTE` | 将远端 receipt 与 durable state 对账 | `CONFLICT`/`UNKNOWN` 退出 2 |
| `pnpm dsh status [STATE]` | 打印 durable state | 只读 |
| `pnpm dsh resume [STATE]` | 根据 durable state 计算可恢复动作 | 只读，不自动执行远端副作用 |
| `pnpm dsh why-blocked` | 解释需要单独授权或现场证据的阻断项 | 只读 |
| `pnpm dsh retry` | 输出需要 state path 和幂等键的重试边界 | 不执行远端副作用 |
| `pnpm dsh rollback` | 输出现场回退入口 | 实际回退必须使用 `deploy/wsl/rollback-release.sh`、同一 `RELEASE_STATE_PATH` 和已记录 receipt |

杭州接收使用 `deploy/wsl/fetch-release.sh`。Tailscale 只传输小型 `release-publication.v1.json` 和两份 attestation sidecar；杭州主机直接从 GitHub Release 下载六个资产，支持断点续传、重试、临时文件和 SHA-256 校验，成功后写入 `release-fetch.v1.json`。大 runtime 包不通过 Mac/Tailscale 中转。

## release 参数和配置优先级

`release` 只接受 `--offline`、`--dry-run`、`--tag` 和 `--config`。release tag 的优先级是：

1. `--tag TAG`
2. 环境变量 `DSH_RELEASE_TAG`
3. 配置文件中的 `release_tag`
4. `VERSION` 推导出的 `dsh-<VERSION>-candidate`

配置文件路径的优先级是 `--config`、`DSH_CONFIG_FILE`、仓库根目录 `.dshrc.json`。tag 必须匹配 `dsh-[A-Za-z0-9._-]+`。`release` 会拒绝 dirty worktree 和已存在的非空 evidence 目录，保证证据目录不可覆盖。

## artifact 内容合同

默认 allowlist 由 [`scripts/release/artifact.mjs`](../../scripts/release/artifact.mjs) 定义，包含：

- 根版本、`package.json`、锁文件、`scripts/dsh.mjs`、`README.md`、`CHANGELOG.md`、`AGENTS.md`、`DESIGN.md`、`Dockerfile`；
- 精确的 `.github/workflows/dsh-release-evidence.yml`；
- `backend/`、`frontend-vue3/`、`config/`、`knowledge/`、`mcp_servers/`、`dsh-plugins/`；
- `scripts/dsh-b0/`、`scripts/dsh-dev/`、`scripts/release/`、`deploy/wsl/`、`docs/release/`、`docs/operating/`。

allowlist 之外的文件不会进入包。`.map`、测试构建残留、`.env`、凭据、cookie、日志、缓存、DuckDB/WAL、SQLite 临时文件、`.git` 和符号链接会被拒绝或排除。打包后 receiver 重新枚举目录、核对 manifest payload 的路径/字节数/SHA-256，并再次执行 secret scan。

本页和 `docs/architecture/` 下的说明属于仓库维护文档，当前 allowlist 不把这两个目录加入 source artifact；运行时接收以 manifest、runtime bundle 和 allowlist 为准。

正式 preflight 输出目录的 `release-preflight.json` 还记录 `stage_timings`、`tthw_ms`、`retry_count` 和 `evidence_coverage`。这些字段用于从同一候选证据回放阶段耗时和 PASS/NOT_RUN 覆盖；它们不把未运行的 WSL2、host HTTP 或真实数据验证标成通过。

## 接收边界

`receive` 在解包前校验 manifest schema、allowlist 路径、payload 路径、artifact 字节数和 SHA-256。source 使用 `secure-unpack.py`，runtime 使用 bounded zstd receiver；两者都限制条目数和展开后字节数。source 拒绝绝对路径、`..`、重复条目、链接、设备文件和不安全权限；runtime 只接受 stage 内相对 symlink/hardlink。解包使用全新的目标目录；任何失败都不会把目录当作可用 release。

生产安装还需要 `release-publication.v1.json`、`SHA256SUMS`、CI evidence index、GitHub Release 和 attestation bundle。r3 已达到 `PUBLISHED_VERIFIED` 并在杭州安装；CRM image、Python wheel 和 runtime peer-link receipt 是本次杭州 sidecar，未作为 GitHub Release asset 上传。未达到 `PUBLISHED_VERIFIED` 时，杭州安装入口必须保持阻断。

## 相关文档

- [rc2 Quickstart](../operating/dsh-rc2-quickstart.md)：从 doctor 到 synthetic release 的教程。
- [rc2 发布与回退 Runbook](../operating/dsh-rc2-runbook.md)：杭州现场操作顺序和回退条件。
- [DSH release trust explanation](../architecture/dsh-release-trust.md)：为什么采用 immutable artifact、allowlist 和 fail-closed。
- [当前验证账本](../release/dsh-rc2-candidate/verification.md)：本轮 PASS、PARTIAL 和 NOT_RUN 证据。
