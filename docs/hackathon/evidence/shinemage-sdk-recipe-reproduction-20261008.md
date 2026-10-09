# SDK 固定双 bundle 配方复现（2026-10-08）

本轮仅在用户明确允许的隔离配方环境执行。官方固定源码、原锁、原脚本未修改，原 `pnpm11/pnpm build` 已在禁止网络的 sandbox 内完成；第二次真实目录布局的两个原始 bundle 与 received-r3 封存文件逐字节一致，未经替换、裁剪或输出后处理。SDK 分发仍 BLOCKED，release_ready=false，八条顶层门禁未改为通过。该证据只关闭固定两份 JS bundle 的配方输出重建子项，不改 `sdk-supply-chain.mjs` 默认值，不接日常插件更新。

工作树 HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`，本任务无产品源码 diff、无提交或推送。固定 pnpm 源 commit `57e7b9b76ac3a5ef67461093071b2264335a1a01`，tree `d506a194e838ba5d01fee37d42f075fe55f4f01b`；构建后重新核对 8027 个原始 blob/链接/模式，变化 0，pnpm-lock.yaml 与 Cargo.lock 均未变。原集成树、DSH、SDK 运行包和默认 Node24.19/Python3.14.4 均不替换。

## 原始产物

- `pnpm.mjs`：15457230 字节，SHA-256 `00805e99c795e7067b0f459846393ca3f6a701ca9ae267fd48b99d11ecd423a8`，原始字节相等 `True`。
- `worker.js`：613034 字节，SHA-256 `9834d944929dba7566e230a084fff0ecdb1da1be777c72ecb5f00a41a04843a4`，原始字节相等 `True`。

直接比较证据：`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/layout-r2/audit-result.json`。构建命令/日志：`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/layout-r2/bundle-build-command.json`、`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/layout-r2/bundle-build.log`；安装命令/日志：`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/layout-r2/source-install-command.json`、`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/layout-r2/source-install.log`。验证摘要见同目录 `shinemage-sdk-recipe-reproduction-validation-20261008.json`。

## 实际执行边界

- Node26.10.0 是根 devEngines 固定运行时，Node24.6.0 是原 bundle 子步骤运行时；pnpm12.7.0 原 native 管理器、esbuild0.28.2、native-preview7.0.0-dev.20260707.2 均按固定原材料。未执行 SEA 的 Node26.0 发布链。Node 运行时槽由原管理器自己生成，没有手写 slot/receipt。
- `.pnpmfile.cjs` 保留执行；安装 `--frozen-lockfile --ignore-scripts --offline`，不禁用 pnpmfile。原 pn/pnx/pnpx wrapper 按已核验原字节复制到私有 tooling-bin，不执行全局 setup；build 字符串未改。只用 Cargo1.97.0 做原管理器必需的 Cargo metadata/依赖物化，没有 rustc/std 或 native build。
- 原 filtered install 默认包含根工作区。最初 880 是 204 个编译参考项目的保守声明上界；计入根声明后的可用平台上界为 1508 registry。原管理器另外会验证整锁 1649 记录，其中 1648 registry + 1 runtime。故补齐剩余140条固定 registry 元数据；另有锁第1文档的管理器2包。缓存夹具仅用于原管理器准备，不当成原源码验收图。真正原源码安装日志为 Scope204/231，不能把缓存批数或包数称为测试通过数。
- Cargo 774 个 registry 条目逐原锁 checksum；另1个 git 输入固定 commit。二者不混称775个 registry 摘要。原 Cargo 配置未关闭。原管理器的受审缓存夹具仅用于准备，之后原源码在断网 sandbox 消费。
- 下载准备阶段正常 TLS；正式安装/构建 `sandbox-exec (deny network*)`，子进程也受约束。文件只写本次独占目录及固定管理器必需的精确 `/private/tmp/pnpm-store-operation-locks-501` 协调锁。SDK、密封源码和个人配置不可写，未放开整个/tmp。

## 保留的失败和路径诊断

首次原源码离线安装因缺其他平台 full metadata 失败，补原材料后第二次成功，不放宽供应链策略。首次原 build 已成功，但 raw 输出存在 store 相对路径差异：pnpm.mjs5234处、worker.js314处。只读内存替换仅用于归因，原始 MISMATCH 和所有文件保留在 `/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/bundle-comparison-r1.json`、`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/bundle-prefix-diagnostic.json`，不算 PASS。

第二次在 `/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-recipe-reproduction-20261008/layout-r2` 创建真实 `work/pnpm/pnpm` 与 `setup-pnpm/store` 目录，使编译入口看到原 `../../../../../setup-pnpm/store/v11/links`。该新store由原管理器重新物化，仅复用官方 metadata/signature缓存，没有复制/拼写store索引或改运行时槽。原 install/build 真断网执行后直接读取新dist与sealed字节比较。空间事前625GiB可用，没有删除历史证据腾空间。

## 仍未关闭

SDK 分发 BLOCKED、嵌入组成 PARTIAL、产品 `inline_function_bytes` 默认 NOT_VERIFIED；顶层门禁及 T5/T15/T19 不勾完。完整安装包身份、其他嵌入来源/资源解析、native 安全门禁、公告上游发布、撤销、干净主机与最终签名继续按原账本。7版本/29公告仍是历史查询，未重查。本轮未跑B0/冷安装/headed/真实业务/生产，未改candidate/journal，未发布。
