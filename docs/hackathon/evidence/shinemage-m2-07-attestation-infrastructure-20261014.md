# M2-07 attestation 基础设施复核（2026-10-14）

本轮只读复核仓库的 GitHub Actions attestation 配置、当前 CLI 登录状态和历史 workflow 结果，没有触发 workflow、创建 tag、上传 artifact 或发布 Release。

## 结果

- `.github/workflows/dsh-release-evidence.yml` 声明 `id-token: write` 和 `attestations: write`
- workflow 包含 source artifact 和 pinned runtime artifact 的 attestation 步骤
- 历史成功 run：`36803275102`
- 历史 run head SHA：`fcbd1324ac5a4b7367d9d7d2bb9bbebdbf32ba25`
- 历史 run 时间：`2026-10-01`
- 历史 run 结果：`success`
- 历史步骤包含：exact-SHA preflight、candidate source attestation、pinned runtime attestation、evidence upload
- 当前 GitHub CLI 已登录组织账号，但本地没有 GPG secret key；没有把本地账号或历史 workflow 当作当前 candidate 的 publisher attestation

## 门禁结论

attestation 基础设施可用，但历史 attestation 绑定的是旧 SHA，不是当前 alpha2 compact closure 或当前主仓候选。当前 candidate 仍缺 exact reviewed source/ref、最终 artifact、workflow attestation receipt 和发布授权；因此 publisher identity、signature/provenance 和 release readiness 仍未关闭，`release_ready=false` 保持不变。
