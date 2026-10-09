# SDK 固定输入补证续接（2026-10-08）

承接[固定字节与补丁补证](shinemage-sdk-byte-closeout-20261008.md)和[SDK 信任交接](grok-sdk-trust-closeout-20261008.md)。仅推进既定 SDK 来源缺口，**分发仍 BLOCKED，release_ready=false，八条顶层门禁没有新增 PASS**。

专属工作树：`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics`，起点及结束 HEAD 均为 `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`（detached）。集成树及原成果树只读，本树只新增本交接和[机器汇总](shinemage-sdk-evidence-followup-validation-20261008.json)。维护期控制器及原始记录保存在本树 `.context/checks/sdk-evidence-followup-20261008/`，没有新增产品校验器或修改日常插件入口。

## 1. 最后一项网络缺口已补上

对固定 `rc-field-form@2.7.1` 的精确 npm tarball URL 本轮仅做一次下载。使用固定 Python 3.14.4、系统公共 CA 和正常 TLS，沿用原控制器的 25 秒请求超时、64 MiB 下载上限、站内 HTTPS 重定向约束和安全静态成员检查；没有运行包管理器、安装或执行包代码。

- URL：`https://registry.npmjs.org/rc-field-form/-/rc-field-form-2.7.1.tgz`。
- 大小 45,946 字节，SHA-256 `0721dc5f5158b25c1be6b8e823db3cd188ed3254bba7a68f99972bdcb88a151d`。
- lock SHA-512 一致；71 个普通文件与 sealed received-r3 全部一致，无缺失、差异、额外文件或未跟随链接。
- 收尾直接重读 received-r3 两份锁，唯一 rc-field-form 声明与下载摘要一致；原 inventory 和两份锁的 SHA/mtime 均保持，见 `lock-recheck.json`。
- 历史首轮、network-retry 两次超时不改写，本轮成功单独保留。

在原 212 条记录上去重接续后的统计如下。只有 rc-field-form 从网络未核验转为普通文件一致；其他类别不偷换成 EXACT。

| 项目 | 当前累计 |
|---|---:|
| 唯一 tarball 摘要匹配固定 lock | **196 / 196** |
| 安装记录普通文件直接一致 | **201 / 212** |
| 既有固定补丁后字节一致 | **2 / 212** |
| types-only 投影已解释，仍非完整 npm 包 | **7 / 212** |
| 重复归一化路径保留拒绝 | **2 / 212** |
| 网络尚未核验 | **0 / 212** |

201 + 2 + 7 + 2 = 212。196 个 tarball 摘要通过不等于 212 个完整包或发布者身份通过。

## 2. 305 个缺文件定位到原 types-only 投影阶段

只读核验原完整归档 `full-pack-r2/sdk.zip`，复算 SHA-256 为 `3aadb81472bf50f0cf4defa44c9802fef1b2898c7fd43d103d258ff0de98c639`；内部 manifest 为 `40ca9385c0e13db7023d5317ee65e9372976d32307ffad72a4c03fb0bd1399e2`。再核对 closure-r3 和 received-r3 的相同 SDK 清单摘要 `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`。

305/305 个 registry 文件都满足：存在于完整归档；归档 blob 和 `sdk-complete` 对应字节与 registry 相等；在 closure-r3 清单和 received-r3 文件系统中均不存在。原 closure receipt 将这七条包记录全部标为 `mode=types`。调用当前仓库真实 `includePackageFile` 函数，对这 305 条路径都返回排除，符合既有 types-only 规则；没有复制旧实现来代替判断，也没有运行依赖包或编译器。

| 包 | 缺文件数 | 原 receipt 模式 |
|---|---:|---|
| @js-temporal/polyfill 0.5.1 | 32 | types |
| @types/mdast 4.0.4 | 1 | types |
| @types/unist 3.0.3 | 1 | types |
| commander 15.0.0 | 9 | types |
| katex 0.16.47 | 208 | types |
| lexical 0.49.0 | 52 | types |
| micromark-util-types 2.0.2 | 2 | types |

因此可以将“缺文件来源不明”细化为 **EXPLAINED_TYPES_ONLY_PROJECTION**。这证明完整输入与缩减输出的阶段差异，不是重演历史进程或证明某个文件曾从 received-r3 中被删除；它们可能从未被复制进去。没有恢复这些文件，没有豁免类型闭包的运行正确性，也没有把缩减目录记为完整 npm 包。

## 3. 两个重复路径继续拒绝

`agent-base@7.1.4` 和 `https-proxy-agent@7.0.6` 的原 tarball 摘要匹配固定 lock。静态遍历补充了成员序号、原始名称、tar header/data offset、大小及内容摘要；各自 `package/./dist/index.js` 与 `package/dist/index.js` 两个普通成员的内容字节相等。

