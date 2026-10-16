# M2-07 alpha4 本地证据完整性复核（2026-10-16）

## 结论

本次本地完整性复核通过。复核范围包括 alpha4 SDK artifact、9 个插件 pack、关键 JSON 回执和当前文档链接。

```text
status=LOCAL_EVIDENCE_INTEGRITY_PASS
release_ready=false
formal_external_gates=still_pending
```

## 复核结果

| 项目 | 结果 | 证据 |
|---|---|---|
| alpha4 SDK artifact SHA-256 | PASS | `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6` |
| plugin pack manifest 数量 | PASS | `9` |
| plugin pack tarball bytes | PASS | 9/9 与 manifest 一致 |
| plugin pack tarball SHA-256 | PASS | 9/9 与 manifest 一致 |
| plugin source commit | PASS | 9/9 为 `50d241cbd23aa2a9d188fe84c3864528a2206917` |
| plugin SDK pin | PASS | 9/9 为 `0.2.1-alpha.4` |
| 关键 JSON 语法 | PASS | summary、verification、SBOM、provenance、attestation inputs、local gate receipts |
| 当前文档本地链接 | PASS | STATUS 和本轮 M2-07/M2-09 文档无缺失链接 |
| 主仓 dirty 状态 | PASS | 仅保留受保护的未跟踪目录 `security-audit-skill/` |

## 复核范围

```text
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/npm-official-r1/deepseek-ai-dsh-0.2.1-alpha.4.tgz
docs/hackathon/evidence/m2-07-final-attestation-draft-20261016.json
```

## 边界

本复核只证明本地文件之间的一致性。它不产生 publisher identity、signature、revocation、正式 dependency closure 或公司 clean machine 证据。`release_ready` 必须保持 `false`。
