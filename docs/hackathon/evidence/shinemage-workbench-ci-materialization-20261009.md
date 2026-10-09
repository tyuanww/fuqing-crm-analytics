# Workbench 固定 CI 输入准备与 Linux 实测（2026-10-09）

承接[上一轮审查](./shinemage-independent-de-git-ci-review-20261009.md)的 CI-PREPARED-HOSTED-MISMATCH，只推进既有 Workbench CI 输入缺口。主树起点为 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d` 加 106 项未提交内容，暂存区为空。没有扩大业务功能；原作者仓仅新增 8 个 CI 文件，原有 tracked 内容不变。

## 当前结论

**Workbench 可以从新建的固定输入目录完成严格构建。** 新目录通过固定 Git 源码、冻结 pnpm 锁和官方 npm tarball 准备，未复制旧 SDK 安装目录。随后禁网的消费者安装、输入预检、host/client 严格类型检查、构建、本包测试、链接检查和内容打包均通过。

这是本地 Docker 的 Debian bookworm / Linux x86_64 实测，运行于 macOS 的架构仿真环境；不是 Ubuntu GitHub Actions 或 WSL2 验收。正式远程 CI 仍 NOT_RUN。新配方消除了旧草案“全新 ubuntu runner 假定已有 /opt 闭包”的实现缺口；旧草案和原审查记录保留，已集成到 Workbench 作者仓，本地提交和远程执行仍未完成。

任务根：`/Users/hutou/.codex/tasks/shinemage-ci-materialization-20261009/`。
本轮机器摘要：[validation JSON](./shinemage-workbench-ci-materialization-20261009-validation.json)。日志、补丁、锁和内容包索引位于主树 `.context/checks/ci-materialization-20261009/`；未归档的安装缓存及全部原始失败目录继续保留在任务根。

## 固定输入及边界

| 输入 | 实际值 / 范围 |
|---|---|
| 消费者 | Workbench `cc1dd6a972c85bb0ef0d7f7131edd72e62335dc1` 的真实 `git clone --no-local`；新配方仅添加 CI 文件 |
| 运行时 | Node 24.19.0；配方脚本 Python 3.14.4；Linux x64 |
| 上游 | `477b4f420553e8a52c2fbccc464d7561b239c443`，tree 和锁摘要核对，tracked 源码始终干净 |
| 包管理器 | 上游 pnpm 11.7.0；作者 / build-tools pnpm 11.28.2；官方 tarball 的 sha512 和 sha256 固定 |
| kit / 领域包 | 仍为 `251383e1…c901` / `22245ab9…0182`，无修改 |
| SDK lib 输入 | 106 个官方包，1,482 个文件；逐包 registry integrity 校验，固定归档和成员清单 |
| 编译 | TypeScript 6.0.3、esbuild 0.25.12；原 host/client 检查和 `skipLibCheck: false` 保持 |

106 个包包含实际所需的 runtime、peer 及 client 类型引用。只读入口检查不是完整类型依赖证明：第一次严格检查发现缺失的 client 声明，补齐精确官方包后原代码通过。没有改业务类型或替换成宽松编译器。

源码仍是 kit 要求的固定 checkout；本轮未移除这一要求，也不是 npm-only 作者路径。准备脚本只在其未跟踪的 `lib/` 目录放置官方发布产物；不重建 DSH、不编辑上游 tracked 文件、不运行依赖生命周期脚本。该步骤不是证明官方 bundle 与源码 recipe 的变换相等，也不关闭 SDK 分发门禁。

准备阶段允许 GitHub/npm 网络，使用冻结锁和原包管理器安全策略。后续所有消费者步骤都在 `--network none` 容器中运行。容器只挂载本次任务根，没有主仓、旧 SDK 安装树或兄弟作者仓挂载；任务根内的固定源码、公开包归档及本轮验证副本可读，不声称整机不可读。

## 实际运行

先在全新的 Linux 目录完成安装及构建，再验证整理后的配方：`recipe-r3` 从另一个空根开始，以 Git 对象和已校验包缓存重新安装输入。缓存只是归档 / pnpm store，不是复制的 node_modules。最终消费者是另一个真实 clone `recipe-consumer`。

| 最终配方步骤 | 实际结果 |
|---|---|
| `prepare-fixed-inputs.py` | exit 0；固定源码、两套冻结安装、官方 lib 准备成功 |
| 输入保护测试 | 6 PASS；含旧根防覆盖、锁身份/重复包拒绝、损坏归档拒绝且 SDK 文件不变 |
| kit 离线安装 | exit 0 |
| 作者边界测试 | 5 PASS / 0 FAIL / 0 SKIP |
| `check-inputs.mjs` | exit 0 |
| 原 `plugin/build.mjs` | exit 0，host/client full typecheck 均通过 |
| `run-package-tests.mjs` | 23 文件，193 PASS / 0 FAIL / 0 SKIP |
| `check-links.mjs` | exit 0，0 个越界链接 |
| `verify-pack.mjs` | exit 0，8 个成员 |

最终命令、cwd、白名单环境、镜像身份、退出码在 `evidence/recipe-*/`，配方内部日志在 `recipe-r3/evidence/`。前面手工组装的通过数不与最终配方相加，也不与 macOS 或其他插件相加。

内容包为 `920183d4172d33915a00fab01af710296e8f6d0716971007fb4c1044f0e95c37`，441,102 字节。两次 Linux 输出同字节；8 个成员与此前 macOS 包 `74321fa0…` 同字节，但压缩归档不同。按新归档身份记账，不继承 candidate、headed、WSL 或正式 packPlugin 结论。

## 保留的失败

- 第一轮官方包获取有 5 个网络超时，84 个成功记录保留。后续只补缺失输入并复用已经核验的归档。
- 最初 runtime/peer 清单不足：两次 client 严格类型检查分别留下 43 和 7 条诊断；Host 已通过。补齐声明引用所需的官方包后通过，不修改插件代码。
- `recipe-r1` 在断网准备阶段遇到 pnpm 安全策略请求 registry 元数据。只停止本次拥有的容器，外层 exit 137，取消原因和原日志保留。最终配方正常允许准备阶段联网，不以离线选项规避策略。
- `recipe-r2` 安装通过后，在逐文件 Git 检查中出现一次目录归属错误。单独复查 UID/目录归属一致；辅助脚本改为一次读取 tracked 文件清单并在结束时再查状态，没有添加 safe.directory 例外或修改 Git 配置。后续全新 `recipe-r3` 完整通过。

## 可审查的交付

补丁：任务根 `patches/workbench-ci.patch`，SHA-256 `29b2ac4aff3eeb8ea6f85dadec94049ab9b24e99a07fb51a2c74533b4c92ac5c`。8 个新增文件：

- `.github/workflows/ci-full.yml`：Ubuntu hosted runner 上先准备输入，再执行完整消费者链；支持 push / PR / 手动触发。
- `scripts/ci/prepare-fixed-inputs.py`、`materialize-public-libs.py`、`preparation-guards.test.py`。
- `inputs/ci/identity.json`、`pnpm-inputs.lock.json`、`public-sdk-libs.lock.json`、`README.md`。

新配方在任务副本中完成运行，Python 语法和 workflow YAML 检查通过；对原作者仓 `cc1dd6a` 的 `git apply --check` 成功，应用前原作者仓干净且没有 remote。本轮已应用这 8 个新文件并核对与实测补丁同字节，原有 tracked 文件不变，暂存区为空；未 commit、建远程仓、push、PR、合并、发布或部署。建议作为一次 CI 输入准备事件提交：`chore(ci): prepare fixed Linux inputs for workbench`。

下一步是将这份已验证并应用的改动纳入 Workbench 的独立 Git 提交，再按对应授权执行远程仓 / PR / Ubuntu CI。其余插件要按各自合同核验该输入方案，不能自动继承 Workbench 的类型检查或测试结论。

SDK 分发仍 BLOCKED，产品 PARTIAL，release_ready=false。原候选 / journal、真实业务、真实 WeKnora、原有外审缺口与独立 DSH 升级均不由此关闭。
