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
`crm-knowledge` 的 `TS2882: Cannot find module 'katex/dist/katex.min.css'` 根因在 alpha3 官方 `@deepseek-ai/dsh-client-ui-primitives` 包：其 `lib/index.js` 运行时导入 `katex` 和 `katex/dist/katex.min.css`，但官方 `package.json` 只在 `devDependencies` 声明 `katex:^0.18.7`。候选 source commit `a928e9b6dc82d98d634bb4381ff52daa2bc3e106` 将 `katex:^0.18.7` 加入 `crm-knowledge` 的 `dependencies`。在 clean npm 前缀加入 `katex@0.18.7` overlay 后，JS/CSS 解析通过。该证据验证候选修复，不代表官方包 closure 已修复。
- `analytics-workbench` 原始构建遇到 `TS2344`，原因是 alpha3 的 `@deepseek-ai/dsh-client-ui-workspace` 类型声明引用了 `workspace.toast`，但 `/client` 闭包没有导入 `ui-slots` 扩展。候选适配复用上游 `RowToast`，建立精确的 `ToastKind` keyed map 和 `ToastOccurrence` factory map。未知 toast key 和错误 payload 的负测均按预期失败。它不再使用宽泛的 `Record` 类型。
- 主仓提交 `a00aca77` 已删除 `0389c92e` 写入主仓的两个 alpha3 适配及引用。主仓继续固定 rc2。候选适配只存在于 ignored candidate formal-pack source commit `a928e9b6dc82d98d634bb4381ff52daa2bc3e106`。

使用 alpha3 候选 toolchain 和 `DSH_PACKAGE_INPUTS` 重跑九个插件，结果为 `9/9 PASS`，摘要为 `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/plugin-build-summary-r8.json`。`analytics-workbench` 的插件测试为 `34 pass / 1 skipped`，HTML 编辑和浏览器边界组为 `130 pass`。rc2 toolchain 回归中的 `analytics-workbench` 和 `crm-knowledge` 也均通过构建。

候选正式 pack 输入 Git 提交为 `a928e9b6dc82d98d634bb4381ff52daa2bc3e106`。`formal-packs-r2/summary.json` 和 `formal-packs-r2/verification.json` 记录九个插件 tarball、tarball SHA-256、pack manifest SHA-256，结果为 `9/9 PASS`。`formal-packs-r1/` 和提交 `560142098cdf199c8295aebb7770ada82a180106` 保留为旧候选记录。

已生成 SBOM、provenance 和 attestation 输入草稿。SBOM 的依赖图仍为 `NOT_RESOLVED`，publisher identity、signature、verification、revocation 和 clean machine 仍未完成。草稿明确保持 `release_ready=false`，不能作为正式发布证明。

使用九个 pack 重新生成 alpha3 profile inputs，并由 profile reader 验收，结果为 `plugin_count=9`。随后将九个 pack 解包到新的本地 profile install 目录，安装回执保持 `host=NOT_RUN` 和 `release_ready=false`。profile inputs、安装回执和摘要位于 `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/formal-packs-r2/`，实际安装目录为 `formal-packs-r2/profile-install-r2b/`。KaTeX overlay 记录位于 `formal-packs-r2/runtime-dependency-overlay-r1.json`。

主仓库的 `scripts/release/profile-packs.mjs` 对 alpha3 profile inputs 返回 `PROFILE_DSH_PIN_MISMATCH`，因为主仓仍固定 rc2。这是预期的保护行为。对应记录为 `formal-packs-r2/main-reader-pin-gate.json`。alpha3 profile 只能由隔离 alpha3 candidate checkout 验收，不能使用主仓 rc2 reader 冒充通过。

## 官方 npm 包隔离运行检查

从官方 npm registry 获取 `@deepseek-ai/dsh@0.2.1-alpha.3` tarball。文件 SHA-256 为：

```text
0b2ff7b8c9dbf4c04a3883a24a9b7a6cdccf39f36b2dc79936239a716a57c5d7
```

在新的本地 npm 前缀中执行 `npm install --ignore-scripts`。安装结果为 `609 packages`。随后在该候选根目录安装 `katex@0.18.7` overlay，并确认 `katex/dist/katex.min.css` 可以解析。在独立的 `HOME`、`DSH_HOME` 和 `TMPDIR` 下执行以下检查：

1. `dsh --version` 返回 `0.2.1-alpha.3`。
2. `dsh --help` 返回成功。
3. `dsh --profile web --dump-config-schema` 返回 JSON Schema，退出码为 0，但输出 4 条原生校验 warning 和 4 条 `unrecognized Loader tree carrier; use cordis:group or cordis:include for native child collection` error。这只能证明 schema 命令可执行，不能证明 alpha3 profile 的完整运行时校验通过。
4. `dsh --profile web --dump-default-config` 返回默认 profile 配置，文件大小为 `44001` 字节。

