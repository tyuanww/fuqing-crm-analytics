# M2-07 单人 owner-operated closure 复验（2026-10-16）

本记录针对单人全栈维护场景：项目 owner 同时是操作者、批准者和独立复验执行者。它补齐技术 closure 的可重现性，但不把同一 owner 的复验写成第二位人员的独立批准。

## 执行模式

```text
execution_mode=OWNER_OPERATED
runner_identity=owner-operated-local-node24
operator=project-owner
independent_replay=same-owner-separate-staging-and-process
governance_status=FORMAL_EXCEPTION_REQUIRED
release_ready=false
```

实际使用固定 Node24 路径和新的 staging：

`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/company-closure-independent-node24-r1/`

复验使用第一轮生产安装生成的 lockfile，在新的 HOME、npm cache、进程和 node_modules 中执行 `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`。TLS 继续使用严格校验和系统 CA，没有关闭证书验证。

## 复验结果

| 检查 | 结果 |
|---|---|
| Node/npm | `v24.19.0` / `11.17.0` |
| cold/frozen `npm ci` | `exit 0` |
| lockfile | 与首轮相同，SHA `5e15caeb445983b26e582093e94eff5b9dfede62e09b6a7678e6e4f77d0701ae` |
| dependency graph | `exit 0`，`26` 个唯一包、`97` 个树节点、无 problems |
| graph 重现性 | 首轮与复验 package/version 集合 `PASS` |
| runtime import | CRM、host、dsh-tools、Cordis、KaTeX JS/CSS `PASS` |
| SBOM | `exit 0`，`26` components |
| graph/SBOM package set | `PASS` |
| company approved tools | `NOT_FOUND` |
| 第二位人员独立批准 | `NOT_RUN` |

复验回执位于：

`.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/company-closure-independent-node24-r1/independent-replay-receipt.json`

其状态为 `SELF_SEPARATED_REPLAY_PASS`，formal company closure 为 `FORMAL_EXCEPTION_REQUIRED`。这说明技术闭包已经可以由单人 owner 在受控本机复现，但仍需要 owner 明确接受治理例外，或取得公司认可的独立验证身份，才能改变正式 M2-07 结论。

## 当前结论

单人 owner-operated runner 可以解决“没有第二位员工、无法执行技术复验”的问题；它不能自动解决公司政策要求的独立批准、publisher signature、revocation、final attestation 和 clean machine。当前继续保持：

```text
M2-07=BLOCKED
M2-08=NOT_RUN
release_ready=false
```
