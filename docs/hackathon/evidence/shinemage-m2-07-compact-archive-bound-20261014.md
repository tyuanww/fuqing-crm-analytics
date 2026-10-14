# M2-07 compact SDK archive-bound 验收（2026-10-14）

本轮把已经通过 closure 依赖图和本地 SBOM projection 的 alpha2 compact SDK 做成独立 closure archive，在新目录接收后重新执行 content audit 和 OSV。完整 development archive 与 compact candidate 分开记账。

## Pack / receive

- closure：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- entries：`30,611`
- logical bytes：`233,962,650`
- archive bytes：`65,510,149`
- archive SHA-256：`17bdc6cf14731f47a459cbaf455bd8cbe011f516787d9839847372a931b0d54c`
- manifest SHA-256：`cde3156f95fb9e06d4c5100280a203a35a5bb330bc0d4d2b1b64ba8cd8a26001`
- pack receipt：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-archive-20261014-r3/receipt.json`
- receive receipt：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-received-20261014-r1/receipt.json`
- pack/receive：`shinemage-development-sdk-closure-archive/v1 / LOCAL_READY`

## 接收后复核

- content audit：`PARTIAL`
- 文件摘要：`26,222`
- secret findings：`0`
- coverage gaps：`18`（二进制、原生模块和字体）
- audit report：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-content-audit-20261014-r1/report.json`
- archive-bound inventory：`364 packages / 1 unidentified manifest / PARTIAL`
- archive-bound OSV：`NO_KNOWN_ADVISORIES`
- OSV queries：`222 requested / 222 queried / 222 completed / 5 requests`
- OSV report：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-supply-chain-osv-20261014-r2.json`

## 门禁边界

这关闭了 compact candidate 的摘要绑定、接收、secret-pattern audit 和 OSV 子项。报告仍标记 `supply_chain=NOT_VERIFIED`、`release_ready=false`；publisher identity、最终签名/验签、撤销验证、registry provenance、18 个 opaque/native coverage gap、干净机器真实安装、升级和回退仍未关闭。compact archive 是 development SDK candidate，不是正式 Release artifact。
