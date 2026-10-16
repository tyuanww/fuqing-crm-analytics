# M2-07 alpha4 离线安全风险接受记录（2026-10-16）

## 使用说明

本记录用于没有公司审批系统时，保存项目负责人的离线风险决定。记录通过 Git 提交保留版本和时间线。

本记录不是独立安全责任方的批准。如果公司制度要求独立复核人，仍需要补充独立复核记录。

## 当前状态

```text
record_type=OFFLINE_OWNER_RISK_ACCEPTANCE
approval_status=OFFLINE_RECORD_PENDING_OWNER_CONFIRMATION
release_ready=false
```

## 固定对象

```text
SDK=@deepseek-ai/dsh@0.2.1-alpha.4
artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
audit_summary=8 moderate / 0 high / 0 critical
```

## 推荐决定

```text
decision=ACCEPT_WITH_COMPENSATING_CONTROLS
scope=ISOLATED_ALPHA4_VALIDATION_ONLY
effective_from=2026-10-16
effective_until=2026-11-16
production_release=DENIED
production_activation=DENIED
canary=DENIED
clean_machine=ALLOWED_FOR_ISOLATED_VALIDATION_ONLY
review_due=2026-11-16
```

## 补偿控制

1. 只允许固定 artifact SHA 的 SDK 进入验收。
2. 固定 Node、pnpm、lock 和 source commit。
3. 不接受浮动版本和未登记的依赖替换。
4. 限制压缩包和外部文件输入。
5. 不把用户可控的 malformed ZIP64 输入交给不受限的解压路径。
6. 在 `2026-11-16` 前重新检查上游修复、dependency closure 和 npm audit。
7. 如果 dependency closure 或上游修复发生变化，必须重新构建 artifact 并重新审计。

## 决策人填写区

请由项目负责人本人填写并确认以下字段：

```text
decision_maker=
decision_maker_role=
security_role_same_person=yes/no
recorded_at=
confirmation_text=
```

推荐确认文字：

```text
我确认接受上述有限范围风险。该决定只允许固定 alpha4 artifact 进入隔离 clean machine 验收，不授权 production activation、canary 或正式 release。风险接受有效期为 2026-10-16 至 2026-11-16。若 dependency closure 或上游修复发生变化，必须重新构建 artifact 并重新审计。
```

## 证据要求

完成确认后，应把以下内容补入本记录：

1. 决策人姓名或公司账号。
2. 决策人角色。
3. 确认时间。
4. 确认文字。
5. 如果有独立复核人，记录其姓名、角色和复核时间。

在这些字段完成前，本记录不能作为正式风险接受。`release_ready` 必须保持 `false`。
