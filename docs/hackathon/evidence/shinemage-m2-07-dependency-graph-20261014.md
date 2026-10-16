# M2-07 alpha2 SDK 离线依赖图补验（2026-10-14）

本轮针对 alpha2 development SDK closure 的 `dependency_graph=NOT_RESOLVED` 缺口做离线补验。输入只来自已接收 closure 内的两个固定 `pnpm-lock.yaml`，没有联网解析、重新安装依赖或读取凭据。

## 结果

- closure：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- lockfile：`upstream/pnpm-lock.yaml`、`build-tools/pnpm-lock.yaml`
- lockfile SHA-256：`b45f8695fb0dca90d3ed07afc766e923356539962706ee36ac8cdb396e6d734d`、`547815f9ce1bd005b9405e6d4f921572a1c7e2056854c092855f5ca4050676e2`
- 节点：`2,400`
- 外部依赖边：`3,899`
- workspace/local 边：`4,158`
- 未解析依赖：`0`
- lockfile package records：`1,832`
- 带 registry integrity 的 package records：`1,832`
- 平台可选未物化项：`6`
- 图报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-dependency-graph-20261014.json`
- 图报告 SHA-256：`2dcff25fab197be82129483edca8081fe7fdc19b0efd7109fc4c2857c4f66a05`

6 个 omitted 项是 `@openai/codex` 的 Darwin/x64、Linux/arm64、Linux/x64 和 Windows 平台可选包。当前 closure 是 Darwin arm64 开发 SDK，它们没有进入该平台安装树；报告保留了明确的 omission 记录，没有把它们记为已安装或已验证。

## 门禁边界

本轮把 alpha2 closure 的 lockfile dependency graph 子项提升为 `PASS`，但不改变 M2-07 整体状态。registry integrity 仍只是 lockfile 中的声明摘要，不是 registry 回读证明；嵌入式/原生内容、发布者身份、最终签名/验签、撤销验证、干净机器安装和最终 release artifact 仍未验证，`release_ready=false` 保持不变。
