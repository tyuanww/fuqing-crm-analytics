# M2-07 公司 production-only closure runner 与 r3 输入映射（2026-10-16）

这份清单把修复后的 CRM r3 输入、公司 runner 目标路径、批准工具和正式输出绑定在一起。它是公司执行前的准备证据，不是公司 closure 回执；在公司 runner 上重新安装和独立核验前，`M2-07` 继续为 `BLOCKED`，`release_ready=false`。

## 当前准备结论

- r3 CRM tarball、pack manifest、alpha4 SDK artifact、SDK SBOM 和 SDK provenance 的本地参考 SHA 已核对。
- 本地输入可以转交公司 runner，但当前机器没有公司批准的 package manager、SBOM、runtime checker 或 closure verifier。
- 当前本地 Node 为 `v25.8.2`，不满足公司 runbook 固定的 `v24.19.0`；本地 npm SBOM 和 provenance 只能作形状参考。
- 因此本清单状态为 `INPUT_MAPPING_READY / COMPANY_EXECUTION_BLOCKED`，没有生成正式 company graph、SBOM 或 provenance。

## r3 输入映射

公司 runner 接收文件后必须在回执中记录实际落盘路径和重新计算的 SHA。下面的 `/secure/input` 是 runbook 的逻辑目标路径，公司可以使用等价的受控路径，但不能从仓库 workspace、旧 `node_modules` 或 `formal-packs-r2` 直接安装。

| 输入 | 本地参考路径 | SHA-256 | 字节数 | 公司 runner 目标路径 |
|---|---|---:|---:|---|
| CRM tarball | `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/crm-knowledge/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz` | `a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d` | `234923` | `/secure/input/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz` |
| CRM pack manifest | `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/crm-knowledge/plugin-pack.json` | `106c38eaf30cde9b6a3e3fc5fea98d8e42aa777f51f99faff37c00c13f55e42d` | `630` | `/secure/input/crm-knowledge.plugin-pack.json` |
| alpha4 SDK artifact | `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/npm-official-r1/deepseek-ai-dsh-0.2.1-alpha.4.tgz` | `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6` | `25149` | `/secure/input/deepseek-ai-dsh-0.2.1-alpha.4.tgz` |
| alpha4 SDK SBOM | `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/sbom-alpha4-r1.json` | `2adb75e23a0af0c60ce202f5e4b265549836b4761e758935111d66bbc257bfca` | `9633` | `/secure/input/sbom-alpha4-r1.json` |
| alpha4 SDK provenance | `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/provenance-alpha4-r1.json` | `5e81763e0fad9ab5952fb6c7b094cf0e01d0a1b0883f469e63b2f672e8d7a0c4` | `4756` | `/secure/input/provenance-alpha4-r1.json` |

固定绑定还包括：candidate source `3b5d4c0680585f8f27c84d70dffabf7c2ec930d2`、alpha4 upstream `86a402200d95fecef4529d969836f1fe13c6cb0d`、upstream lock SHA `ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317`、Node `v24.19.0`、upstream pnpm `11.28.5` 和 plugin pnpm `11.28.2`。

`formal-packs-r2` 中的旧 CRM tarball（source `50d241...`）不能作为公司输入。公司执行方必须先核对 r3 的 CRM tarball 和 manifest，再开始安装。

## runner 与工具清单

| 项目 | 公司执行要求 | 当前本机探针 | 状态 |
|---|---|---|---|
| runner | 公司批准的 staging 或受控 CI runner；空目录、无历史 `node_modules` | 未提供 | `PENDING_COMPANY_RUNNER` |
| Node | `v24.19.0` | `v25.8.2` | `BLOCKED_VERSION_MISMATCH` |
| package manager | 公司批准的 npm 或 pnpm；记录版本、registry 和 frozen lock 行为 | npm `11.21.0`、pnpm `11.28.2`，无公司批准标识 | `PENDING_APPROVAL` |
| SBOM | 公司批准的 SBOM 工具和版本 | `company-sbom`、`syft`、`cyclonedx`、`bom` 均未找到 | `NOT_FOUND` |
| runtime checker | 公司批准的安装树检查器 | `company-runtime-check` 未找到 | `NOT_FOUND` |
| closure verifier | 公司批准的 graph/SBOM/provenance 独立核验器 | `company-closure`、`slsa-verifier`、`cosign`、`in-toto` 未找到 | `NOT_FOUND` |
| registry/network | 公司批准的 registry、缓存和网络策略 | 未提供 | `PENDING_COMPANY_INPUT` |

