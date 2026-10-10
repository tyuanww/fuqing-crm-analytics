# rc1 可追踪重建与 kit 包边界（2026-10-07）

状态：**本机新 rc1 构建/恢复通过；kit 本地包与预检通过；G0 仍 PARTIAL**。工作树 `codex/plugin-boundary-review`，HEAD `418edc29`；保留之前 17 个未提交文件。本轮没有提交、推送、发布、杭州操作或业务数据访问，没有修改官方源码、现有候选或 journal。

## rc1 来源补证

在全新 `.context/checks/rc1-build-provenance-20261007/source` 从官方仓库取回精确 commit `46a7f68b0922371ce7144b668b90e377d8e799f4`。Node `24.19.0`、pnpm `11.7.0`，rc1 锁文件 SHA-256 `f561d4d2b02ca15f94fc9177500ab4646c38d847cf1c52ac50bd4022690d2f50`。源码 tracked clean，未把 rc2 依赖或旧编译输出复制过去。

本轮目录中的 `prepare-online.mjs` 使用隔离 HOME、现有固定 Corepack 与 store，执行 `pnpm install --frozen-lockfile --ignore-scripts --config.optimistic-repeat-install=false --registry=https://registry.npmjs.org`。`install-online.log` 记录 **1678 条锁文件依赖通过供应链策略、安装退出 0**。这里的包管理器策略检查不等于本项目 T5 的 SBOM/CVE 完整门禁。

随后分别执行官方 `pnpm run build:lib:host` 与 `pnpm run build:native-system`，没有自行改写编译流程；`build.mjs`、`build-native.mjs` 和日志保留。原生文件锁通过官方 C 源码与本机 Node-API headers 编译。

调查中实际发生并修复的问题：

1. 隔离 HOME 的 Corepack 缓存路径最初指错，触发下载并报 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`。改为已存在的固定缓存，没有全局安装或升级。
2. pnpm 的 offline 安装仍发起 registry metadata 策略查询，并遇到同一 CA 错误；只停止该次自有安装进程，保留 `install-offline.log` 和 `install-stop.json`。
3. 系统 curl 的 TLS 校验成功，Node `tls.getCACertificates('system')` 却返回 0。用系统自带 `/System/Library/Keychains/SystemRootCertificates.keychain` 的公开根证书生成本轮 `system-roots.pem`，只通过子进程 `NODE_EXTRA_CA_CERTS` 使用；Node 探针恢复 200，随后冻结在线安装成功。未关 TLS、未修改系统信任或用户配置。
4. 首轮恢复缺少新源码树的 `system.node`，保留三份 `matrix-*` FAIL 回执；补跑官方 native build 后三组 `verified-matrix-*` 通过。没有把失败目录覆盖成成功。

## 新输入的恢复证据

封存构建输入后，再运行 `matrix-sealed.mjs`；三个 `sealed-matrix-*` 目录均为本轮新建，仅使用合成会话。rc2 来自既有固定本机 `477b4f42…` checkout，不修改其源码或编译输出。

| 语料 | 本机结果 |
|---|---|
| text | 四项 PASS、10 个冷进程 |
| tool | 四项 PASS、10 个冷进程 |
| rich（附件引用/委派元数据） | 四项 PASS、10 个冷进程 |

每组四项是 rc2 截断恢复、rc1→rc2 读/续写、rc2→rc1 读、保留旧状态回退。合计 **12 场景 / 30 冷进程**，不是实际模型、工具、附件服务或子代理执行。`inputs-before.json` / `inputs-after.json` 的 **99839 个文件/链接条目保持一致**，文件总字节 1987953557；只封存本轮新 source 树，未扫描业务库。源码与依赖较大，保留供后续受控目标平台验证，不混入插件包。

`build-provenance.json` 绑定源码/tree/lock、Node/pnpm/C 编译器、输入清单摘要、实际命令/日志摘要、恢复控制器摘要和结果。新编译的 cordis、session、persistence-jsonl、subagent 四个 package manifest 与 JS 主入口摘要均与上次杭州记录一致。

这关闭“可追踪新 rc1 输入的本机验证”子项，**不补造旧二进制的历史签名**：receipt 明确保留 `signed_provenance=NOT_VERIFIED`、`old_wsl_compiled_closure=NOT_VERIFIED`、`wsl_new_build=NOT_RUN`、`release_ready=false`。四入口相等不能证明旧 WSL 所有依赖/原生二进制相等，新 Mac 构建也不等于 WSL 构建。

## kit 改动与实际验证

- `inspectToolchain` 从 `bindToolchain` 提取为共享只读检查，所有固定输入通过后才执行编译工具和写插件链接。
- 26 个 SDK 的 package identity、main/types 文件存在性与路径边界在构建前验证；禁止缺入口、目录入口与外部 symlink。工具仅 resolve，不执行。Git 预检屏蔽继承的 Git 定位变量、关闭可选 index 写入与 fsmonitor，错误 stderr 不泄露到 CLI。
- 新 `check.mjs --upstream /absolute/path [--build-tools /absolute/path]` 返回 `READY` 或 `BLOCKED` / 退出 2；只证明 build inputs，不代签编译和供应链。
- kit 增加 package `files`、`./toolchain` export、Node/pnpm 声明；仍 private、没有 registry 发布。真实 tarball 经安全解包后从包 export 导入，并实际执行独立 shine-brand 构建/测试；`.env`/`node_modules` 负夹具未入包。
- 干净复制白名单、B0 测试入口和机器边界清单同步。首次边界检查拒绝动态 `require(path)`，已改为显式包名的延迟加载；没有降低静态规则。生成清单还同步了此前已提交源码的 node:util 和三项测试引用，业务源码未改。

实际命令：

```sh
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" node --test \
  scripts/dsh-b0/plugin-kit.test.mjs scripts/dsh-b0/clean-build.test.mjs \
  scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs
