# M2-07 SDK 本地 SBOM 投影（2026-10-14）

本轮使用已经验证的 alpha2 closure manifest graph，生成带 CycloneDX `dependencies` 的本地 SBOM 投影。输入只来自本地 closure、现有 364 个可识别 package manifest 和实际 symlink 关系；没有联网下载、发布、签名或修改主仓。

## 结果

- SBOM schema：`shinemage-sdk-sbom/v3`
- scope：`development-sdk-only-local-projection`
- closure：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- components：`364`
- dependency entries：`364`
- component reference 缺失：`0`
- 运行依赖图：`PASS`，1,101 条边、0 条未解析运行依赖
- SBOM 报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-sbom-v3-20261014.json`
- SBOM 报告 SHA-256：`2899d227693fa6511bf078b71da1d5cab7282eaa7767ec11929f83bc63614b5f`

SBOM 保留了 `types-only`、可选依赖和 benchmark fixture omission，CycloneDX composition 仍为 `incomplete`，没有把 omission 当成已安装组件。

## 门禁边界

这关闭了 M2-07 的本地 SBOM 投影子项，不是正式分发 SBOM。当前报告仍明确标记：publisher identity、最终签名/验签、revocation、registry 回读、opaque/native 语义审计、干净机器安装与回退均未完成，`release_ready=false` 保持不变。正式发布必须从最终 immutable artifact 重新生成并签署 SBOM。
