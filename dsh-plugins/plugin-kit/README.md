# ShineMage DSH plugin kit

这是插件构建期使用的共享工具链边界，不是 DSH 运行时，也不会进入插件 tarball。它负责把插件绑定到固定的 Node、pnpm、DSH SDK、上游 SHA、build-tools 闭包和显式锁定的领域包输入。插件运行时只能依赖自己的 `package.json`、DSH peer 和公开 capability 合同。

`toolchain.json` 与 `build-tools/` 的 manifest、锁文件、补丁由本 kit 维护。所有插件读取同一份固定配置；workbench 的业务类型检查留在 workbench 内。kit 不导入任何业务插件源码。

构建前可以单独做只读输入检查：

```sh
node dsh-plugins/plugin-kit/check.mjs \
  --upstream /absolute/pinned-upstream-0.1.7-rc.2 \
  --build-tools /absolute/installed-build-tools
```

`READY` 只表示源码 SHA/锁、工具版本与 26 个 SDK 的 main/types 入口可用，不能代替编译、依赖审计或发布签名；缺项返回 `BLOCKED` / 退出 2。命令不联网、不安装、不导入 SDK/编译器代码、不生成插件链接。实际 `bindToolchain` 复用同一检查，全部通过后才加载工具与绑定。

kit 现在有显式 package `files` 和 `./toolchain` export，可在隔离目录运行 `pnpm pack` 得到仅源码/锁/补丁的包，并通过 `@shine-mage/dsh-plugin-kit/toolchain` 导入。包继续 `private: true`，没有发布 registry；SDK、已安装的编译依赖和业务包都不打进 kit。独立插件构建仍须显式提供固定 upstream/build-tools，现有 workspace 构建入口保持兼容。后续分仓还需安装接线、分发信任和干净机器验证，不能把本地 pack 称为已发布开发套件。

从仓库根执行既有 `scripts/dsh-b0/pipeline.mjs --prepare|--audit|--check --python /absolute/python3.14` 准备和验证；`--check` 不安装依赖。已有环境可以复用相同锁文件的依赖缓存，干净环境由 `--prepare` 安装到这里。显式传给 build 的 build-tools 必须与 kit 的 manifest、锁文件和补丁逐字节一致。

`scripts/dsh-b0/plugin-isolation.test.mjs` 把 kit 和单个叶子插件复制到独立临时目录，在没有 workbench 源码的情况下构建、测试并受控打包。测试 Git 提交只属于临时夹具，不能作为已审查的发布 SHA。当前仍是 workspace dev kit；正式独立 kit 分发、DSH 跨版本兼容和真实宿主安装按 G0 门禁推进。

`packaged-dependencies.mjs` 只处理构建输入协议：按消费者精确版本和 SHA-256 核验 tarball/公开导出/类型，不执行包 hooks、不读取兄弟包源码、不包含图表逻辑。绑定目标是当前插件 `node_modules/.shinemage-bundled/<digest>` 的包字节，消费入口仍用标准 package exports；它不是 `workspace:`/`file:` 依赖。旧摘要目录保留，不自动删除。变更/外部链接/未锁定输入失败即阻断。
