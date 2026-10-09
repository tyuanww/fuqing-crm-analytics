# SDK 三个固定包的变换复现（2026-10-08）

smart-buffer 4.2.0、socks 2.8.10、semver-range-intersect 0.3.1 已在新隔离目录按原 build 字符串实际编译，三个退出码均为 0。对应原 null source 的 **12 个发布 JS 文件全部原始字节相等（2 + 6 + 4）**，没有修改或后处理输出。

关闭范围仅为这 12 条路径的本机变换证明。gitHead 是 registry 精确版本元数据声明，并不是独立验证的签名 provenance 或唯一源身份。没有重新打 npm tarball，没有据此关闭完整包身份或顶层门禁：SDK 分发仍 BLOCKED，EMBED-INLINE-BYTES 仍 PARTIAL，两个产品默认字段仍 NOT_VERIFIED，`release_ready=false`。官方 map 的 `sourcesContent` 仍 null，没有改写。

## 固定输入与实际命令

使用 B 已保存的三个 codeload 归档，先重新核对 archive SHA-256、registry gitHead 声明和安全成员边界，再提取到 A 树新的 `.context/checks/sdk-three-package-transform-20261008/work/`。没有使用旧构建产物充当编译输入；这 12 个 JS 输出路径在对应 commit 归档中均不存在。

| 包 | registry 声明 gitHead | 原锁固定工具 | 原 build 字符串 | 实际结果 |
|---|---|---|---|---|
| smart-buffer@4.2.0 | `2ce01c95312343325997b19e52daa166dc227930` | yarn.lock，TypeScript 3.5.3 | `tsc -p ./` | exit 0，1.200 s，JS 2/2 相等 |
| socks@2.8.10 | `ff3347684f29e68eb67d04e23d1ed466e7e55c76` | package-lock v3，TypeScript 5.9.3、Prettier 3.9.6 | `rm -rf build typings && prettier --write ./src/**/*.ts --config .prettierrc.yaml && tsc -p .` | exit 0，1.325 s，JS 6/6 相等 |
| semver-range-intersect@0.3.1 | `5323289d783b9be34a8108ec417b192560d809bf` | package-lock v1，TypeScript 3.5.3 | `tsc` | exit 0，0.608 s，JS 4/4 相等 |

控制环境是 Node 24.19.0，符合三个 package engines。本轮物化原 build 所需固定工具、运行时及类型闭包：smart-buffer 4 个、socks 10 个、semver 3 个，共 17 份物化、16 个唯一归档（TypeScript 3.5.3 共用下载但各包独立物化）。smart-buffer/socks 包括 typeRoots 可见的全部根 @types；semver 原 tsconfig 使用 `types: []`，只取显式导入相关依赖。没有安装无关 test/lint/release 闭包，不宣称完整 dev lock 安装通过。

16 个归档均使用正常 TLS 精确下载并匹配**原锁 SHA-512**；没有解析浮动版本。yarn 原 URL 与本轮 registry.npmjs.org 等价归档 URL 都保留，归档身份以同一原锁 SRI 校验。安全提取拒绝链接、设备、FIFO、绝对路径及越界成员，逐文件摘要和包内未执行的 scripts 有记录。未调用 install、prepublish、发布生命周期或全局安装；尤其未执行原 prepublish 中的 `npm install -g typescript`。

## 隔离与源码变化

实际构建经 macOS `sandbox-exec` 执行：拒绝全部网络、拒绝新目录之外写入，拒绝用户目录读取（仅固定 Homebrew 工具及本轮新目录可读）。每包使用新 HOME/TMP/cache/config/state，PATH 仅本包编译器入口与系统工具。真实拒绝探针得到 network EPERM、write EPERM，退出码 0；构建进程不能读取 B 的固定发布 store，比较在构建完成后由单独只读步骤完成。

包 manifest、原脚本、tsconfig 和原锁摘要均未变化。smart-buffer、semver 的归档已有文件未变化。socks 原 Prettier 步骤在新副本中改变了 `src/common/helpers.ts` 一处括号排版；已保存 `socks-prettier-helpers.diff`，不能宣称源码格式没变。原 build 同时重建 typings，四个原归档声明文件的字节发生变化；本轮不宣称声明或所有 map 相等。所比较的六个实际 JS 仍与固定发布文件原始字节完全一致，没有手工修补或输出后处理。

## 保留的失败与证据

本轮没有重跑编译。以下辅助准备/比较失败均保留：

- 首次准备器误取 `packages` 键，实际字段为 `packages_with_git_head`；在提取前停止。r2 按实际结构读取，不改变源材料。
- `@types/chai@4.1.7` 首次正常 TLS 连接超时（curl 28）；只重试该精确包，r2 摘要通过，没有关闭证书校验。
- 首次比较器假定只有一份上游 map，semver 实际同时有 `.d.ts.map` 与 `.js.map`，因断言退出；r2 只选择明确 `compiled_js_sibling` 的 JS map。未改任何构建产物。

[机器记录](shinemage-sdk-three-package-transform-validation-20261008.json)与本树 `.context/checks/sdk-three-package-transform-20261008/summary.json` 同字节，SHA-256 `9155b43227da6d227c696e13178825ac95bcb4350a3e89423f5cec95477f98a5`。12 组输出/发布路径、摘要、大小、源前后变化、实际命令/退出码均在原始 JSON 中。

精简原始清单为同目录 `archive-manifest.json`：218 文件，17,477,410 字节，SHA-256 `6f2c3a649cf8269e771470037a810eac10471c97432eb9b921fa9760cc766158`。清单包含固定源归档/registry 副本、16 个精确依赖归档、源副本和实际产物、12 个只读发布 JS 参考副本、控制器、sandbox、日志、失败和回执；排除可重新物化的 node_modules 与私有执行目录。没有复制真实库、凭据或会话。

本次未重跑原 bundle、B0、目标验收、模型或 OSV；没有写 B 材料/live store、集成树或旧树，没有提交、推送、PR、发布或部署。
