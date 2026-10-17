# DSH rc1 release lane

这条 lane 为内部 rc1 候选准备 release 输入。它与 rc2 主兼容线分开。它不修改 `dsh-plugins/plugin-kit/toolchain.json` 的 rc2 默认值，也不切换杭州 `current`。

## 固定输入

| 输入 | 值 |
| --- | --- |
| SDK | `@deepseek-ai/dsh@0.2.1-rc.1` |
| 上游 tag | `dsh-v0.2.1-rc.1` |
| 上游 SHA | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| Cordis | `4.0.5` |
| Node | `v24.19.0` |
| plugin pnpm | `11.28.2` |
| source identity | `subject-archive`，`f4026619392c2909b449eb75be1081776b7c5507` |

## 本地入口

```bash
node scripts/release/rc1-preflight.mjs \
  --source-archive /absolute/rc1-source.tar.gz \
  --subject-root /absolute/final-subject-set \
  --source-sha f4026619392c2909b449eb75be1081776b7c5507 \
  --runtime-bundle /absolute/shinemage-dsh-upstream-runtime-1600d8a1e140dcde43a1a0941940a0480712c011.tar.zst \
  --runtime-provenance /absolute/shinemage-dsh-upstream-runtime-1600d8a1e140dcde43a1a0941940a0480712c011.tar.zst.provenance.json \
  --output-dir /absolute/rc1-preflight
```

入口会检查 source archive、source tree、LFS pointer、两份 profile、9 个 plugin pack、pack provenance、runtime archive 和 runtime provenance。任一检查失败时只写 `rc1-preflight.json`，退出码为 `2`，不生成可安装 release manifest。

## 当前真实结果

2026-10-17 的本地回执位于 `.context/checks/dsh-rc1-release-prep-20261017/rc1-preflight/`：

- 9 个 plugin pack：`PASS`。
- 2 个 profile：输入已绑定。
- source archive：`BLOCKED`，发现 `108` 个 Git LFS pointer。
- runtime bundle：`BLOCKED`，peer alias 修复后仍被 `RUNTIME_SECRET_SCAN_FAILED` 阻断。
- manifest：`NOT_GENERATED`。
- formal `SHA256SUMS`：`NOT_GENERATED`。
- publication、attestation 和杭州切换：`NOT_RUN`。

source `.tar.zst` 只作为准备阶段失败产物保存。它的 `source-provenance.json` 明确标记 `formal_release_accepted=false`。不能把它上传为正式 release asset。

## 远端 workflow

`.github/workflows/dsh-rc1-release-preflight.yml` 只接受明确的 source archive URL、subject-set URL、archive SHA-256 和 source identity。它不使用当前 rc2 workflow 的 `GITHUB_SHA` 假设，也不把 `f402...` 当作 Git commit。source archive 未完成 LFS hydration 或 runtime scanner 未通过时，workflow 必须失败。

正式发布仍需在 source identity 固化、LFS 内容完整、runtime scanner 通过后，再生成 `release-manifest.v1.json`、正式 `SHA256SUMS`、CI evidence index、attestation 和 publication sidecar。

当前状态保持：`M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。
