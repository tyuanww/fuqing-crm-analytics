# D/E 五仓本地 Git 与 Workbench CI 输入（2026-10-09）

主集成树仍是 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d`。本轮开始时 porcelain 为 102 项，暂存区为空。主树只追加当前文档，不提交继承修改，不改产品源码、VERSION、旧 candidate 或 journal。机器摘要：[shinemage-independent-de-git-and-ci-20261009-validation.json](./shinemage-independent-de-git-and-ci-20261009-validation.json)。此前复核见[交接审查](./shinemage-independent-de-and-git-review-20261009.md)。

五个作者仓各有一笔无父提交。作者是 `tyuanww <tyuanww@users.noreply.github.com>`。没有 remote，没有第二笔提交。排他复制修复已在首次提交内。提交不含 `plugin/lib`、`node_modules` 或 store。五仓当前 build 没有单独 tsc，记为 NOT_IN_CURRENT_BUILD。

| 仓 | 分支与提交 | 文件 | clone |
|---|---|---|---|
| shine-query | `codex/shine-query-independent` `258a34490ec09c47397b55cf9d4e7c2a5bd04743` | 27 | `/Users/hutou/.codex/tasks/shinemage-leaf-independent-20261009/clones/shine-query-r1` |
| shine-board | `codex/shine-board-independent` `49b00e0871c16f489f99f0c8ed42d3378d1b2240` | 27 | `.../clones/shine-board-r1` |
| shine-crowd-action | `codex/shine-crowd-action-independent` `51f8088d798a0ce0f146e270fbc4dba4c3aec6ef` | 27 | `.../clones/shine-crowd-action-r1` |
| shine-funnel | `codex/shine-funnel-independent` `1c71c04bf2a5738ca3a00bb7e52d8b17cdd7218b` | 29 | `/Users/hutou/.codex/tasks/shinemage-chart-independent-20261009/clones/funnel-r1` |
| shine-waterfall | `codex/shine-waterfall-independent` `632867cb2ca1481ceae0a5f51ed8c95659d5ac7c` | 29 | `.../clones/waterfall-r1` |

clone 都由 `git clone --no-local` 创建，HEAD 与提交相同，没有 alternates。D 三仓提交含 `.github` 草案；E 两仓没有 workflow。草案在缺 `*_UPSTREAM`、`*_BUILD_TOOLS` 或 pnpm 入口时以 `FIXED_SDK_INPUTS_NOT_CONFIGURED` 停止，不是完整 CI。

## 真实 clone 结果

各组测试分开记账。共同固定输入是 Node 24.19.0、pnpm 11.28.2 显式入口、上游 `477b4f420553e8a52c2fbccc464d7561b239c443`、abc-resume build-tools、kit `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901`。E 两仓还使用 clone 内 board-components `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。

| 仓 | 通过步骤 | 本包测试 | 内容包 |
|---|---|---|---|
| query | install、check-inputs、build | lifecycle 2；boundary 5 | `f19fc60ce50f4a963367282031d7c2071258ba75e9bd5649de6530d605bae98d`，1431 字节 |
| board | 首次 install 0；profile-r2 的 check-inputs、build | lifecycle 2；boundary 5 | `0bcf6ed8310f97e65771df56a5940eb4d418a4d43a38a25c0eae05705173115c`，1514 字节 |
| crowd-action | install、check-inputs、build | lifecycle 2；boundary 5 | `dfbd9279394853aa8afca82391327b21c7e769d894b734c4860c509ad6918d94`，1600 字节 |
| funnel | install、check-inputs、build | 计算 2；lifecycle 1；boundary 7 | `ba1f9cd941d67447ee19e29eaf1810c27dfb6ac738da366584aab2a28148105d`，2409 字节 |
| waterfall | profile 修正后的 install、check-inputs、build | 计算 1；lifecycle 1；boundary 7 | `d98ee03ea678aacec87d1e6f39aecac43f741f728a90da5de1c5c0541fe021f9`，2871 字节 |

以上失败/跳过均为 0。board 首次 `steps/check-inputs.exit` 为 1：沙箱用 `file-read*` 拒绝了整个 worktrees，Node 对 `/Users/hutou/.codex/worktrees` 的 `lstat` 得到 EPERM。该日志保留。`profile-r2/` 改为只拒绝 `file-read-data` 后，预检到打包退出码 0。waterfall 的同类失败在 `sandbox-profile-realpath-fail/check-inputs/exit`，随后 `steps/` 退出码 0。

