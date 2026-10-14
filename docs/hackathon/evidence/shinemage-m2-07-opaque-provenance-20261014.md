# M2-07 compact closure opaque/native 来源矩阵（2026-10-14）

本轮将 compact closure 的 18 个 opaque/native/font coverage gap 映射到所属 package、版本、package manifest 摘要、文件类型和文件 SHA-256，并尝试关联 lockfile integrity。

## 结果

- 对象数：`18`
- package owner 缺失：`0`
- package manifest SHA 缺失：`0`
- 文件类型识别缺失：`0`
- 文件 SHA 缺失：`0`
- lockfile integrity：`9/18` 有记录，`9/18` 无记录
- 矩阵报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-opaque-provenance-20261014.json`
- 矩阵 SHA-256：`f6e085d85fcf0aea9c92acb3a03eccaeb9b8997ca90c9faa56bf37169afdd7b1`

缺少 registry integrity 的 9 个对象属于 pnpm bundled `@reflink`/`fastlist` 原生文件或 workspace-owned Montserrat 字体，不是 lockfile 中的独立 registry package tarball；这解释了缺口来源，但没有把它们自动判为可信。

## 门禁边界

本轮关闭了 opaque 对象的 owner、manifest、字节摘要和文件类型归属子项；binary/native 语义审计、原生 ABI 审计、发布者身份、签名、撤销和最终 artifact provenance 仍未完成。M2-07 继续保持 `BLOCKED`，`release_ready=false`。
