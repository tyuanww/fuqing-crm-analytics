# SDK 固定配方输入准备（2026-10-08）

承接[SDK 固定输入补证](shinemage-sdk-evidence-followup-20261008.md)。本轮准备固定配方的数据材料，**未安装依赖、执行下载的包/native、运行编译器或比较变换输出**。SDK 分发仍 BLOCKED、release_ready=false；不是编译或发布通过。

专属工作树 `/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics` 保持 detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。控制器 Node 24.19.0、Python 3.14.4 不变；既有 PyYAML 6.0.2 仅 safe_load_all 读取固定锁，不安装解析器。新原始材料均在本树 `.context/checks/sdk-recipe-inputs-20261008/`。

## 完整官方源码已收取并核验

从精确 `https://codeload.github.com/pnpm/pnpm/tar.gz/57e7b9b76ac3a5ef67461093071b2264335a1a01` 收取 12,130,452 字节。首次正常 TLS 连接超时，第二次相同 URL 成功；两轮记录分别保留，没有浮动分支或换版本。

归档全部 **8027/8027 个 Git blob** 与已封存 commit `57e7b9b76ac3a5ef67461093071b2264335a1a01`、tree `d506a194e838ba5d01fee37d42f075fe55f4f01b` 相符，同时核对路径及 Git mode。没有额外或缺少 blob。

`source-view/` 只保存 8021 个普通文件，权限为 0600；6 个源码链接的目标字节通过 Git blob 核验，保存在 `source-links.json`，没有创建链接。原执行位和链接关系保存在 `source-verification.json`。这是可审的数据视图，不是已经能直接运行的构建 checkout；之后须在新的自有 build 目录恢复经审核的 mode/link，不能在 sealed 输入或本数据视图内安装/构建。

## 四个编译器包与 67 个辅助包

四个编译器包从精确 npm URL 收取，逐包匹配固定 lock SHA-512、package name/version，并安全静态遍历普通文件，拒绝越界、特殊成员和归一化重复路径，没有解包/执行 native：

- `esbuild@0.28.2`。
- `@esbuild/darwin-arm64@0.28.2`。
- `@typescript/native-preview@7.0.0-dev.20260707.2`。
- `@typescript/native-preview-darwin-arm64@7.0.0-dev.20260707.2`。

另外按原 build 脚本使用的 `rimraf@6.1.3`、`shx@0.4.0`、`@pnpm/tabtab@0.5.4`、`ps-list@9.0.0`，从真实锁 snapshot 遍历其辅助依赖闭包，共 **67 个精确身份**。这 67 个与上述四个编译器包不重叠：

- 4 个复用此前封存 tarball，并重新对照本配方锁核验；原包 SHA/mtime 保持。
- 63 个新请求，首轮 56 成功、7 连接超时；对失败项一次 urllib 重试恢复 5 个，保留 2 个超时。
- 对仅连接超时的 `brace-expansion@5.0.12` 和 `isexe@2.0.0`，按主 Agent 指示增加一次系统 curl 正常 TLS＋IPv4 传输诊断，使用相同精确 URL、connect-timeout 10 秒/max-time 30 秒，不改代理或全局配置；两包均下载成功且 lock SHA-512 匹配。不据此断言已证明原网络故障根因。
- 最终 **67/67 摘要与静态成员检查通过**。先前 65/67 的记录保留，新结果为 `auxiliary-verification-r2.json`。

本批一共覆盖 **71 个精确 registry 包材料**。这与上一轮 SDK 212 条安装记录的核验是不同集合，不合并成新的安装通过数。所有下载均正常 TLS、有时间及大小上限；没有执行包管理器、包生命周期或 native。

## 构建依赖与运行时仍未就绪

实际 `pnpm11/pnpm/tsconfig.json` 的递归引用有 **204 个项目**。依照这些项目真实 lock importer 的 dependencies/devDependencies/optionalDependencies，并按 Darwin arm64 处理可选平台，得到 **880 个 registry 身份的保守声明闭包**。它包含 dev/test 声明，是准备范围的上界，不是已经证明的最小 bundle import 图。

本批 71 个身份全部属于该集合。`remaining-declared-inputs.json` 精确列出另外 **809 个未被本批覆盖的身份和锁摘要**；没有扫描整机缓存，因此不能称这 809 个在机器上都不存在，也没有自动下载这 809 个。完整依赖布局、类型解析和 compiled lib 入口尚未生成。