这只是重复成员的具体观测，仍为 **BLOCKED_NORMALIZED_DUPLICATE_PATH**。没有解包，没有改归一化/重复路径拒绝策略，没有把两个安装记录记为 EXACT。

## 4. 完整 bundle 变换仍缺固定构建输入

本轮核对八份本地官方 recipe/lock/workflow 源文件的 git blob，全部匹配已保存的 commit `57e7b9b76ac3a5ef67461093071b2264335a1a01`、tree `d506a194e838ba5d01fee37d42f075fe55f4f01b`；没有重新查询网络版本。

- 官方 lock/catalog 指向 `esbuild@0.28.2` 和 `@typescript/native-preview@7.0.0-dev.20260707.2`；固定 SHA-512 已记录。密封 SDK 的既有 inventory 没有这两个精确编译器版本，现有 esbuild 是 0.25.12。
- recipe 的 root packageManager 是 pnpm 12.7.0；bundle 脚本声明 Node 24.6.0；release workflow runtime 为 Node 26.10.0。它们是待准备输入，不改变本任务 Node 24.19.0 / Python 3.14.4 的固定约束。
- 保存的官方源码快照只具备固定树 8,027 个 blob 中的 30 个实际文件，不是完整构建 checkout。缺 `pnpm11/pnpm/tsconfig.json`；编译后的 `pnpm11/pnpm/lib/pnpm.js` 和 `pnpm11/worker/lib/worker.js` 也没有。
- 还需完整固定源树及构建依赖闭包、对应平台编译器字节、配方工具链环境和编译入口，才能进行完整变换比较。之前的 15 个编译 lib / 86 个 null source 缺口并未由本轮关闭。

结果保持 **BLOCKED_INPUTS_MISSING / transformed_bundle_comparison=NOT_RUN**。只检查上述密封 SDK 与保留官方快照，不声称扫描过整台机器或任意缓存；没有用 0.25.12 替代编译器，没有补装、运行 native、重建 SDK 或调用发布步骤。

## 本轮命令、失败与保护

| 控制器 | 退出码 | 结果 |
|---|---:|---|
| `retry-rc-field-form.py` | 0 | 一次正常 TLS 下载；摘要匹配，71 普通文件一致 |
| `trace-static.py` | 1 | 控制器先假定 tar 根叫 package，遇到 mdast 根名后停止；尚未写结果 |
| `trace-static-r2.py` | 0 | 沿原检查器识别唯一根目录；305 个路径阶段及字节核验、2 个重复成员记录 |
| `compiler-inputs.py` / `compiler-inputs-r2.py` | 1 / 1 | 控制器只解析第一个 packages 区段，固定 lock 实际有多个 YAML 文档；两个失败均保留 |
| `compiler-inputs-r3.py` | 0 | 逐个 packages 区段核对，记录缺失输入；不代表编译通过 |
| `finalize.py` | 0 | 累计分类闭合，30 个输入状态核对，旧成果树 Git 状态和密封 bundle 摘要保持 |

修正的是本任务证据控制器的输入解析，没有放宽产品检查或修改历史失败。没有新增产品代码，因此没有重跑 B0、冷安装、服务专项、shell/tool、十场更新或 headed；没有执行外审。7 版本/29 条公告未重查，签名/撤销/native/干净主机/最终分发等门禁状态不变。

以下原始 JSON 均在专属树 `.context/checks/sdk-evidence-followup-20261008/`：

| 路径 | SHA-256 |
|---|---|
| `rc-field-form/result.json` | `8aefa8c34da68b5c9b3ee0d75363097bdb9cec0baee2d41587c501c3d18ce863` |
| `projection-result.json` | `84a4e6c47734dd3cfa0711cd6b32e3dbd5ce776df0e3a3a327f8b211d6db3d6e` |
| `duplicate-members.json` | `355ad2e1a6bb0a16134c5b3b6ae19a6c4e433fa5ddf9bd1767686fc9c548ae3e` |
| `compiler-inputs.json` | `aacf70b1ca740024a90079470b8c95170cc8df6a67e45a442be36bd71a40fc12` |
| `lock-recheck.json` | `d9ce2c539eba76aacbadee7a5ad53a1ae8f11983351ffaa7a45bb0f650d8dbe7` |
| `summary.json`，同机器汇总 | `70f243d81b86713c15c8dba096c8741c531b237176346392397c9cda803c6fde` |

完整包身份父门禁仍 OPEN，嵌入组成和 EMBED-INLINE-BYTES 账本仍 PARTIAL，产品 inline_function_bytes 仍 NOT_VERIFIED。运行 bundle、上游、plugin candidate/journal 均未改。未 commit、push、PR、合并、发布、部署，也没有真实业务数据或生产服务操作。
