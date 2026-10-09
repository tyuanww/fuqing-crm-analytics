# SDK 隔离配方工具链 — 2026-10-08

本轮只准备用户明确授权的配方复现工具链。Node 26.10.0、Node 24.6.0 和 pnpm 12.7.0 的官方归档已核对，三条 `--version` 均退出 0 并返回精确版本。`release_ready=false`；这不是源码构建、bundle 字节复现或 SDK 分发通过。

工作树是 `shinemage-candidate-admission`，没有改产品代码、默认环境、SDK 或 DSH，也没有提交。完整机器可读交接见 [validation](shinemage-sdk-recipe-toolchain-validation-20261008.json)。原始目录为 `.context/checks/sdk-recipe-toolchain-20261008/`。

## 可承接入口

以下均相对原始目录，使用时应展开成绝对路径，子进程的 HOME、缓存和 store 继续使用接收任务自己的隔离目录：

- 根配方 Node：`tools/node-26.10.0/bin/node`。
- `pnpm11/pnpm` 的 bundle 脚本 Node：`tools/node-24.6.0/bin/node`。
- 包管理器：`tools/pnpm-12.7.0-native/pnpm`。直接使用精确平台二进制，不执行 wrapper bootstrap 或 install.js。
- 官方归档、SHASUMS 和精确 npm 元数据：`downloads/`。
- 逐请求 URL、curl 参数、TLS 结果、退出码和摘要：`logs/*.request.json`。
- 三份版本查询命令、完整隔离环境、stdout/stderr 和退出码：`logs/*-version.json`。

## 实际字节校验

| 归档 | SHA-256 | 核对依据 |
| --- | --- | --- |
| node-v26.10.0-darwin-arm64.tar.gz | 751fdf7439f115d87ee2a8f3f18c065b6151852068e3e666ac60ac2996f75ac9 | 官方该版本 SHASUMS256 的准确文件名 |
| node-v24.6.0-darwin-arm64.tar.gz | 768f14952403e3025fed8e2887500dfa63eeb55628a9b203e4b8ebb0fb09c7eb | 官方该版本 SHASUMS256 的准确文件名 |
| pnpm-12.7.0.tgz | 1a7fe4b36abead79ee13e2f2c2089ddd37fee016179b9fe56a85a44ef72aaf7f | 精确 npm 元数据 SHA-512 integrity 及 SHA-1 |
| pnpm-exe-darwin-arm64-12.7.0.tgz | 971c089cc6c57f2f5df0611b431401dd96dfa707de28ec7554d5eec552701b74 | 精确平台 optionalDependency 元数据 SHA-512 integrity 及 SHA-1 |

通过官方 HTTPS、系统 CA 和限定超时/体积取得材料，没有关闭 TLS。共 11 次请求，8 次成功；24.6.0 的 SHASUMS、pnpm 元数据及平台包元数据各首次 SSL 连接超时，退出码 28 的原始记录均保留，各自第二次成功。请求没有执行下载脚本或安装包。

静态提取仅写新目录，拒绝绝对路径、路径穿越、重复成员、特殊文件和硬链接；Node 中的 2/3 条符号链接均留在对应提取根目录。26.10.0 有 4743 个常规文件，24.6.0 有 5034 个，pnpm wrapper 449 个，native 4 个，逐成员摘要和模式保存在 manifests 中。

pnpm 12.7.0 是 native 包装器。其 wrapper 的 preinstall/postinstall 都是 `node install.js`，静态检查显示其会把平台二进制放到 wrapper 入口；bootstrap 另有下载回退。本轮两者均未执行。对应 `@pnpm/exe.darwin-arm64@12.7.0` 没有 package scripts，本轮直接对核验后的 native 执行 `--version`。三次版本查询均在本任务新目录、白名单子进程环境中执行；结束后 private 目录没有新增文件。

## 边界与剩余

- 正常 TLS 和官方摘要相等不代表独立签名、撤销或 attestation 门禁通过，这些仍未执行。
- 本轮没有依赖安装、store 导入、源码构建或 bundle 字节比较；后续由 SDK 配方任务使用这些只读工具材料继续。
- SDK 分发、既有八条门禁、candidate/journal、B0 和业务验收均不因这三条版本查询改变状态。
- 根配方 Node 26.10.0 与 bundle 脚本 Node 24.6.0 是固定源码的两个不同执行角色，不替换日常控制解释器 Node 24.19.0。

原始 summary 与跟踪 validation 字节一致，SHA-256：`4ea250d346f9aa486f46061b98000dde48dbefaabe60026d5ac634846d617ab7`。其中列出 37 份原始文件的摘要；本轮未提交、推送或发布。
