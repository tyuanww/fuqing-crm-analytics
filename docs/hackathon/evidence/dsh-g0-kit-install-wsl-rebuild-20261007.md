# kit 独立安装与 WSL rc1 重建（2026-10-07）

基线：`codex/plugin-boundary-review`。此前 27 文件已通过正常 hooks 本地提交 **`cc1d8497b20d6ebe1738fd3f53efd0f4a1e292ad`**，提交前定向测试 26 PASS，提交后工作树干净。本页记录随后增量，不把后续未提交代码归入该提交，也没有 push、发布或生产激活。

## kit 独立安装子项

`shine-brand/build.mjs` 改用 `@shine-mage/dsh-plugin-kit/toolchain` 公开导出，manifest 固定开发依赖 `0.1.0`。不改品牌/UI/运行时入口；其他叶子包逐项迁移，不一次切换所有构建方式。

- 实际 pnpm `11.7.0` 对本地 kit tarball 执行 `install --offline --ignore-scripts --ignore-workspace --config.auto-install-peers=false`，使用全新 store 与隔离 HOME。kit 没有 registry 依赖；Corepack 本体与固定 SDK/build-tools 仍由已准备环境提供。
- 临时父工程保存本地 tarball 安装声明，原 shine-brand 源码位于其下独立目录；**没有相邻 plugin-kit 源码目录**。通过标准 Node 包解析完成预检、原插件构建及原测试；错误 kit 版本在构建前拒绝，已有产物不变。
- 仓库内显式 `plugin-kit-link.mjs` 仅为开发建立当前 kit 链接，核对身份/版本/导出和 dev-only 声明，重试不改变同一链接；外部安装、错误声明、父目录 symlink 拒绝覆盖。B0 pipeline 与 release preflight 的 build 阶段同步调用，只读检查不链接。
- 边界扫描现在区分 dev kit 与会打入 runtime 的领域包：kit 公开导出只允许精确开发依赖的构建入口使用，运行时代码、未导出子路径、错误版本和未打包导出拒绝；kit 不能进入业务 `bundled-dependencies.json`。原领域 lock 仍校验 digest/版本/来源。

首次检查确实失败：旧 inventory 规则错误地要求新增 kit devDependency 提供领域包 lock，报 `BOUNDARY_BUNDLED_LOCK_REQUIRED`（两项测试失败）。已修正分类并增加对应负测；保留 `kit-tests-first.log`，未覆盖为成功。

实际命令（Node 24）：

```sh
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" node --test \
  scripts/dsh-b0/plugin-kit.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs \
  scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/package-inputs.test.mjs \
  scripts/dsh-b0/clean-build.test.mjs scripts/release/plugin-boundary.test.mjs
node --test scripts/release/cli.test.mjs scripts/release/release.test.mjs
node scripts/dsh-b0/plugin-boundaries.mjs --check
```

结果：**34 PASS / 0 FAIL / 0 SKIP**（`kit-tests-fixed.log`），release CLI/核心回归 **53 PASS / 0 FAIL / 0 SKIP**（`release-entry-tests.log`）。边界清单 11 包、31 边、640 文件通过。没有运行需要 clean reviewed commit 的全量 preflight，也没有重新运行全后端或全部 release suite。

## WSL 现场范围

本轮原始证据根：`.context/checks/postcommit-kit-wsl-20261007/`。第一次 SSH 连接超时；Tailscale 显示节点在线，ping 经 DERP(sfo) 中继返回、直连未建立。增加一次有界连接等待后 SSH 成功，进入实际 WSL2 x86_64；current 仍为 `dsh-0.20.0.0-r3`。这证明该次连接恢复，不能把在线状态等同稳定 SSH/直连。

