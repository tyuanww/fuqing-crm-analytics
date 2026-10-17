# Linux portable runtime and formal gate audit

本回执只记录本地 owner candidate 的诊断结果。它不代表正式 Linux rebuild，也不代表公司发布门禁通过。

## runtime 结果

- archive `runtime-linux-x64-owner-r4.tar.zst` 的 SHA-256 为 `b92d758994a09d7c315cd81f51ea16333fec0cc8b60364b63c40ccacb12a2d7b`。
- `zstd -q -t` 通过。
- 解包树包含 42 个含 `/private/var` 的文件，共 5,182 次引用。
- 解包树包含 19 个 Mach-O 文件和 17 个 ELF 文件。
- 解包树同时包含 Darwin、Linux 和 Windows native artifacts。
- 发现 `sherpa-onnx-darwin-arm64`、`sharp-libvips-darwin-arm64`、`ripgrep-darwin-arm64` 和其他 Darwin native files。

当前 runtime 不能作为正式 Linux portable asset。只替换 `/private/var` 字符串不能修复平台混装问题。

## 根因

`scripts/release/runtime-bundle.mjs` 先执行 `pnpm deploy --config.inject-workspace-packages=true`。该步骤把绝对 workspace 路径写入 `package.json`、`pnpm-lock.yaml`、`.modules.yaml` 和 workspace state。当前流程只重写 registry tarball URL。它不归一化 workspace file specifier，也没有在 tar 前拒绝非 Linux native files。

## 正式门禁探针

| 门禁 | 本地结果 | 正式状态 |
| --- | --- | --- |
| publisher identity | `OWNER_IDENTITY_DECLARED_LOCAL` | `NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE` |
| signature | `OWNER_SELF_SIGNED_LOCAL / VERIFICATION_PASS` | `NOT_RUN_COMPANY_SIGNER_UNAVAILABLE` |
| revocation | `NOT_RUN_NO_TRUST_SERVICE` | `NOT_RUN_NO_REVOCATION_SERVICE` |
| independent verification | `SELF_SEPARATED_REPLAY_PASS` | `NOT_RUN_SECOND_PERSON_UNAVAILABLE` |
| final attestation | `OWNER_ATTESTATION_DRAFT_NOT_FORMAL` | `FORMAL_EXCEPTION_REQUIRED` |
| clean-machine | `OWNER_OPERATED_REPLAY_PASS` | `NOT_RUN_COMPANY_CLEAN_MACHINE` |

本机缺少 `cosign`、`gpg`、`notation`、`in-toto-verifier`、`slsa-verifier`、`syft`、CycloneDX CLI、`gitsign` 和 `crane`。本机也没有公司 publisher、signer、revocation、KMS 或 OIDC 输入。

## 下一步条件

1. 在批准的 Linux runner 上按固定 upstream SHA、Node 和 pnpm 重新安装和 deploy。
2. 在打包前加入 fail-closed portable metadata scan。
3. 拒绝 host absolute path、`file:///` workspace path、Darwin native magic 和 Windows native files。
4. 从重建后的真实 bytes 重新生成 runtime、SBOM 和 provenance。
5. 再执行 Linux import、最小功能和 rollback。

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```
