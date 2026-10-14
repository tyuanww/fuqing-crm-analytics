# M2-07 本地供应链门禁回归（2026-10-15）

本轮只运行固定 Node 工具链下的本地供应链与 attestation 合同测试，没有生成 artifact、访问 registry、触发 workflow、创建 tag、签名、发布或修改凭据。

## 实际命令与结果

```text
node --test scripts/release/sdk-supply-chain.test.mjs \
  scripts/release/sdk-closure.test.mjs \
  scripts/release/attestation-binding.test.mjs

42 tests / 42 pass / 0 fail / 0 skipped
```

覆盖范围包括：digest-pinned closure 只读校验、依赖图与 source reader fail-closed、链接越界/循环/漂移拒绝、manifest 与资源预算边界、OSV 分页/预算/TLS/响应异常处理、错误输出脱敏、artifact 变更失效，以及 attestation 的 exact source SHA、证书来源摘要和不相关验证结果拒绝。

## 门禁结论

这次回归证明本地检查器行为稳定，没有新增发布材料。最终 SDK artifact、完整正式 SBOM、publisher identity、最终签名/验签、撤销验证、干净机器安装/回退和与最终 SHA 绑定的 attestation 仍未提供，`release_ready=false`、M2-07 继续 `BLOCKED`。没有把本地合同测试结果写成正式分发通过。
