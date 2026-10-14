# M2-07 alpha2 候选 OSV 查询（2026-10-14）

本轮只对已固定的 alpha2 development SDK closure 做公开 OSV 依赖公告查询，不安装、不执行 SDK，不修改主仓 DSH pin，也不授予 release readiness。

## 输入与命令

- closure：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014`
- closure SHA-256：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- upstream：DSH `0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c`
- 运行时：Node `24.19.0`，与 closure 的 `node_major=24` 匹配
- 检查器：候选 alpha2 workspace 中与主仓相同来源的 `scripts/release/sdk-supply-chain.mjs`
- OSV endpoint：`https://api.osv.dev/v1/querybatch`
- 原始回执：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-supply-chain-osv-20261014-r3.json`

```sh
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem \
  /Users/hutou/homebrew/opt/node@24/bin/node \
  .context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/alpha2-sdk-closure-workspace-20261014/scripts/release/sdk-supply-chain.mjs \
  --root .context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014 \
  --closure-sha256 6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b \
  --output .context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-supply-chain-osv-20261014-r3.json \
  --osv
```

## 结果

命令退出码为 `2`，因为检查器对 development SDK 始终保持 `release_ready=false`；这不是 OSV 查询失败。摘要为：

```json
{"status":"PARTIAL","packages":364,"unidentified":1,"advisories":"NO_KNOWN_ADVISORIES","release_ready":false}
```

因此，本轮关闭了该 closure 的 OSV 查询子项，结果为 `NO_KNOWN_ADVISORIES`。`unidentified=1` 仍属于不完整库存；dependency graph、完整 SBOM、registry integrity、publisher identity、opaque content、revocation、最终签名/验签和干净机器安装仍未关闭。M2-07 继续保持 `BLOCKED / OFFLINE_INVENTORY_PARTIAL`，产品仍为 `PARTIAL`。
