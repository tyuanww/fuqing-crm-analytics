# DSH rc1 release lane

这条 lane 为内部 rc1 候选准备 release 输入。它与 rc2 主兼容线分开。它不修改 `dsh-plugins/plugin-kit/toolchain.json` 的 rc2 默认值，也不负责杭州 owner-operated 的现役切换。当前杭州内部 r9 现场和正式 release 状态只看 [STATUS.md](../../STATUS.md)；本 lane 的 local asset 不等于公司正式 release。

## 固定输入

| 输入 | 值 |
| --- | --- |
| SDK | `@deepseek-ai/dsh@0.2.1-rc.1` |
| 上游 tag | `dsh-v0.2.1-rc.1` |
| 上游 SHA | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| Cordis | `4.0.5` |
| Node | `v24.19.0` |
| plugin pnpm | `11.28.2` |
| upstream pnpm | `11.28.5` |
| source identity | `subject-archive`，`f4026619392c2909b449eb75be1081776b7c5507` |

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

本节保留 2026-10-17 的 local lane 回执。它不是当前杭州 r9 资产，也不是正式公司 release。当前 owner-operated r9 事实和正式门禁只看 [STATUS.md](../../STATUS.md) 及 2026-10-18 回执。

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

`.github/workflows/dsh-rc1-release-preflight.yml` 只接受明确的 source archive URL、subject-set URL、archive SHA-256 和 source identity。它不使用当前 rc2 workflow 的 `GITHUB_SHA` 假设，也不把 `f402...` 当作 Git commit。source archive 未完成 LFS hydration 或 runtime scanner 未通过时，workflow 必须失败。

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
