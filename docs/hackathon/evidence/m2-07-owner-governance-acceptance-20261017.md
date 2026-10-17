# M2-07 单人 owner-operated 例外接受回执（2026-10-17）

本回执明确接受 `OWNER_EXCEPTION_ACCEPTED`，范围仅限项目内部使用和单人 owner-operated 技术复验。

## 接受范围

- `governance_status=OWNER_EXCEPTION_ACCEPTED`
- `execution_mode=OWNER_OPERATED`
- `distribution=INTERNAL_ONLY`
- `operator=project-owner`
- 同一 owner 在独立 staging、进程和复验目录中完成技术复现
- 保留 SDK、CRM consumer、依赖图、SBOM、provenance、clean replay 和 rc2 回退证据

## 明确不接受的范围

本例外不等于正式公司对外发布授权，也不把 owner-local 结果改写成以下正式 PASS：

- company publisher identity
- company-approved signature / transparency reference
- second-person independent verification
- revocation PASS
- formal company final attestation
- formal company clean-machine receipt
- production activation、canary 或外部 distribution

## 当前正式状态

```text
M2-07=BLOCKED
M2-08=NOT_RUN
release_ready=false
production_activation=DENIED
```

`OWNER_EXCEPTION_ACCEPTED` 只解除“单人内部使用无法采用技术复验”的治理歧义，不关闭对外供应链门禁。正式对外分发仍需单独的 publisher identity、签名、撤销、独立核验、final attestation 和 formal clean-machine 回执。

关联历史回执：[owner governance exception](m2-07-owner-governance-exception-20261016.md)。
