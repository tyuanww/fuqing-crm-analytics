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

`pnpm dsh doctor --release` 和 `scripts/release/preflight.mjs` 使用同一加载器。profile 改动会先体现在 readiness 和候选构建输入中；T21 candidate 现在携带原字节 `profile.json`，将其 SHA-256 同时绑定到 candidate digest 和 `CANDIDATE_PREPARED` journal。必须显式指定同一绝对 state path；远端 receipt/activation 接线仍为 T13 未完成部分。

`config/dsh-profile.crm-knowledge.rc2.json` 是另一个显式选择的首期双包 allowlist，不替换默认七插件 profile。`plugin verify-host` 只接受该双包范围，校验所选候选包和已实测的伴随包、实际 composition 与宿主证据，再向既有 journal 追加 `CANDIDATE_HOST_VERIFIED`。profile 本身只定义选择/顺序；精确版本与完整包摘要来自不可变 candidate/host 回执，不把 allowlist 当作完整版本锁或发布批准。

## 变更边界

修改插件列表时，必须同时更新 profile 中的 `path`、`id`、`build` 和包 manifest，并通过 profile 测试与 preflight 检查。这个文件只描述合同，不能替代真实构建、DSH 宿主生命周期、远端接收或杭州验收证据。
