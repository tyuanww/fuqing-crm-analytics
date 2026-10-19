# DSH rc1 release lane

这条 lane 为内部 rc1 候选准备 release 输入。它与主仓兼容线分开。它不修改 `dsh-plugins/plugin-kit/toolchain.json` 的默认值，也不负责杭州 owner-operated 的现役切换。当前线上为 `dsh-0.2.1-rc.1-owner-main-4ac076de-20261019`；2026-10-18 的 r9 只保留为历史回退证据。正式 release 状态只看 [STATUS.md](../../STATUS.md)；本 lane 的 local asset 不等于公司正式 release。

## 固定输入

| 输入 | 值 |
| --- | --- |
| SDK | `@deepseek-ai/dsh@0.2.1-rc.1` |
| 上游 tag | `dsh-v0.2.1-rc.1` |
| 上游 SHA | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| 上游锁文件 SHA-256 | `952ca2f79998660dc690b739078a5d6052bc7c5c2193714b918b9d720baaeaba`（`pnpm-lock.yaml`） |
| Cordis | `4.0.5` |
| Node | `v24.19.0` |
| plugin pnpm | `11.28.2` |
| upstream pnpm | `11.28.5` |
| source identity | `subject-archive`，`f4026619392c2909b449eb75be1081776b7c5507` |

## 当前 clean-main v4 staging

2026-10-20 已在独立 staging 目录生成 `dsh-0.2.1-rc.1-clean-main-20261020-v4`。它使用同一 upstream SHA，但 runtime/profile 是本次重建的新输入：runtime SHA-256 为 `d3d504dd39cd333fb98acf61cf4597664f6d4fda5482fb2ea970748bd2b8a94f`，web profile SHA-256 为 `c3ec7df313c2323996428b1034af0fd5eec5fffe1d06a8c618532074110503ad`。官方 plugin-market bundle 已加入 profile，并通过 native boot、Settings/account RPC、插件页、Discover tab、peer 缺失负测和 AppleDouble 扫描；market index 仍未配置（候选 receipt 已确认）。

候选回执位于目标机 `/srv/shinemage/dsh/staging/rc1-clean-main-20261020/candidate-profile-receipt.json`。IM package/index 不在可验证的归档输入中，回执保持 `BLOCKED_MISSING_ARTIFACT`、`release_ready=false`，production switch 为 `HELD_PENDING_IM_ARTIFACT`。线上 `current` 仍指向 `dsh-0.2.1-rc.1-owner-main-4ac076de-20261019`；这条 lane 没有执行切换。

## 本地入口

```bash
node scripts/release/rc1-preflight.mjs \
  --source-archive /absolute/dsh-rc1-source-f4026619-hydrated.tar.zst \
  --subject-root /absolute/final-subject-set \
  --source-sha f4026619392c2909b449eb75be1081776b7c5507 \
  --runtime-bundle /absolute/shinemage-dsh-upstream-runtime-1600d8a1e140dcde43a1a0941940a0480712c011.tar.zst \
  --runtime-provenance /absolute/runtime-provenance.json \
  --release-dir /absolute/rc1-release \
  --output-dir /absolute/rc1-preflight
```

入口会检查 source archive、source tree、LFS pointer、两份 profile、9 个 plugin pack、pack provenance、runtime archive 和 runtime provenance。任一检查失败时只写 `rc1-preflight.json`，退出码为 `2`，不生成可安装 release manifest。

## 2026-10-17 历史本地结果

本节保留 2026-10-17 的 local lane 回执。它不是当前线上 owner-main 资产，也不是正式公司 release。2026-10-18 的 r9 只作为历史回退证据，当前 owner-operated 事实和正式门禁只看 [STATUS.md](../../STATUS.md)。

2026-10-17 的本地回执位于 `.context/checks/dsh-rc1-release-prep-20261017/rc1-preflight/`，本地 release asset 位于 `.context/checks/dsh-rc1-release-prep-20261017/rc1-release/`：

- 9 个 plugin pack：`PASS`。
- 2 个 profile：输入已绑定。
- source archive：`PASS`，`lfs_pointer_count=0`；hydrated archive SHA-256 为 `20e915fc23bd6f2b7d1c7fe0b6e9bbefebbb2f283d194301f7c26e2a5d196bfc`，tree SHA-256 为 `3a4567ebdbe0053135dd33a62615f288b6cba0f3e98933154959fdda09d66c3d`。
- runtime bundle：`PASS`；`188116158` bytes，SHA-256 为 `bff4e5cedb3e70facdf73e1c16ad8a0ef8231d1d2cb3e56fb7850b6c22775965`。`chrome-devtools-mcp` 不在 bundle 中。
- rc1 preflight：`PASS`，`43/43` release tests 通过；正式状态仍为 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。
- 本地 release asset：已生成 `dsh-0.20.0.0-rc1.tar.zst`、runtime bundle、`pre-manifest.v1.json`、`release-manifest.v1.json`、`SHA256SUMS`、`ci-evidence-index.v1.json` 和 `release-preflight.json`。`release-preflight` 的 `wsl2` 与 `host_http` 为 `NOT_RUN`。
- publication、公司 publisher/signature/revocation/final attestation、clean-machine 和杭州切换：`NOT_RUN`。

旧的 `runtime-build-failure.json` 和 pointer 失败 preflight 仍保留为历史失败证据。hydration receipt 见 `rc1-preflight/source/lfs-hydration-receipt.json`，hydrated source provenance 见 `rc1-preflight/source/source-provenance-hydrated.json`，runtime provenance 见 `rc1-preflight/runtime/runtime-provenance.json`。本地 release asset 只证明字节和输入绑定，不代表公司签名、正式 publication 或杭州生产切换已完成。

## 远端 workflow

`.github/workflows/dsh-rc1-release-preflight.yml` 只接受明确的 source archive URL、source archive SHA-256、subject-set URL、subject-set SHA-256、runtime bundle URL、runtime bundle SHA-256 和 source identity。workflow 使用 `secure-unpack.py` 的 bounded extraction，并让严格 profile pack reader 重新核对 profile、manifest、tarball bytes、包身份和 generated-bytes provenance。它不使用当前 rc2 workflow 的 `GITHUB_SHA` 假设，也不把 `f402...` 当作 Git commit。source archive 未完成 LFS hydration、subject/runtime digest 不匹配或 runtime scanner 未通过时，workflow 必须失败。

正式发布仍需把本地 asset 送入批准的 publisher、signature、revocation、independent verification、final attestation 和 clean-machine 流程，再生成可外发的 publication sidecar。当前没有执行这些外部门禁。

当前状态保持：`M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。

## Linux x64 portable runtime

在 Linux x64 builder 上生成可移植 runtime 时，使用 `--portable-linux`。该选项要求 Linux x64、固定上游 checkout、离线 preparation receipt 和新的输出目录：

```bash
node scripts/release/runtime-bundle.mjs \
  --upstream /absolute/pinned/dsh-upstream \
  --output /absolute/output/runtime-linux-x64.tar.zst \
  --provenance /absolute/output/runtime-linux-x64.provenance.json \
  --portable-linux
```

构建会重写 pnpm staging shim、移除不适用的 Darwin/Windows/Linux arm64 native 文件，并在打包前拒绝 host path 和 native findings。该结果仍是 owner-local 输入；publisher identity、signature、revocation、independent verification、final attestation 和 formal clean-machine 需要单独完成。
