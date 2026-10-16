# M2-07 修复后 CRM consumer closure 正式执行尝试（2026-10-16）

## 结论

已使用修复后的 CRM tarball 在独立 staging 中逐步执行 production-only install、dependency graph、runtime import、CycloneDX SBOM 和 provenance 生成。所有本地步骤均通过，但当前环境没有公司批准的 package manager、SBOM 服务、runtime checker 或 closure verifier，因此本次只能记录为本地复现，不能作为正式公司 closure。

```text
local_production_install=PASS
local_dependency_graph=PASS
local_runtime_imports=PASS
local_sbom=PASS
local_provenance=LOCAL_REPRODUCTION_ONLY
company_consumer_closure=NOT_RUN_COMPANY_TOOLS_UNAVAILABLE
M2-07=BLOCKED
release_ready=false
```

## 固定输入

```text
package=@shine-mage/dsh-crm-knowledge@0.0.0-crm.1
tarball=.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/crm-knowledge/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz
tarball_sha256=a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d
candidate_source_sha=3b5d4c0680585f8f27c84d70dffabf7c2ec930d2
sdk=@deepseek-ai/dsh@0.2.1-alpha.4
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
upstream_lock_sha256=ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317
node=v24.19.0
npm=11.17.0
plugin_pnpm=11.28.2
```

tarball manifest 中的 Cordis peer 为 `4.0.5-alpha.2`，dsh-tools peer 为 `0.2.1-alpha.4`，KaTeX 为 runtime `dependencies.katex=^0.18.7`。

## 分步真实输出

### 1. Production-only install

在新临时 staging 执行：

```sh
npm install --omit=dev --ignore-scripts --no-audit --no-fund <repaired-crm-tarball>
```

真实结果：

```text
exit=0
added 26 packages in 15s
package-lock.json sha256=7a5285740f78ee03f1431eb9f34aeb7fcb25cbc751fd3ea4f674862f5b53a21b
```

### 2. Production dependency graph

执行：

```sh
npm ls --omit=dev --all --json > dependency-graph.json
```

真实结果：

```text
exit=0
dependency-graph.json sha256=a41f4e3b9c0e04753740bc2dd6f8989ee81bb2241a42ad9b563357763f6f7a7b
```

递归图中确认：

```text
@shine-mage/dsh-crm-knowledge=0.0.0-crm.1
@deepseek-ai/dsh-tools=0.2.1-alpha.4
@deepseek-ai/cordis=4.0.5-alpha.2
katex=0.18.11
@shine-mage/dsh-plugin-kit=ABSENT
```

### 3. Runtime import

解析和 import 检查真实退出码为 `0`：

```text
@shine-mage/dsh-crm-knowledge/package.json=PASS
@deepseek-ai/dsh-tools/package.json=PASS
@deepseek-ai/cordis/package.json=PASS
katex/package.json=PASS
katex=PASS
katex/dist/katex.min.css=PASS
@shine-mage/dsh-crm-knowledge=import PASS
@shine-mage/dsh-crm-knowledge/host=import PASS
```

### 4. SBOM

执行：

```sh
npm sbom --omit=dev --sbom-format=cyclonedx > sbom-production.json
```

真实结果：

```text
exit=0
format=CycloneDX
specVersion=1.5
components=26
sbom-production.json sha256=b233945e8a4b4325f10f21c4a50fb4b5b22be0ebbf8e47c35580afd3f29a0213
```

将 dependency graph 与 SBOM 按 package/version 去重比较，结果为 `26/26` 一致。CRM、dsh-tools、Cordis 和 KaTeX 均在 SBOM 中；dev-only plugin kit 不在 SBOM 中。

### 5. Provenance

根据上述真实 artifact、lockfile、依赖图、SBOM、runtime log 和固定 source/toolchain 生成：

```text
consumer-provenance-local-r1.json sha256=0bf6165fc9e48f9e8c60096d5a75195b6d7f4376200158bfd3f78792444701a6
status=LOCAL_REPRODUCTION_ONLY
company_execution=NOT_RUN_COMPANY_TOOLS_UNAVAILABLE
publisher_identity=NOT_VERIFIED
signature=NOT_GENERATED
independent_verification=NOT_RUN
revocation=NOT_RUN
```

## 公司环境缺口

以下命令在当前环境均不存在：

```text
company-package-manager=NOT_FOUND
company-sbom=NOT_FOUND
company-runtime-check=NOT_FOUND
company-closure=NOT_FOUND
```

因此本次 provenance 只绑定本地复现输出，未声明公司发布身份、签名或独立验证。正式公司 closure 仍需在公司批准的 staging/CI 中使用正式发布输入重新执行；在此之前 `M2-07=BLOCKED`、`release_ready=false`，不得进入 publisher signing 或 clean machine。
