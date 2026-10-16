# M2-07 alpha4 publisher identity 和签名执行包（2026-10-16）

## 目的

本执行包用于在公司发布环境生成 publisher identity、signature、independent verification、revocation result 和 final attestation。

本地只准备固定输入和回执模板。公司私钥、KMS 凭据、OIDC token 和 registry token 不得进入仓库。

## 固定输入

```text
SDK=@deepseek-ai/dsh@0.2.1-alpha.4
artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
candidate_source_sha=50d241cbd23aa2a9d188fe84c3864528a2206917
upstream_lock_sha256=ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317
sbom_sha256=2adb75e23a0af0c60ce202f5e4b265549836b4761e758935111d66bbc257bfca
provenance_sha256=5e81763e0fad9ab5952fb6c7b094cf0e01d0a1b0883f469e63b2f672e8d7a0c4
plugin_pack_verification_sha256=a126775bc0985d6926e9e21a70f4e5d743eb335e7fe38ee22ca876a3614c3b25
```

模板文件：

```text
docs/hackathon/evidence/m2-07-publisher-evidence-template-20261016.json
```

## 公司环境执行顺序

1. 在公司发布机或受控 CI runner 创建空工作目录。
2. 接收 alpha4 SDK artifact、SBOM、provenance 和 plugin pack verification。
3. 使用 `shasum -a 256` 校验 artifact、SBOM、provenance 和 verification 文件。
4. 只允许 artifact SHA 为 `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6` 的文件进入签名流程。
5. 使用公司批准的发布身份签名方式。优先使用公司 KMS、HSM 或受控 keyless signer。
6. 生成 publisher identity 证据。至少记录 issuer、subject、key ID 和公钥或证书 SHA-256。
7. 对 artifact 生成 signature。签名对象必须是 artifact 原始字节或公司批准的 DSSE/in-toto subject。
8. 生成 signature bundle、transparency log reference 或公司签名服务回执。
9. 在没有签名权限的独立验证环境执行 verification。验证 artifact SHA、SBOM subject、provenance subject、publisher identity 和 signature。
10. 在公司密钥目录、证书状态服务、签名服务或 transparency log 执行 revocation check。
11. 生成 final attestation。attestation 必须绑定 artifact、SBOM、provenance、plugin verification、publisher identity、signature、verification 和 revocation result。
12. 使用独立验证身份再次验证 final attestation。
13. 保存命令、CI job ID、输出、退出码、时间、验证人和回执文件路径。

## 推荐验证命令形状

下面的命令只表示输入和输出关系。实际命令必须替换为公司批准的签名工具、KMS 或签名服务命令。

```sh
shasum -a 256 deepseek-ai-dsh-0.2.1-alpha.4.tgz
shasum -a 256 sbom-alpha4-r1.json
shasum -a 256 provenance-alpha4-r1.json
shasum -a 256 verification-alpha4-r2.json

# 公司签名服务或 KMS：生成 signature 和 publisher identity
company-signer sign \
  --artifact deepseek-ai-dsh-0.2.1-alpha.4.tgz \
  --sha256 9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6 \
  --output signature.bundle

# 独立验证环境：验证签名和身份
company-verifier verify \
  --artifact deepseek-ai-dsh-0.2.1-alpha.4.tgz \
  --signature signature.bundle \
  --expected-sha256 9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6

# 公司密钥目录或签名服务：检查撤销状态
company-verifier revocation-check \
  --key-id '<company-key-id>' \
  --signature-ref '<signature-reference>'

# 公司 attestation 服务：生成最终 attestation
company-attest finalize \
  --artifact-sha256 9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6 \
  --sbom sbom-alpha4-r1.json \
  --provenance provenance-alpha4-r1.json \
  --plugin-verification verification-alpha4-r2.json \
  --publisher-evidence m2-07-publisher-evidence-template-20261016.json \
  --output final-attestation.json
```

`company-signer`、`company-verifier` 和 `company-attest` 是占位命令。不要直接执行。发布责任方必须替换为公司实际工具或 CI job。

## 必须保存的结果

| 结果 | 必须包含 |
|---|---|
| publisher identity | issuer、subject、key ID、公钥或证书 SHA-256、身份来源 |
| signature | 签名格式、签名文件 SHA-256、签名服务回执或 transparency log reference |
| independent verification | 独立验证人、时间、artifact/SBOM/provenance subject 对比、signature result、日志 |
| revocation | 查询服务、查询时间、key status、certificate status、signature status、回执 |
| final attestation | attestation 文件、SHA-256、签名 key ID、独立验证结果 |

## 通过条件

1. 所有 subject 都指向同一个 artifact SHA。
2. publisher identity 属于公司批准的发布身份。
3. signature 在独立验证环境通过。
4. revocation check 没有撤销或未知状态。
5. final attestation 能被独立验证。
6. 任何 PENDING、UNKNOWN、MISMATCH 或 NOT_RUN 都不能进入 `release_ready=true`。

## 当前限制

本执行包不会在本地生成正式 publisher identity、signature、revocation result 或 final attestation。它们必须来自公司发布环境。production release、production activation 和 canary 在 M2-07 关闭前继续禁止。
