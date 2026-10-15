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
- `analytics-workbench` 仍未通过。alpha3 的 `@deepseek-ai/dsh-client-ui-workspace` 类型声明引用了 `workspace.toast`，但当前声明闭包没有正确导入对应的 `ui-slots` 扩展，随后出现 `TS2344` 和多个 `TS2305` 类型错误。

这说明升级不会让旧 SDK 自动失效。升级会改变 SDK 的类型和运行时接口，插件可能需要适配、重新构建和重新验收。当前 alpha3 候选还不能替换主仓 rc2。

## 当前结论

- alpha3 源码、锁文件、Node 和 pnpm 已具备本机隔离构建条件。
- alpha3 SDK 输入检查已通过本机开发检查。
- `release_ready=false` 仍然有效。
- 九个插件中，七个直接通过；`crm-knowledge` 需要候选侧类型声明适配后通过；`analytics-workbench` 仍被 alpha3 类型声明兼容问题阻塞。
- 尚未完成 SDK artifact、SBOM、provenance、publisher identity、signature、verification、revocation 和 final attestation。
- 尚未在 clean machine 安装、卸载、回退并验证旧版。
- M2-07 仍不能关闭。M2-08 仍不能执行。

## 后续顺序

1. 复制 alpha3 plugin-kit 绑定，重新构建九个业务插件和 profile。
2. 运行插件单测、生命周期、组合集成、browser/recovery 和回退检查。
3. 对同一个 alpha3 artifact 生成 SHA-256、SBOM、provenance 和签名材料。
4. 由发布责任方完成 publisher identity、verification、revocation 和 final attestation。
5. 在 clean machine 按安装、校验、卸载、回退顺序验收。
6. 验收通过后，再评审是否把主仓 pin 从 rc2 适配到 alpha3。

