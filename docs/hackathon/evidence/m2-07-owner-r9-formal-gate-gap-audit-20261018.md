# rc1 r9 正式门禁缺口盘点（2026-10-18）

本次按正式 release 顺序重新盘点当前 r9 subject。已执行能在 owner-operated 环境完成的本地核验，并重新探测公司身份、签名、撤销和独立 CI 输入。正式状态没有升级。

> 事实纠偏（2026-10-18）：PR #139 合并后，`dsh-rc1-release-preflight.yml` 已存在于默认 `origin/main`。旧的 404 记录已失效。`gh run list --workflow dsh-rc1-release-preflight.yml --limit 10` 当前没有返回 run，因此不能把 workflow 存在写成正式执行通过。

## 当前状态

- `M2-07=BLOCKED`
- `M2-08=NOT_RUN`
- `M2-09=NOT_RUN`
- `release_ready=false`
- GitHub Release：`NOT_CREATED`

当前 subject set：`7053c9bea8e90a4e9c2f0de6ab822841c14deb2669ed3691b739d5c53559d8ab`。

## 六项门禁

| 门禁 | 本地结果 | 正式结果 | 仍缺什么 |
|---|---|---|---|
| publisher identity | `OWNER_IDENTITY_DECLARED_LOCAL` | `NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE` | 公司批准 issuer、subject、key ID、证书、公钥、OIDC 或 KMS identity |
| signature | `OWNER_SELF_SIGNED_LOCAL / VERIFICATION_PASS` | `NOT_RUN_COMPANY_SIGNER_UNAVAILABLE` | 公司 KMS/HSM/keyless signer、signature bundle、transparency reference |
| revocation | `NOT_RUN_NO_TRUST_SERVICE` | `NOT_RUN_NO_REVOCATION_SERVICE` | 公司 key registry、certificate status 或签名服务回执 |
| independent verification | `SAME_OWNER_SEPARATED_REPLAY_PASS` | `NOT_RUN_SECOND_PERSON_UNAVAILABLE` | 第二人身份或独立公司 CI job |
| final attestation | `OWNER_LOCAL_FINAL_ATTESTATION_NOT_FORMAL` | `FORMAL_EXCEPTION_REQUIRED` | 公司格式、公司签名、publisher evidence、revocation 和 independent verification 绑定 |
| clean-machine | `OWNER_OPERATED_FRESH_EXTRACTION_PASS` | `NOT_RUN_COMPANY_CLEAN_MACHINE` | 公司 clean-machine runner 和正式回执 |

## 真实阻塞

1. 本机没有 `cosign`、`gpg`、`notation`、`in-toto-verifier`、`slsa-verifier`、`syft`、CycloneDX CLI、`gitsign` 或 `crane`。
2. 环境没有 `COMPANY_*`、`OIDC_*`、`KMS_*`、`SIGN_*`、`REVOCATION_*` 或 `ATTEST_*` 输入。
3. 默认分支已经包含 `dsh-rc1-release-preflight.yml`，origin/main blob 为 `75ac9dbd3c3ce2f45169a18b01674f475a668735`；当前 `gh run list --workflow dsh-rc1-release-preflight.yml --limit 10` 没有返回 run，正式独立 CI 回执仍缺失。
4. 远端当前可见的 release workflow 仍是旧 rc2 线：`DSH rc2 release evidence`、`DSH rc2 release preflight` 和 `Publish DSH rc2 release assets`。
5. `gh` 登录只证明 GitHub 访问，不证明公司 publisher identity，也不提供 revocation 或第二人核验。

## 已处理的本地项

- 建立 formal-r9 staging，修正旧 release 目录 `runtime.tar.zst` 与 r9 provenance 不一致的问题。
- 重新生成 owner-local publisher key、subject binding 和 detached signature。
- 在分离临时进程中重新读取 `25` 个 subject，远端全部 `all_match=true`。
- 在杭州 WSL fresh temporary workspace 完成 r9 解包、版本、help、import、KaTeX CSS、credentials scan 和 rc2 rollback reference 检查。
- 生成 owner-local final attestation draft。

这些结果只证明字节绑定、技术回放和内部 owner-operated 可用性。它们不替代公司正式门禁。

## 下一步触发条件

只有拿到以下真实输入，才继续 formal release：

1. 公司 publisher identity。
2. 公司 signer、KMS、HSM 或批准的 keyless signature。
3. 公司 revocation 查询回执。
4. 独立公司 CI 或第二人 verifier 回执。
5. 公司 final attestation。
6. 公司 clean-machine 回执。

在这些输入齐全前，不创建 GitHub Release，不切换正式发布，不修改 `release_ready`。
