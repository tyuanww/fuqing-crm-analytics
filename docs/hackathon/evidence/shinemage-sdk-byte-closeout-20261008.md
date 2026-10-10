# SDK 固定字节与补丁重放补证（2026-10-08）

承接[SDK 收尾交接](grok-sdk-trust-closeout-20261008.md)及[并行集成](shinemage-parallel-closeout-20261008.md)，仅推进既有来源字节缺口。产品源码、SDK、上游、profile 和 journal 均未改，SDK 分发仍 **BLOCKED / release_ready=false**。

## graceful-fs 来源差异已通过固定补丁解释

固定官方 commit `57e7b9b76ac3a5ef67461093071b2264335a1a01` 的 tree 中，补丁 git blob 为 `1659a7352943702909af809bee3870ebbcc0a716`；本地补丁字节与 blob、lock 中的 SHA-256 `68ebc232…`、workspace 的补丁路径一致。registry tarball 原字节通过该固定 lock 的 SHA-512 核验。

在新自有目录只写入 tarball 中的 `graceful-fs.js`，用系统 patch 工具 dry-run 后以 `-F 0` 应用既有补丁，无 fuzz/offset。结果为 12,704 字节，SHA-256 `b47953721e408e70e23753c83ccdd06baaf40e3b942aa5e0e1d56db71287cc54`，与密封部署副本及 sourcemap 的对应 sourcesContent 完全相等。

这关闭“graceful-fs registry 原文与 map/部署副本差异尚未重放补丁”的具体子项。原分析中 68 个直接相同文件、1 个差异的历史统计不回写；新增记录将该差异解释为固定补丁后的相同字节。没有运行包代码、native/PE 或 esbuild，也不证明整个变换后 bundle。

证据：`.context/checks/sdk-graceful-patch-replay-20261008/r2/result.json`。首轮控制器误按 hash/path 对象解析 lock，实际格式是标量 hash、路径在 workspace；失败在写入包文件前发生，原控制器、失败记录和输入摘要保留，修正解析后通过。

## 212 条安装记录的固定 tarball 与普通文件比对

来源为原 `current-inventory.json` 与密封 received-r3 的 upstream/build-tools 两份锁；212 条 installed-package 记录对应196个唯一name/version。仅请求 `https://registry.npmjs.org/` 下的精确版本 tarball，使用系统公共 CA，保持TLS，拒绝跨站或非HTTPS重定向。下载有大小/时间上限，不运行包管理器，不安装依赖或执行包代码，不查询 latest/OSV。

首轮196项：173个tarball匹配lock SHA-512，其中171项完成普通文件比较，2项因归一化后的重复成员路径拒绝；另23项网络失败。仅对网络失败做一次独立重试，22项恢复、1项仍超时；未覆盖首轮记录，没有第三轮网络重试。

| 当前汇总 | 结果 |
|---|---:|
| 固定 tarball 摘要已匹配 | **195 / 196 个唯一版本** |
| 安装记录的普通文件字节直接一致 | **200 / 212 条** |
| 既有补丁重放后全部对应文件一致 | **2 / 212 条** |
| 已核对缺失文件，保持 PARTIAL | **7 / 212 条，合计305文件** |
| 重复归一化成员路径，保留拒绝 | **2 / 212 条** |
| 网络失败，尚未验证 | **1 / 212 条** |

200+2+7+2+1=212；重试不重复计数。这是文件内容比较，不是发布者身份、签名撤销、文件权限模式或包代码安全证明。120个workspace源、此前26个pnpm部署包及管理器的既有证据不计入这212条。嵌套依赖目录不当作当前包的额外文件，包自身的tarball成员仍逐项核对，依赖由独立安装记录约束。

### 两份既有类型补丁

- `antd@5.29.3`：3753文件直接相同，两个 `useForceUpdate.d.ts` 由固定 `b9a69e8e…` 补丁重放后一致。
- `rc-picker@4.11.3`：567文件直接相同，两个 `PickerPanel/index.d.ts` 由固定 `32a1444d…` 补丁重放后一致。

补丁取自密封 received-r3，核对lock/workspace及当前仓库同字节副本，只在新目录应用。未修改部署副本、旧SDK、原包或类型实现。两项首次比对的差异仍保留，新回执补充解释。

### 保持的缺口

- `rc-field-form@2.7.1`：重试仍超时，不记作摘要失败或通过。
- `agent-base@7.1.4`、`https-proxy-agent@7.0.6`：tarball摘要匹配，但各含 `package/./dist/index.js` 与 `package/dist/index.js` 两个归一化后同路径成员。它们内容摘要相同，仍保留原重复路径拒绝，不放宽解包/归一化规则，也没有解包到SDK。
- 已核对 `.context/checks/sdk-installed-integrity-20261008/summary.json` 的 `missing_records`，缺文件记录：`@js-temporal/polyfill@0.5.1` 32个、`@types/mdast@4.0.4` 1个、`@types/unist@3.0.3` 1个、`commander@15.0.0` 9个、`lexical@0.49.0` 52个、`micromark-util-types@2.0.2` 2个、`katex@0.16.47` 208个。包括源码、文档及部分dist文件。缺失列表本身不证明故障或恶意，也不能因SDK缩减就自动豁免，当前仅如实保留为PARTIAL；本轮未补装或重建。

原始输入、逐包JSON、下载原包、重试及补丁回执位于 `.context/checks/sdk-installed-integrity-20261008/`；[机器汇总](shinemage-sdk-byte-closeout-validation-20261008.json)包含已核对的分类、缺失路径和原始证据摘要。TLS和下载失败日志在各包JSON内，不是外审或业务测试失败。

## 门禁与保护

完整包完整性/身份父门禁仍 **OPEN**；本轮只补了大部分tarball及安装文件字节。`EMBED-INLINE-BYTES` 证据账本仍PARTIAL，校验器inline_function_bytes仍NOT_VERIFIED，八条顶层门禁未新增PASS。上游7版本/29公告没有重查；签名、撤销、干净主机、资源/native安全和完整变换输出保持各自未关闭状态。

未调用第三次探针外审，未重跑B0、服务专项、shell/tool、查询冷安装、十场更新或headed。未读真实DuckDB，未操作杭州、6677、旧CRM、WeKnora，未改DSH上游或共享构建环境。正式candidate/journal仍NOT_LINKED，CI仍NOT_RUN；未commit/push/PR/合并/发布/部署。
