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

## 生成与校验

| 代理 | 生成器 |
|---|---|
| public compiler contracts（15 条） | `scripts/dsh-b0/*-contract.mjs`，由 `config/public-contract-inputs.lock.json` 锁定 |
| CRM / knowledge OpenAPI 与 access 常量 | `scripts/crm-calibration/generate_contract.py`、`scripts/crm-calibration/generate_types.mjs` |

- 本地重生成：对应生成器 `--write`（生成器校验会读取真实 backend/contract 源）。
- 主仓守卫：`node --test scripts/dsh-b0/contracts-package.test.mjs`（导出面、消费方
  import、禁插件内生成副本、逐字节重生成）。
- B0 封印校验：`scripts/dsh-b0/fixed-contract-checks.mjs` 在隔离 stage 中把作者
  物料投影到本包路径后跑 15 个生成器 `--check`，漂移 fail-closed。
