# `@shine-mage/dsh-contracts`

生成器契约产物的唯一归属包（P2d）。生成器不再把 `.generated.*` 写进各插件的
`src/`；插件与后端消费方只通过本包导出的 subpath 引用，不再持有插件内生成副本。

## 边界

- 本包 `private: true`、版本 `0.1.0`、`type: module`，随主仓一起演进；P4 拆仓时按
  `shinemage-dsh-contracts` 独立仓发布 tarball，插件改为安装该包。
- 目录布局 `<domain>/<原插件 src 内相对路径>`，文件内容与生成器渲染结果逐字节一致。
- `package.json` 的 `exports` 是唯一导出面：`.generated.d.ts` 导出为
  `.../<name>.generated.js`（TypeScript 类型解析），运行时 `.ts` 同时提供
  `.ts` 与 `.js` 两个 subpath，`.mjs` 保留扩展名。新增/迁移文件必须同步维护
  `exports`、`files` 与生成器目标路径，否则 `scripts/dsh-b0/contracts-package.test.mjs`
  失败。
- 插件把本包声明为 `devDependencies`（构建期打包进 `lib/`，运行时无需安装本包）。

## 运行时绑定

本包唯一的运行时导入是 pin 住的 `@deepseek-ai/dsh-tools`
（`<domain>/service-transport.generated.mjs`，由 `service-client.template.mjs`
生成）。`package.json` 仍然不声明任何 dependency：消费方 bundler 会把生成物打进
`lib/` 并把 `@deepseek-ai/*` 保持为 external，运行时由宿主 profile 解析同一
specifier。

源码级工作区跑（不经过包管理器安装）需要额外绑定一次，因为 Node 从**导入文件所在
包的真实路径** `dsh-plugins/contracts/...` 解析 bare specifier，看不到插件自己的
`node_modules`：

```bash
node scripts/dsh-b0/contracts-link.mjs --upstream /absolute/pinned-dsh-checkout
```

该命令把本包 link 进每个声明它的插件（与 B0 pipeline 一致），并按
`dsh-plugins/plugin-kit/toolchain.json` 的 `sdk_bindings`/`sdk_version` 把 pin 住的
`@deepseek-ai/dsh-tools` 校验后 link 进本包 `node_modules`（与 kit 被 link 进插件
同构）；`scripts/crm-calibration/verify.py` 的 `contracts-link` 阶段即执行它。
不带 `--upstream` 时保持原行为（只 link 插件；不加载 transport 的 probe 使用）。

## 生成与校验

| 代理 | 生成器 |
|---|---|
| public compiler contracts（15 条） | `scripts/dsh-b0/*-contract.mjs`，由 `config/public-contract-inputs.lock.json` 锁定 |
| CRM / knowledge OpenAPI 与 access 常量 | `scripts/crm-calibration/generate_contract.py`、`scripts/crm-calibration/generate_types.mjs` |

- 本地重生成：对应生成器 `--write`（生成器校验会读取真实 backend/contract 源）。
- 主仓守卫：`node --test scripts/dsh-b0/contracts-package.test.mjs`（导出面、消费方
  import、禁插件内生成副本、逐字节重生成）。其中 CRM / knowledge 的 11 个包内产物
  由 `generate_contract.py --check --package-only` 在 B0 的 Python 闭包内重跑：
  `--package-only` 只跳过需要完整 CRM runtime（pandas、bcrypt）的 4 份 backend
  OpenAPI，它们由 `backend/tests/test_crm_service_contracts.py` 在 Python 计划里
  端到端覆盖。因此只改 `dsh-plugins/contracts/**` 的 PR 也会 fail-closed。
- B0 封印校验：`scripts/dsh-b0/fixed-contract-checks.mjs` 在隔离 stage 中把作者
  物料投影到本包路径后跑 15 个生成器 `--check`，漂移 fail-closed。
