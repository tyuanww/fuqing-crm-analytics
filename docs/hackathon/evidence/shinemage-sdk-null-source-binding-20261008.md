# 11 个精确包的 86 条 null 源处置（2026-10-08）

11 个包、86 条路径都已有处置。76 条已从 registry 精确版本的 `gitHead` 归档中按 map 相对路径取得源字节，发布关联成立，到当前发布 JS 的变换未证明。2 条 `src/generated/validators.js` 在对应 commit 中不存在。其余 8 条所在的 6 个包没有固定 commit。map 的 `sourcesContent` 仍为 null。EMBED-INLINE-BYTES 仍为 PARTIAL，SDK 分发仍 BLOCKED，`release_ready` 仍为 false。

本轮没有重做两份 bundle、两份官方 map、15 个 compiled lib、2594 条有内容 store 条目及其复核。没有重查 OSV，没有编译、安装或执行包代码，没有重下 tarball，没有改产品检查器、主树 STATUS/TODOS、candidate 或 journal。HEAD 保持 `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。

## 已取得的材料

固定 lock 是 `grok-sdk-trust-20261008T101338/official/pnpm-lock.yaml`，SHA-256 `0dd3e839cb46139f376e0345ba6ea492a70cc9196caf6b74ae07703d0e485b94`。11 个精确版本的 registry `dist.integrity` 都与该 lock 的 integrity 字符串相同。这是同一版本文档里的摘要对齐，本轮没有重新下载 tarball，也没有把安装目录再审成完整包身份。

5 个版本文档带有 40 位 `gitHead`。codeload 按该 commit 返回归档，归档根只有一个，map 相对路径与记录路径一致。文件按该路径抽出。同名但路径不同的文件没有当作命中。

| 包 | gitHead | 归档字节 | 归档 SHA-256 | 取得 / 路径 |
|---|---|---:|---|---:|
| `smart-buffer@4.2.0` | `2ce01c95312343325997b19e52daa166dc227930` | 58072 | `70ef032b30de3581aed153a4f25afc6cd856b40e50bc16ae27b66788df55984b` | 2 / 2 |
| `socks@2.8.10` | `ff3347684f29e68eb67d04e23d1ed466e7e55c76` | 44438 | `dce82acf8c046e7aa97326ad890ae06d67dccc0bf8431ff5967a4b966edd00fc` | 6 / 6 |
| `table@6.9.0` | `8b85bc8f7e5202c2fcea295bd59d4e7d25519c7a` | 1409881 | `e146667c39ed183e93c51cc708275286c890449be33ce920c339275268e20bfe` | 32 / 33 |
| `semver-range-intersect@0.3.1` | `5323289d783b9be34a8108ec417b192560d809bf` | 72784 | `f8b604803717cc128ac32cae2e77c71a966031384f7a1ab924d7f338b836931c` | 4 / 4 |
| `@zkochan/table@2.0.1` | `379f775bd320c39e236bee2080c57715b51c494a` | 1409767 | `24ecaa95bb80034a904b9f08cd2691f78d70e77191ea8cf53ddc4a8f19f060e3` | 32 / 33 |

`table@6.9.0` 与 `@zkochan/table@2.0.1` 都指向 `gajus/table`，commit 不同。32 个同路径文件里 27 个字节相同，5 个不同：`src/spanningCellManager.ts`、`src/stringifyTableData.ts`、`src/table.ts`、`src/utils.ts`、`src/validateTableData.ts`。两份归档都保留，没有互相替代。

76 条源文件共 231,493 字节，落在 `.context/checks/sdk-null-source-binding-20261008/files/`。逐条 SHA-256 在 [机器记录](shinemage-sdk-null-source-binding-validation-20261008.json)，该文件 SHA-256 `b26d568b7b7bd50fabf3a1dcb10a6337d461fb2f126879e9bf1f6f285bdf6717`。

## 变换仍未证明

取得的是 commit 里的源文件。发布 map 的 `sourcesContent` 仍是 null。本轮没有运行 tsc、prettier 或 ajv，因此不能把这些文件记成当前发布 JS 的生成输入。

| 包 | 发布元数据里的构建声明 | 仍缺的变换输入 |
|---|---|---|
| `smart-buffer@4.2.0` | `tsc -p ./`；`typescript` 为 `^3.2.1`；commit 内有 `tsconfig.json` | 精确的 TypeScript 版本及其工具链字节 |
| `socks@2.8.10` | `prettier --write` 后再 `tsc -p .`；`typescript` 为 `^5.3.3`，`prettier` 为 `^3.2.5` | 这两个工具的精确版本字节；还要证明 prettier 没有改写已取得的源文件 |
| `semver-range-intersect@0.3.1` | `build` 为 `tsc`；`typescript` 精确为 `3.5.3`；commit 内有 `tsconfig.json` | `typescript@3.5.3` 的字节和一次未执行的编译比较 |
| `table@6.9.0`、`@zkochan/table@2.0.1` | `typescript` 精确为 `4.5.2`；`prebuild` 删除 `src/generated`，`create-validators` 再用 ajv 生成 `validators.js` | `typescript@4.5.2` 字节；`ajv-cli@^5.0.0`、`ajv-keywords@^5.0.0`、`js-beautify@^1.14.0`、`mkdirp@^1.0.4` 的精确版本 |

两个 table commit 的归档里已有 `src/schemas/config.json`、`src/schemas/shared.json`、`src/schemas/streamConfig.json`。schema 在场并不产生 `validators.js`。

## 86 条路径

`SOURCE_BOUND` 表示源字节和发布关联已记录，变换为 `NOT_PROVEN`。`ABSENT` 表示固定 commit 中没有该路径。`NO_PIN` 表示 registry 精确版本没有可用 commit。

| index | 包 | 路径 | 处置 |
|---:|---|---|---|
| 913 | `smart-buffer@4.2.0` | `src/utils.ts` | SOURCE_BOUND |
| 914 | `smart-buffer@4.2.0` | `src/smartbuffer.ts` | SOURCE_BOUND |
| 915 | `socks@2.8.10` | `src/common/constants.ts` | SOURCE_BOUND |
| 916 | `socks@2.8.10` | `src/common/util.ts` | SOURCE_BOUND |
| 926 | `socks@2.8.10` | `src/common/helpers.ts` | SOURCE_BOUND |
| 927 | `socks@2.8.10` | `src/common/receivebuffer.ts` | SOURCE_BOUND |
| 928 | `socks@2.8.10` | `src/client/socksclient.ts` | SOURCE_BOUND |
| 929 | `socks@2.8.10` | `src/index.ts` | SOURCE_BOUND |
| 1499 | `safe-execa@0.3.0` | `src/index.ts` | NO_PIN |
| 1801–1812、1815–1819、1821–1834、1836 | `table@6.9.0` | 除下一行外的 32 个 `src/*.ts` | SOURCE_BOUND |
| 1814 | `table@6.9.0` | `src/generated/validators.js` | ABSENT |
| 1837 | `render-help@2.0.0` | `src/index.ts` | NO_PIN |
| 2073 | `semver-range-intersect@0.3.1` | `src/utils.ts` | SOURCE_BOUND |
| 2074 | `semver-range-intersect@0.3.1` | `src/single-range.ts` | SOURCE_BOUND |
| 2075 | `semver-range-intersect@0.3.1` | `src/multi-range.ts` | SOURCE_BOUND |
| 2076 | `semver-range-intersect@0.3.1` | `src/index.ts` | SOURCE_BOUND |
| 2854–2865、2867–2885、2887 | `@zkochan/table@2.0.1` | 除下一行外的 32 个 `src/*.ts` | SOURCE_BOUND |
| 2866 | `@zkochan/table@2.0.1` | `src/generated/validators.js` | ABSENT |
| 3314 | `agent-base@7.1.4` | `src/helpers.ts` | NO_PIN |
| 3315 | `agent-base@7.1.4` | `src/index.ts` | NO_PIN |
| 3316 | `http-proxy-agent@7.0.2` | `src/index.ts` | NO_PIN |
| 3317 | `https-proxy-agent@7.0.6` | `src/parse-proxy-response.ts` | NO_PIN |
| 3318 | `https-proxy-agent@7.0.6` | `src/index.ts` | NO_PIN |
| 3319 | `socks-proxy-agent@8.0.5` | `src/index.ts` | NO_PIN |

`table` 与 `@zkochan/table` 的 32 条逐项索引和摘要在机器记录的 `paths` 数组，不在上表展开。

## 六个包停止时缺的材料

这 6 个包的 registry 文档 HTTP 200，integrity 与 lock 一致，`gitHead` 为空。`https://registry.npmjs.org/-/npm/v1/attestations/<包>@<版本>` 均为 HTTP 404。发布的 `repository` 只给了仓库或 `tree/main/...`，`main` 没有被当作 commit。没有改用 tag、分支或其他版本。

| 包 | 发布仓库字段 | 要补上才能继续的材料 |
|---|---|---|
| `safe-execa@0.3.0` | `zkochan/packages` 的 `tree/main/safe-execa` | 该精确版本的 40 位 commit，或已验证的 provenance commit |
| `render-help@2.0.0` | `zkochan/packages` 的 `tree/main/render-help` | 同上 |
| `agent-base@7.1.4` | `TooTallNate/proxy-agents`，目录 `packages/agent-base` | 同上 |
| `http-proxy-agent@7.0.2` | 同仓库，目录 `packages/http-proxy-agent` | 同上 |
| `https-proxy-agent@7.0.6` | 同仓库，目录 `packages/https-proxy-agent` | 同上 |
| `socks-proxy-agent@8.0.5` | 同仓库，目录 `packages/socks-proxy-agent` | 同上 |

两条 `validators.js` 还缺：该路径在 commit `8b85bc8f…` 与 `379f775b…` 中的文件字节，或能生成它的 `ajv-cli`、`ajv-keywords`、`js-beautify`、`mkdirp` 精确版本。生成之后仍要单独证明变换。

## 命令

| 命令 | 退出码 | 范围 |
|---|---:|---|
| `/Users/hutou/homebrew/opt/python@3.14/bin/python3.14 .context/checks/sdk-null-source-binding-20261008/bind.py` | 0 | 11 份精确版本元数据、11 次 attestation、4 次 `api.github.com` commit 查询 |
| 在证据目录执行 `python3.14 bind-archives.py` | 0 | 只对已有 `gitHead` 的 5 个 commit 拉取 codeload 归档；没有再调用 `api.github.com` |

Python 为 3.14.4。TLS 使用系统 CA `/etc/ssl/cert.pem`，未关闭校验。

第一次 `api.github.com` 查询返回 403 `rate limit exceeded`。`binding.json`（SHA-256 `b9a6019464f6840e6c27134d5e8d4c9b00808b4317d17e9b5f46d514d88b8033`）把这次 403 记成 commit 不存在，并因 scoped 安装路径写错而没读到 `@zkochan/table` 的本地 `package.json`。该文件保留。最终处置以 registry 文档和 codeload 归档为准，没有重试这个 403。

## 可关闭与仍开放

可关闭的子项只有：76 条路径已经取得 registry `gitHead` 所指向 commit 的对应源字节，并且版本、lock integrity、registry integrity、commit 归档、map 相对路径连在一起。

仍开放：86 条 map 的 null `sourcesContent`；86 条到发布 JS 的变换；2 条生成文件字节；8 条没有固定 commit 的路径。完整包身份、签名、撤销、native、干净主机和产品默认字段都没有因此改变。没有新的顶层 PASS。

没有新的固定 commit、已验证 provenance 或上述精确工具链字节时，这 11 个包不再进入下一轮。

## 证据

目录：`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-null-source-binding-20261008/`

| 文件 | SHA-256 |
|---|---|
| `bind.py` | `d88f2b07d7491e4774575dc7f4e94b052e55afef3aa4d8f0691b7b3dac55b01c` |
| `bind-archives.py` | `e5ca16a7edd3e6f1d1d8298340eb1c47d459aaabed47a668966959bc21241e9c` |
| `binding.json` | `b9a6019464f6840e6c27134d5e8d4c9b00808b4317d17e9b5f46d514d88b8033` |
| `archive-binding.json` | `3fa98385875b250ded0c0622ff3a3f623cfca8af5d5e16240123173c43a6fe07` |

`null-source-open.json` 仍为 `1a92961310c8b5dda4aaa405b54ca774bd5aad3b9b4da360fd83485a5d9f4096`。未 commit、push、PR、合并、发布或部署。
