# M2-07 当前候选 attestation dry-run 边界（2026-10-14）

本轮只读核对 `.github/workflows/dsh-release-evidence.yml` 和 `dsh-release-publish.yml` 的 workflow dispatch 合同，没有触发 workflow、push、tag、Release 或发布。

## 当前 workflow 合同

证据 workflow 要求：

- `release_tag`
- `reviewed_sha`
- `approval_ref=run:<id>`
- `preflight_run_id`
- immutable tag 指向 reviewed SHA
- `GITHUB_SHA` 与 reviewed SHA 一致
- exact-SHA preflight 成功
- source artifact 和 pinned DSH runtime artifact 由 GitHub Actions attestation 生成

发布 workflow 还要求：

- evidence run 成功且与当前 tag/SHA 一致
- evidence artifact manifest 和 attested digest 一致
- 受保护 tag ruleset
- release id 和 evidence run id
- attestation verify 成功

## 当前候选边界

当前 compact candidate 是 DSH alpha2 `d7432673…` development SDK，`release_ready=false`；现有 release workflow 固定校验 DSH rc2 upstream `477b4f42…`，历史成功 attestation 绑定旧 SHA `fcbd1324…`。因此不能拿当前 alpha2 candidate 直接 dispatch 现有 rc2 release workflow，也不能把历史 attestation 借给当前候选。

要正式进入 attestation，必须先有最终 reviewed commit、与该 commit 匹配的 immutable tag、同版本 preflight artifact、发布授权和可验证的 evidence run。当前只完成 dry-run 合同核对，正式 publisher identity、attestation、signature、revocation 和 release publication 仍未执行。
