# 独立插件作者输入验收（2026-10-08）

本轮在 `68845ad0dfce2737d5e7b017916f16d4c8ec5255` 上修复 workbench 的正式作者安装入口与测试夹具供给。在无相邻业务源码的 owned 目录，以 Node 24.19.0、pnpm 11.28.2、固定 received-r3 SDK 实际执行 `pnpm build`、`pnpm test`、`pnpm test:built` 与 `pnpm pack`。build 包含 host/client full typecheck；初次验收 35 基础、111 HTML、2 产物、25 合同和 11 领域包边界测试全部通过。随后 native review 确认的目的目录祖先 symlink 问题已修复并完整复验，领域包边界增加为 **12 PASS**，其余计数相同，全部 **0 skip**；最新路径、源码 SHA 和失败恢复见文末。该结果不代表发布、宿主激活或产品全量验收。

## 根因与正式路径

历史 `analytics-workbench/pnpm-lock.yaml` 仍是 registry 闭包，未包含后来新增的 private `@shine-mage/dsh-plugin-kit@0.1.0` 与 `@shine-mage/board-components@0.1.0`。pnpm 11 在执行脚本前校验依赖，旧入口因此触发安装，再因 CI frozen lock 与 manifest 不一致失败。真实失败保留在 `.context/checks/html-integration-20261008/build.log`。本轮旧入口重试也进入 registry supply-chain 检查并超时，记录为 `before-pnpm-build.log`；该超时不是另一份 frozen 失败证据。

本包新增 `author-inputs.mjs`，接收绝对的 kit tar、经核对的 kit SHA、原领域输入目录和全新目的目录。先校验 kit 原始 SHA，离线安装开发工具；再通过已安装 kit 的公开 `readPackagedLibrary`/`validatePackageLock` 校验消费者锁和领域 tar 的精确 SHA/身份。它复制本包源码及原领域 tar 到开发者 owned 父工程，在父工程设置本地 tar overrides，并生成开发专用锁。实际安装始终使用 `--offline --ignore-scripts --frozen-lockfile`；普通 build/test 不生成锁、不关闭 pin 或 frozen 校验。

插件源码 manifest 与原文件逐字节一致，private kit/board 声明仍为精确 `0.1.0`。本地 overrides、workspace、锁和输入归开发父工程所有，均未进入运行时包。`build.mjs` 在显式参数之后读取 `B0_BUILD_UPSTREAM`/`B0_BUILD_TOOLS`；Node、DSH pin、SDK closure 与工具版本仍由既有公开 kit toolchain 检查。

领域绑定新增标准 pnpm 虚拟 store 的只读复用：原锁 tar 先验摘要，现有链接及父目录必须符合 pnpm 普通目录结构，随后比较完整 manifest、lib 文件集合和每个文件字节。通过才沿用原路径；不覆盖或迁移 pnpm 安装，不创建另一份私有领域 store。原 `.shinemage-bundled` 绑定路径保持不变。

## 固定输入与输出

本机 owned 工作区：`/var/folders/tz/wswl3q3117v437rw68yd90gh0000gn/T/plugin-author-final-zU6oVP/author/plugin`。无相邻 kit/provider 源码；用于打包 kit 的临时源码副本在作者准备前已移除。日志与复现脚本位于仓库 `.context/checks/plugin-author-inputs-20261008/`。

| 输入/产物 | 精确身份 |
| --- | --- |
| Node / pnpm | `24.19.0` / `11.28.2` |
| SDK | `.context/checks/kit-sdk-v2-distribution-20261007/received-r3` |
| SDK closure SHA | `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4` |
| 本轮 kit tar SHA | `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901` |
| 原 board tar SHA（前后相同） | `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182` |
| 开发父工程 pnpm-lock SHA（负测恢复后相同） | `b9b62b11c90d787a52107e1c2cc07c6abce88dfaf76ce8ae44c5fcd84d8c405c` |
| 本轮 workbench tar SHA | `445565c63280e6ee7e97fbd101cf1db0b27e205654a5afbce5c89c3110eea936` |

领域原件为 `.context/dsh-b0/package-inputs/shine-mage-board-components-0.1.0.tgz`；owned 输入副本与原件逐字节相同。未重打领域原件或修改消费锁。kit tar 来自本轮受审源码的本地真实 `pnpm pack`，不是 registry 发布或签名证明。

最终 sandbox 禁止网络，禁止读取主仓的 `dsh-plugins/scripts/docs/backend/config/node_modules` 与旧 Desktop 仓库；SDK 与领域输入目录只读。作者准备阶段允许读本包源码，随后 build/test/pack 均在 owned 副本执行。sandbox 规则与全部 argv/cwd/env/exit 保存在 `validation.json`、`author-paths.json`、`artifact-audit.json` 和 owned `author.sb`。

## 实际执行

