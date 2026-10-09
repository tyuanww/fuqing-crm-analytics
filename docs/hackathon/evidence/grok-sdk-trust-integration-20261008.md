# SDK 信任证据索引（2026-10-08）

## 最新固定变换收尾：五包 82 JS 对齐，剩余 8 条路径等待输入

五包原配方已在 Node 24.19.0 和真实禁网沙箱中生成/编译，82 个发布 JS 原始字节相等，覆盖原 86 null-source 中 78 条路径的变换子项。76 份源码与固定归档一致，两条 validators 原命令生成并对齐最终发布 JS；并未获得历史原始 generated source。其余 6 包/8 路径缺固定源码关联，无新材料不重复请求。见[本轮原始执行、复算和审核](shinemage-grok-handoff-transform-20261008.md)。

socks 声明文件存在差异，本轮只证明所列 JS；registry gitHead 声明关联及输出复现不能冒称已验签 provenance/唯一源码身份。官方 map 保持 86 个 null，产品默认 NOT_VERIFIED、账本 PARTIAL、SDK BLOCKED、八条顶层门禁及 release_ready=false 不变。以下 86 源/变换 OPEN 是各自此前时点，不代表本轮尚未取得这 78 条变换证据。

## 最新原子补证：map、编译lib与有内容store来源

在已完成双bundle原始复现的基础上，两份构建map也与官方map逐字节相等，15个编译lib与官方sourcesContent相等。2594个唯一有内容store条目分为2473物理文件、111依赖自身外部map、10内联data-map；三种来源必须分开表述，不能将map内容冒称物理TS文件或完整包身份。86个null源明确分布于11个固定包，仍缺精确原始源及可信发布关联，保持OPEN。详见[本轮映射](shinemage-sdk-embedded-gap-closeout-20261008.md)和[集成/独立复核](shinemage-closeout-progress-20261008.md)。

本轮未构建、下载、执行native或重查公告；EMBED-INLINE-BYTES仍PARTIAL，产品默认两个字段仍NOT_VERIFIED，SDK分发BLOCKED / release_ready=false，八条顶层门禁不变。以下“15 lib/其余store缺证明”等为此前时点；86null与其他父门禁仍开放。

## 当前补证：两个 bundle 固定配方原始输出一致，分发仍 BLOCKED

用户授权的隔离 Node 26.10.0 / Node 24.6.0 / pnpm 12.7.0 环境已实际执行原配方。固定源 8027 成员及两份锁保持；禁网安装、原 build 均退出 0。第二轮 `pnpm.mjs`（15,457,230 字节，`00805e99…`）和 `worker.js`（613,034 字节，`9834d944…`）未经后处理即与封存 SDK 逐字节相等，主 Agent 独立复算一致。首轮原始输出 MISMATCH 保留，精确路径前缀的内存诊断未算作通过；第二轮以真实相对目录布局重新原生物化和构建。见[本轮集成](shinemage-input-unblock-20261008.md)。

只关闭这两个文件的固定配方变换比较子项；EMBED-INLINE-BYTES / SDK-EMBEDDED-COMPOSITION 保持 PARTIAL，`inline_function_bytes` 与默认 `embedded_components` 仍 NOT_VERIFIED。完整包身份、撤销、native、资源解析、干净主机和最终签名未由本项关闭，八条顶层门禁无新增 PASS，SDK 分发 BLOCKED / release_ready=false。7 个版本 / 29 条公告仍沿用旧查询。配方构建输入的包数与下方 212 条 SDK 安装记录属于不同统计范围，不相加。下文“缺编译器/源码/依赖、变换 NOT_RUN”保留为此前阶段。

## 当前补证：196/196 摘要匹配，分发仍 BLOCKED

见[固定输入续接](shinemage-sdk-evidence-followup-20261008.md)与[机器汇总](shinemage-sdk-evidence-followup-validation-20261008.json)。本轮 rc-field-form 正常 TLS 下载及 lock SHA-512 核对成功，71 个普通文件一致。累计 212 条安装记录为 **201 直接一致、2 固定补丁一致、7 types-only 投影已解释、2 重复路径仍拒绝**；网络未核验归零。305 个缺文件在原完整归档/源码副本/registry 字节一致，当前真实裁剪函数均排除，不把裁剪输出认定为完整 npm 包。完整 recipe 仍缺固定编译器、完整源码和构建依赖，变换比较 NOT_RUN。

完整身份父门禁 OPEN；嵌入组成及 EMBED-INLINE-BYTES 仍 PARTIAL，产品字段仍 NOT_VERIFIED；八条顶层门禁无新增 PASS，release_ready=false。未接入每次插件更新、未放宽默认校验、未重查 7 版本/29 公告。以下各段为此前交接时点；195/196 和“只有 lock 声明”等历史结论不作为当前计数。

## 后续固定字节补证

graceful-fs 的固定官方补丁已在隔离文件上重放，输出与部署副本/map源一致。原212条只有lock声明的安装记录现已实际核对：196个唯一tarball中195个摘要匹配；200条安装记录直接相同、2条经既有antd/rc-picker补丁对齐；7条缺文件、2条重复成员路径、1条网络失败仍未关闭。完整包身份仍OPEN、SDK分发仍BLOCKED，不改默认校验或pipeline。见[字节补证](shinemage-sdk-byte-closeout-20261008.md)与[机器汇总](shinemage-sdk-byte-closeout-validation-20261008.json)。下方212条未比较及补丁未重放的文字保留为此前交接时点。

