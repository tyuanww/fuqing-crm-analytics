# M2-09 DSH 升级候选延后复核（2026-10-13）

本轮先核对当前 DSH pin 与运行现场，随后识别官方升级候选并在 ignored 隔离目录准备精确 checkout；不修改主仓 pin、上游源码、锁文件或 live/current。

## 当前基线

本地 `dsh-plugins/plugin-kit/toolchain.json` 实际读取为：

```json
{
  "sdk_version": "0.1.7-rc.2",
  "upstream_sha": "477b4f420553e8a52c2fbccc464d7561b239c443"
}
```

该文件 SHA-256 为：

```text
8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe
```

`git diff -- dsh-plugins/plugin-kit/toolchain.json` 为空。固定 pin 没有被本轮改写。

杭州目标只读现场核对：

```text
current=/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3
candidate-runtime-present
upstream-dirs=upstream-0.1.7-rc.2-477b4f42
```

candidate 与 live 均继续使用 rc2 上游；杭州目标没有新的隔离升级 runtime。官方新候选的本地准备与静态矩阵见下文，不能直接替换当前 pin，因为插件 peer、profile、lock、SDK closure、浏览器、恢复和真实业务兼容矩阵尚未重跑。

## 结论

M2-09 更新为 `CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / MAIN_PIN_UNCHANGED / CROSS_VERSION_NOT_RUN`。候选自身已安装、构建并完成聚焦生命周期/session 矩阵；九包在独立候选 toolchain 中均已构建并通过自测，但主仓 peer 与固定 toolchain 仍锁 rc2，组合运行矩阵和跨版本恢复尚未完成，升级不混入当前九包发布 candidate。

## 2026-10-13 版本目录复核

授权目标的 release 目录只包含历史 `dsh-0.18.0.2-r2.*`、`dsh-0.19.0.0-r3` 和当前 `dsh-0.20.0.0-r3`，没有新的现场升级 runtime。仓库与目标仍使用 `0.1.7-rc.2` / `477b4f42`；旧版本目录不能作为升级候选输入。

## 2026-10-13 官方候选识别与静态矩阵

官方仓库发布页列出预发布 `dsh-v0.2.1-alpha.2`；远端 tag 的 peeled commit 为 `d743267388641bc76f17c45ce8b4c231aed1d32c`。本地以该精确 tag 创建 ignored checkout：

```text
.context/dsh-b0/upstream-0.2.1-alpha.2
tag=dsh-v0.2.1-alpha.2
commit=d743267388641bc76f17c45ce8b4c231aed1d32c
```

没有安装依赖、构建 SDK、启动宿主或修改当前工具链。新增的兼容矩阵入口由本地提交 `39cdb9c3` 提供可选 candidate 参数，要求完整 id/version、绝对 checkout 和 40 位 commit SHA；默认 rc2/旧 advisory 行为保持不变。

使用固定旧 checkout 与新候选 checkout 运行离线静态矩阵，结果文件为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/compatibility-matrix.json`：

| 行 | 结果 | 范围 |
|---|---|---|
| `dsh-0.1.7-rc.2` / `477b4f42…` | `SUPPORTED` | 精确 checkout 的 source family 静态命中 |
| `dsh-0.2.1-alpha.2` / `d7432673…` | `SUPPORTED` | 精确 checkout 的 source family 静态命中 |
| `dsh-0.2.0-rc.2` | `DEFERRED` | 本地未提供 checkout |
| overall | `PARTIAL` | advisory `dsh-0.2.0-rc.2` 行为 `DEFERRED`；runtime、插件、恢复和真实业务结果由下方独立证据记账 |

该 `SUPPORTED` 只表示四组 source family 文件名扫描通过，不表示 SDK/宿主运行兼容，不表示 release readiness，也不授予切换授权。

## 2026-10-13 隔离 runtime 与恢复矩阵

在 `.context/dsh-b0/upstream-0.2.1-alpha.2` 使用 Node `24.19.0`、pnpm `11.28.5` 和固定 lock 执行 `pnpm install --frozen-lockfile --ignore-scripts`；随后补跑候选要求的 `pnpm run build:native-system` 与 `pnpm run build:lib:host`，两项均通过。安装首次使用 corepack 时遇到本机 registry CA 校验错误，改用 `/etc/ssl/cert.pem` 的 `NODE_EXTRA_CA_CERTS` 后精确 pnpm 版本可用；该环境事实已记录在 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/runtime-compatibility-summary.json`。

候选自身聚焦测试共 14 个文件、`468 PASS / 0 FAIL`，覆盖 plugin-manager、profile/loader、Agent loop resource/scope、session repair/records、Cordis lifecycle、continuable subagent 和 spawn lifecycle。候选编译 persistence API 又分别完成 text/tool/rich 三组撕裂尾只读、修复续写、冷读验证；每组主行 `PASS`、4 个冷进程执行，cross-version 行为因没有 rc1 编译模块保持 `NOT_RUN`。结果位于 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-session-recovery-{text,tool,rich}/session-recovery.json`。

## 2026-10-13 插件适配复核

候选 `@deepseek-ai/dsh-tools` 版本为 `0.2.1-alpha.2`，主仓九个现有插件的 `peerDependencies.@deepseek-ai/dsh-tools` 全部仍为 `0.1.7-rc.2`，静态兼容数仍为 `0/9`；完整回执为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/plugin-peer-matrix.json`。直接用候选 checkout 运行 `B0_BUILD_UPSTREAM=... node dsh-plugins/shine-brand/build.mjs` 仍在主仓 `plugin-kit/toolchain.json` 的固定 upstream SHA 校验处拒绝，实际 `d7432673…`、期望 `477b4f42…`；这证明主仓 pin 仍然保护当前 rc2 组合，没有改写主仓。

随后在 ignored 目录 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-plugin-workspace` 建立独立候选 toolchain，仅在副本 manifest 中把九包 peer 和 toolchain SHA 指向候选。九包隔离构建 `9/9 PASS`；九包自测 `9/9 PASS`，共 286 项，其中 CRM/Knowledge 分别为 `108/108` 与 `32/32`，浏览器 journey 也通过。CRM/Knowledge 测试使用指向仓库 synthetic 夹具的只读符号链接修正相对根路径，未复制源码、真实数据或凭据。完整汇总见 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/plugin-adaptation-summary.json`、`plugin-build-summary.json` 和 `plugin-test-summary.json`。

这组结果只证明九包可以在隔离候选 toolchain 中编译并通过自身测试；组合宿主生命周期、组合 browser、组合 recovery、cross-version 以及正式包/lock/SDK closure 尚未执行。下一步应在该隔离候选上跑组合生命周期、browser、recovery 和 cross-version 矩阵，再把需要进入主仓的 peer/toolchain 适配作为独立代码变更走 `open-code-review-delegate` 和本地提交；完成前不申请切换授权。
