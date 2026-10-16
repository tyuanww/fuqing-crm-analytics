# M2-07 SDK 供应链门禁当前复核（2026-10-13）

本轮只复核当前 checkout 中的供应链检查器是否仍保持 fail-closed，不执行 SDK prepare、OSV 请求、网络访问、安装、native/PE 执行、签名、撤销验证、发布或干净机器验收。

## 实际检查

```sh
sha256sum scripts/release/sdk-supply-chain.mjs
git diff --quiet -- scripts/release/sdk-supply-chain.mjs
node scripts/release/sdk-supply-chain.mjs --help
```

实际结果：

```text
690034dea4f9a823ede52dc298b50bb44b0a29feb68a6aaf24f17eb81d947fba  scripts/release/sdk-supply-chain.mjs
git-diff=scripts/release/sdk-supply-chain.mjs CLEAN
help-exit=0
```

CLI 帮助明确：默认离线；只有显式 `--osv` 才发送依赖名称/版本；不安装或执行包；`PARTIAL/BLOCKED` 退出码为 2；永远不授予 release readiness。

源码当前仍将以下覆盖项置于未验证状态，并固定 `release_ready=false`：

```text
dependency_graph: NOT_RESOLVED
embedded_components: NOT_VERIFIED
registry_integrity: NOT_VERIFIED
publisher_identity: NOT_VERIFIED
opaque_content: NOT_REVIEWED
revocation: NOT_VERIFIED
release_ready: false
```

## 结论

这次复核证明检查器边界没有漂移，但不产生新的 SDK 分发通过证据。M2-07 继续保持 `BLOCKED`；完整 SBOM、发布者身份、最终签名、验签、撤销/允许名单、opaque/native 安全、干净机器安装和回退仍需要外部材料与授权动作。没有把静态 CLI 帮助、历史 SDK 消费结果或本地开发包当作正式分发证据。

## 2026-10-13 定向回归

执行：

```sh
node --test --test-concurrency=1 scripts/release/sdk-supply-chain.test.mjs scripts/release/sdk-content-audit.test.mjs
```

结果：`31 PASS / 0 FAIL / 0 SKIP`。这些测试只证明供应链检查器和内容审计的 fail-closed 行为保持稳定，不替代真实 SBOM、发布者身份、签名、撤销验证、干净机器安装或发布授权，因此 M2-07 状态不变。

## 2026-10-13 供应链材料盘查

对当前仓库与授权目标做了受限文件名盘查，未发现可绑定本候选的最终 SDK SBOM、发布者签名、sigstore/attestation、撤销名单或允许名单。仓库命中的是历史 attestation 绑定说明与审计测试；目标机命中的是 Python 依赖包自带的 CycloneDX 文件，不是本九包 DSH SDK 的最终分发 SBOM，也没有对应发布者签名或撤销证明。

该盘查没有下载、生成或伪造供应链材料，M2-07 继续保持 `BLOCKED`。
