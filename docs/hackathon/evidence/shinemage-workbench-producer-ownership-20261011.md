# Workbench 作者验证归属接续（2026-10-11）

主仓基线 `5390667cc990fa558b0445aa455b086d325a6c77`，作者仓基线 `92dfa171cf8ea298bdceee5634b418269e711a37`。本轮没有 commit、push、PR、合并、发布、部署或删除。机器记录见[validation JSON](shinemage-workbench-producer-ownership-20261011-validation.json)；主仓客户端消费的历史边界见[原生 prompt 记录](shinemage-workbench-native-prompt-pack-20261011.md)。

## 归属与实际改动

作者仓 `scripts/run-package-tests.mjs` 新接入四个既有文件：`loader.test.mjs`、`skills-loader.test.mjs`、`query-skills-loader.test.mjs`、`sessionless-view-dom.test.mjs`。这四文件及既有 built 检查均逐字节未改；不降低断言、不增加 skip。Loader 检查读取本仓 Host 输出，skills 检查读取未公开的 `skills.js`，独立视图没有进入发布 files；这些内部检查由作者仓承担，主仓不能绕过 exports 或临时扩充发布内容。

官方固定输入锁从 106 包/1,482 个 lib 文件扩到 113 包/1,532 文件。原 106 条记录逐项相等；七个新增包均为 `0.1.7-rc.2`：AgentLoop、AgentLoop testkit、tool-skill、skill-filesystem、token-meter、compaction-basic 及其 compaction-tool-result-pruner 依赖。metadata、tarball、SHA-512 integrity 与 lib 摘要已核对；不执行包安装脚本、不编译或修改上游源码，也不复制主仓业务实现。新锁在无 node_modules/lib 的真实源码 clone 中按归档缓存重放成功；这不是 fresh pnpm SDK 安装或 SDK 分发证明。

## 实测分层

| 记录 | 范围 | 结果 |
|---|---|---|
| linux-r4 producer-tests | 四个原作者入口，真实固定 Cordis Loader/AgentLoop/compaction | 8 PASS / 0 FAIL / 0 SKIP，exit 0 |
| linux-r4 package-tests | 实际作者入口，同次 28 文件 | 204 PASS / 0 FAIL / 0 SKIP，exit 0；包含上述 8，不加总 |
| linux-r4 preparation-guards | 实际准备 CLI 的坏锁、坏包、防覆盖等 | 6 PASS，exit 0 |
| linux-r4 build | host/client 严格类型检查与构建 | exit 0，skipLibCheck 未放宽 |
| lock-replay-r1 | 113 包锁，源码 clone，归档缓存 | exit 0；无已安装 SDK 复制进该 clone |
| content-pack-r2 | 本次修复后作者输出，普通内容包 | exit 0，8 成员，441127 字节，SHA-256 `f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7` |
| existing-content-pack-r1 | 同名第二次写入 | 预期 exit 1 / EEXIST，首包摘要不变 |

Node `24.19.0`、Python `3.14.4`、pnpm `11.28.2`；固定 DSH `0.1.7-rc.2` / `477b4f42`。本地 Docker Linux x64 使用已有固定镜像。消费者为作者提交的真实 `--no-local` clone，加上明确的未提交运行 peer 修复、测试入口和输入锁；没有把这些字节说成干净提交。

执行挂载只提供本次消费副本、固定 DSH/build-tools 和新的本地输入副本。列明主仓、原 Workbench/CRM/Knowledge 作者目录在容器中为 ENOENT；这不是对整台 Mac 的 deny-default 沙箱。SDK 验证使用本地已安装的固定闭包副本，加上本轮 integrity 校验的官方 lib；不宣称完整空 runner 准备或 GitHub Actions 通过。模型 adapter 与内核 fetch 仍为合成夹具；loader 的临时 bridge 仅在本次容器内，测试 Context dispose 后容器退出，不触及本机端口或无关进程。

## 失败保留与当前开放项

linux-r1 为 5 PASS / 2 FAIL，skills 文件因固定输入缺 lib 未启动。linux-r2/r3 被 Docker 单独挂载 Git 根后的归属检查拒绝；更正为挂载父目录后，实查 UID、工作目录与 .git 均为 501，未设置 safe.directory 例外。linux-r4 首次内容包因 harness 未准备 CONTENT_PACK_OUT 失败；补本次目录后仅重跑该打包步骤，不重跑已通过测试，旧失败不改写。另保留一次 Python orchestration 的 __file__ 缺失，未执行产品命令。

主仓全部产品增量仍与本轮起始字节相等，七个旧生产者入口仍在：built Host、loader、skills-loader、query-skills-loader、sessionless-view、native-board-auth、lane-g。四个入口只是完成作者仓本地接线和验证；提交、对应 CI 和主仓切走重复执行尚未完成，不能删副本或声称默认完整 B0 脱离源码。Workbench/CRM/知识源码构建、其他历史输入守卫、完整宿主和原正式包缺运行 peer 的问题仍按各自证据开放。

18 份既有正式 manifest/归档及 candidate/state 摘要未变，没有新正式 pack、candidate 或 journal。本次新内容包不能继承旧正式包的 headed/WSL/服务/回退身份。新 hosted CI、live CLI reload、当前目标与浏览器、真实模型/CRM/WeKnora/UAT、独立发布和 DSH 升级未执行；SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION `0.20.0.0`。

原始材料：`/Users/hutou/.codex/tasks/shinemage-workbench-producer-ownership-20261011-io4yqx4a/`。失败日志、metadata、113 份包归档、新旧锁比较、只读输入和成功日志均保留；仓库只收本说明和机器索引，不收 SDK 安装树或归档。
