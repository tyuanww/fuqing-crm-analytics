# ShineMage DSH plugin kit

这是插件构建期使用的共享工具链边界，不是 DSH 运行时，也不会进入插件 tarball。它只负责把插件绑定到固定的 Node、pnpm、DSH SDK、上游 SHA 和 build-tools 闭包。插件运行时只能依赖自己的 `package.json`、DSH peer 和公开 capability 合同。

当前 workspace 仍从 `analytics-workbench/build-tools` 复用已审计的构建依赖；构建脚本通过本 kit 的 `toolchain.mjs` 接入，不能再直接导入另一个插件的 toolchain 源码。未来独立 kit 仓库只需迁移这里的 pin 与 build-tools，不改变插件包合同。
