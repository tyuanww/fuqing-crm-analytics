# M2-07 alpha4 official dependency closure 执行包（2026-10-16）

## 目的

本执行包用于确认正式 SDK 的 runtime dependency closure。closure 是“正式安装后，所有运行时导入都能从发布包和正式依赖中解析”的证据。

当前 alpha4 已知缺口：`@deepseek-ai/dsh-client-ui-primitives@0.2.1-alpha.4` 的运行时代码导入 `katex` 和 `katex/dist/katex.min.css`，但官方 `package.json` 把 `katex:^0.18.7` 放在 `devDependencies`。当前官方 closure 不能直接标记为通过。

模板文件：

```text
docs/hackathon/evidence/m2-07-official-dependency-closure-template-20261016.json
```

本地已准备最小修复 patch：

```text
docs/hackathon/evidence/m2-07-official-closure-katex-runtime-fix.patch
```

修复说明见 [KaTeX runtime closure 修复候选](m2-07-official-closure-katex-runtime-fix-20261016.md)。

## 固定输入

```text
SDK=@deepseek-ai/dsh@0.2.1-alpha.4
artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
candidate_source_sha=50d241cbd23aa2a9d188fe84c3864528a2206917
upstream_lock_sha256=ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317
sbom_sha256=2adb75e23a0af0c60ce202f5e4b265549836b4761e758935111d66bbc257bfca
provenance_sha256=5e81763e0fad9ab5952fb6c7b094cf0e01d0a1b0883f469e63b2f672e8d7a0c4
root_package_json_sha256=8bb7e0f4693c9d68f0a3200e0503c03f25f30090bdfe373ccfc9a71b706158dc
ui_primitives_package_json_sha256=8208a57a195c448a9932372dcfd7228f394c1abe527acf57b0848c4840e27640
```

## 公司环境执行顺序

1. 接收正式 artifact、SBOM、provenance 和发布身份材料。
2. 在独立 staging 目录计算所有 SHA-256，并与固定输入比较。
3. 解包正式 artifact。只检查正式发布包，不从本地 workspace 推断 closure。
4. 读取正式包的 `package.json`、exports、files 和实际安装树。
5. 在生产依赖模式安装。使用公司批准的包管理器和 lock。必须排除 devDependencies。
6. 生成生产安装依赖图。记录所有直接、间接、optional、peer 和 native 依赖。
7. 检查正式包的每个 runtime import。重点检查 `katex` 和 `katex/dist/katex.min.css`。
8. 生成同一生产安装树的 CycloneDX 或公司批准格式 SBOM。
9. 将 SBOM subject 与 artifact SHA 比较。将 SBOM 包列表与生产安装依赖图比较。
10. 检查 provenance 是否绑定相同 source SHA、lock SHA、Node 和 pnpm。
11. 形成 closure 结论：`PASS`、`REBUILD_REQUIRED` 或 `FORMAL_EXCEPTION_REQUIRED`。
12. 在独立验证环境重复 dependency graph、runtime import 和 SBOM subject 检查。
13. 将 closure manifest、closure SHA、SBOM、provenance 和验证日志写入回执模板。

## 当前 KaTeX 缺口的推荐处理

推荐选择 `REBUILD_WITH_KATEX_RUNTIME_DEPENDENCY`：

1. 在发布源中把 `katex:^0.18.7` 从 `devDependencies` 移到 `dependencies`。
2. 重新生成并固定 lock。
3. 重新构建官方 SDK artifact。
4. 重新生成 SBOM 和 provenance。
5. 重新计算 artifact、lock、SBOM 和 provenance SHA-256。
6. 重新生成 publisher identity、signature、verification、revocation 和 final attestation。
7. 重新执行 clean machine 验收。

公司发布 checkout 的推荐命令：

```sh
git apply docs/hackathon/evidence/m2-07-official-closure-katex-runtime-fix.patch
corepack pnpm@11.28.5 install --lockfile-only --ignore-scripts
corepack pnpm@11.28.5 install --frozen-lockfile --ignore-scripts
pnpm run verify-package-dependencies
pnpm run build:lib:host
pnpm run build:lib:client
```

如果公司发布流程要求不同命令，以公司批准流程为准，但必须保留同样的输入、输出和 SHA 证据。

现有 artifact 的所有发布材料不能沿用，因为重新构建会改变 subject 或 provenance。

## 允许的替代处理

只有在发布责任方能提供正式证明时，才可以选择其他处理：

- KaTeX 被正式包内置，且所有 runtime 文件在 artifact 中可验证。
- 运行时代码已移除 KaTeX 导入，并已重新构建。
- 公司正式发布规范允许该 closure 缺口，并有批准编号和有效期。

CRM 候选中的 KaTeX overlay 只能证明候选本地运行。它不能证明官方 alpha4 closure。

## 推荐验证命令形状

下面的命令是检查关系的示例。实际命令必须替换为公司发布工具。

```sh
shasum -a 256 deepseek-ai-dsh-0.2.1-alpha.4.tgz
shasum -a 256 sbom-alpha4-r1.json
shasum -a 256 provenance-alpha4-r1.json

# 使用公司批准的生产依赖安装方式，不允许 devDependencies 进入 closure
company-package-manager install --production --frozen-lockfile

# 生成生产依赖图和 SBOM
company-package-manager list --production --json > dependency-graph.json
company-sbom generate --production-tree . --output sbom-production.json

# 验证 runtime import，至少包含 KaTeX 路径
company-runtime-check --import '@deepseek-ai/dsh-client-ui-primitives'
company-runtime-check --resolve 'katex'
company-runtime-check --resolve 'katex/dist/katex.min.css'

# 独立验证闭包和 subject
company-closure verify \
  --artifact-sha256 9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6 \
  --dependency-graph dependency-graph.json \
  --sbom sbom-production.json \
  --provenance provenance-alpha4-r1.json
```

`company-package-manager`、`company-sbom`、`company-runtime-check` 和 `company-closure` 是占位命令。不要直接执行。发布责任方必须替换为公司实际工具或 CI job。

## 通过条件

1. 正式 artifact SHA 一致。
2. 生产依赖图生成成功。
3. 生产模式安装不依赖 devDependencies。
4. 每个 runtime import 都能解析。
5. `katex` 和 `katex/dist/katex.min.css` 有正式 runtime closure，或存在正式例外批准。
6. SBOM subject 和 package list 与生产安装树一致。
7. provenance 与 source、lock、Node、pnpm 一致。
8. 独立验证通过。
9. `closure_result.status=PASS`。

## 当前限制

当前本地材料只能证明官方源码的已知缺口和候选输入。它不能产生正式 dependency closure。`release_ready` 必须保持 `false`，直到公司环境完成 closure 复核或完成正式重建。
