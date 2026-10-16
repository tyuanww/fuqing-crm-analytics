# M2-07 alpha4 KaTeX runtime closure 修复候选（2026-10-16）

## 结论

已准备最小修复 patch，并在固定 alpha4 checkout 上通过 `git apply --check`。没有修改官方 checkout，没有修改主仓。

```text
status=PATCH_REJECTED_BY_OFFICIAL_POLICY
patch_check=PASS
release_ready=false
```

## 修复范围

只修改两个文件：

1. `packages/client/ui-primitives/package.json`
   - 将 `katex:^0.18.7` 从 `devDependencies` 移到 `dependencies`。
2. 根 `pnpm-lock.yaml`
   - 将 `packages/client/ui-primitives` importer 中的 `katex` 从 `devDependencies` 移到 `dependencies`。
   - `katex@0.18.7` 的解析版本和 integrity 不变。

不修改：

- `src`。
- 生成的 `lib`。
- 官方 alpha4 checkout。
- 主仓 rc2 pin。
- 现有正式 artifact。

## Patch 文件

```text
docs/hackathon/evidence/m2-07-official-closure-katex-runtime-fix.patch
```

Patch SHA-256：

```text
23e9b452bf53632d565c6fb931d3d0bb4aacdd200fa115c728e656da3a9f94f5
```

## 输入与预期摘要

| 文件 | 当前 SHA-256 | 应用 patch 后的本地预期 SHA-256 |
|---|---|---|
| `packages/client/ui-primitives/package.json` | `8208a57a195c448a9932372dcfd7228f394c1abe527acf57b0848c4840e27640` | `a7bd3757a4c92e039dfc863844b043ddd58e1ab6b6c9127697b30b6e5ffc25c9` |
| 根 `pnpm-lock.yaml` | `ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317` | `491dfeb8951c89cc4c79d169f0d03070efad73582695d917e7d56f528577267d` |

预期 SHA 只用于检查 patch 输入。正式重建后必须以公司环境实际字节重新计算。

## 已执行检查

```text
fixed alpha4 checkout = .context/dsh-b0/upstream-0.2.1-alpha.4
git apply --check = PASS
temporary patched package metadata = dependencies.katex present, devDependencies.katex absent
official checkout modified = NO
main rc2 pin modified = NO
```

临时 clean checkout 的 `npm pack --dry-run --json` 通过，包元数据包含 `dependencies.katex`。随后官方 `verify-package-dependencies` 失败，因此该 patch 不能作为当前官方仓库的最终修复。

本地模拟回执：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/closure-fix-sim-RfuTcP/receipt.json
receipt_sha256=9aecff0f1a74f5f561d88975fc48ae5745d1e1f17923bb7daf0f16a01aacddc7
npm_pack_dry_run=PASS
package=deepseek-ai-dsh-client-ui-primitives-0.2.1-alpha.4.tgz
```

## 公司环境后续命令

在公司发布 checkout 应用 patch 后执行：

```sh
git apply docs/hackathon/evidence/m2-07-official-closure-katex-runtime-fix.patch
corepack pnpm@11.28.5 install --lockfile-only --ignore-scripts
corepack pnpm@11.28.5 install --frozen-lockfile --ignore-scripts
pnpm run verify-package-dependencies
pnpm run build:lib:host
pnpm run build:lib:client
```

该 patch 不应直接进入当前官方发布源。请先阅读 [official closure policy 冲突记录](m2-07-official-closure-policy-conflict-20261016.md)，再按最终消费者边界执行正式 pack、production-only install、dependency graph、SBOM 和 runtime import 检查。

## 边界

该 patch 只证明最小修复方向可以应用。它没有生成正式 artifact，也没有生成正式 SBOM、provenance、signature、verification、revocation 或 clean machine 回执。正式重建后，旧 artifact 和所有旧发布材料必须失效并重新生成。