精确 Node 路径为 `/Users/hutou/homebrew/Cellar/node@24/24.19.0/bin/node`。环境来自 received-r3 的 `consumers-command.json`，另固定 `COREPACK_ENABLE_NETWORK=0`、`COREPACK_ENABLE_AUTO_PIN=0`、`COREPACK_DEFAULT_TO_LATEST=0`、`CI=1`、`npm_config_offline=true`、owned HOME/TMPDIR 与绝对 `DSH_PACKAGE_INPUTS`。普通用户入口见 [quickstart](../../operating/dsh-plugin-author-quickstart.md#workbench-独立作者安装固定本地输入)。

| 命令/阶段 | 实际结果 | 原始证据 |
| --- | --- | --- |
| `node author-inputs.mjs --destination <owned>/author --kit <owned>/kit.tgz --kit-sha256 <上述 SHA> --package-inputs <原目录>` | 两次真实 frozen 安装均通过；最后工作区安装 downloaded 0 | `author-prepare.log`；owned `author/logs/{kit-install,workspace-install}.log` |
| `corepack pnpm build` | PASS；host/client full typecheck 均通过 | `formal-pnpm-build.log` |
| `corepack pnpm test` | 35 基础 + 111 HTML PASS；0 fail/skip | `formal-pnpm-test.log` |
| `corepack pnpm test:built` | 2 PASS；0 fail/skip | `formal-pnpm-built.log` |
| `node --test src/free-page/resource/frozen-contract.test.mjs src/free-page/bridge/contract.test.mjs src/free-page/contract/schema.test.mjs src/free-page/source-index/source-index.test.mjs` | 25 PASS；0 fail/skip | `local-contracts.log` |
| `node --test scripts/dsh-b0/package-inputs.test.mjs`（仓库侧） | 11 PASS；0 fail/skip | `kit-domain-boundaries.log` |
| `corepack pnpm pack --out <owned>/workbench.tgz` | PASS；8 个正式成员 | `formal-pnpm-pack.log`；`artifact-audit.json` |
| `git diff --check` | PASS | 本轮终检 |

11 项领域测试中，新增正例真正执行 pnpm 离线 lock 创建及 frozen 安装，然后验证原链接、全部字节和锁未变。文件篡改、manifest 篡改、新增成员、symlink、FIFO、错误原 tar 和别名 `node_modules` 父目录均被拒绝；恢复后重新绑定通过。不是复制目录模拟 pnpm 安装。

5 项作者负测实际运行，见 `negative-results.json` 和 `negative-*.log`：

- 错 kit SHA：`AUTHOR_KIT_DIGEST`，未创建目的目录。
- 已存在目的目录：`EEXIST`，不接管旧工作区。
- owned manifest 加入未锁依赖：真实 `pnpm install --offline --frozen-lockfile --ignore-scripts` 返回 `ERR_PNPM_OUTDATED_LOCKFILE`；恢复 manifest 后锁字节未变。
- 错 SDK closure SHA：正式 `pnpm build` 返回 closure 身份错误；已有 `lib/index.js` 摘要未变。
- owned 合同夹具追加空格：`COORDINATOR_FIXTURE_DIGEST`；恢复后与原夹具逐字节相同。

最后核对 570 个作者源码/夹具文件与当前工作树一致。发布 tar 仅含五个 `lib/*.js`、`bundled-dependencies.json`、`cordis.patch.yml` 和 `package.json`；未包含 author 脚本、测试夹具、开发锁、kit 或输入 tar。pnpm pack 仅移除 manifest 的开发 `packageManager` 字段；其余字段与源 manifest 一致，所有版本声明无 `file:`/`workspace:`。

## 测试合同与失败恢复

此前 HTML fixture loader 向上搜索 AGENTS 或直接读主仓 docs/backend。现本包携带三个 test-only 原字节夹具，固定名字和 SHA，缺失或漂移硬失败，无主仓回退。`provenance.json` 记录 owner、合同版本、原始路径和基线 commit。

| 夹具 | SHA-256 |
| --- | --- |
| `frozen-contract-v0.json` | `076b63f4b43c4b06c4e2a7066e25456e7f30410e8b84f3ecf3da523bfe6dc517` |
| `d48-scope.fixture.json` | `37605e4391675f0f03cf76bbbecbcc4cd482519691aead9dec123b4811becfb8` |
| `analytics-page.openapi.json` | `aaba98882b5b3bd2b334cc4cafa740f7777035edacb2998695d7e29599655c05` |

本包 OpenAPI 测试验证固定已发布合同的 conformance；它不宣称当前 backend 生成一致性。仓库 `package-inputs.test.mjs` 第 11 项真实读取三个受追踪来源并逐字节比较，backend 或 docs 单侧变更会失败；既有 backend 离线生成检查继续独立负责生成一致性。

失败证据保留且未计入 PASS：初次本包 loader 路径多一层导致 `ENOENT`（`formal-pnpm-test-first.log`），修复后 formal 35+111 通过；第二次额外 schema 合同测试仍残留旧 `readFileSync` 调用（`local-contracts-second.log`），移到固定 loader 后 25 项通过。两次最终 sandbox 草案误阻断 SDK 祖先路径/目录读取（`formal-pnpm-build-sandbox-{first,second}.log`），属于 runner 规则错误；最终规则只封锁业务源码和输入写入，完整验证通过。产物核对初稿误要求 pnpm pack 保留 `packageManager`，查明 pnpm 标准裁剪后只允许这一字段差异，未修改产品实现。

本轮不改 toolchain.json、上游、SDK、pnpm manager、发布 manifest 或旧 registry lock；不启动 CRM/6677，不读取业务数据库，不调用真实模型。WSL/Windows、远端 CI、registry 发布、宿主启用和全 10 消费者重跑不在本证据中；边界 inventory 与最终集成审查由主 Agent 统一执行。

## Native review 后：目的目录真实路径修复与复验

独立 reviewer 证实旧 `relative(source, destination)` 仅按词法判断：外部目录中的父级 symlink 指向本包 `src/` 时，准备流程会将新作者目录写回源码。review 原件位于 `.context/checks/parallel-followup-20261008/native-review.md` 和 `destination-alias-probe.json`。

本轮后续只修改 `author-inputs.mjs` 的路径判定与 `package-inputs.test.mjs` 的对应回归。入口先取 `realpath(source)`，再以 `realpath(dirname(destination))` 加目标 basename 构成真实 destination，在任何写入前拒绝同路径或源内目标。后续写入使用该规范路径，仍由 exclusive `mkdir` 拒绝既有目标。没有改变安装、frozen、verifyDeps、kit 摘要或领域锁合同。

新增回归从当前真实脚本逐字节复制到独立夹具，在第一个包管理器调用前停止。先使用未修实现运行，结果为 **1 FAIL / 0 skip**：`source_was_written=true`、`destination_guard_rejected=false`。修后同一测试为 **1 PASS / 0 skip**：`source_was_written=false`、`destination_guard_rejected=true`。同时确认源码原文件与目录成员未变、合法外部父级 symlink 可进入准备、macOS `/var` → `/private` 不被误拒绝，重复目标仍 `EEXIST`。回归只写临时夹具；没有在仓库源目录注入错误再恢复。

失败与成功证据分别新增到 `.context/checks/plugin-author-inputs-20261008/destination-realpath/`，未覆盖前一轮结果：

- `author-inputs.before.mjs`：旧实现原字节，SHA `ff75e689d94f480ad52c41a044c9219a1bdca12f148b3d31a4dc052278901ebe`。
- `regression-before.log` / `regression-after.log`：真正回归的 FAIL → PASS。
- `regression-before-runner-failure.log`：首次调用漏传既有 `COREPACK_HOME`，before hook 尝试获取 pnpm 但证书失败；没有执行目的目录测试，不作为缺陷复现。补回固定 SDK 环境后才得到上述真实回归。
- `validation.json` / `author-paths.json`：新工作区全部 argv、cwd、env、退出码。
- `source-snapshot.json` / `artifact-audit.json`：源码与输入/产物核对。

最终真实作者准备也通过合法外部父级 symlink 传入目的目录：请求路径 `/var/folders/tz/wswl3q3117v437rw68yd90gh0000gn/T/plugin-author-realpath-wLhqOu/outside-alias/author`，规范插件目录为 `/private/var/folders/tz/wswl3q3117v437rw68yd90gh0000gn/T/plugin-author-realpath-wLhqOu/outside-parent/author/plugin`。在该目录完整重跑：

| 最新命令/检查 | 结果 |
| --- | --- |
| 真实离线作者准备与两次 frozen 安装 | PASS；沿用先前同一 kit 原 tar，未重打 |
| `corepack pnpm build` | PASS；host/client full typecheck |
| `corepack pnpm test` | 35 基础 + 111 HTML PASS；0 fail/skip |
| `corepack pnpm test:built` | 2 PASS；0 fail/skip |
| 上述 4 个合同/source-index 测试文件 | 25 PASS；0 fail/skip |
| `node --test scripts/dsh-b0/package-inputs.test.mjs` | 12 PASS；0 fail/skip，含新增目的目录回归 |
| `corepack pnpm pack` | PASS；仍为原 8 个正式成员 |
| 先前 5 项作者负测 | 全部预期拒绝并恢复；锁与已有构建产物未变 |
| 570 个源码/夹具文件快照比较 | 与当前源码逐字节相同 |

最新源码 SHA：`author-inputs.mjs` 为 `2ff08cddccc169b3123446a8a8218509ef60ab0ba2b5157d848c1c752c1b867b`；`package-inputs.test.mjs` 为 `999c1531d79540bbeab9fbf695f42c560fde5b781fa55f9711de181ff75bb4db`。上述 kit、SDK closure、领域原包、开发锁和最终 workbench tar 的 SHA 与前文全部相同；源 manifest 未变。源码再次冻结，后续边界 inventory、综合文档与提交仍由主 Agent 负责。
