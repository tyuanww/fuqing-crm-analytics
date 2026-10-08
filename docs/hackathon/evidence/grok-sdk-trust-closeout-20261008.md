# T5/T15/T19：SDK 信任收尾（2026-10-08）

专属工作树：`/Users/hutou/.codex/worktrees/grok-sdk-trust-closeout/fuqing-crm-analytics`。

起点是集成树 `e577f41b9247e3ac56052e21f84daed9dd32f163` 的 detached HEAD，加上该树当时的 34 个未提交文件。本树对这些文件做了逐字节比较：34 个一致，0 个不一致。集成树未被 checkout、reset、stash 或改写；结束时仍是同一 SHA，porcelain 仍是 34 行。

这 34 个文件是继承快照，不是本任务成果。其中包括 `STATUS.md`、`TODOS.md`、`verification.md`、平台设计、`pipeline.mjs`、插件测试与七份既有交接。本任务没有改它们。

## 本任务相对起始快照的新增

Git 可见新增文件：

- `scripts/release/sdk-embedded-map.mjs`
- `scripts/release/sdk-embedded-map.test.mjs`
- `docs/hackathon/evidence/grok-sdk-trust-closeout-20261008.md`

可应用差异：`.context/checks/sdk-trust-closeout-20261008/product-delta.patch`。

`scripts/release/sdk-supply-chain.mjs` 未改。它的 `embedded_components` 仍是 `NOT_VERIFIED`，`release_ready` 仍是 `false`。新校验器没有接入 pipeline、验证总入口或插件更新。

证据目录（gitignore，不进入上述补丁）：`.context/checks/sdk-trust-closeout-20261008/`。

- `public/github-release-v11.28.2.json`
- `public/github-tag-v11.28.2.json`
- `public/github-tag-object-v11.28.2.json`
- `public/github-actions-run-36451958183.json`
- `public/github-actions-artifacts-36451958183.json`
- `public/query-time-utc.txt`
- `public/source-maps.tgz`
- `extracted/pnpm.mjs.map`
- `extracted/worker.js.map`
- `run-map.mjs`
- `analyze-remaining.py`
- `map-position.json`
- `analysis.json`
- `follow-up.json`
- `logs/sdk-embedded-map.test.log`
- `logs/run-map.log`
- `logs/analyze-remaining.log`
- `logs/follow-up.log`

固定 SDK、官方树、28 个既有 registry tarball 和前轮证据只读。没有复制 `.context`、`node_modules` 或数据库。没有安装依赖，没有执行 native/PE，没有运行 esbuild。

## 内联组成：现有证据能证明什么

缺口以前被写成“发布包没有 sourcemap / metafile”。pnpm 11.28.2 的 npm 包和 received-r3 的 `dist/` 仍然没有 `.map`，两个 bundle 也没有 `sourceMappingURL` 指令。官方 GitHub Release 另有一份外部 map。

本轮公开读取只针对 pnpm `v11.28.2`：

- 时间：首次 release 请求在 `2026-10-08T06:11:25Z` 因 TLS 握手超时失败；release 于 `2026-10-08T06:12:20Z` 取回；annotated tag 于 `2026-10-08T06:13:05Z` 取回。本续跑没有重发这些请求。
- 来源：`https://github.com/pnpm/pnpm/releases/tag/v11.28.2`，资源 `source-maps.tgz`，创建时间 `2026-09-28T16:53:45Z`，发布 `2026-09-28T17:40:47Z`。
- GitHub 记录的 digest 为 `sha256:ef5928c83dac89d6a9bf7c355b24b94b697c5c0d9063efaa58b2150fdd3f9091`，大小 7,267,693。本段复算本地 tarball，摘要相同。
- Actions run `36451958183` 的 artifact 列表是空的。map 是 release asset。annotated tag 对象 `6615a5e2152f28305c73405ad104c1617e330804`，GitHub API `verification.verified=true`、`reason=valid`。这是 GitHub 的声明，本轮没有本地重放 gpg。
- 7 个受影响版本 / 29 条公告仍是 `2026-10-08 01:23:04 +08:00` 至 `01:38:11 +08:00` 的既有查询，本轮未重查 OSV。

解出的两份 map 只做静态读取：

| 文件 | SHA-256 | mapped lines |
|---|---|---|
| `pnpm.mjs.map` | `4865d30c95de064d49e60dae5599de0a657d7f59c16856462fa43d4b44fd2a07` | 356912 |
| `worker.js.map` | `1384a64fa469e5f5d4b41aa77a4208eed9e88e3b6b6795e679e7a288d66aa55d` | 17302 |

