# M2-07 修复后 CRM consumer closure r2 执行记录（2026-10-16）

## 结论

按 production-only runbook 对修复后的 CRM tarball 重新执行 fresh staging。最终 install、dependency graph、runtime import、SBOM、local provenance 和 local receipt 均生成成功；当前环境没有公司批准的 package manager、SBOM 服务、runtime checker 或 closure verifier，因此正式公司 closure 仍为 `NOT_RUN_COMPANY_TOOLS_UNAVAILABLE`。

```text
local_install=PASS
local_dependency_graph=PASS
local_runtime_imports=PASS
local_sbom=PASS
local_provenance=LOCAL_REPRODUCTION_ONLY
company_closure=NOT_RUN_COMPANY_TOOLS_UNAVAILABLE
M2-07=BLOCKED
release_ready=false
```

## 输入

```text
artifact_sha256=a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d
pack_manifest_sha256=106c38eaf30cde9b6a3e3fc5fea98d8e42aa777f51f99faff37c00c13f55e42d
candidate_source_sha=3b5d4c0680585f8f27c84d70dffabf7c2ec930d2
node=v24.19.0
npm=11.17.0
plugin_pnpm=11.28.2
```

## 实际输出

```text
install_exit=0
installed_packages=26
package-lock.json sha256=01e5787072bd8126e957e88e0d4e0e1d792256c7149f6e9d5acddecda16675d1
dependency-graph.json sha256=4efd3a7aa4c9c40cbc248c230d2634044b35d6d584fe3f8b27d7852e5b712c41
runtime-check.log sha256=6656a53ba74bbc346a275bc903a89d38adf737e3577114ac128208b16b03a8d7
sbom-production.json sha256=ab86c9c70fad2bc455004d29fe0a7c3a7e6b3e1ab71a94f6902f9fd4e575942d
consumer-provenance-local-r2.json sha256=6232d5e44ce739180d1903216d8bb978794090db8c6217815976f717d79c14f2
consumer-closure-receipt-local-r2.json sha256=da5206b85c5a2600f4e29835c64c41759a124d88c599f0989a37c7d273627527
```

依赖图和 SBOM 都包含 26 个 package/version 对，`26/26` 一致；关键版本为：

```text
@shine-mage/dsh-crm-knowledge=0.0.0-crm.1
@deepseek-ai/dsh-tools=0.2.1-alpha.4
@deepseek-ai/cordis=4.0.5-alpha.2
katex=0.18.11
@shine-mage/dsh-plugin-kit=ABSENT
```

runtime 检查全部通过：CRM package、CRM host、dsh-tools、Cordis、KaTeX 和 `katex/dist/katex.min.css`。

## 执行异常记录

第一次 graph 命令因读取 `staging=` 前缀失败；第二次因将仓库相对输出路径附加到临时 staging 失败。两次均未产生有效 graph，最终命令使用绝对输出路径并退出 `0`。失败不被计入 closure PASS，也不影响最终文件的 SHA 记录。

## 公司门禁状态

本次只生成了本地复现材料。正式 company package manager、SBOM、runtime checker、closure verifier、独立验证、publisher identity、signature、revocation 和 final attestation 仍未执行。local receipt 的 `status=NOT_RUN_COMPANY_TOOLS_UNAVAILABLE`，不能替代正式回执。

输出目录：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/company-closure-attempt-r2/
```
