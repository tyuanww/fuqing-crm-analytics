# DSH profile manifest

<a id="dsh-profile-contract"></a>

release 和 preflight 的插件顺序由 `config/dsh-profile.rc2.json` 定义。脚本不再维护一份可漂移的插件数组；profile 是候选准备阶段唯一的插件选择输入。

profile 当前固定：

- `schema_version: dsh-profile/v1`
- `profile_id: dsh-rc2`
- DSH SDK `0.1.7-rc.2`
- upstream SHA `477b4f420553e8a52c2fbccc464d7561b239c443`
- 七个插件的相对路径、包名、`build.mjs` 入口和 `enabled: true`

`scripts/release/profile.mjs` 只读加载并校验 profile。它拒绝绝对路径、路径穿越、重复插件、包名不一致、DSH peer 不匹配和未提供 build 入口，并返回 profile 文件的 SHA-256。它不安装依赖、不构建、不启动宿主、不读取业务数据。

`pnpm dsh doctor --release` 和 `scripts/release/preflight.mjs` 使用同一加载器。profile 改动会先体现在 readiness 和候选构建输入中；profile digest 会随证据记录，后续 T21 candidate/journal 需要把它绑定到 candidate receipt。当前 `RELEASE_STATE_PATH` 的统一 journal 仍属于 T13 未完成部分。

## 变更边界

修改插件列表时，必须同时更新 profile 中的 `path`、`id`、`build` 和包 manifest，并通过 profile 测试与 preflight 检查。这个文件只描述合同，不能替代真实构建、DSH 宿主生命周期、远端接收或杭州验收证据。