产品函数对照的是 received-r3 里的密封 bundle，摘要与既有封存值一致：`pnpm.mjs` 15,457,230 字节，`00805e99c795e7067b0f459846393ca3f6a701ca9ae267fd48b99d11ecd423a8`；`worker.js` 613,034 字节，`9834d944929dba7566e230a084fff0ecdb1da1be777c72ecb5f00a41a04843a4`。

位置结果：

- `pnpm.mjs`：`CONSISTENT`，inside 1,432,507，end_of_line 43，outside 0，beyond_file 0，invalid 0，未映射尾部 201 行。
- `worker.js`：`CONSISTENT`，inside 69,157，end_of_line 0，outside 0，beyond_file 0，invalid 0，未映射尾部 13 行。
- 两份的 `source_mapping_directive` 都是 `ABSENT`。
- 函数返回的 `inline_function_bytes` 保持 `NOT_VERIFIED`，`release_ready` 保持 `false`。原因是 `POSITION_CONSISTENCY_DOES_NOT_PROVE_TRANSFORMED_BYTES`。

未映射尾部从最后一条已映射行 `/*! Bundled license information:` 延续，到唯一的 `*/` 结束，其后没有非空白。两条尾部都记为 `UNMAPPED_LICENSE_COMMENT`。

仓库源（map 的 `sourcesContent` 对 commit `57e7b9b76ac3a5ef67461093071b2264335a1a01` 的树 `d506a194e838ba5d01fee37d42f075fe55f4f01b`，树未截断）：

- 条目：git blob 一致 939，不在树中 15，store 路径 2764，`sourcesContent` 为 null 86。
- 唯一仓库路径：一致 883，不在树中 15，hash mismatch 0。
- 抽查 `pnpm11/core/constants/src/index.ts`：本地官方副本与树 blob 都是 `f7582967f523dcaeabe22c16501f152550b56839`。
- 15 个不在树中的路径全部是编译产物 `lib/*.js`，例如 `pnpm11/core/logger/lib/LogBase.js`、`pnpr/client/lib/protocol.js`。完整 15 条在 `analysis.json` 的 `git_exceptions`。

既有 28 个 registry tarball 与 map 中 store 源的重叠：

- 68 个文件与 tarball 成员字节一致。
- 1 个不一致：`graceful-fs@4.2.11` 的 `graceful-fs.js`。map 与密封部署副本都是 `b47953721e408e70e23753c83ccdd06baaf40e3b942aa5e0e1d56db71287cc54`（12,704 字节）。registry 原文是 `7da35669b6b6b0e4aafee31674c033f2cebb0c8f9ae010f709dcc185d3f17786`（12,680 字节）。既有补丁键 `68ebc232025360cb3dcd3081f4067f4e9fc022ab6b6f71a3230e86c7a5b337d1` 本轮没有重放。
- 42 条路径不在对应 tarball 里。样例是 `minipass` 的 `src/index.ts`，以及 `tar` 路径下嵌套的 `node_modules/...`。完整清单只保留了前 12 条。
- 2483 个 store 文件不在这 28 个 tarball 中，记为未比较。

因此内联缺口现在是三块，而不是“找不到 map”：

1. 883 个仓库源已有 commit blob 映射。15 个编译后的 `lib/*.js` 和 86 个 null `sourcesContent` 还没有源字节。
2. store 源只核对了已在本地的 28 个包。其余包缺 registry tarball 字节，以及与 lock integrity 的逐字节核对。
3. 变换后的 bundle 字节是否等于该 recipe 的编译输出，本轮 `NOT_RUN`。`bundle.ts` 使用的 esbuild 与 SDK 里的 `@esbuild/darwin-arm64@0.25.12` 不是同一个编译器。本轮不执行 esbuild。

## 本段命令

工具链：`/Users/hutou/homebrew/opt/node@24/bin/node` 24.19.0，`/Users/hutou/homebrew/opt/python@3.14/bin/python3.14` 3.14.4。工作目录是专属工作树。

| 命令 | 退出码 | 结果 | 日志 |
|---|---|---|---|
| `tar -xzf public/source-maps.tgz -C extracted pnpm.mjs.map worker.js.map` | 0 | 只解出两份 map | 本段终端输出 |
| `node --test --test-concurrency=1 scripts/release/sdk-embedded-map.test.mjs` | 0 | PASS 5 / FAIL 0 / SKIP 0 | `logs/sdk-embedded-map.test.log` |
| `node .context/checks/sdk-trust-closeout-20261008/run-map.mjs` | 0 | 两份 `CONSISTENT`；`inline_function_bytes=NOT_VERIFIED`；`release_ready=false` | `logs/run-map.log`，`map-position.json` |
| `python3.14 -I -B analyze-remaining.py` | 0 | 见 `analysis.json`；`release_ready=false` | `logs/analyze-remaining.log` |
| 继承文件逐字节比较 | 0 | 34 match / 0 mismatch | 本段终端输出 |
| graceful-fs 与 lock 分类补记 | 0 | map 等于部署副本，不等于 registry 原文 | `logs/follow-up.log`，`follow-up.json` |