## 公司 runner 执行前检查

- [ ] runner 身份、CI job、操作者和独立核验身份已登记。
- [ ] Node `v24.19.0` 和批准的 package manager/SBOM/runtime/closure 工具版本已记录。
- [ ] 五份输入已复制到受控目录，并重新计算 SHA 与上表一致。
- [ ] staging 是空目录且权限为 owner-only；不是本仓库或旧 closure 目录。
- [ ] registry、网络策略和缓存策略已登记；凭据、OIDC/KMS token 和私钥不写入回执。
- [ ] 已确认使用 r3 CRM 输入，没有引用 `formal-packs-r2` 的旧 CRM tarball。

## 正式输出映射

公司执行方必须从这次 production-only 安装树生成以下文件；下面的名称是最小回执集合，不是本地文件的替代品：

| 正式输出 | 要求 | 通过条件 |
|---|---|---|
| `package-lock.json` 或批准的 frozen lock | 安装树生成，记录 SHA | cold/frozen recheck 退出码为 `0` |
| `dependency-graph.json` | `npm ls --omit=dev --all --json` 或批准等价物 | 无 `invalid`、`missing`、`extraneous`；production 包集合完整 |
| `runtime-check.log` | 从安装树 resolve/import CRM、host、dsh-tools、Cordis、KaTeX JS/CSS | 全部 `PASS` |
| `sbom-production.json` | 公司批准工具从同一安装树生成 | subject、graph package set 和 dev 排除均通过 |
| `provenance-company.json` | 公司身份绑定 artifact、manifest、source、SDK、lock、graph、SBOM、Node/pnpm | 不是 `LOCAL_REPRODUCTION_ONLY` |
| `independent-verification.log` | 独立 workspace/job/身份复验 | artifact、graph、SBOM、provenance 和 runtime 全部匹配 |
| `company-closure-receipt.json` | 按 [回执模板](m2-07-company-production-only-consumer-closure-receipt-template-20261016.json) 回填 | 所有必需字段真实完成；无 `PENDING`/`UNKNOWN`/`NOT_RUN` |

正式执行命令和禁止绕过项见 [company production-only closure runbook](m2-07-company-production-only-consumer-closure-runbook-20261016.md)。本地 r2 目录中的 graph/SBOM/provenance 只能作为字段形状和数量参考，不能复制为公司正式输出。

## 当前本地参考输出

这些文件已经由本地隔离安装生成，但仍标记为 `LOCAL_REPRODUCTION_ONLY`：

| 文件 | SHA-256 |
|---|---:|
| `company-closure-attempt-r2/package-lock.json` | `01e5787072bd8126e957e88e0d4e0e1d792256c7149f6e9d5acddecda16675d1` |
| `company-closure-attempt-r2/dependency-graph.json` | `4efd3a7aa4c9c40cbc248c230d2634044b35d6d584fe3f8b27d7852e5b712c41` |
| `company-closure-attempt-r2/runtime-check.log` | `6656a53ba74bbc346a275bc903a89d38adf737e3577114ac128208b16b03a8d7` |
| `company-closure-attempt-r2/sbom-production.json` | `ab86c9c70fad2bc455004d29fe0a7c3a7e6b3e1ab71a94f6902f9fd4e575942d` |
| `company-closure-attempt-r2/consumer-provenance-local-r2.json` | `6232d5e44ce739180d1903216d8bb978794090db8c6217815976f717d79c14f2` |

这些本地 SHA 不得写入正式 company provenance 的 builder 或 independent verification 字段。

## 当前回执状态

准备清单状态：`INPUT_MAPPING_READY / COMPANY_EXECUTION_BLOCKED`。正式 closure 回执仍使用 [模板](m2-07-company-production-only-consumer-closure-receipt-template-20261016.json)，其 `status` 保持 `PENDING_COMPANY_EXECUTION`、`closure_result.status` 保持 `PENDING`、`release_ready=false`。公司工具和 runner 到位前，不生成 `PASS`，也不推进 M2-08。
