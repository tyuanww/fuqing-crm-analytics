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

M2-09 在 2026-10-13 的初始状态为 `CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / COMBINED_BROWSER_NOT_RUN / MAIN_PIN_UNCHANGED`。下方 2026-10-14 记录已补齐候选正式 pack/profile 输入和组合 browser；主仓 peer 与固定 toolchain 仍锁 rc2，升级不混入当前九包发布 candidate。

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

候选自身聚焦测试共 14 个文件、`468 PASS / 0 FAIL`，覆盖 plugin-manager、profile/loader、Agent loop resource/scope、session repair/records、Cordis lifecycle、continuable subagent 和 spawn lifecycle。候选编译 persistence API 完成 text/tool/rich 三组撕裂尾只读、修复续写、冷读验证；随后用显式版本参数完成 rc2 → `0.2.1-alpha.2` 的三组跨版本恢复，每组 `4 PASS`、10 个冷进程执行，包含 baseline 写入、candidate 读取续写、旧 reader 读取新状态和保留回退快照。实现提交为 `a7c895e9`，汇总见 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/cross-version-recovery-summary.json` 和 `runtime-compatibility-summary.json`。 九包组合 lifecycle 另在 ignored harness 中完成 9 次加载与 9 次逆序卸载，最终工具数归零；回执为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-combined-lifecycle-20261014.json`。

## 2026-10-13 插件适配复核

候选 `@deepseek-ai/dsh-tools` 版本为 `0.2.1-alpha.2`，主仓九个现有插件的 `peerDependencies.@deepseek-ai/dsh-tools` 全部仍为 `0.1.7-rc.2`，静态兼容数仍为 `0/9`；完整回执为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/plugin-peer-matrix.json`。直接用候选 checkout 运行 `B0_BUILD_UPSTREAM=... node dsh-plugins/shine-brand/build.mjs` 仍在主仓 `plugin-kit/toolchain.json` 的固定 upstream SHA 校验处拒绝，实际 `d7432673…`、期望 `477b4f42…`；这证明主仓 pin 仍然保护当前 rc2 组合，没有改写主仓。

随后在 ignored 目录 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-plugin-workspace` 建立独立候选 toolchain，仅在副本 manifest 中把九包 peer 和 toolchain SHA 指向候选。九包隔离构建 `9/9 PASS`；九包自测 `9/9 PASS`，共 286 项，其中 CRM/Knowledge 分别为 `108/108` 与 `32/32`，浏览器 journey 也通过。CRM/Knowledge 测试使用指向仓库 synthetic 夹具的只读符号链接修正相对根路径，未复制源码、真实数据或凭据。完整汇总见 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/plugin-adaptation-summary.json`、`plugin-build-summary.json` 和 `plugin-test-summary.json`。

这组结果证明九包可以在隔离候选 toolchain 中编译并通过自身测试，跨版本 persistence 和组合 lifecycle 已通过；alpha.2 组合 browser、正式 pack/lock/SDK closure 尚未执行。下一步应先为候选生成正式 pack inputs，再跑组合 browser/recovery 矩阵，再把需要进入主仓的 peer/toolchain 适配作为独立代码变更走 `open-code-review-delegate` 和本地提交；完成前不申请切换授权。

## 2026-10-14 候选正式 pack/profile 与组合 browser 补验

为解除正式组合 browser 的输入缺口，本轮新增显式候选 toolchain 适配入口，默认 rc2 路径保持不变。候选 toolchain 为 DSH `0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c`，Cordis 运行时为 `4.0.5-alpha.1`，CRM/Knowledge 包声明的候选兼容 peer 为 `4.0.2`，二者均在回执中分开记录。候选正式准备回执为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-formal-prepared-20261014/preparation.json`：9 个正式 plugin pack、2 份 profile inputs、lock/profile/manifest/tarball 摘要均由真实读取器复核，`release_ready=false`、host/remote CI 为 `NOT_RUN`。

