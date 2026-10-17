# M2-07 本地可关闭项复验（2026-10-17）

本回执只记录当前固定 Node24 checkout 能完成的本地合同回归和输入探针。它不替代公司 runner、publisher identity、公司签名、撤销服务、独立 verifier、final attestation 或正式 clean machine；正式状态保持 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`release_ready=false`。

## 固定输入和边界

| 项目 | 实际值 |
| --- | --- |
| checkout | `codex/current-main-fact-final2` |
| tested checkout SHA | `13c1831cee7703f33cd1d4bd00e5ffca9934773b` |
| Node | `v24.19.0` (`/Users/hutou/homebrew/opt/node@24/bin/node`) |
| pnpm | `11.28.2` |
| DSH pin | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| protected input | `security-audit-skill/` retained and untouched |

## 实际命令和输出

命令：

```sh
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem \
  /Users/hutou/homebrew/opt/node@24/bin/node \
  --test scripts/release/*.test.mjs
```

退出码：`0`。

原始输出文件：`/tmp/m2-07-release-tests-20261017T044938Z.txt`。

实际汇总：

```text
tests 558
pass 558
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 66197.203083
```

该套件覆盖 release CLI、preflight/readiness、artifact/receive、runtime/source provenance、service/host evidence、promotion/rollback fail-closed 和 SDK closure 合同。它证明本地代码合同回归通过，不证明公司 closure 或 release readiness。

本机当前批准工具和公司 runner 仍不可用：`cosign`、`syft`、`cyclonedx`、`in-toto`、`slsa-verifier`、`gitsign`、`crane` 均未找到，`/secure`、`/secure/input`、`/secure/work` 均不存在。固定 Node24 只满足本地 toolchain 前置，不等于公司 runner。

## 当前结论

本地可完成的合同回归已完成；正式六项门禁仍未完成：publisher identity、公司签名/独立验签、revocation、独立 verifier、final attestation、company clean-machine。不得把本地 `558/558` 提升为正式公司 PASS。

```text
M2-07=BLOCKED
M2-08=NOT_RUN
release_ready=false
```
