# SDK 两份 table 原配方变换复现（2026-10-08）

本轮实际运行 `table@6.9.0` 与 `@zkochan/table@2.0.1` 所关联固定 commit 的原生成及编译命令，两包各 35 个发布 `dist/src/**/*.js` 全部直接字节相等，包含生成 validators 的编译输出。SDK 分发仍 **BLOCKED**，`EMBED-INLINE-BYTES` 仍 **PARTIAL**，`release_ready=false`；八条顶层门禁不变。

施工树为 `shinemage-sdk-evidence/fuqing-crm-analytics`，detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。仅新增本轮隔离证据和交接，不改产品源码、校验器、主树、旧证据或 SDK 运行包，不提交。

| 对象 | 固定 gitHead 声明 | 历史缺失 TS 的 JS | 历史 generated validator 的 JS | 全部发布 JS | 原 build |
|---|---|---:|---:|---:|---|
| table@6.9.0 | `8b85bc8f7e5202c2fcea295bd59d4e7d25519c7a` | 32/32 相等 | 1/1 相等 | 35/35 相等 | exit 0，2.057 秒 |
| @zkochan/table@2.0.1 | `379f775bd320c39e236bee2080c57715b51c494a` | 32/32 相等 | 1/1 相等 | 35/35 相等 | exit 0，1.874 秒 |

66 条历史 null 路径是 70 个全部发布 JS 比较中的相关子集，不能相加。每条路径已按原包 map 的 source index、相邻发布 JS 和本次输出绑定。原 `sourcesContent` 仍为 null，没有改 map，也没有把新生成 source 冒称为旧发布 source 原字节。

## 固定输入与实际执行

先按前轮 `archive-binding.json` 核验两个不同 commit 归档及 registry 记录的摘要，分别读取各自锁。`gitHead` 是精确 registry 版本元数据的关联声明，不是已验证签名 provenance 或唯一源身份。table 归档 manifest 原版本是 `1.0.0`，保持原样；scoped table manifest 为 `2.0.1`、锁根版本为 `2.0.0`，同样没有改版本。

两包共准备 97 个不同 URL/SRI 的精确依赖 tar，全部满足各自原锁 SRI；原锁中既有 SHA-512 也有 SHA-1，未伪称全是 SHA-512。按原锁路径分别物化 85 和 94 个依赖条目，并保留每成员摘要和 bin 链接记录。这是受控的固定锁 tar 物化，不是一次 `npm ci`，没有执行依赖安装生命周期。

固定 Node 24.19.0、Python 3.14.4。现有 Node 附带 npm 11.17.0 仅运行原 `npm run create-validators`，不安装或更新工具。两包 TypeScript 均为 4.5.2、ajv-cli 5.0.0、ajv-keywords 5.1.0、js-beautify 1.14.0、mkdirp 1.0.4；table 的 AJV 为 8.8.1，scoped table 为 8.12.0，严格按各自锁，未互换。Node 引擎要求分别 >=10、>=16.14，固定 24.19.0 满足，无另换 runtime。

分别在新副本原样执行：

```sh
# 原 prebuild
rm -fr ./src/generated && mkdirp ./src/generated
# 原 build
npm run create-validators && tsc
# 原 create-validators，由 npm run 调用
ajv compile --all-errors --inline-refs=false -s src/schemas/config -s src/schemas/streamConfig -r src/schemas/shared -c ajv-keywords/dist/keywords/typeof -o | js-beautify > ./src/generated/validators.js
```

下载准备使用正常 TLS 与原锁精确 URL；执行使用 `sandbox-exec` 的 `deny network*` 和外部写入拒绝，只允许本轮目录与 `/dev/null` 写入。真实探针确认 loopback/外部地址连接及旧输入写打开均被拒绝，本轮目录可写。HOME、缓存、临时目录和空 npm 配置均属于本轮；下载和执行分开。原 tsconfig 包含 test，所以类型编译产生了 test 输出，但没有运行测试、lint、发布脚本或 install lifecycle。

构建后分别重验归档原有 123 个源文件，全部字节不变，两锁不变；旧归档/registry 摘要不变。比较直接读取发布 JS 与本次 raw JS；没有 normalize、替换、输出后处理或源码反推。

## 保留的失败与有限修复

1. 首轮 97 个下载中 8 个 TLS 连接超时（curl 28 / HTTP 000），保留原日志；同 URL 的一次低并发有界重试后 97/97 SRI 通过。
2. npm 版本探针首次因 user/global 指向同一空配置文件报 double-loading，旧失败保留；改成两个独占空文件后版本探针通过。
3. 首轮两包 build 均 exit 1：本轮 tar 装配器遗漏了声明 bin 的可执行权限，`ajv: Permission denied`。保留 `build.log`、结果 JSON 和当轮空 validators。仅对本轮依赖 8 个声明 bin 恢复可执行位，所有文件字节不变；`bin-mode-correction.json` 逐项记录。随后原 prebuild/build 第二轮通过。未改原 script、schema、锁、编译选项或输出。

## 原始证据与剩余边界

证据根为本施工树 `.context/checks/sdk-table-transform-20261008/`：

- `summary.json`、`comparison.json`：实际执行摘要及全部 70 个 JS 的路径/大小/SHA/直接比较。
- `null-path-transform-mapping.json`：两组各 32 TS + 1 generated validator 的 66 条原子映射，保留 map/index 和原 null 状态。
- `plan.json`、`downloads-final.json`、两包 `dependencies-materialized.json`：源/锁摘要、精确闭包、原锁 SRI 和成员记录。
- `offline.sb`、`sandbox-and-versions.json`、`environment-r2.json`、各 `*-r2-command.json`：实际隔离与命令。
- `execution-results.json`、`execution-results-r2.json`、`bin-mode-correction.json`：原失败、有限装配修复和实际第二轮退出码。
- `protected-inputs-after.json`、`archive-manifest.json`：保护输入复核、精简归档清单；排除展开 node_modules、完整旧 store/cache。

可复制交接 JSON 为 [shinemage-sdk-table-transform-validation-20261008.json](shinemage-sdk-table-transform-validation-20261008.json)。本轮关闭的是上述源码/生成配方到所比较发布 JS 的变换缺口；不是完整包身份、签名 provenance、原始 sourceContent 补全或最终分发签名。其他六个无 commit 包没有重查；既有双 bundle/B0/冷安装/公告/native 门禁没有重跑或改写。
