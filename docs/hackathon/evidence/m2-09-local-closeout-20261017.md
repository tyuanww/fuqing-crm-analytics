# M2-09 alpha2 本地输入与目标回执收口（2026-10-17）

本回执只复核已生成的 alpha2 target browser/recovery 输入和本地回执完整性，没有启动或重启候选，没有切换主仓 pin，也没有把 synthetic headed browser 结果升级为正式公司证据。

## 实际复核命令

### 1. 目标包 manifest SHA

命令：

```sh
sha256sum -c .context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/m2-09-alpha2-target-20261016T070323Z-38823/manifest.sha256
```

退出码：`0`。四项均为 `OK`：`alpha2-toolchain.json`、`dsh-runner-scripts.tar.zst`、`prepared-inputs.tar.zst`、`upstream-no-node-modules.tar.zst`。

### 2. history/board/page fixture SHA

使用 Python `hashlib.sha256` 读取实际 fixture 文件，与 `m2-09-alpha2-target-browser-recovery-rerun-20261016.json` 的声明逐项比较，退出码：`0`。

```text
alpha2-target-history-fixture.mjs match=True
alpha2-board-fixture.mjs match=True
alpha2-page-files-fixture.mjs match=True
TARGET_FIXTURE_HASHES=PASS
FORMAL_COMPANY_EVIDENCE=False
MAIN_PIN=0.1.7-rc.2 477b4f420553e8a52c2fbccc464d7561b239c443
```

实际 SHA：

| 输入 | SHA-256 |
| --- | --- |
| history fixture | `db42fa4307506b649aaaca5b8b722c65e35ffe73c4a8bd9426188078a3dce065` |
| board fixture | `0465f3e82b696815c6bfb246c96615259307a03b3152c06d1d235eb5de6f7d73` |
| page-files fixture | `c8471cef9dd1e9ea2022ab4936c1b5d5ca1fa20f46b664e51749a3d61605241e` |

## 当前结论

本地输入身份和已有 synthetic headed browser/history/board 重启回读证据一致；回执明确 `formal_company_evidence=false`。因此本地可做的输入完整性收口已完成，剩余仍是正式目标环境的独立审计 runner、正式 target browser/recovery 回执，以及主仓 alpha2 适配/切换决策。

```text
TARGET_BROWSER_SYNTHETIC_PASS
TARGET_RECOVERY_SYNTHETIC_PASS
FORMAL_TARGET_BROWSER_NOT_RUN
FORMAL_TARGET_RECOVERY_NOT_RUN
MAIN_PIN_UNCHANGED
release_ready=false
```
