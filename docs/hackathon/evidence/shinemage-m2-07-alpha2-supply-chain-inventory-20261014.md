# M2-07 alpha2 候选离线供应链清单（2026-10-14）

本轮只对已经生成的 alpha2 缩减 SDK 闭包做离线清单和 SBOM 投影，帮助定位供应链门禁还缺什么。没有执行 OSV 网络查询、签名/验签、发布者身份核验、撤销验证、干净机器安装或发布动作。

## 输入与入口

- 闭包：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014`
- closure SHA-256：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- alpha2 upstream：`d743267388641bc76f17c45ce8b4c231aed1d32c`
- 离线入口：候选 pin 绑定的 `scripts/release/sdk-supply-chain.mjs` 隔离副本
- 原始报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-supply-chain-20261014.json`

## 实际结果

报告 schema 为 `shinemage-sdk-supply-chain/v1`，状态为 `PARTIAL`，`release_ready=false`：

| 项 | 结果 |
|---|---:|
| package manifest inventory | 364 |
| module-scope manifest | 33 |
| unidentified manifest | 1（`build-tools/package.json` 无 name/version） |
| unique advisory query candidates | 222 |
| CycloneDX component count | 364 |
| OSV | `NOT_RUN`（只有显式 `--osv` 才联网） |
| advisory findings | 未执行 OSV，不能作无漏洞结论 |

报告覆盖字段仍为：`dependency_graph=NOT_RESOLVED`、`embedded_components=NOT_VERIFIED`、`registry_integrity=NOT_VERIFIED`、`publisher_identity=NOT_VERIFIED`、`opaque_content=NOT_REVIEWED`、`revocation=NOT_VERIFIED`。这些字段是门禁缺口，不是通过结论。

## 门禁结论

这一步把 alpha2 候选的离线 inventory 和 SBOM 投影落了下来，但不能关闭 M2-07。完整 SDK 分发仍需要最终 artifact、完整 SBOM、发布者身份、签名与验签、撤销验证、干净机器安装和回退材料；当前 M2-07 保持 `BLOCKED / OFFLINE_INVENTORY_PARTIAL`，M2-08 继续 `NOT_RUN`。本轮没有修改主仓、live/current 或任何凭据。
