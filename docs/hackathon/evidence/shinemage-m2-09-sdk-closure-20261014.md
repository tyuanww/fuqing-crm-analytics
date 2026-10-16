# M2-09 alpha2 SDK 归档与缩减闭包（2026-10-14）

本轮继续使用已通过准备的 alpha2 开发 SDK 输入，在隔离 `.context/checks` 目录完成归档、接收和缩减闭包投影。主仓 rc2 pin、正式 profile/journal、live/current 和 release/activation 均未修改。

## 归档与接收

候选 `sdk-archive.py pack` 读取 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-prepared-20261014-r2`，固定 Node `24.19.0` 和 alpha2 candidate kit，生成 153,047 个条目、2,382,628,617 logical bytes 的开发归档。归档实际为 867,271,253 bytes，摘要为：

```text
969de1d098a07971a34635cd20d93b30051efdad7eac6d125e2f57847c3559bf
```

在全新目录接收同一归档并以同一摘要复核，`pack` 与 `receive` 都返回 `shinemage-development-sdk-archive/v1 / LOCAL_READY`。原始回执位于：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-archive-20261014/receipt.json
.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-received-20261014/receipt.json
```

两份回执仍标记 `development-sdk-only`、`supply_chain=NOT_VERIFIED`、`secret_scan=NOT_RUN`、`release_ready=false`。

## 缩减闭包

为避免主仓 rc2 `toolchain.json` 被误读，本轮在隔离候选脚本副本中运行 `sdk-closure.mjs`，其 `plugin-kit`、`toolchain.json` 和校验器均来自 alpha2 candidate。接收目录、归档摘要和固定 Python 3.14 均作为显式参数传入，生成：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014/receipt.json
schema=shinemage-development-sdk-closure/v1
status=LOCAL_PROJECTED
closure_sha256=6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b
entries=30611
bytes=233962650
packages=335
```

闭包内的 DSH/Cordis 包版本均来自 alpha2 source tree；`check.mjs` 在准备阶段已返回 `shinemage-kit-inputs/v1 / READY`。闭包投影没有写入主仓代码或 profile，也没有把 archive/receive 当作发布 artifact。

## 内容审计边界

使用同一候选校验器运行 `sdk-content-audit.mjs --root ... --closure-sha256 ...`，结果为 `shinemage-sdk-content-audit/v1 / PARTIAL`：26,222 个文件完成摘要检查，`findings=0`，保留 18 个 coverage gaps，全部是明确列出的二进制、字体或平台原生文件（`binary-or-nontext` / `native-or-wasm`）。这不是安全漏洞结论，也不等价于完整 SBOM、发布者身份、签名/验签、撤销验证或干净机器安装。

因此 M2-09 新增 `SDK_CLOSURE_PASS / SDK_CONTENT_AUDIT_PARTIAL` 子项，主仓适配仍延期。后续需要在 alpha2 候选中完成插件消费锁、九包 pack/profile、组合 lifecycle/browser/recovery 和回退矩阵，再单独评审是否进入主仓；M2-07 供应链门禁和 M2-08 release/activation 继续保持 `BLOCKED / NOT_RUN`。
