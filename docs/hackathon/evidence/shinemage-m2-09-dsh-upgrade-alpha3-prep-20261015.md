# M2-09 DSH alpha3 升级候选准备（2026-10-15）

本页记录最新官方 DSH 版本的隔离准备结果。它不改变主仓当前的 `0.1.7-rc.2`，不改变正式 profile，不执行运行中切换。

## 目标版本

- 官方标签：`dsh-v0.2.1-alpha.3`
- 官方提交：`2fbf4359b82fb94c03dcce0b831660d87f12ea5c`
- 上游地址：`https://github.com/deepseek-ai/deepseek-harness.git`
- 版本性质：GitHub pre-release。它不能直接作为正式生产发布版本。

## 已完成

在 `.context/dsh-b0/upstream-0.2.1-alpha.3` 完成以下步骤：

1. 使用官方固定提交创建隔离源码副本。
2. 使用 Node `v24.19.0`。
3. 使用上游声明的 pnpm `11.28.5`。
4. 使用 `pnpm install --frozen-lockfile --ignore-scripts --prefer-offline` 安装依赖。
5. 锁文件 SHA-256 为：

   ```text
   087cc6686b9b51ba764742eba50e1d3125e9706af7b430a578789281750f9b2a
   ```

6. `pnpm run build:lib` 返回成功，生成 host/client 编译产物。
7. 在隔离的 alpha3 plugin-kit 配置下，`check.mjs` 返回：

   ```json
   {"schema_version":"shinemage-kit-inputs/v1","status":"READY","sdk_packages":26,"bindings":32,"release_ready":false}
   ```

## 插件兼容性结果

已在隔离候选工作区使用 alpha3 输入执行九个业务插件的构建检查。结果如下：

- `knowledge`、`shine-board`、`shine-brand`、`shine-crowd-action`、`shine-funnel`、`shine-query`、`shine-waterfall` 通过。
- `crm-knowledge` 原始构建遇到 `TS2882: Cannot find module 'katex/dist/katex.min.css'`。加入候选侧 CSS 类型声明后通过。这个改动属于插件适配，不能直接视为官方兼容。
- `analytics-workbench` 原始构建遇到 `TS2344`，原因是 alpha3 的 `@deepseek-ai/dsh-client-ui-workspace` 类型声明引用了 `workspace.toast`，但当前声明闭包没有导入对应的 `ui-slots` 扩展。第一次候选声明又遮蔽了原模块，产生多个 `TS2305`；改为带模块导入的 declaration merge 后，host/client 类型检查和构建通过。
- 加入两个候选侧适配后，九个插件的候选构建均通过。`analytics-workbench` 的插件测试通过：第一组 `34 pass / 1 skipped`，HTML 编辑和浏览器边界组 `130 pass`。这些适配目前只存在于隔离候选工作区，正式提交前仍需决定是否采用插件侧兼容声明，或等待上游修复。

2026-10-15 已将两个适配写入候选分支提交 `0389c92e`。该提交没有修改 DSH 上游或主仓 rc2 toolchain。使用 alpha3 候选 toolchain 和 `DSH_PACKAGE_INPUTS` 重跑九个插件，结果为 `9/9 PASS`，摘要为 `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/plugin-build-summary-r8.json`。rc2 toolchain 回归中的 `analytics-workbench` 和 `crm-knowledge` 也均通过构建。

随后建立候选正式 pack 输入 Git 提交 `560142098cdf199c8295aebb7770ada82a180106`，生成九个插件 tarball，并使用 `readPluginPack` 逐个验收。结果为 `9/9 PASS`。每个 pack 都有 tarball SHA-256 和 pack manifest SHA-256。对应材料位于 `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/formal-packs-r1/`。

已生成 SBOM、provenance 和 attestation 输入草稿。SBOM 的依赖图仍为 `NOT_RESOLVED`，publisher identity、signature、verification、revocation 和 clean machine 仍未完成。草稿明确保持 `release_ready=false`，不能作为正式发布证明。

这说明升级不会让旧 SDK 自动失效。升级会改变 SDK 的类型和运行时接口，插件可能需要适配、重新构建和重新验收。当前 alpha3 候选还不能替换主仓 rc2。

## 当前结论

- alpha3 源码、锁文件、Node 和 pnpm 已具备本机隔离构建条件。
- alpha3 SDK 输入检查已通过本机开发检查。
- `release_ready=false` 仍然有效。
- 九个插件的 alpha3 候选构建已通过；`crm-knowledge` 和 `analytics-workbench` 各使用候选侧类型声明适配。完整正式包、上游修复判断和适配提交评审仍未完成。
- 九个插件的候选 artifact、SHA-256、pack manifest 和 pack reader 验收已完成。SDK 完整 closure artifact、publisher identity、signature、独立 verification、revocation 和 final attestation 尚未完成。
- 尚未在 clean machine 安装、卸载、回退并验证旧版。
- M2-07 仍不能关闭。M2-08 仍不能执行。

## 后续顺序

1. 将两个候选侧适配变成可审查的插件改动，或记录上游修复后移除条件。
2. 复制 alpha3 plugin-kit 绑定，重新构建九个业务插件和 profile。
3. 运行插件单测、生命周期、组合集成、browser/recovery 和回退检查。
4. 对同一个 alpha3 artifact 生成 SHA-256、SBOM、provenance 和签名材料。
5. 由发布责任方完成 publisher identity、verification、revocation 和 final attestation。
6. 在 clean machine 按安装、校验、卸载、回退顺序验收。
7. 验收通过后，再评审是否把主仓 pin 从 rc2 适配到 alpha3。

