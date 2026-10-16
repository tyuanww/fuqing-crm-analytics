# M2-07 修复后 CRM 本地 Node24 closure 复验（2026-10-16）

本记录是按公司 production-only runbook 在本地隔离 staging 进行的复验。它验证修复后的 r3 CRM tarball 在固定 Node `v24.19.0` 下可被生产安装和导入，但不构成公司 runner、公司 SBOM、provenance 或独立核验的正式证据。

## 执行环境

- Node：`/Users/hutou/homebrew/opt/node@24/bin/node` → `v24.19.0`
- npm：`11.17.0`
- plugin pnpm：`11.28.2`
- registry：`https://registry.npmjs.org/`
- TLS：保持 `strict-ssl=true`，通过 `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem` 使用系统 CA；没有使用 `strict-ssl=false`、`--force` 或 `--legacy-peer-deps`。
- staging：`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/company-closure-attempt-node24-r3/`

第一次尝试在空 staging 中因 Node/npm 没有信任 registry 的本地 issuer 而返回 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`；第二次在屏蔽全局 npmrc 后仍复现。两次失败均保留在同一轮 ignored 检查目录，没有把失败当作依赖合同失败。使用系统 CA 且保持严格 TLS 后重新执行成功。

## 固定输入

| 输入 | SHA-256 |
|---|---:|
| 修复后 CRM tarball | `a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d` |
| r3 pack manifest | `106c38eaf30cde9b6a3e3fc5fea98d8e42aa777f51f99faff37c00c13f55e42d` |
| candidate source | `3b5d4c0680585f8f27c84d70dffabf7c2ec930d2` |

## 本地结果

| 检查 | 结果 |
|---|---|
| `npm install --omit=dev --ignore-scripts --no-audit --no-fund` | `exit 0`，added `26` packages |
| lockfile | SHA `5e15caeb445983b26e582093e94eff5b9dfede62e09b6a7678e6e4f77d0701ae` |
| dependency graph | `exit 0`；`26` 个唯一 name/version、`97` 个树节点、`problems=[]` |
| dev-only kit | `@shine-mage/dsh-plugin-kit` 为 `ABSENT` |
| runtime import | CRM package、CRM host、dsh-tools、Cordis、KaTeX JS、KaTeX CSS 全部 `PASS` |
| runtime log | SHA `f5d652c29b7dbc496a9632dabb8a5b5d7dfd7286b4f042bde43946e63c11ec87` |
| CycloneDX SBOM | `exit 0`，`26` components，SHA `3b0d1a443059e1a3a3c468d989b246d86c3decddcd3a5a8a65165eec1d510dc2` |
| local provenance | `LOCAL_REPRODUCTION_ONLY`，SHA `ae6501ba0a2fadc1e9a8770f4e51bd489773c7c41874715588ee90eb63362196` |
| local receipt | `NOT_RUN_COMPANY_TOOLS_UNAVAILABLE`，SHA `d7eb5d768ff2c26f4ebf0f1a8fdae9d5054484a5bc5f71a0b4927c871ea6fe45` |

## 公司门禁仍未关闭

本地成功不改变正式状态。当前公司 runner、`/secure/input`、`/secure/work`、批准的 package manager、批准的 SBOM/runtime/closure 工具、registry/network policy 和独立 verifier 仍未提供。正式 dependency graph、SBOM、provenance 和 independent verification 继续为 `NOT_RUN` / `PENDING_COMPANY_EXECUTION`。

本地回执明确保持：

```text
status=NOT_RUN_COMPANY_TOOLS_UNAVAILABLE
consumer_runtime_closure=LOCAL_REPRODUCTION_ONLY
release_ready=false
```

这份记录不能推进 M2-07，也不能启动 M2-08；公司 runner 到位后必须重新接收 r3 artifact、重新安装并重新生成正式材料。