随后在固定 Node `24.19.0`、Python `3.14.4` 下执行候选 `native-composition-browser-probe.mjs`，使用候选正式 Workbench page pack 启动 alpha2 native host，创建隔离 SQLite session，预置并读回 1 条 synthetic history，确认 synthetic board preview，随后关闭自有 runtime。结果为 `PASS`，原始摘要 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-combined-browser-20261014.json`；`model_calls=0`、`contains_real_data=false`、`console_errors=[]`，不构成真实业务、生产、发布或切换验收。

本轮代码提交 `01b753e5`（`feat(verification): support explicit candidate toolchains`）已按 `open-code-review-delegate` 覆盖 8/8 文件审查；固定 Node 24 下 release/profile/composition/serve 回归共 `119 PASS / 0 FAIL / 0 SKIP`，候选 CRM/Knowledge/page 组合 `20 PASS`，候选 browser probe `PASS`。主仓 `dsh-plugins/plugin-kit/toolchain.json`、live/current、正式 profile/journal 和 release gate 均未切换。

因此当前 M2-09 状态更新为：`CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / FORMAL_PACK_PASS / COMBINED_BROWSER_PASS / MAIN_PIN_UNCHANGED`。仍开放主仓 peer/toolchain 适配的 release-scoped 评审、正式目标 browser/recovery、切换授权以及所有 release/activation 门禁。


## 2026-10-14 授权目标 alpha2 browser/recovery 补验

在用户授权的杭州目标 `100.93.46.46` 上，使用同一候选 `dsh-v0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c` 和正式 page pack 输入，创建一次性 `/tmp/shinemage-dsh-alpha2-target-20261014`。目标平台为 Linux x86_64 / WSL2、Node `24.21.0`、Python `3.14.4`。首次启动只暴露 fresh checkout 尚未执行 `build:lib:client` 的前置缺口，保留为 `BLOCKED_BUILD_INCOMPLETE`；在同一临时 checkout 补跑 `build:lib` 后，上游 tracked source 保持 clean。

补建 client bundle 后，candidate 在目标临时端口 `4329` 完成正式 page pack browser：synthetic session/history/board 均通过，history seed HTTP `200`、`model_calls=0`、`contains_real_data=false`、`console_errors=[]`。随后发送 owned-host `restart`，同一 runtime 重启并返回 `restarted-owned-host`，恢复阶段 PASS。目标现役 `4328/4332/4336` 监听未修改，alpha2 临时目录和 runtime 已回收；原始回执为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-target-browser-recovery-20261014.json`。

这关闭 M2-09 的目标 browser/recovery synthetic 子项，不等于真实业务 UAT、生产激活、release、canary、rollback 或主仓 pin 切换。当前状态为：`CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / FORMAL_PACK_PASS / COMBINED_BROWSER_PASS / TARGET_BROWSER_PASS / TARGET_RECOVERY_PASS / MAIN_PIN_UNCHANGED`。


## 2026-10-14 证据纠偏与当前门禁

复核发现本文件前述 alpha2 formal pack/profile、组合 browser 和授权目标 browser/recovery 的结论过度。formal preparation 使用 ignored candidate workspace，回执的外层 source_sha 与 source_dirty=false 不能证明候选包源码来自已提交树；旧打包器没有校验 source manifest 与 HEAD 的逐字一致性。native-composition-browser-probe.mjs 只启动 HTTP backend/native host，未调用浏览器自动化 API，也没有页面导航或 console 监听；console_errors=[] 不能证明浏览器无错误。restart 只得到宿主重启响应，没有新进程中的 history/board 读回。授权目标还复用了 synthetic backend，不能作为正式目标 browser/recovery 证据。旧回执、日志和提交不删除，作为历史尝试保留。

本轮已修复 scripts/release/plugin-pack.mjs 的来源门禁，并新增 clean-looking ignored manifest overlay 回归测试；固定 Node 24 下打包回归为 25 PASS / 0 FAIL / 0 SKIP，候选和宿主相关回归分别为 8 PASS 与 26 PASS。当前 M2-09 为：

CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / CROSS_VERSION_PASS / COMBINED_LIFECYCLE_PASS / FORMAL_PACK_SOURCE_PROVENANCE_BLOCKED / COMBINED_BROWSER_NOT_RUN / TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN / MAIN_PIN_UNCHANGED

下一步是准备一个 tracked candidate workspace，以修复后的来源门禁重新生成 pack/profile；之后再使用真实 headed 浏览器完成页面操作，并在 owned-host 重启后回读 history/board，最后才评估主仓 peer/toolchain 适配。主仓 rc2 pin/live、正式 profile/journal、release/activation 均未切换。
