# M2-07 owner-operated publisher 与 clean-machine 剩余门禁矩阵（2026-10-16）

本矩阵将 owner-operated 模式下已经完成的本地技术证据与仍缺的正式公司门禁分开。`OWNER_SELF_SIGNED_LOCAL`、`SELF_SEPARATED_REPLAY_PASS` 和 `OWNER_OPERATED_REPLAY_PASS` 都不等于公司 publisher signature、第二人独立核验或 formal clean-machine。当前 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`release_ready=false`。

## 两层 subject

| subject | 绑定 |
|---|---|
| SDK publisher subject | `@deepseek-ai/dsh@0.2.1-alpha.4` / artifact `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6` / source `50d241cbd23aa2a9d188fe84c3864528a2206917` |
| CRM consumer subject | `@shine-mage/dsh-crm-knowledge@0.0.0-crm.1` / tarball `a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d` / manifest `106c38eaf30cde9b6a3e3fc5fea98d8e42aa777f51f99faff37c00c13f55e42d` / source `3b5d4c0680585f8f27c84d70dffabf7c2ec930d2` |

不要把 CRM r3 tarball hash 替换 SDK publisher subject；最终 attestation 必须同时表达 SDK artifact 与 CRM consumer 的关系。

## 逐项状态

| 门禁 | 本地 owner 结果 | 正式公司状态 | 剩余缺口 |
|---|---|---|---|
| `publisher_identity` | `OWNER_IDENTITY_DECLARED_LOCAL` | `NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE` | 公司批准 issuer/subject/key-id/certificate 或 KMS/OIDC identity |
| `signature` | `OWNER_SELF_SIGNED_LOCAL / VERIFICATION_PASS` | `NOT_RUN_COMPANY_SIGNER_UNAVAILABLE` | 公司批准 KMS/HSM/keyless signer、signature bundle 和 transparency reference |
| `revocation` | `NOT_RUN_NO_TRUST_SERVICE` | `NOT_RUN_NO_REVOCATION_SERVICE` | 证书/密钥/签名状态服务和查询回执 |
| `independent_verification` | `SELF_SEPARATED_REPLAY_PASS` | `NOT_RUN_SECOND_PERSON_UNAVAILABLE` | 公司独立身份或独立 CI job，不由同一 owner 写入 PASS |
| `final_attestation` | `OWNER_ATTESTATION_DRAFT_NOT_FORMAL` | `FORMAL_EXCEPTION_REQUIRED` | 公司格式、公司签名、publisher evidence、revocation 和 independent verification 绑定 |
| `clean_machine` | `OWNER_OPERATED_REPLAY_PASS` | `NOT_RUN_COMPANY_CLEAN_MACHINE` | 公司 clean machine 身份、正式 signature/revocation 验证和正式回执 |

## 本地回执和工具

- owner attestation：`docs/hackathon/evidence/m2-07-owner-attestation-20261016.json`。
- owner final attestation draft：`docs/hackathon/evidence/m2-07-owner-final-attestation-draft-20261016.json`。
- clean-machine owner replay：`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/owner-clean-machine-node24-r1/owner-clean-machine-receipt.json`。
- SDK/CRM local closure：`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/company-closure-attempt-node24-r3/consumer-closure-receipt-local-node24-r3.json`。
- same-owner independent replay：`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/company-closure-independent-node24-r1/independent-replay-receipt.json`。
- 本机 `openssl 4.0.3` 可生成和验证 owner-local binding；`cosign`、`gpg`、`notation`、`in-toto`、`slsa-verifier`、`syft`、CycloneDX CLI、公司 signer/verifier/revocation 工具均不可用。`gh` 登录不代表 publisher 身份。

## 下一步

1. 如果公司接受 owner exception，需由 owner 明确记录 `governance_status=OWNER_EXCEPTION_ACCEPTED`，但仍要保留“同一 owner、无第二位 verifier”的事实。
2. 需要公司 publisher identity、签名服务、独立 verifier、revocation service 和 formal clean-machine runner 后，逐项替换正式 `NOT_RUN` 回执。
3. 在这些正式回执全部完成前，禁止把 `release_ready` 改为 `true`，禁止启动 M2-08。