运行时角色按实际源文件区分：

| 版本 | 原配方用途 | 本轮状态 |
|---|---|---|
| pnpm 12.7.0 | root packageManager 及 devEngines.packageManager，onFail=download | 未准备/未执行 |
| Node 26.10.0 | root devEngines.runtime，onFail=download；另用于 workflow 和 root typecheck-only | 未准备/未执行，不能推断局部包管理器运行会绕开它 |
| Node 24.6.0 | `pnpm11/pnpm` 的 `bundle` 子步骤，运行 bundle.ts 生成 pnpm.mjs 和 worker.js | 未准备/未执行 |
| Node 26.0.0 | build-artifacts.ts 的 SEA 嵌入运行时 | 双 JS bundle 比较不执行此步骤 |
| Node 24.19.0 / Python 3.14.4 | 本轮控制器固定解释器 | 保持未改 |

A 的只读交叉审核发现初版 Node 26.10 说明漏掉 root devEngines。已在 `build-input-closure-r2.json` 补正；旧 `build-input-closure.json` 保留，不再用其简略 Node 角色说明作为当前结论。没有执行依赖该遗漏的命令，也没有把“本轮静态准备”写成用户永久禁止编译。

## 已准备但未执行的下一步

`commands-not-run.json` 保存具体命令、隔离路径和前置条件，`executed=false`：

1. 取得主 Agent 对精确隔离配方环境的授权后，在新自有目录准备 pnpm 12.7.0、root Node 26.10.0、bundle Node 24.6.0；本机默认工具链保持。核验身份及包管理器 runtime 选择，不能依赖全局自动下载。
2. 将封存源码数据材料化为新的 build 副本，恢复审核后的 mode/link；补足精确锁依赖到私有 store。验证固定 manager 的 CLI 行为后执行 `pnpm install --frozen-lockfile --ignore-scripts --offline --store-dir <private-store>`；固定 pnpmfile/补丁需复核，sealed 输入只读。
3. 在禁止联网的隔离环境执行原有 `pnpm --dir pnpm11/pnpm run build`；它执行 tsgo、清理自有 dist、bundle 子步骤及固定复制动作。不要改配方或用当前宿主 24.19/旧 esbuild 顶替。
4. 只读比较新 `dist/pnpm.mjs` 与 `dist/worker.js` 的字节和既有密封摘要，不执行输出；不运行 SEA、发布、SDK rebuild 或业务验收。

上述步骤全部 **NOT_RUN**。完整固定源码和编译器数据已到位，不再笼统称“没有编译器包”；当前准确缺口是隔离 runtime/manager、完整依赖布局、执行准入及最终变换字节比较。

## 证据与保护

关键原始记录为 `source-verification.json`、`compiler-packages.json`、`auxiliary-verification-r2.json`、`build-input-closure-r2.json`、`remaining-declared-inputs.json` 和 `commands-not-run.json`。原失败请求、65/67 阶段、Node 角色修正前记录全部保留。

[机器汇总](shinemage-sdk-recipe-inputs-validation-20261008.json)与本树原始 `summary.json` 同字节，SHA-256 为 `6575ef506bd878e2c25c89dd8655e1fb97eccc73ef4e7c728a3f8e41b0c1f5c4`；它记录 40 份控制器/JSON/日志和 72 份源码/包归档的绝对路径及摘要。`commands-not-run.json` SHA-256 为 `935baf6433883905e9f3d8fd3c20bdf51851d665720be311a88ae8d9642df1b2`。

收尾核对全部新材料字节、先前两份交接、既有官方 commit/tree/lock SHA/mtime、4 个复用归档、密封 pnpm.mjs/worker.js 摘要，均保持。没有修改产品代码、sdk-supply-chain 默认门禁、SDK、DSH 上游、候选或 journal。未查询 latest/OSV，7 版本/29 公告未重查；无 B0/冷安装/headed 重跑，无真实业务/生产操作，无 commit/push/PR/合并/发布/部署。

完整身份父门禁 OPEN，嵌入组成和 EMBED-INLINE-BYTES 账本 PARTIAL，校验字段 NOT_VERIFIED。八条顶层门禁没有新增 PASS，变换输出仍 NOT_RUN。
