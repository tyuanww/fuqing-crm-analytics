# M2-07 alpha4 official closure policy 冲突记录（2026-10-16）

## 结论

直接把 `katex` 从 `ui-primitives` 的 `devDependencies` 移到 `dependencies` 不是当前官方仓库可接受的修复。官方 `verify-package-dependencies` 明确把它识别为 browser build input，并要求 `devDependencies-only`。

```text
status=PATCH_REJECTED_BY_OFFICIAL_POLICY
release_ready=false
```

## 失败证据

隔离重建 checkout：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/rebuild-sim-Ggj47w/
```

执行：

```sh
corepack pnpm@11.28.5 run verify-package-dependencies
```

结果：退出码 `1`。

原文：

```text
packages/client/ui-primitives/package.json: katex (declared browser build input, packages/client/ui-primitives/src/markdown/MarkdownText.tsx, packages/client/ui-primitives/src/markdown/katex.tsx) must be devDependencies-only; found dependencies
```

日志：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/rebuild-sim-Ggj47w/verify-package-dependencies-katex-fix.log
log_sha256=fd3e0ad8827003167c43a035a2bf8986fbc99c358063fe2026fbec0a0d63e480
```

## 官方 policy 证据

官方脚本 `scripts/verify-package-dependencies.ts` 在 browser build input 规则中，将非 workspace 依赖加入 `devDependencies-only` 检查。该规则与直接移动 `ui-primitives` 的 `katex` 声明冲突。

官方 runtime 代码仍然导入：

```text
katex
katex/dist/katex.min.css
```

## 当前可行方向

### 推荐：验证最终消费者闭包

保持官方 `ui-primitives` 的 browser build policy 不变。对每一个最终发布并执行该 UI 代码的消费者，声明自己的 runtime `katex` 依赖，并在正式 pack/install closure 中验证。

当前候选 `crm-knowledge` 已有：

```json
"dependencies": {
  "katex": "^0.18.7"
}
```

这只证明候选 manifest 已准备。公司环境仍需证明正式 plugin pack 的 production-only 安装能解析 KaTeX。

### 备选：协调修改官方 bundling/policy

如果官方 `ui-primitives` 必须独立作为 runtime 包发布，则需要同时修改：

1. 官方 package manifest。
2. 官方 dependency policy。
3. 官方 verifier 和相关测试。
4. bundling 或发布边界。

这不是本地单文件修复。它需要新的 reviewed upstream source commit。

## 结论

本次 patch 只能保留为失败证据。公司发布方不能直接应用它并宣称 closure 通过。下一步应执行最终消费者的 production-only pack/install closure，或提交一套同时更新 bundling 和 policy 的官方变更。