未执行，不能改记为通过：OSV 重查、pnpm 11.28.2 attestation 重证、esbuild 重建、native/PE 执行、Mach-O `codesign` 重跑、图片/字体再解码、DSH 安装、干净主机准备、B0、服务专项、shell/tool、查询冷安装、十场更新、headed 25/25。

## 门禁

| 门禁 | 本轮之后 | 实际落地的子项 | 仍缺的材料 |
|---|---|---|---|
| SDK-EMBEDDED-COMPOSITION | PARTIAL | 既有四项 PROVEN 保持。新落地：官方 map 资产摘要、两份位置一致性、883 个仓库源 blob、尾部许可证注释、graceful-fs map 与部署副本一致 | 见上节三块。父门禁保持 PARTIAL |
| EMBED-INLINE-BYTES | PARTIAL | 上列源映射和位置结果。产品字段仍返回 `NOT_VERIFIED` | 可重现的变换字节；15 个 `lib/*.js`；86 个 null 源；其余 store tarball |
| SDK-FULL-PACKAGE-INTEGRITY-IDENTITY | OPEN | 212 个 installed-package 在 upstream/build-tools lock 里各有一条 sha512 声明。26 个 corepack 部署包和 pnpm 11.28.2 管理器沿用既有证明，本轮未重证 | 这 212 条声明没有对照 tarball 字节。120 个 workspace 源是固定树里的 DSH 包，没有 registry integrity。另有 1 个嵌套清单 `fast-uri/benchmark/package.json`（`benchmark@1.0.0`）不在 lock 中 |
| SDK-UPSTREAM-ADVISORIES | BLOCKED_UPSTREAM_RELEASE | 无新查询 | 仍用同日 7 个版本 / 29 条公告。缺官方替换这些版本的 commit/release，以及对该候选的身份、依赖和兼容核验 |
| SDK-REVOCATION | OPEN | `scripts/release/trust.mjs` 仍在固定 Sigstore verifier 到位前 fail-closed | 签名的撤销/允许名单、回滚和 fail-closed 刷新测试 |
| SDK-NATIVE-EXECUTION-SAFETY | OPEN | 4 个 PE 的证书表虚拟地址和大小都是 0，嵌入签名记为 `ABSENT`，文件未执行 | 作者签名、源/构建映射、各平台上的预期行为。既有 Mach-O ad-hoc/无签名结果未重跑 |
| SDK-ASSET-PARSER-SAFETY | PARTIAL | 无新运行 | 浏览器侧解析和资源限制。既有 Pillow/FreeType 格式子检查保留 |
| SDK-COMPLETE-PREPARATION-AND-CLEAN-HOST | OPEN | 无新运行 | 独立的干净主机准备。不把 SDK prepare 加进每次业务插件更新 |
| SDK-FINAL-DISTRIBUTION-SIGNATURE | OPEN | 无新运行 | 授权发布者对最终 SDK 摘要、配方和 SBOM 的 attestation |
| distribution | BLOCKED | 无 | 上列未关闭项。`release_ready` 保持 false |

没有一条顶层门禁被记为通过。单项源映射没有升级成 SDK 放行。

## 运行包与旧验收

本轮没有改 received-r3、插件包、pin、上游源码、profile、candidate 或 journal。运行包字节不变。既有 B0、服务专项、shell/tool、查询冷安装、十场更新和 headed 25/25 的验收对象没有变化，那些证据继续有效。本目录是新增 SDK 证据，不替换它们。

## 请主 Agent 集成时处理

建议只在 SDK 证据索引中收下本交接，并把 `EMBED-INLINE-BYTES` 记为 PARTIAL。`SDK-EMBEDDED-COMPOSITION` 保持 PARTIAL，distribution 保持 BLOCKED，`release_ready` 保持 false。

不要把 `sdk-embedded-map.mjs` 接到每次插件更新、pipeline、正式 profile、candidate 或 journal。不要放宽 `sdk-supply-chain.mjs` 的默认 coverage。不要在 `STATUS.md`、`TODOS.md`、`AGENTS.md`、`VERSION` 或 `CHANGELOG` 里把 T5/T15/T19 勾完。

本任务没有 commit、push、PR、合并、发布或部署。