第二次同名写入：query、board、crowd-action 退出码 1；funnel、waterfall 退出码 2。首包摘要不变。摘要与审修留存包相同，因为打包字节相同，不继承 candidate、headed 或 WSL。formal packPlugin 为 NOT_RUN。

E 两仓公开 subpath 分别是 `./funnel` 与 `./waterfall`，指向 `lib/*.mjs` 和 `lib/*.d.mts`。两份 `.d.mts` 与领域包声明同字节。构建后的 `.mjs` 与领域包源码字节不同，包内 `.mjs` 与本次构建产物一致。

## 访问边界

五仓策略都是 `(allow default)` 后拒绝网络，再拒绝列出的产品树和作者仓内容，并只读放行上游与 build-tools。这不是整机 deny-default。

探针中 EPERM 的范围包括主树对应插件、`plugin-kit/toolchain.mjs`、五个 D/E 作者仓，以及 workbench/crm/knowledge 作者仓。固定上游与 build-tools 为 READ。

另外按路径记录为可读的副本：

- query：本任务 `evidence/shine-query/source-before/` 与历史 isolate tarball。
- crowd-action：`evidence/HANDOFF.md`、本插件历史 source-before 与 isolate tarball，以及 `/tmp/dsh-release-tag.tfu2qR`、`/tmp/fuqing-prod-build-r3`、`/tmp/dsh-release-r1.NRXFFY` 下的 `dsh-plugins/shine-crowd-action` 目录。
- waterfall：三个 shine-brand 作者/clone 的 `package.json`，图表任务 `HANDOFF.md`，funnel 与 waterfall 的历史内容包。
- funnel 探针 JSON 还保存了 macOS 文本编码变量 `__CF_USER_TEXT_ENCODING`，没有凭据。

## Workbench CI 输入

任务目录：`/Users/hutou/.codex/tasks/shinemage-ci-inputs-20261009/`。消费者 clone 是该目录下的 `dsh-analytics-workbench`，SHA `cc1dd6a972c85bb0ef0d7f7131edd72e62335dc1`，无 alternates。没有 commit，没有写入原作者仓。

`input-identity.json` 与 `prepare-inputs.mjs` 把三类输入分开：

- 官方 npm runtime 与公开编译包按 registry integrity 下载到 `public-npm/`。cordis 记录为实际版本 4.0.4，没有查询 `cordis@0.1.7-rc.2`。
- kit `251383e1…` 与 board-components `22245ab9…` 的 registry HTTP 为 404，仍使用提交内的 vendor tarball 与领域包。
- 上游源码按 `https://github.com/deepseek-ai/deepseek-harness.git` 的 `477b4f42` 取到 `source/upstream`，tree `e3e63253d1d35ad07f785273235c40813cb6c8bd`，锁摘要与固定输入一致。该树没有安装 `node_modules`。`check-inputs-source-only` 退出码 1，停在 `inspectToolchain` 对 `apps/web/package.json` 解析 `vite/package.json` 时的 `MODULE_NOT_FOUND`。这一次失败保留，没有再查同一缺口。

本机已准备输入的全链在 `evidence/run-prepared/summary.json`，平台 darwin/arm64，每步 status 0：边界测试、离线安装、预检、`plugin/build.mjs`（日志含 host/client full typecheck passed）、23 文件 193 项、链接检查、内容包。包为 `74321fa09edb178e6cb7c781811cf3923643cfbda944211c36d2642974b9423e`，438782 字节。这条链路读取的是本机既有上游 checkout 和 abc-resume build-tools，不是用刚下载的源码树代替它们。同一 SHA、同一锁和同一平台闭包可以复用；版本、锁或平台二进制变化才需要重新准备。

`patches/ci-prepared-runner.yml` 与 `patches/require-prepared-inputs.mjs` 尚未应用到作者仓。workflow 只在 `workflow_dispatch` 下运行，并要求 runner 自己已经放好 `/opt/shinemage/inputs/477b4f420553e8a52c2fbccc464d7561b239c443` 的 upstream 与对应平台 build-tools。macOS 的 esbuild 可选包不能充当 Ubuntu 的 `@esbuild/linux-x64`。文件头写明 NOT EXECUTED。Ubuntu 与 GitHub Actions 为 NOT_RUN。没有持久 runner，没有远程 secret，没有发布 SDK。

SDK 分发仍 BLOCKED。它没有被当作本机这次构建的暂停条件，也没有被包成 CI 缓存放行。产品保持 PARTIAL，`release_ready` 为 false。远程建仓、push、PR、合并、宿主验收、真实业务和发布均未执行。