node scripts/dsh-b0/plugin-boundaries.mjs --check
node dsh-plugins/plugin-kit/check.mjs --upstream "$PWD/.context/dsh-b0/upstream-0.1.7-rc.2"
```

本轮测试 **21 PASS / 0 FAIL / 0 SKIP**，其中包含真实解包 kit 构建和四个叶子插件隔离构建。边界检查 11 包、31 条跨包边、640 源文件通过；实际预检 READY（26 SDK、32 bindings）。日志 `kit-reviewed-tests.log`、`boundary-final.log`、`kit-readiness.json` 在同一 evidence 目录。没有重跑未受影响的完整后端或 release suite，上一轮 434 项不算本轮新结果。

## 剩余顺序

- [x] T2：固定 rc1 新源码/冻结依赖/官方 host+native 构建/三语料本机矩阵与输入封存。
- [x] T15：dev kit 的本地包合同、只读前置校验、实际解包消费和叶子回归。
- [ ] T2：新可追踪输入的 WSL 平台验证或旧 WSL 完整编译闭包比对；签名信任独立处理。
- [ ] T15：脱离相邻目录引用的安装接线、SDK/工具闭包分发和无现有缓存的新机器验证；本轮 tarball 只带 kit 源码/锁，不带 SDK 或已安装依赖。
- [ ] T5/T19：独立插件签名接线、SBOM/CVE、撤销/轮换；其后按既有 G0 的真实身份/模型/UAT、canary/回退、stop/go 决定分仓和生产准入。

结果年龄策略保持历史快照 + 保存时校验，不恢复阈值待办。

## 审查与输入保护

OCR delegate 用当前 workspace preview 和规则检查本批；新增源码、生成清单和修改文档人工复核，之前的审查仅在文件摘要未变时复用。修复动态 require 不能被边界扫描解析的问题后，相关真实验证通过；最终逐文件覆盖与摘要保存在 `review-final.json`，当前范围未留下高/中严重度发现。剩余验收项保持上方 PARTIAL，不以代码审查代替现场结果。

`protected-final.json`：此前 1318 个封存文件的字节数、mtime 与 SHA-256 全部一致；当前 candidate 与独立核对的 journal 文件摘要均未变，journal 仍 seq 6。没有覆盖原失败回执或追加发布事件。旧 17 个未提交文件保留，本轮累计工作树 27 个变更文件；此前 release suite 结果由原证据承载，本轮没有重新宣称其通过。
