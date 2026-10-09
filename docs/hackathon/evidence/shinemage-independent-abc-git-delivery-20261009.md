# 三个独立作者仓的本地 Git 交付与真实 clone（2026-10-09）

主集成树仍是 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d`，`origin` 为 `https://github.com/tyuanww/fuqing-crm-analytics.git`。本轮开始时 porcelain 为 98 项、暂存区为空。本轮只追加当前汇总和证据，不提交主树，不改产品源码、VERSION、旧 candidate 或 journal。机器摘要：[shinemage-independent-abc-git-delivery-20261009-validation.json](./shinemage-independent-abc-git-delivery-20261009-validation.json)。此前审修见[交接审查](./shinemage-independent-abc-review-20261009.md)。

三个作者仓各有一笔无父提交的首次功能提交，作者为 `tyuanww <tyuanww@users.noreply.github.com>`。提交时没有使用 `--no-verify`；这三个仓没有安装 hook。没有第二笔 fix 提交：r2 clone 没有发现缺文件。`CONTENT_PACK_OUT` 的独占写入已经包含在首次提交里。

| 仓 | 路径、分支、提交 | 提交内容 |
|---|---|---|
| analytics-workbench | `/Users/hutou/.codex/tasks/shinemage-workbench-independent-20261008/dsh-analytics-workbench`；`codex/analytics-workbench-independent`；`cc1dd6a972c85bb0ef0d7f7131edd72e62335dc1`；tree `8877b255e8b882607c0c51d9118d604c52f7bb8f` | 609 个文件：`plugin/`、`scripts/`、`inputs/`、`vendor/`、`pnpm-lock.yaml`、`DEVELOPMENT.md`、`README.md`、`.github/workflows/ci.yml`。包 ID `@shine-mage/dsh-analytics-workbench-b0@0.0.0-b0` |
| crm-knowledge | `/Users/hutou/.codex/tasks/shinemage-crm-independent-20261008/dsh-crm-knowledge`；`codex/crm-knowledge-independent`；`12b8259351d7e64429336faca96a175aad77d517`；tree `64a9e3bff6405ac03ef281f8569b20fec1f9adcd` | 65 个文件，含插件源码、锁、构建入口、合成夹具说明和 workflow。没有 `main`。包 ID `@shine-mage/dsh-crm-knowledge@0.0.0-crm.1`，cordis peer 精确 `4.0.2`。`board_tools` 仍是 `status` / `execution` / `reason` 对象 |
| knowledge | `/Users/hutou/.codex/tasks/shinemage-knowledge-independent-20261008/dsh-knowledge`；`codex/knowledge-independent`；`d9e26776905cc00f57c550dd08318e37ee1d1b21`；tree `12f0f760d45dd0b1524a55ea2ff9841abafa53a5` | 40 个文件。审修中的 `scripts/isolate-verify.sh`、`scripts/author-boundary.test.mjs`、`plugin/test/identity-lease.test.mjs` 直接在这笔提交里。没有 `main`。包 ID `@shine-mage/dsh-knowledge@0.0.0-candidate.1`，peer 为 dsh-tools `0.1.7-rc.2` 与 cordis `4.0.2`，合同 `shinemage-knowledge-access/v1` |

三仓 `git status` 都只有对应分支、无已跟踪改动、`git remote` 为空。提交消息分别是 `feat(workbench): add independent plugin author repository`、`feat(crm): add independent plugin author repository`、`feat(knowledge): add independent plugin author repository`。

## 真实 clone

每仓命令形式为 `git clone --no-local <作者仓> <任务根>/clones/r2`。clone HEAD 与上表 SHA 相同，`.git/objects/info/alternates` 不存在。提交树不含 `lib/`、`node_modules/` 或旧 store；这些目录是 r2 安装和构建之后的产物。

隔离完整的证据目录：

