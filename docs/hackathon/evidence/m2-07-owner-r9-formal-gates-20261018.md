# rc1 r9 owner-operated 正式门禁执行记录（2026-10-18）

本记录按正式 release 顺序执行了当前可执行的六项门禁。执行范围是内部 owner-operated。结果不能替代公司发布身份、公司签名服务、独立公司核验或公司 clean-machine。

## 当前正式状态

- `M2-07=BLOCKED`
- `M2-08=NOT_RUN`
- `M2-09=NOT_RUN`
- `release_ready=false`
- GitHub Release：`NOT_CREATED`

## 统一候选 subject

- SDK：`@deepseek-ai/dsh@0.2.1-rc.1`
- upstream：`1600d8a1e140dcde43a1a0941940a0480712c011`
- formal-r9 staging：`/srv/shinemage/dsh/staging/rc1-formal-r9-20261018`
- subject set SHA-256：`7053c9bea8e90a4e9c2f0de6ab822841c14deb2669ed3691b739d5c53559d8ab`
- runtime archive SHA-256：`ed11ec808d939bbab292738be6227e8882c95889d3af5db1a9febbc318aa05a2`
- runtime provenance SHA-256：`22c710ca15e59d4659338a27b798f298d227b03b02c1c6ba912889df16e6921e`
- subject manifest：[`m2-07-owner-r9-formal-subject-manifest-20261018.json`](m2-07-owner-r9-formal-subject-manifest-20261018.json)

上一份现役 release 目录中的 `runtime.tar.zst` SHA 为 `8a7fb15404bcb8a63824df9a43c1bf75e0bc45e002d3406349607ee202bd28df`，与 r9 provenance 的 `ed11ec...` 不一致。没有用该目录作为正式签名 subject。已在不改变 `current` 的前提下建立 formal-r9 staging，并重新绑定精确 runtime bytes。

## 实际执行结果

1. **publisher identity**

   已生成新的 owner-local ephemeral Ed25519 public key。公钥 SHA-256 为 `476b048df3f683d1205b3bcb6df78eb17154bc49e9b10197c3a93927f51ab492`。公司批准 issuer、subject、key ID、OIDC 或 KMS identity 未配置。

   结果：`OWNER_IDENTITY_DECLARED_LOCAL`；正式结果：`NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE`。

2. **signature**

   已对 r9 subject binding 生成 detached Ed25519 owner-local signature。signature SHA-256 为 `62903b7bf88f32758149822863977bb6fb00a50390d2634af63315e1043fbfcf`。真实 `openssl pkeyutl -verify -rawin` 返回 `Signature Verified Successfully`，退出码 `0`。

   结果：`OWNER_SELF_SIGNED_LOCAL / VERIFICATION_PASS`；正式结果：`NOT_RUN_COMPANY_SIGNER_UNAVAILABLE`。

3. **revocation**

   本机未找到公司 key registry、certificate status、transparency log 或 revocation service。没有生成非撤销声明。

   结果：`NOT_RUN_NO_TRUST_SERVICE`；正式结果：`NOT_RUN_NO_REVOCATION_SERVICE`。

4. **independent verification**

   在新的临时目录和独立进程中读取 manifest，重新计算远端 formal-r9 staging 的 `25` 个 subject。`all_match=true`。同一进程重新执行 owner signature verification，退出码为 `0`。

   结果：`SAME_OWNER_SEPARATED_REPLAY_PASS`；正式结果：`NOT_RUN_SECOND_PERSON_UNAVAILABLE`。同一 owner 的隔离进程不等于第二人或独立公司 CI。

5. **final attestation**

   已生成绑定当前 subject set、publisher-local key、signature、independent replay 和 clean-machine replay 的 owner-local draft。

   结果：`OWNER_LOCAL_FINAL_ATTESTATION_NOT_FORMAL`；正式结果：`FORMAL_EXCEPTION_REQUIRED`。

6. **clean-machine**

   在杭州 WSL `DESKTOP-FAEJK8S` 的 fresh temporary workspace 中重新校验 r9 archive、zstd、解包、runtime version、help、runtime import、KaTeX CSS 和 credentials scan。实际结果如下：

   - Node：`v24.21.0`
   - target 默认 pnpm：`11.19.0`，未使用
   - archive 内 upstream pnpm：`11.28.5`
   - approved plugin wrapper：`11.28.2`
   - runtime：`0.2.1-rc.1`
   - rc2 rollback reference：`0.1.7-rc.2`
   - KaTeX CSS：`PASS`
   - credentials scan：`PASS`
   - temporary workspace cleanup：`PASS`

   结果：`OWNER_OPERATED_FRESH_EXTRACTION_PASS`；正式结果：`NOT_RUN_COMPANY_CLEAN_MACHINE`。

## 回执文件

- [formal subject manifest](m2-07-owner-r9-formal-subject-manifest-20261018.json)
- [owner binding](m2-07-owner-r9-formal-gates-20261018/owner-binding.json)
- [owner public key](m2-07-owner-r9-formal-gates-20261018/owner-public-key.pem)
- [owner signature](m2-07-owner-r9-formal-gates-20261018/owner-binding.sig)
- [separated replay receipt](m2-07-owner-r9-formal-gates-20261018/owner-r9-independent-verification-20261018.json)
- [clean-machine receipt](m2-07-owner-r9-formal-gates-20261018/owner-r9-clean-machine-receipt-20261018.json)
- [final attestation draft](m2-07-owner-r9-formal-gates-20261018/owner-r9-final-attestation-draft-20261018.json)

## 创建 GitHub Release 的条件

当前不创建 GitHub Release。只有以下输入全部变为真实可验证的正式结果后，才重新评估：

1. 公司 publisher identity。
2. 公司 signer、KMS、HSM 或批准的 keyless signature。
3. 公司 revocation 查询回执。
4. 独立公司身份或独立 CI verifier。
5. 公司格式的 final attestation。
6. 公司 clean-machine 回执。

任何 `PENDING`、`UNKNOWN`、`NOT_RUN` 或同一 owner 的 local PASS 都不能把 `release_ready` 改为 `true`。
