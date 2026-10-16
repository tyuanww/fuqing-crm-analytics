# M2-07 owner-operated 本地 final attestation 复核（2026-10-16）

本文件把当前 owner-operated 模式能够真实完成的 publisher identity、local signature、revocation 盘点、consumer closure、same-owner replay 和 clean-machine r1 回执集中起来。它是本地技术证据，不是公司 final attestation，也不授予发布或生产激活。正式状态保持 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`release_ready=false`。

## 本地已完成

- 修复后的 CRM tarball production-only 安装、26 个唯一包、97 个依赖节点、无 graph problems、runtime import 和 26 component SBOM 均为本地 `PASS`。
- owner Ed25519 detached signature 由 `openssl pkeyutl -verify -rawin` 复核成功；签名范围仍是既有 owner binding。
- same-owner 独立 staging/process replay 通过，不能解释为第二人独立验证。
- owner clean-machine r1 完成 alpha4 安装、version/help/plugin-help、SDK/CRM/host/KaTeX 导入、卸载、包缺失和 rc2 回退，所有步骤 exit 0。
- 本次没有生成新的 clean-machine r2 回执：仓库没有独立的 rc2 tarball，不能把不完整的 alpha4 单边重放写成 PASS。

## 五项正式门禁

| 门禁 | owner-operated 本地结果 | 正式状态 |
|---|---|---|
| publisher identity | `OWNER_IDENTITY_DECLARED_LOCAL` | `NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE` |
| signature | `OWNER_SELF_SIGNED_LOCAL / VERIFICATION_PASS` | `NOT_RUN_COMPANY_SIGNER_UNAVAILABLE` |
| revocation | `NOT_RUN_NO_TRUST_SERVICE` | `NOT_RUN_NO_REVOCATION_SERVICE` |
| final attestation | `OWNER_LOCAL_FINAL_ATTESTATION_NOT_FORMAL` | `FORMAL_EXCEPTION_REQUIRED` |
| clean-machine | `OWNER_OPERATED_REPLAY_PASS` | `NOT_RUN_COMPANY_CLEAN_MACHINE` |

独立验证另外保持 `SELF_SEPARATED_REPLAY_PASS / NOT_RUN_SECOND_PERSON_UNAVAILABLE`。公司批准 identity、KMS/HSM 或 keyless signer、transparency reference、revocation service、独立 verifier、正式 final attestation 和公司 clean-machine runner 仍缺失。

## 回执索引

机器可读回执：[m2-07-owner-final-attestation-local-r2-20261016.json](m2-07-owner-final-attestation-local-r2-20261016.json)。publisher/signature/revocation 细节见 [owner-local-publisher-signature-revocation](m2-07-owner-local-publisher-signature-revocation-20261016.md)，clean-machine 原始回执在 `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/owner-clean-machine-node24-r1/owner-clean-machine-receipt.json`。

所有 `PENDING`、`NOT_RUN` 和 `FORMAL_EXCEPTION_REQUIRED` 都继续保持非 PASS；主仓 DSH pin 仍为 `0.1.7-rc.2`。
