# M2-07 owner-operated 正式门禁缺口盘点（2026-10-17）

本次只做本地 owner-operated gap audit：重新读取固定 subject、owner binding、公钥和 detached signature，使用真实 `openssl pkeyutl` 验签，并探测本机发布工具与公司 identity/signer/revocation 输入。结果只说明本地材料当前可复核到什么程度，不把本地结果提升为公司正式发布证据。

## 当前正式状态

- `M2-07=BLOCKED`
- `M2-08=NOT_RUN`
- `M2-09=NOT_RUN`
- `release_ready=false`

## 本地真实输出

- 固定 Node：`/Users/hutou/homebrew/Cellar/node@24/24.19.0/bin/node`，`v24.19.0`。
- pnpm：`11.28.2`。
- OpenSSL：`4.0.3`。
- owner public key 存在，SHA-256：`234d4a8d016c65adca1fd9bdd470b92d2f82fa8a8e022bc2cd1572b813e2b908`。
- owner binding 存在，SHA-256：`dfd7e89d1ffa4779caff5169bb9c08ee9e5dd0b7d4caccbdffe43784b08cbdd7`。
- detached signature 存在，SHA-256：`26f4a6ac9c116b729f27260ab40c6b5eb13b657c291df907ebf6bc75be7d1d0d`。
- `openssl pkeyutl -verify ... -rawin` 真实退出码 `0`，输出 `Signature Verified Successfully`。
- 本机未找到 `cosign`、`gpg/gpg2`、`notation`、`in-toto-verifier`、`slsa-verifier`、`syft`、CycloneDX CLI、`gitsign`、`crane`。
- `COMPANY_PUBLISHER_ID`、`COMPANY_SIGNER`、`COMPANY_REVOCATION_SERVICE`、`COMPANY_KMS_ENDPOINT`、`OIDC_ISSUER` 均未提供。

机器可读回执见 [m2-07-owner-formal-gate-gap-audit-20261017.json](m2-07-owner-formal-gate-gap-audit-20261017.json)。

## 缺口与边界

| 门禁 | 本地结果 | 正式状态 | 唯一剩余输入 |
|---|---|---|---|
| publisher identity | `OWNER_IDENTITY_DECLARED_LOCAL` | `NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE` | 公司批准 issuer、subject、key ID、公钥/证书或 KMS/OIDC identity |
| signature | `OWNER_SELF_SIGNED_LOCAL / VERIFICATION_PASS` | `NOT_RUN_COMPANY_SIGNER_UNAVAILABLE` | 公司 KMS/HSM/keyless signer、signature bundle、transparency reference |
| revocation | `NOT_RUN_NO_TRUST_SERVICE` | `NOT_RUN_NO_REVOCATION_SERVICE` | 公司 key registry、certificate status 或签名服务查询回执 |
| independent verification | `SELF_SEPARATED_REPLAY_PASS` | `NOT_RUN_SECOND_PERSON_UNAVAILABLE` | 独立公司身份或独立 CI job |
| final attestation | `OWNER_ATTESTATION_DRAFT_NOT_FORMAL` | `FORMAL_EXCEPTION_REQUIRED` | 公司格式、公司签名、publisher evidence、revocation、独立验证的绑定 |
| clean-machine | `OWNER_OPERATED_REPLAY_PASS` | `NOT_RUN_COMPANY_CLEAN_MACHINE` | 公司 clean-machine runner、正式验签/撤销和回执 |

可本地完成的部分已经完成：文件摘要复核、owner detached signature 验签、工具/环境探针和已有本地回执索引。剩余六项需要公司信任服务、独立身份或正式 clean-machine，当前机器没有对应输入；继续重复本地回放不会关闭这些门禁。

本回执不生成公司 signature、revocation、独立 verifier 或 formal final attestation，也不修改 M2 状态。