- `/Users/hutou/.codex/tasks/shinemage-workbench-independent-20261008/evidence/git-delivery-20261009-r2/`
- `/Users/hutou/.codex/tasks/shinemage-crm-independent-20261008/evidence/git-delivery-20261009-r2/`
- `/Users/hutou/.codex/tasks/shinemage-knowledge-independent-20261008/evidence/git-delivery-20261009-r2/`

每份证据含 `clone-argv.txt`、`sandbox.sb`、`probe-before.txt`，以及 `steps/<name>/{argv.txt,cwd.txt,env.txt,stdout,stderr,exit}`。环境文件只保留白名单：Node 24.19.0 的 PATH、`LC_ALL=C`、Corepack 网络开关、各仓 pnpm 入口、`B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS`、`DSH_PACKAGE_INPUTS`、clone 内 `HOME` 和证据目录 `TMPDIR`。没有保存完整环境或凭据。

固定输入：

| 输入 | 值 |
|---|---|
| Node | `/Users/hutou/homebrew/opt/node@24/bin/node`，24.19.0 |
| pnpm | 11.28.2，三仓都使用已核验的 `pnpm.mjs` 绝对路径 |
| 上游 | `/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics/.context/dsh-b0/upstream-0.1.7-rc.2`，`477b4f420553e8a52c2fbccc464d7561b239c443` |
| Workbench / CRM build-tools | 主树 `.context/checks/abc-resume-20261008/build-tools` |
| Knowledge build-tools | 主树 `dsh-plugins/plugin-kit/build-tools`；r2 策略同时只读放行 abc-resume build-tools，探针也读到了该 `package.json` |
| kit | SHA-256 `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901` |
| Workbench 领域包 | SHA-256 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182` |

## r2 结果

下表只属于这次 clone。各组单独记账，三仓之间、以及与 r1 或更早日志之间都不相加。

| 仓 | 退出码 0 的步骤 | 本包测试 | 内容包 |
|---|---|---|---|
| Workbench | install、check-inputs、build | 23 个文件，193 pass / 0 fail / 0 skipped | `74321fa09edb178e6cb7c781811cf3923643cfbda944211c36d2642974b9423e`，438782 字节，8 个成员 |
| CRM | install、check-inputs、build | 103 pass / 0 fail / 0 skipped；守卫 11 未重跑 | `39c3bd893f4535167d90adb57773ad96b72136b64086685603fc3b0937812914`，242766 字节，6 个成员 |
| Knowledge | install、check-inputs、build | graph 22、service-client 5、package 5、identity 12、author-boundary 5；各组 0 fail / 0 skipped | `74ded7db78008b146e825b0620e14e70775630b34205050670c25718d1b6ce2c`，16844 字节，5 个成员 |

构建日志分别写有 `B0 host full typecheck passed`、`B0 client full typecheck passed`、`CRM candidate typecheck and pinned build passed`、`Knowledge candidate typecheck and pinned build passed`。预检确认上游 SHA、kit 摘要；Workbench 同时确认领域包摘要；CRM 确认 cordis peer `4.0.2` 且 `cordis_peer_widened` 为 false，上游实际 cordis 为 4.0.4；Knowledge 记录 `live_weknora`、`live_neo4j`、`formal_candidate` 为 NOT_RUN。

内容包成员：

- Workbench：`package/package.json`、`package/bundled-dependencies.json`、`package/cordis.patch.yml`、`package/lib/index.js`、`package/lib/tool.js`、`package/lib/skills.js`、`package/lib/page-tools.js`、`package/lib/client.js`。`formal_pack_plugin` 为 NOT_RUN。
- CRM：`package/README.md`、`package/cordis.patch.yml`、`package/lib/client.js`、`package/lib/host.js`、`package/lib/index.js`、`package/package.json`。`formal_pack_plugin` 与 `candidate` 为 NOT_RUN。
- Knowledge：`package/README.md`、`package/cordis.patch.yml`、`package/lib/graph-tools.js`、`package/lib/index.js`、`package/package.json`。`formal_pack_plugin` 与 `live_weknora` 为 NOT_RUN。

三份 tarball 都在对应 `evidence/git-delivery-20261009-r2/pack/`。第二次写入退出码为 1，错误是 `EEXIST`，第一次摘要保持不变。摘要与审修回执相同，是因为本次打包字节相同；这不重建已删除的历史 tarball，也不继承 `295b234a`、`a0d5dd08`、`b75d90`、旧 headed 或旧 WSL。

## 访问边界

r2 探针在安装前退出 0。三仓都是 EPERM 的路径：主树 `STATUS.md`，主树 knowledge、crm-knowledge、analytics-workbench 的 `package.json`，plugin-boundary-review 的 shine-board `package.json`，`plugin-kit/toolchain.mjs`，三个原作者仓的 `package.json`，以及该仓自己的 `clones/r1/package.json`。

三仓都 READ 的路径：自己的 `clones/r2/package.json`、上游 `package.json`、abc-resume build-tools 的 `package.json`。Knowledge 额外 READ `dsh-plugins/plugin-kit/build-tools/package.json`，这是它声明的 `B0_BUILD_TOOLS`。策略拒绝写入这些固定输入。

r2 先 `(allow default)`，再拒绝 `/Users/hutou/.codex/worktrees`、`/Users/hutou/Desktop/ai-engineering`、三个作者仓和三个 r1 clone 的文件内容，然后只读放行上游和适用 build-tools，并放行自己的 r2 clone 与证据目录。Workbench 拒绝全部网络。CRM 与 Knowledge 拒绝网络后再放行 localhost。这不是 deny-default 的整盘沙箱。

r1 保留在各自 `evidence/git-delivery-20261009/` 与 `clones/r1/`。Workbench r1 拒绝全部 worktrees 和本作者仓，但没有拒绝另外两个作者仓。CRM r1 在 `(allow file-read* (subpath "/"))` 之后只拒绝主树、plugin-boundary-review、Desktop 和本作者仓。Knowledge r1 在 `(deny default)` 后使用 `(allow file-read*)`，再拒绝主树、本作者仓和 Desktop。三份已保存 r1 探针都没有探测另外两个作者仓，因此 r1 只证明它实际探测到的 EPERM。功能链保留，不与 r2 合并计数。

## 远程仓与完整 CI

三个作者仓的 remote 都是 NONE。GitHub Actions、远程 clone、push、PR、合并、发布和部署都是 NOT_RUN。workflow 已随首次提交入库，输入供应仍 OPEN：

- Workbench `.github/workflows/ci.yml` 在 ubuntu-24.04 上安装公开 pnpm 11.28.2、离线安装 vendored kit，并运行 `scripts/source-boundary.test.mjs` 与 `scripts/build-input.test.mjs`。文件第 34–35 行写明托管 runner 没有固定上游 checkout 或已安装 build-tools，该 workflow 不构建、不做类型检查、不跑包行为测试、不做内容包。它不是完整构建 CI。
- CRM workflow 把 `vars.CRM_BUILD_UPSTREAM`、`vars.CRM_BUILD_TOOLS`、`vars.CRM_PNPM_ENTRY` 映射到构建环境。下一步用 `test -d` 和 `test -f` 检查它们。变量不会创建 checkout、build-tools 或 pnpm，job 也不下载 DSH。缺任一项时 job 在类型检查之前失败。类型检查、构建、测试和内容包门禁仍在文件中，没有改成 guard-only。
- Knowledge workflow 只有 `workflow_dispatch`。`scripts/check-runner-inputs.mjs` 在 `B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS` 或 `KNOWLEDGE_PNPM_ENTRY` 为空时打印 `FIXED_SDK_INPUTS_NOT_CONFIGURED` 并 `process.exit(2)`。这一步不拉取 DSH，也不跳过后面的类型检查；后面的步骤因为 runner 没有这些制品而到不了。

SDK 分发仍是 BLOCKED。本轮没有新的 SDK 全量审计，没有改上游，没有关闭 TLS，也没有绕过版本或摘要检查。完整公开依赖严格编译仍是 NOT_VERIFIED。产品保持 PARTIAL，`release_ready` 为 false。
