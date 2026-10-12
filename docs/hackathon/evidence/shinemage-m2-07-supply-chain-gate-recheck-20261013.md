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