随后在另一个独立 npm 前缀安装官方 `@deepseek-ai/dsh@0.1.7-rc.2`。tarball SHA-256 为：

```text
5f2da7272d9485abc223e681075809a8d929697c5232ee445718e1b7e066bff8
```

旧版 `dsh --version` 返回 `0.1.7-rc.2`，`dsh --help` 返回成功。这个结果证明 npm 包层面的回退路径可执行。它不替代公司正式 clean machine 的安装、卸载和主仓 profile 回退验收。

运行记录位于：

- `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/npm-official-r1/observation.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/clean-npm-r1/runtime-check.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/clean-npm-rollback-r2/runtime-check.json`

随后完成了一个独立目录的本地 clean machine 流程模拟。模拟按“接收 artifact → 校验 SHA-256 → 安装 alpha3 → 版本和帮助检查 → 入口导入 → KaTeX CSS 解析 → 卸载 → 安装 rc2 → 旧版版本和帮助检查”的顺序执行，结果全部通过。回执位于 `.context/checks/dsh-upgrade-0.2.1-alpha.3-20261015/formal-packs-r2/clean-machine-sim-r1/receipt.json`，状态为 `LOCAL_SIMULATION_ONLY`。该回执不能替代公司正式 clean machine 的验收，也不能替代 SBOM closure、签名、撤销和 final attestation。

这说明升级不会让旧 SDK 自动失效。升级会改变 SDK 的类型和运行时接口，插件可能需要适配、重新构建和重新验收。当前 alpha3 候选还不能替换主仓 rc2。clean npm 的 KaTeX overlay 只验证本地候选运行闭包，不能替代正式 artifact 的 SBOM closure。

对 `clean-npm-r1` 执行 `npm audit --omit=dev` 得到 `8` 个 moderate 漏洞，high 和 critical 均为 `0`。直接依赖 `@deepseek-ai/dsh` 的审计项 `fixAvailable=false`。审计结果位于 `formal-packs-r2/npm-audit-alpha3-r1.json` 和 `formal-packs-r2/npm-audit-alpha3-r1-summary.json`。该结果需要发布责任方处理或书面接受，不能标记为无漏洞。

## 当前结论

- alpha3 源码、锁文件、Node 和 pnpm 已具备本机隔离构建条件。
- alpha3 SDK 输入检查已通过本机开发检查。
- `release_ready=false` 仍然有效。
- 九个插件的 alpha3 候选构建已通过。主仓没有 alpha3 适配；候选 source commit `a928e9b6dc82d98d634bb4381ff52daa2bc3e106` 包含精确 toast 类型适配和 `katex:^0.18.7` runtime 依赖。官方 ui-primitives 的 KaTeX closure 仍标记为 `UPSTREAM_DEFECT_DEV_ONLY`。
- 九个插件的候选 artifact、SHA-256、pack manifest 和 pack reader 验收已完成。SDK 完整 closure artifact、publisher identity、signature、独立 verification、revocation 和 final attestation 尚未完成。
- clean npm 根目录的锁文件包含 `680` 个条目，当前平台安装 `610` 个，`70` 个为平台可选包。依赖图只对这个本地平台根目录解析完成。npm audit 仍有 `8` 个 moderate 漏洞，官方 SDK closure 和漏洞处理意见仍未完成。
- 已完成两个独立 npm 前缀的 alpha3 安装启动检查、rc2 npm 包回退启动检查，以及一个本地 clean machine 流程模拟。正式 clean machine 的 artifact 接收、SHA 校验、SBOM closure 校验、卸载、主仓 profile 回退和旧版完整启动验收仍未完成。
- M2-07 仍不能关闭。M2-08 仍不能执行。

## 后续顺序

1. 审查并接纳候选 source commit `a928e9b6dc82d98d634bb4381ff52daa2bc3e106`，同时确认官方 KaTeX runtime closure 已由发布包所有者修复或明确纳入 artifact closure。
2. 处理或书面接受 npm audit 的 `8` 个 moderate 漏洞，尤其是 `@deepseek-ai/dsh` 的 `fixAvailable=false` 项。
3. 运行插件单测、生命周期、组合集成、browser/recovery 和回退检查；候选复制目录缺少仓库级 `frontend-vue3`、锁定 Python 和主仓测试支持路径时，不把测试结果记为正式通过。
4. 对同一个 alpha3 artifact 生成 SHA-256、SBOM、provenance 和签名材料。
5. 由发布责任方完成 publisher identity、verification、revocation 和 final attestation。
6. 在 clean machine 按安装、校验、卸载、回退顺序验收。
7. 验收通过后，再评审是否把主仓 pin 从 rc2 适配到 alpha3。