隔离 runner 以已提交 `cc1d8497` 的四个恢复控制器和安全解包器逐字节绑定；新建 `/tmp/owned-rc1-rebuild-ifg9_5iq`。构建使用 nobody/独立 HOME/Corepack/store、nice 10，从官方仓库获取精确 rc1 SHA/树/锁，执行冻结安装和官方 host/native 构建；不更改旧 checkout 或系统 pnpm，不把测试编译结果部署为生产 artifact。rc2 继续下载并校验原不可变 runtime。

实际结果：固定 pnpm **11.7.0**，source fetch 6.123 秒、冻结安装 74.051 秒、官方 host 构建 87.879 秒、native 构建 0.715 秒，均退出 0。系统原 pnpm 为 11.19.0，新流程只使用隔离目录中的固定版本，未升级或替换系统工具。

| 语料 | WSL 结果 | 冷进程 | 矩阵耗时 |
|---|---|---|---|
| text | 4/4 PASS | 10 | 1.016 秒 |
| tool | 4/4 PASS | 10 | 1.066 秒 |
| rich | 4/4 PASS | 10 | 1.467 秒 |

每组包含 rc2 torn-tail 恢复、rc1→rc2 读/续写、rc2→rc1 只读、保留旧状态的回退。所有状态为自有合成会话，没有真实模型/工具/子代理执行。新 rc1 四个 package/JS 主入口与原 WSL 记录相同；完整构建来源由新源码/锁和安装/编译日志记录，不再依赖未知旧编译过程解释本次矩阵。

`rc1-rebuild/collection.json`：**133 个文件**取回逐项验证，结果 archive SHA-256 `6af8d977238d502dda424f872ef6621b7af344f7c070b75985aa3b876836aa78`。`retrieved/build-provenance.json` 绑定 source/tree/lock、pnpm、UID 与完整源码/依赖/输出清单摘要；`integrity.json` 证明 **98040 个新构建输入、30147 个原 rc2 输入、五个控制器及 runtime archive 不变**，原 rc1 四入口和生产快照不变。输入清单摘要 `6c86d24b94494184d681e69a039f784fcc3e42dff7a73b7ebcf16418ce4c9e45`。

这关闭 T2 的“新可追踪 rc1 输入 WSL 三语料验证”子项；仍为未签名操作者构建记录，`signed_provenance=NOT_VERIFIED`、`production=NOT_RUN`、`release_ready=false`，不能替旧构建补造历史签名。

回收完成：`rc1-rebuild/cleanup.result.json` 先核对完整结果 archive 摘要及专属 marker，再确认没有本次进程，删除且只删除本次临时目录。前后生产 current 与五个监听/PID 快照相同，current 仍为 r3；旧版本、runtime、业务数据和原 release 均未删除。后续重跑必须重新建立隔离输入，不能引用已回收的远端目录。

## 本轮审查

按 OCR delegate 的文件/规则清单由当前 Agent 审查源码、调用方、生成清单和文档，包含 pipeline/preflight 两个实际构建入口；最终覆盖/文件摘要见同目录 `review-final.json`。修正了 kit/领域依赖分类与正式 preflight 接线后，当前范围没有未关闭高/中严重度代码发现；剩余平台分发/签名/业务验收不是已通过。语法、差异和新增文档链接另行核验，已有候选/journal 仍保持。

## 仍未关闭

- 其余插件迁移到 kit 公开包导出、SDK/工具闭包分发、整台干净机器安装、kit registry/签名交付；当前只关闭一个实际消费者的本地独立安装子项。
- T2 完整事件组合、真实附件/子代理执行、0.2.0 生命周期，以及签名来源信任；本机或 WSL 观察不自动放行生产。
- T5/T19 插件签名/SBOM/CVE/撤销，真实身份/模型/UAT、production canary/rollback/G0 stop-go；物理分仓按原门禁推进。

结果年龄继续采用历史快照与保存时校验，没有恢复阈值待办。旧 1318 个封存文件及 candidate/journal 保护检查通过，journal 保持 seq 6；新 kit 本地测试不改变原候选。
