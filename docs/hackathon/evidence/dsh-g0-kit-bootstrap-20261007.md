# kit 首次 SDK 准备与新输入消费（2026-10-07）

工作树 `codex/plugin-boundary-review`，HEAD `cc1d8497`，保留此前 57 个未提交路径。本轮实现 T15 的“没有既有 SDK 目录时如何开始”子项；没有 commit、push、发布、操作杭州或访问业务数据。整体 **PARTIAL / release_ready=false**。

## 实现边界

- `dsh-plugins/plugin-kit/prepare.mjs` 随私有 kit 源码包交付，公开 `./prepare`。命令只接受新目录，在自己的 HOME/Corepack/store 中取固定官方 SHA、验证锁文件并冻结安装，执行官方 `build:lib:host`、`build:lib:client`，再安装 kit 自己的 build-tools 输入。
- 共用依赖安装/网络环境助手迁入 kit；原 `scripts/dsh-b0/package-manager-env.mjs` 薄转出保持现有调用方合同。kit 不反向导入仓库脚本。
- 目的目录存在就拒绝；不使用调用者应用凭据、Git/npm 配置或全局安装。显式代理仅用于联网阶段；输出脱敏。进程执行有超时、输出上限和本次进程组回收。
- 分阶段 `preparation.json` 与日志记录实际输入、source tree、pin/lock、平台、版本和摘要；失败保留 BLOCKED，不覆盖或伪装恢复。当前重试须选新目录，不支持 resume。
- 仅开发 SDK，不运行 `build:web`、构建 production runtime、启动 DSH 或切换宿主；READY 仍带 `supply_chain=NOT_VERIFIED`、`production_runtime=NOT_BUILT`、`release_ready=false`。

## 真实冷准备

原始证据目录：`.context/checks/kit-bootstrap-20261007/`。Node `24.19.0`、pnpm `11.7.0`、Darwin arm64。先实际 pack kit，再用本地 tarball 离线安装到新 consumer/store；随后从**安装后的 kit**执行准备命令。kit 本地安装使用已有 Corepack 启动器；SDK 准备自身使用新 Corepack HOME，重新获取固定 pnpm，不依赖旧 SDK、旧 build-tools 或旧依赖 store。这不是新操作系统/虚拟机验证。

```sh
node node_modules/@shine-mage/dsh-plugin-kit/prepare.mjs \
  --destination /absolute/new-sdk-inputs \
  --ca-file /etc/ssl/cert.pem
```

测试实际目录由 `installed-r2.json`、`trial-r2.json` 记录，命令与安装步骤保存在 `bootstrap-proof-r2.mjs`。该驱动实际执行的是 `realpath` 后的已安装入口，上方为预期消费者用法；后续审核发现并修复 pnpm symlink 用法空跑，详见[审核记录](dsh-g0-kit-review-20261007.md)，不能把本次实际路径执行当作当时 symlink 已通过。成功回执副本为 `preparation-r2.json`：

| 输入/结果 | 实际值 |
|---|---|
| 官方源码 | `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 官方 tree | `e3e63253d1d35ad07f785273235c40813cb6c8bd` |
| 上游 lock SHA-256 | `5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa` |
| 实际运行 kit tarball SHA-256 | `8b96bb0f3e15d8a5e1a2e7084b04c9692fe510a8121771605c7c3ab2f442bc35` |
| 公共 CA SHA-256 | `9dae8d76e55cb08991f2b672d58999ea15560d910759c16b544f843bdffbb994` |
| 准备结果 | READY；26 SDK main/types 入口、32 bindings |
| 阶段耗时合计 | 497.779 秒，约 8 分 18 秒 |
| 主要耗时 | Git 取源码 96.577s；SDK install 85.826s；host build 63.965s；client build 53.953s；tools install 192.037s |

安装后的 13 个代码/锁/补丁文件与当时源码逐字节一致。package.json 只有 pnpm pack 正常移除 packageManager 和格式化的差异，其余字段相同；README 在验证期间补充了使用说明。`installed-code-binding*.json` 保留核对结果。这里的 SHA 是此次未提交开发包的输入追踪，不是 reviewed release/signature；后续审核修复的代码另行验证，不修改这个历史包。

## 发现的失败及修复

1. 第一轮固定源码下载、SHA/lock 校验通过，但 Corepack 下载 pnpm 时返回 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`。系统 curl 可验证同一公开地址；Node 默认信任和 `--use-system-ca` 仍失败，显式系统公共 CA 文件后 HTTP 200。增加可选 `--ca-file`：普通文件、大小受限、拒绝私钥，复制到自有目录并记录摘要，仅联网阶段使用 `NODE_EXTRA_CA_CERTS`。没有关闭 TLS、安装全局证书或修改版本钉。第一轮失败回执和日志仍在 `trial.json` 所指目录，`bootstrap-first.log`/`bootstrap-exit.json` 保留。
2. 新 SDK 下首次全部消费者构建/测试通过，但完整输入核对发现 `upstream/.git/index` 变化。定位到 workbench `host-leave-adapter.test.mjs` 的普通 `git status` 自动刷新 stat cache。改用 `--no-optional-locks` 并关闭 fsmonitor，kit 测试新增整组运行后的 index 不变断言。首次失败保护结果 `fresh-consumer-result.json` 保留；不是源文件或 SDK 二进制变动。

