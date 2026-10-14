# M2-09 alpha2 开发 SDK 准备回执（2026-10-14）

本轮在 tracked alpha2 candidate 的隔离目录中准备开发 SDK 输入，目的是为后续候选 pack/lock 适配提供真实、可复核的 upstream 与 build-tools 闭包。该步骤不修改主仓 `toolchain.json`，不改九包正式 peer，不启动或切换 live/current。

## 输入与命令

- candidate workspace：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-workspace-20261014`
- candidate source commit：`1bb2646523a7c1cd5aa04d11080617a373af7147`
- upstream：`dsh-v0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c`
- preparation entry：candidate `plugin-kit/prepare.mjs`
- machine：Darwin arm64、Node `v24.19.0`、plugin pnpm `11.28.2`、upstream pnpm `11.28.5`
- output：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-prepared-20261014-r2`

第一次使用新的隔离 destination 时，source fetch、精确 SHA/lock 校验和 upstream manager 均通过，但 `manager-tools-version` 因隔离 Corepack HOME 无法从 registry 获取 pnpm `11.28.2`，以 `KIT_PREPARE_STAGE_FAILED` 停止。失败回执保留在同目录 `candidate-sdk-prepared-20261014/preparation.json`，没有重用或覆盖。

随后在第二个全新 destination 中预置本机已有、同版本的公开 Corepack pnpm 缓存，再按同一入口重跑。没有修改准备器或候选源码，也没有关闭 TLS 校验。成功回执为：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-prepared-20261014-r2/preparation.json
sha256=1ed23867b7d4c3e1c5c906f6394db8660ed34b40b0e34fdeff3b9acdbeb63faf
```

## 实际结果

`preparation.json` 的所有阶段均为 `PASS`，包括固定源码抓取、checkout、两个 manager 版本、SDK install、host/client library build、build-tools install 和 source clean。准备器报告 `bindings=32`、`sdk_packages=26`、`status=READY`；随后使用候选 `plugin-kit/check.mjs` 对绝对 upstream/build-tools 路径复核，返回 `shinemage-kit-inputs/v1 / READY`。

这是一份本机 Darwin arm64 的开发 SDK 输入。回执仍明确记录 `scope=development-sdk-only`、`supply_chain=NOT_VERIFIED`、`production_runtime=NOT_BUILT`、`release_ready=false`；它不等价于完整 SBOM、发布者身份、签名/撤销验证、干净机器安装、Linux/WSL2 目标验收或正式 SDK 分发通过。候选正式 pack/profile、九包组合、browser/recovery 和主仓 rc2 pin 仍按各自证据记账。

## 后续边界

现在可以在隔离 candidate 中以该 SDK 输入继续生成与锁定 alpha2 pack/manifest；仍需把插件消费锁、profile、组合 lifecycle/browser/recovery 和回退条件作为一个完整候选闭包复核。主仓适配必须等这组闭包完成后单独评审，当前 `MAIN_PIN_ADAPTATION_DEFERRED / MAIN_PIN_UNCHANGED` 保持不变。
