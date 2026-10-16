# M2-07 owner-operated 本地 publisher/signature/revocation 回执（2026-10-16）

本回执只记录单人 owner-operated 模式下可以在本机完成的身份声明、完整性签名和工具盘点。它不是公司 publisher identity、不是公司批准签名、不是独立验证回执，也不是 revocation 结果。正式状态继续保持 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`release_ready=false`。

## 已完成的本地材料

- owner identity：`OWNER_IDENTITY_DECLARED_LOCAL`
- identity 类型：本地一次性 Ed25519 public key
- public key PEM SHA-256：`234d4a8d016c65adca1fd9bdd470b92d2f82fa8a8e022bc2cd1572b813e2b908`
- public key DER SHA-256：`79796ecfd44e35f1e684d16cc1943ea232b3c45fb2b45943f45c5d766677ae81`
- Ed25519 public key raw bytes（不是 fingerprint）：`0d:fd:de:ca:56:09:28:0e:5b:62:c3:39:40:da:9d:86:4b:fc:85:86:62:f5:fe:b2:37:be:20:f5:ee:f6:bf:e4`
- binding 文件：`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/owner-attestation-r1/owner-binding.json`
- binding SHA-256：`dfd7e89d1ffa4779caff5169bb9c08ee9e5dd0b7d4caccbdffe43784b08cbdd7`
- detached signature：`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/owner-attestation-r1/owner-binding.sig`
- signature SHA-256：`26f4a6ac9c116b729f27260ab40c6b5eb13b657c291df907ebf6bc75be7d1d0d`
- `openssl pkeyutl -verify ... -rawin`：exit `0`，`Signature Verified Successfully`

签名覆盖的是已有的 `owner-binding.json`，其中已经绑定 alpha4 SDK、修复后 CRM tarball、local closure、同 owner replay 和 owner clean-machine receipt 的 SHA。新生成的本回执引用这些已签名材料，但没有伪造公司签名或把自身追加为已签名 subject。

## 未完成的正式门禁

| 门禁 | 本地结果 | 正式状态 | 缺口 |
|---|---|---|---|
| publisher identity | `OWNER_IDENTITY_DECLARED_LOCAL` | `NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE` | 公司批准 issuer、subject、key ID、证书/公钥或 KMS/OIDC identity |
| signature | `OWNER_SELF_SIGNED_LOCAL / VERIFICATION_PASS` | `NOT_RUN_COMPANY_SIGNER_UNAVAILABLE` | 公司 KMS/HSM/keyless signer、signature bundle、transparency reference |
| revocation | `NOT_RUN_NO_TRUST_SERVICE` | `NOT_RUN_NO_REVOCATION_SERVICE` | 公司 key registry、certificate status 或签名服务查询回执 |

## 真实工具盘点

本机可用于当前 binding 验签的是 `openssl 4.0.3`。以下公司/生态发布工具本轮实际探测为 `NOT_FOUND`：`cosign`、`gpg`、`gpg2`、`notation`、`in-toto-verifier`、`slsa-verifier`。`COMPANY_PUBLISHER_ID`、`COMPANY_SIGNER`、`COMPANY_REVOCATION_SERVICE`、`COMPANY_KMS_ENDPOINT` 和 `OIDC_ISSUER` 环境变量也均未提供。没有 trust service 时不能推断 key 或 signature 的非撤销状态，因此 revocation 保持 `NOT_RUN`。

## 后续执行输入

公司发布环境接手时，使用同一 alpha4 artifact/CRM tarball 的 SHA，填充 [publisher signing runbook](m2-07-publisher-signing-runbook-20261016.md) 和 [publisher evidence template](m2-07-publisher-evidence-template-20261016.json) 中的 issuer、subject、key ID、signature bundle、独立 verifier、revocation 和 final attestation 字段。不能复用本地 owner key 作为公司身份，也不能把本地 `PASS` 改写为 formal `PASS`。

机器可读回执：[m2-07-owner-local-publisher-signature-revocation-20261016.json](m2-07-owner-local-publisher-signature-revocation-20261016.json)
