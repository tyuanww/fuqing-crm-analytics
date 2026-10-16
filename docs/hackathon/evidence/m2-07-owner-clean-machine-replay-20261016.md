# M2-07 owner-operated clean-machine 技术回放（2026-10-16）

这是单人 owner-operated 模式下的 clean-machine 技术回放。它使用固定 Node24、全新 HOME/cache、全新 staging 和独立 alpha4/rc2 目录，证明安装、导入、最小 CLI、卸载和 rc2 回退可重现；它不是公司 clean-machine receipt，也不包含公司 publisher identity、signature 或 revocation。

## 执行输入和环境

- runner：`owner-operated-local-node24`
- operator/approver：`project-owner` / `project-owner`
- Node：`v24.19.0`
- npm：`11.17.0`
- pnpm：`11.28.2`
- TLS：`strict-ssl=true`，`NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem`
- alpha4 SDK artifact SHA：`9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6`
- 修复后 CRM tarball SHA：`a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d`
- rc2 rollback tarball SHA：`5f2da7272d9485abc223e681075809a8d929697c5232ee445718e1b7e066bff8`

## 真实本地结果

| 步骤 | 结果 |
|---|---|
| alpha4 + CRM production-only install | `exit 0` |
| alpha4 `dsh --version` | `0.2.1-alpha.4`, `exit 0` |
| alpha4 `dsh --help` | `exit 0` |
| `dsh plugin --help` | `exit 0` |
| SDK/CRM/CRM host/KaTeX JS/CSS import | 全部 `PASS` |
| alpha4 uninstall | `exit 0` |
| alpha4 package absence after uninstall | `exit 0`，两个包均 `ABSENT` |
| rc2 install | `exit 0` |
| rc2 `dsh --version` | `0.1.7-rc.2`, `exit 0` |
| rc2 `dsh --help` | `exit 0` |

原始命令和逐步日志保存在：

`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/owner-clean-machine-node24-r1/`

本地回执：

`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/owner-clean-machine-node24-r1/owner-clean-machine-receipt.json`

回执状态为 `OWNER_OPERATED_REPLAY_PASS`，`formal_company_clean_machine=NOT_RUN`，`release_ready=false`。

## publisher 和 attestation 状态

已生成 [owner attestation](m2-07-owner-attestation-20261016.json) 和 [owner final attestation draft](m2-07-owner-final-attestation-draft-20261016.json)。一次性 Ed25519 owner key 只用于本地 binding 完整性：

```text
owner_binding_sha256=dfd7e89d1ffa4779caff5169bb9c08ee9e5dd0b7d4caccbdffe43784b08cbdd7
owner_public_key_sha256=234d4a8d016c65adca1fd9bdd470b92d2f82fa8a8e022bc2cd1572b813e2b908
owner_signature_sha256=26f4a6ac9c116b729f27260ab40c6b5eb13b657c291df907ebf6bc75be7d1d0d
owner_signature_verification=PASS
```

这不是公司批准的 publisher identity 或 signature。当前正式发布门禁仍为：

```text
publisher_identity=NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE
signature=NOT_RUN_COMPANY_SIGNER_UNAVAILABLE
independent_verification=NOT_RUN_SECOND_PERSON_UNAVAILABLE
revocation=NOT_RUN_NO_TRUST_SERVICE
final_attestation=FORMAL_EXCEPTION_REQUIRED
```

在 owner exception 被公司政策明确接受前，不能把这些本地结果升级为 formal company evidence，也不能把 `release_ready` 改为 `true`。
