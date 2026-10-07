# ShineMage board-components

领域包 `@shine-mage/board-components@0.1.0` 拥有漏斗/瀑布图的纯计算函数、公开类型和跨语言测试标本。它不是 DSH 插件，不注册 slot、工具、会话或宿主能力，也不依赖 DSH、React、CRM 或数据服务。

公开入口是 `@shine-mage/board-components/funnel` 与 `@shine-mage/board-components/waterfall`，各自同时发布 `.mjs` 和 `.d.mts`。未知输入返回 `null`；漏斗人数必须嵌套、比例保持 0–1、零分母不可用；瀑布图保持数值守恒。工作台和旧图表插件仍拥有自己的 DSH 生命周期与展示合同。

在仓库根、Node 24 / pnpm 11.28.2 环境执行（自有插件工具链；官方 DSH 构建版本由 kit 的 `upstream_pnpm` 单独固定）：

```bash
node scripts/dsh-b0/plugin-kit-link.mjs "$PWD/dsh-plugins/board-components" "$PWD/dsh-plugins/plugin-kit"
node dsh-plugins/board-components/build.mjs
node scripts/dsh-b0/package-inputs.mjs
node --test dsh-plugins/board-components/test/geometry.test.mjs scripts/dsh-b0/package-inputs.test.mjs
```

构建只生成本地包输入，默认位于 `.context/dsh-b0/package-inputs/`；第一个位置参数可指定另一个输出目录。pnpm 按包自身的工作目录和 `packageManager` 解析。构建从 kit 精确开发依赖的公开入口导入解包校验器，不引用相邻源码；独立仓库使用已安装 kit。打包临时 manifest 删除 scripts 和 devDependencies；tarball 只有四份代码/类型和 package.json，无安装 hooks 或开发 kit 依赖。此次构建接线不改变既有 `0.1.0` tarball 的字节与摘要。输出同名包已存在时，只接受完全相同的摘要，不覆盖不同字节。

消费者将精确版本写入 `devDependencies`，将 tarball 文件名与 SHA-256 写入 `bundled-dependencies.json`，通过 `DSH_PACKAGE_INPUTS=/absolute/inputs` 从任意目录消费同一个包。kit 验证 tarball 摘要、文件/类型/导出与已安装字节，绑定到插件私有的内容寻址目录，旧输入保留。构建将代码打入插件产物；线上无需再安装本领域包，也不需更改 profile。

这是 workspace 边界证明，尚未发布 npm 包或创建独立仓库。更新函数/类型时先升级领域包版本，再审查消费者 lock 和回归结果；正式发布仍受签名、来源、SBOM/CVE 与 clean reviewed SHA 门禁约束。打包成功不等于宿主或杭州已验收。
