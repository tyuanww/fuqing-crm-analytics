# M2-07 registry integrity 适用性分类（2026-10-14）

本轮对 compact closure 的 18 个 opaque/native/font 对象分类 registry integrity 是否适用，避免把 bundled/workspace 内容误当第三方 registry 包。

结果：

- `9` 个对象：registry integrity 已存在
- `9` 个对象：明确属于 pnpm bundled 原生文件或 workspace-owned 字体，registry integrity `NOT_APPLICABLE`
- registry integrity 缺失但应适用：`0`
- 分类报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-registry-applicability-20261014.json`
- 分类报告 SHA-256：`e75e73b3a883f7f25fb320ac2b6b1c4b6d52dcc26e88d590889fe3a625c74dd7`

该分类不等价于 bundled/workspace 对象已经安全或已签名；它只说明 registry integrity 对这 9 个对象不是正确的证明类型。它们仍需要 source provenance、发布者身份、签名/验签、撤销和原生语义审计。M2-07 整体继续保持 `BLOCKED`，`release_ready=false`。
