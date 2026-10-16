# M2-07 发布者身份复核（2026-10-15）

本轮只检查本机是否具备可用于正式 SDK 签名和撤销验证的工具/身份，不读取或输出账号名、私钥、token 或任何凭据，也没有创建签名、tag、release 或 attestation。

## 当前机器事实

```text
local_gpg_secret_key_count=0
cosign_cli=absent
gh_auth=authenticated
```

`gh_auth=authenticated` 只表示 GitHub CLI 会话已认证，不能证明当前账号拥有正式 artifact 发布、签名或撤销权限；它也不能代替 GitHub Actions OIDC attestation 对最终 immutable source SHA 的绑定。当前候选仍没有正式发布者身份的可验证信任链，也没有最终签名和撤销回执。

## 门禁结论

```text
publisher_identity=BLOCKED_PUBLISHER_IDENTITY
signature=NOT_RUN
revocation=NOT_RUN
release_ready=false
```

不能因为本机存在 GitHub CLI 会话就假造正式签名。后续只有在发布责任方提供正式身份、授权签名方式、独立验签环境和撤销验证材料后，才能把这些门禁从 `BLOCKED/NOT_RUN` 推进；本轮不修改代码、不改变 DSH pin、不部署或切换 live。