## 当前验证

```sh
node --test scripts/dsh-b0/plugin-kit-prepare.test.mjs \
  scripts/dsh-b0/package-manager-env.test.mjs scripts/dsh-b0/clean-build.test.mjs

# 两个路径都来自上面的新准备目录，Corepack 也使用同目录的新 HOME。
B0_BUILD_UPSTREAM=/absolute/new-sdk-inputs/upstream \
B0_BUILD_TOOLS=/absolute/new-sdk-inputs/build-tools \
node --test scripts/dsh-b0/plugin-kit.test.mjs

node --test scripts/dsh-b0/plugin-boundaries.test.mjs \
  scripts/release/plugin-boundary.test.mjs \
  scripts/release/cli.test.mjs scripts/release/release.test.mjs
node scripts/dsh-b0/plugin-boundaries.mjs --check
git diff --check
```

- `guard-tests-r2.log`：**16 PASS / 0 FAIL / 0 SKIP**，含真实子进程环境、拒绝覆盖、缺程序/非零/日志上限、超时后代回收、预取消、CA 输入和既有冻结安装回归。保护测试不联网，已纳入 B0。
- `fresh-consumer-fixed-tests.log`：**15 PASS / 0 FAIL / 0 SKIP**，包含 **10/10** 消费方的实际安装 kit 构建与既有测试。board-components、brand、query、board、crowd-action、funnel、waterfall、CRM、knowledge、workbench 均只携带自己的源码；后者含完整类型检查和 8 份既有测试文件。领域 tarball 保持原 `22245ab9…` 摘要。
- `fresh-consumer-fixed-result.json`：修复后 **123781 个 SDK/工具文件与链接记录**前后字节/链接目标一致，包括 Git index；没有借用旧 SDK 来补缺项。这里只认证 upstream/build-tools 内容，不把可变缓存目录计为不可变 artifact。
- `regression.log`：**67 PASS / 0 FAIL / 0 SKIP**，覆盖边界和 release/CLI 相关合同。
- 边界清单：**11 包 / 34 边 / 642 源文件 / 74 个测试级动态引用 PASS**；mjs 语法、文档链接与差异检查通过。
- `integrity.json`：旧 **1318** 个封存文件的字节/mtime 不变；candidate SHA `cb5a24e0…`、journal SHA `b9ef9b17…` 保持，journal 仍 seq 6。

临时消费者由测试回收；SDK 新输入与两轮准备日志保存在本次标记的自有目录，供后续复核和复用。没有安装后台服务。未执行全量 B0 pipeline、CRM 后端全量、真实模型/浏览器/业务 UAT、远端 CI、此新入口的 WSL 验收或生产切换。

## 下一顺序

此轮关闭 kit **自行准备固定开发 SDK/工具**的本机路径；同一 pin 可以复用该目录，普通插件改动不需要每次重建 DSH。尚未提供预编译 SDK 闭包、registry 分发或数字签名。

下一步仍为可校验的 SDK/工具闭包分发及新环境/目标 WSL 安装，然后继续 T5/T19 插件来源签名、SBOM/CVE/撤销，以及业务 UAT/G0/物理分仓。新的 WSL 必须实际跑本入口，不能沿用旧 rc1 恢复或首购服务的现场结果。
