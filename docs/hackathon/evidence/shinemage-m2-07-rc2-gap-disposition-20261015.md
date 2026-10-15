# M2-07 当前 rc2 closure coverage gap disposition（2026-10-15）

本记录对当前主仓固定 rc2 development closure 的 17 个内容审计 coverage gaps 做路径和用途分类。它只处理审计范围和下一步 provenance 要求，不把二进制、字体或原生模块自动判为安全，也不改变 `release_ready=false`。

## 输入

```text
upstream_sha=477b4f420553e8a52c2fbccc464d7561b239c443
pin_sha256=8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe
source_archive_sha256=04d0d8102232634b50869f9d168de0aecd1582e0d2beab15e72ab565c6ac9ead
closure_sha256=6bce087aec3255b922545ae4b94432470f1646d2ab2291f734cd953b772bfc54
content_audit_sha256=ac635c98e7e2897dbf1dcf6d08fade2931b4d8979fadb8624a96402fcd405000
coverage_gaps=17
secret_findings=0
status=PARTIAL
release_ready=false
```

原始报告：

```text
.context/checks/m2-07-rc2-local-materials-20261015/m2-07-rc2-content-audit-20261015.json
```

## 分类结果

| 分组 | 数量 | 审计内容 | disposition |
|---|---:|---|---|
| build-tools UI assets | 6 | `rc-tree` 与 `rc-tree-select` 的 PNG/GIF 资源 | 绑定 build-tools package、manifest 和文件 SHA；最终 SDK 不需要时从 artifact 排除，需要时保留 provenance |
| Corepack bundled native | 6 | pnpm `@reflink` 的 Darwin/Windows `.node` 以及 `fastlist` Windows 可执行文件 | 明确 bundled/toolchain scope、平台架构矩阵、来源和文件 SHA；不能用 registry integrity 缺失直接判通过 |
| upstream native/binary | 2 | Darwin arm64 `esbuild` 与 `node-addon-require-builtin` 原生模块 | 补充 package owner、构建来源、ABI/架构和最终 artifact 绑定 |
| workspace font assets | 3 | `ui-theme` 的 Montserrat WOFF2 字体 | 补充 workspace source、许可证/来源、文件 SHA 和 artifact manifest 绑定 |

原因计数：

```text
binary-or-nontext=10
native-or-wasm=7
```

## 当前处理边界

- 本轮确认 17 个 gap 都有固定路径和 SHA-256，没有丢失条目。
- 6 个 build-tools 资源和 6 个 Corepack bundled native 文件属于开发工具闭包，是否进入正式 SDK 必须由最终 artifact manifest 决定。
- 2 个 upstream native/binary 文件需要最终 package/source/ABI 绑定，当前内容审计不能证明其安全性或跨平台可用性。
- 3 个字体文件不是 npm registry package tarball，必须补充 workspace source 和许可证/来源信息。
- 当前没有对应的正式 immutable artifact，因此不能把“已分类”写成“已关闭”。

## 结论

当前 rc2 closure 的 17 个 coverage gaps 已完成逐项分组和下一步处理定义，但 provenance、最终 artifact scope、ABI/语义审计和签名绑定仍未完成。M2-07 继续保持：

```text
BLOCKED / SBOM_LOCAL_PROJECTION_PASS / OPAQUE_NATIVE_REVIEW_REQUIRED / release_ready=false
```

正式 artifact 到位后，应按本表逐项核对 manifest、source、owner、平台/架构、文件 SHA、SBOM 和签名绑定，再决定是否能关闭该 coverage 子门禁。
