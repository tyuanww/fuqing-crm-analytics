# M2-07 alpha2 SDK 干净 HOME 输入复核（2026-10-14）

本轮在全新的临时 `HOME`、`XDG_CACHE_HOME`、`XDG_CONFIG_HOME` 和 `XDG_DATA_HOME` 下，对已接收的 alpha2 SDK archive 做只读输入复核。没有安装系统依赖、联网下载、写入主仓或修改 live runtime。

## 结果

- 输入：`candidate-sdk-received-20261014`
- alpha2 checker：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/alpha2-sdk-closure-workspace-20261014/dsh-plugins/plugin-kit/check.mjs`
- 输出：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-clean-check-20261014-r4/check.json`
- 输出 SHA-256：`9a3f0e55a57d5c56a621bb5a88dafcecb2d99ea9aac2477b5fe429eb56111f18`
- 结果：`shinemage-kit-inputs/v1 / READY`
- DSH pin：`0.2.1-alpha.2`
- upstream SHA：`d743267388641bc76f17c45ce8b4c231aed1d32c`
- SDK packages：`26`
- bindings：`32`

主仓 rc2 checker 对同一接收目录返回 `Upstream SHA drift`（期望 `477b4f42…`，实际 `d7432673…`）。该拒绝是版本边界保护，保留为负面证据，没有用 alpha2 输入冒充 rc2。

## 门禁边界

这只证明了全新 HOME 下的 alpha2 build-input identity 和 lock/toolchain 可读性；输出仍标记 `compilation=NOT_RUN`、`supply_chain=NOT_VERIFIED`、`release_ready=false`。它不等价于干净机器安装、签名/验签、撤销验证或正式 SDK 分发通过。
