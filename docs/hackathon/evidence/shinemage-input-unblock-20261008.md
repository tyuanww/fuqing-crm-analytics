# 既有准入输入解阻与隔离配方接续（2026-10-08）

从 detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09` 和前轮 12 份未提交文档/证据接续，原成果保留。没有重新规划或新增产品功能；candidate `993daf31…`、包 `b75d90e9…`、正式 journal seq 3 保持。前轮实际测试见[准入续接](shinemage-admission-closeout-20261008.md)，不重复计入本轮。

## 已完成的三线输入准备

### 候选目标准入材料

现有 schema 下 source 输入 43 成员中 42 个复用、只更换 candidate.json；terminal 输入 349 成员中 345 个复用、只更换四个候选相关成员。现有纯只读 `verify_inputs`、`verify_source_binding`、`checkedSet`、受审控制器检查通过；主 Agent 另核对 392 条成员记录的大小与摘要。这是材料检查，不是新增业务测试数。

未生成新平台回执、input-v5 或目标验收封套。v5 必须在固定 runner 的 source HTTP 子步骤真实成功后生成，再执行 terminal；不能复用旧 candidate 回执。未来命令及互斥 source-only/combined 入口已具象化在 `commands-not-run-r2.json`，未连接目标或启动服务。详见[候选离线交接](shinemage-candidate-target-preflight-20261008.md)和[机器汇总](shinemage-candidate-target-preflight-validation-20261008.json)。

### SDK 官方配方材料

固定 commit `57e7b9b7…` 的官方源码归档已取得，8027/8027 Git blob、路径与 mode 对齐封存树。数据视图保留 8021 普通文件和 6 个链接元数据。四个精确编译器/平台包及 67 个辅助工具包通过原锁 SHA-512 和静态成员检查；两类不重叠，共 71 包。辅助包中的两个连接超时，经一次正常 TLS/IPv4 curl 诊断取得，原失败保留。

实际 tsconfig 引用 204 个项目；880 个声明依赖是包含 dev/test 的保守上界，不是最小 import 图。静态准备阶段本批覆盖 71，余 809 仅表示本批未覆盖，不能宣称整机不存在。这一阶段未安装或执行包/编译器，详见[固定输入交接](shinemage-sdk-recipe-inputs-20261008.md)和[机器汇总](shinemage-sdk-recipe-inputs-validation-20261008.json)。主 Agent 复算该阶段 40 份原始记录、72 份归档及 7 项受保护输入摘要，均匹配。

### HTML 原生路由

确认 task tab 可精确绑定，但 `sessionName` 实际只建立用户已有窗口内的标签组，不是隔离 profile。macOS 接口未提供本次需要的隔离实例窗口路由。空白任务 tab 已关闭；本轮未启动 DSH 或 Chrome 新实例，菜单/缩放/Tab 输入均为零。两项保持 NOT_RUN，详见[原生路由记录](shinemage-html-native-route-20261008.md)和[机器记录](shinemage-html-native-route-20261008.json)。不重试相同无效启动，不制作 standalone 替代页。

## 交叉审查与隔离配方授权

C 对候选材料的只读交叉审核没有代码/绑定/路径问题；发现并修正一处 v5 生成时点的文档措辞。A 对 SDK 输入/控制器的只读审核发现根 `devEngines.runtime=26.10.0/onFail=download` 不能遗漏，已补正；辅助包最终 67/67 与摘要核对一致。修正后两线没有剩余审核发现。审查没有重跑业务、完整字节审计或外部 OCR。

官方配方约束为根 Node 26.10.0、bundle 子步骤 Node 24.6.0、manager pnpm 12.7.0；SEA Node 26.0.0 不在两个 JS bundle 比较范围。不能绕过根 runtime 约束后宣称同配方重现。

用户已直接答复 **“允许，仅用于隔离配方复现”**，授权仅在独立目录准备并使用这些精确版本及编译依赖。本机默认环境、现有 SDK、DSH pin 与发布限制保持。授权单列于集成树 `.context/checks/abc-input-unblock-20261008/recipe-authorization.json`，不改写此前静态阶段的 NOT_RUN。

后续隔离执行由工具链准备、依赖/构建、钩子审查三线接续；实际执行结果须单列原始日志和摘要，不能以输入准备代替编译或 bundle 字节一致。SDK 分发仍 BLOCKED、release_ready=false；目标 WSL、正式 CI、真实模型/业务和生产没有因此放行。

## 授权后的实际配方复现

工具链准备、原生依赖准备和只读 hook 审查并行推进，构建与证据集成按依赖串行执行。完整材料分别见[固定工具链](shinemage-sdk-recipe-toolchain-20261008.md)、[运行时原生预热](shinemage-sdk-runtime-prewarm-20261008.md)、[Cargo 输入与钩子](shinemage-sdk-cargo-inputs-20261008.md)和[双 bundle 实际复现](shinemage-sdk-recipe-reproduction-20261008.md)。主 Agent 核对上述四份机器记录引用的 94 条原始材料摘要，全部一致；未重复执行其检查。

- 精确 Node 运行时由 pnpm 原生下载校验、生成槽及缓存；独立 HOME 和禁网消费已有记录。默认解释器不变。
- 固定 Cargo 1.97.0 仅承担配方所需 metadata 与依赖物化。774 个 registry 包按原锁 checksum，另一个 Git 包按固定 commit / 原生文件清单；C 原记录核对 39,201 个文件，0 差异。没有 Rust/native 编译。
- 完整依赖准备保留 `.pnpmfile.cjs`、固定补丁及原锁；早期 880 项是编译引用项目声明的保守上界，后续真实安装包含根依赖与整锁策略检查，不能混用各阶段数量。缓存准备 fixture 不算正式配方验收。
- 实际源码安装使用 `--frozen-lockfile --ignore-scripts --offline`，原 `run build` 使用固定配方的原命令；二者都在 OS sandbox 的 `deny network*` 下执行，不能以离线环境变量代替禁网事实。

首轮安装缺其他平台 full metadata 的失败保留；补齐固定材料后成功。首轮原 build 退出 0，但两个 raw bundle 均 MISMATCH。差异是 store 相对路径前缀：分别 5234 / 314 处，每处长 94 字节；只在内存中替换用于归因，原始输出未改写，也未算作通过。

第二轮在新的 `work/pnpm/pnpm` 与 `setup-pnpm/store` 布局中由原生 manager 重新物化，得到配方原有相对路径；没有拼接 store 索引、改槽或处理输出。实际禁网安装 **exit 0 / 3.72 秒**，原 build **exit 0 / 26.88 秒**。构建后核对固定源 8027 个原始 blob / 链接 / mode，变化 0；两锁不变。

| 原始产物 | 字节数 | SHA-256 | 与封存输入比较 |
|---|---:|---|---|
| pnpm.mjs | 15,457,230 | `00805e99c795e7067b0f459846393ca3f6a701ca9ae267fd48b99d11ecd423a8` | 逐字节相等 |
| worker.js | 613,034 | `9834d944929dba7566e230a084fff0ecdb1da1be777c72ecb5f00a41a04843a4` | 逐字节相等 |

主 Agent 直接读取第二轮产物与原密封 SDK，另行完成两个原始文件的 bytes 比较及 SHA-256 核对，没有规范化或后处理。记录为集成树 `.context/checks/abc-input-unblock-20261008/raw-bundle-independent.json`。首轮 MISMATCH、各次准备失败与完整日志保留。

本项只关闭固定两份 JS bundle 的配方输出比较。**EMBED-INLINE-BYTES 账本仍 PARTIAL，产品默认 inline_function_bytes / embedded_components 仍 NOT_VERIFIED，八条顶层门禁未新增 PASS，SDK 分发 BLOCKED、release_ready=false。** 没有修改产品校验器，也没有接入每次插件更新。

## 现场保持与剩余收尾

集成树仍 detached HEAD `8aabaaeb`，本地引用 `codex/shinemage-abc-local-candidate` 指向同一提交。六个受保护任务树的 HEAD、porcelain 和 105 份未提交文件摘要保持；固定 DSH 的 HEAD、index、锁及状态保持。当前 candidate、插件 tgz、正式 journal 摘要都保持，journal 仍 seq 3；本轮没有向 journal 追加事件。见 `.context/checks/abc-input-unblock-20261008/protected-after.json`。

剩余仍沿用既有任务，不增加功能：

1. 候选的目标宿主 / WSL 验收与正式 CI 尚未运行；现有 source / terminal 输入只完成离线检查。真实 source HTTP 成功后才能形成新 v5 并推进 terminal，不能用旧回执关联新候选。
2. HTML 的查看菜单、200% 键盘焦点、真实读屏 / 触控 / Windows 高对比度及 standalone 仍缺实际设备、可精确控制的隔离窗口或真实页面包。probe 外审超时未关闭，不第三次续跑；现有人工 / delegate 不能抵扣。
3. SDK 仍需完整包身份及剩余嵌入/资源证明、上游公告发布、撤销、native 安全、干净主机与最终分发签名。7 版本 / 29 公告沿用既有查询，未重查。本轮固定配方成功不等于所有 SDK 内容均已证明。
4. 真实模型 / 业务 / 生产验收未做；物理分仓、独立 CI / 发布及 DSH 升级仍受原 stop/go 限制。

本轮没有修改产品源码或 VERSION，没有新增 commit、push、PR、合并、发布、部署；已完成 B0 等检查没有重跑。

## 最终复核与归档

独立 Agent 对双轮原始输出、关键源码/锁、控制器和实际 sandbox / 日志完成只读复核，43 份材料留有摘要，**0 条审查发现**；没有重复 build 或全源审计。见[独立复核原文](/Users/hutou/.codex/worktrees/shinemage-candidate-admission/fuqing-crm-analytics/.context/checks/sdk-recipe-raw-review-20261008/review.md)。这不是外部 OCR，不抵扣尚未关闭的 probe 外审。前述准备阶段修正与本次最终 0 finding 区分记录。

原静态输入归档保持：134 文件、29,669,016 字节，archive SHA-256 `479cd8b83fe39c3e4873e2e198fd0faf6d2403dd39126a3864e5ccea27a4d3f6`。后续执行材料另建 `.context/archives/shinemage-recipe-reproduction-20261008/`：794 文件、193,986,193 字节，压缩后 144,778,747 字节；包含固定工具归档、双轮原始 bundle、日志、控制器、清单与独立审核，不复制 live store/cache。每个归档成员的大小与 SHA-256 复验一致。执行 archive SHA-256 `3221cfaada002549682d5675b3c4afe075d9a21bafd59e9e02096c40dc875b91`；manifest SHA-256 `4400fbb36090b56f0927e4c5b32601e492c67f9c02068f8fd697d6a925dd5734`。旧失败文件和两个归档均未覆盖。

集成状态、原始引用、主 Agent 独立比较及归档汇总见[机器记录](shinemage-input-unblock-validation-20261008.json)。本页与共享状态为本地未提交进度，不写入发布记录。