## 最新接续：内联证据 PARTIAL，SDK 分发仍 BLOCKED

后续专属树的[SDK 收尾交接](grok-sdk-trust-closeout-20261008.md)已由主 Agent 核对原始 JSON、官方 map 资产摘要、密封 bundle 字节和日志，见[集成核验](shinemage-parallel-closeout-20261008.md)与[机器记录](shinemage-parallel-closeout-validation-20261008.json)。这里只接收交接及证据，不导入两份新校验器源码、不应用 `product-delta.patch`，不修改 `sdk-supply-chain.mjs` 或 pipeline。

| 层级 | 最新状态 | 含义 |
|---|---|---|
| `EMBED-INLINE-BYTES` 证据账本 | **PARTIAL** | 外部官方 map 位置一致、883 个唯一仓库源 blob 相符、部分 store 源字节已核对；尚未证明 recipe 的变换输出 |
| 校验器 `inline_function_bytes` / 默认 `embedded_components` | **NOT_VERIFIED** | 产品校验默认值没有放宽；不能用账本 PARTIAL 覆盖机器结果 |
| `SDK-EMBEDDED-COMPOSITION` | **PARTIAL** | 父门禁未关闭 |
| SDK 分发 / `release_ready` | **BLOCKED / false** | 八条顶层门禁没有一条新增 PASS |

15 个编译后 lib 源、86 个 null 源、其余 store tarball 和变换字节仍缺证明；212 个 installed-package 只有 lock integrity 声明，未逐包对字节。7 个受影响版本/29 条公告继续沿用原查询，本轮未重查。源码映射不等于完整包身份、撤销、native 安全、干净主机或最终分发签名通过。

以下为此前 C 交接快照，保留其当时的 NOT_VERIFIED，不改写历史结果。

基线 `cb6f723c66df4a66117ef5edbf9aacd4a94d2065`。工作树 `/Users/hutou/.codex/worktrees/grok-sdk-trust-evidence/fuqing-crm-analytics`，分支 `codex/grok-sdk-trust-evidence`。本轮只新增本索引。没有修改产品代码，没有改原证据目录，没有 commit、push、PR、合并、发布或部署。

## 原证据

只读目录：

`.context/checks/grok-sdk-trust-20261008T101338/`

本轮读取：

- `REPORT.md`
- `remaining-trust.json`
- `embed-result.json`
- `path-identity-proven.json`（461 条列表，未复制进 Git）

生成时间 `2026-10-08T02:46:55Z`。原目录本轮没有写入。

## 保持的结论

| 项 | 状态 |
|---|---|
| distribution | BLOCKED |
| release_ready | false |
| embedded composition | PARTIAL |
| 内联函数体 | NOT_VERIFIED |
| 7 个受影响版本、29 条公告 | 沿用既有记录，本轮未重查 |

`embed-result.json` 的 `embedded_gate` 是 `PARTIAL`，`inline_function_bytes` 是 `NOT_VERIFIED`。`scripts/release/sdk-supply-chain.mjs` 没有修改，嵌入组成仍按原检查器保持未验证，没有放宽。

输入摘要沿用原报告：closure SHA-256 `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`，30546 条，上游 `477b4f420553e8a52c2fbccc464d7561b239c443`。已封存 `pnpm-11.28.2.tgz` SHA-256 `30d4099fa03b9ba1124d81527808b1e4d8e719aeb0ddfe169426df3c4a038a5f`。来源 commit `57e7b9b76ac3a5ef67461093071b2264335a1a01`。

## 原报告中的门禁

| id | 状态 |
|---|---|
| SDK-UPSTREAM-ADVISORIES | BLOCKED_UPSTREAM_RELEASE |
| SDK-EMBEDDED-COMPOSITION | PARTIAL |
| SDK-FULL-PACKAGE-INTEGRITY-IDENTITY | OPEN |
| SDK-REVOCATION | OPEN |
| SDK-NATIVE-EXECUTION-SAFETY | OPEN |
| SDK-ASSET-PARSER-SAFETY | PARTIAL |
| SDK-COMPLETE-PREPARATION-AND-CLEAN-HOST | OPEN |
| SDK-FINAL-DISTRIBUTION-SIGNATURE | OPEN |

PARTIAL 的嵌入门禁只绑定发布包路径、lock integrity 和已核对的部署副本。它不证明内联函数体。native/PE 未执行，作者签名未验证。

## 本轮没有做的事

没有重查 OSV。没有运行 native 或 PE。没有 SDK prepare。没有重建 pnpm bundle。没有真实模型或付费 API。没有把这些证据接进每次插件更新。

本轮命令：只读打开上述四个文件并核对状态字段。没有新的供应链退出码。

## 主 Agent 集成

可以接收本索引。不要把 BLOCKED 改成 PASS，不要把 PARTIAL 的路径绑定写成内联字节已证明。原目录里的 registry tarball、官方树 JSON 和分析脚本继续留在原处，不要复制进 Git 跟踪目录。SDK 分发仍阻塞，和任务 A 的插件包字节核对是两件事。
