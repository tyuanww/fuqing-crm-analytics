# SDK 信任证据索引（2026-10-08）

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
