# 发给发布责任方

## 主题

请完成 M2-07 alpha4 正式发布材料并返回完整证据

## 消息正文

你好。请按下面的固定输入完成 M2-07 alpha4 的正式发布准备。

固定输入：

```text
SDK=@deepseek-ai/dsh@0.2.1-alpha.4
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
candidate_source_sha=50d241cbd23aa2a9d188fe84c3864528a2206917
upstream_lock_sha256=ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317
Node=v24.19.0
upstream_pnpm=11.28.5
plugin_pnpm=11.28.2
candidate_sdk_artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
```

请完成以下动作：

1. 从固定 source、lock 和 toolchain 生成或确认正式 SDK artifact。
2. 计算正式 artifact SHA-256，并确认它与接收文件一致。
3. 生成完整 SBOM。
4. 生成 provenance。
5. 提供 publisher identity。
6. 对 artifact 和材料生成 signature。
7. 在独立环境执行 verification。
8. 执行 revocation check。
9. 生成 final attestation。

请返回以下文件或等价的可验证记录：

- SDK artifact。
- artifact SHA-256。
- 完整 SBOM。
- provenance。
- publisher identity。
- signature。
- independent verification result。
- revocation result。
- final attestation。

每份材料都必须绑定同一个 artifact SHA-256。请同时确认以下两个问题：

1. 官方 `ui-primitives` 的 KaTeX 是否已经进入正式 runtime closure。
2. 如果没有进入，正式发布是否接受这个 closure 缺口，以及谁批准。

当前候选本地证据已经完成：9 个插件构建、9 个 pack reader、analytics 测试、CRM 全量测试 `108 pass / 0 fail`、本地安装和 rc2 回退模拟。

当前仍未关闭：正式 SBOM closure、publisher identity、signature、independent verification、revocation 和 final attestation。

请在材料中明确 `release_ready`。在所有材料一致前，请保持 `release_ready=false`。

参考：

```text
docs/hackathon/evidence/shinemage-m2-07-alpha4-external-handoff-checklist-20261016.md
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/local-final-preflight-r1.json
```
