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

## 当前结论

- alpha3 源码、锁文件、Node 和 pnpm 已具备本机隔离构建条件。
- alpha3 SDK 输入检查已通过本机开发检查。
- `release_ready=false` 仍然有效。
- 尚未完成九个业务插件的 alpha3 适配构建和测试。
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

