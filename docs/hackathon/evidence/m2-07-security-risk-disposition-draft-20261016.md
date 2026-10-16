# M2-07 alpha4 安全风险处置草稿（待项目负责人确认）

## 当前状态

```text
status=OFFLINE_OWNER_APPROVED
release_ready=false
decision=PROPOSED_LIMITED_SCOPE_RISK_ACCEPTANCE
effective_from=2026-10-16
effective_until=2026-11-16
decision_maker=天元
decision_maker_role=AI赋能工程师
approval_record=m2-07-security-risk-acceptance-record-20261016.md
```

本文件是风险处置草稿。它不是安全责任方批准，也不是正式发布授权。

## 对象

```text
SDK=@deepseek-ai/dsh@0.2.1-alpha.4
artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
```

审计摘要：

```text
moderate=8
high=0
critical=0
direct @deepseek-ai/dsh fixAvailable=false
```

原始摘要：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/npm-audit-alpha4-r1-summary.json
```

## 受影响包

| 包 | 严重度 | 是否直接依赖 | 是否有自动修复 |
|---|---:|---:|---:|
| `@deepseek-ai/dsh` | moderate | 是 | 否 |
| `@deepseek-ai/dsh-office-to-pdf` | moderate | 否 | 是 |
| `@deepseek-ai/dsh-sdk-app` | moderate | 否 | 是 |
| `@deepseek-ai/dsh-sdk-minimal` | moderate | 否 | 是 |
| `@deepseek-ai/dsh-skill-office` | moderate | 否 | 否 |
| `@deepseek-ai/dsh-web-app` | moderate | 否 | 是 |
| `@deepseek-ai/libreoffice-kit` | moderate | 否 | 否 |
| `fflate` | moderate | 否 | 否 |

`fflate` advisory：

```text
GHSA-px8p-9vwx-vf98
fflate unzipSync can enter an infinite loop when parsing malformed ZIP64 archives
range >=0.8.0 <0.8.3
```

## 推荐填写结果

以下内容是本轮推荐值。项目负责人已经通过离线记录确认。该记录适用于当前项目范围；如果公司要求独立安全责任方复核，仍需补充独立记录。

| 字段 | 推荐值 |
|---|---|
| 处置决定 | 接受有限范围风险，并执行补偿控制 |
| 适用范围 | `@deepseek-ai/dsh@0.2.1-alpha.4`，只限固定 SHA 的隔离候选和 clean machine 验收 |
| 不允许的范围 | production activation、canary、面向外部用户的正式 release、浮动依赖替换 |
| 风险接受开始 | `2026-10-16` |
| 风险接受结束 | `2026-11-16`，或上游修复并重新构建 artifact 后提前结束 |
| 责任人 | 项目负责人本人 |
| 安全复核人 | 项目负责人本人，按公司流程补充安全复核记录 |
| 是否允许 clean machine | 允许，但只用于隔离验收和证据收集 |
| 是否允许 release | 不允许。M2-07 在正式材料齐全前保持 `BLOCKED` |
| 是否需要重新构建 | 当前先不重建。若 dependency closure 或上游修复改变，则必须重新构建并重新审计 |

## 推荐处置

推荐先采用“有限范围风险接受”，原因如下：

1. 直接依赖 `@deepseek-ai/dsh` 没有自动修复版本。
2. 强行替换上游 SDK 依赖会改变 SDK 行为和插件兼容性。
3. 当前没有 high 或 critical 项。
4. 当前候选只在隔离 synthetic 环境验证。
5. M2-07 仍然不能在没有正式批准的情况下变为 `release_ready=true`。

## 建议补偿措施

以下措施需要项目负责人确认是否可执行：

1. 仅允许固定 artifact SHA 的 SDK 进入验收。
2. 不接受浮动版本和未登记的依赖替换。
3. 插件只处理已定义的输入合同。
4. 对压缩包和外部文件输入执行大小、格式和错误处理限制。
5. 不把用户可控的 malformed ZIP64 输入直接交给不受限的解压路径。
6. 记录 npm audit 结果和上游修复跟踪号。
7. 在下一个 alpha 或稳定版本重新执行审计。

## 推荐审批结论

```text
decision=ACCEPT_WITH_COMPENSATING_CONTROLS
scope=ISOLATED_ALPHA4_VALIDATION_ONLY
production_release=DENIED
production_activation=DENIED
canary=DENIED
review_due=2026-11-16
approval_status=OFFLINE_OWNER_APPROVED
```

正式审批时，需要确认以下事实：

1. artifact SHA 仍为 `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6`。
2. 只使用固定 Node、pnpm、lock 和 source commit。
3. malformed ZIP64 输入不会进入不受限的解压路径。
4. 风险接受不会授权 production activation、canary 或正式 release。
5. `2026-11-16` 前重新检查上游修复、dependency closure 和 npm audit。

## 待确认字段

- [x] 是否接受上述有限范围风险：项目负责人已确认接受。
- [x] 风险接受有效期：`2026-10-16` 至 `2026-11-16`。
- [x] 责任人：项目负责人天元，角色为 AI赋能工程师。
- [x] 复查日期：`2026-11-16`。
- [x] 是否允许进入公司 clean machine 验收：允许，仅限隔离验收。
- [x] 是否需要在正式发布前重新构建 artifact：当前不需要；若 closure 或上游修复变化，则必须重建。
- [ ] 独立安全责任方复核记录：如果公司制度要求，待补充。

## 结论

推荐值已经填入。项目负责人天元已经通过离线记录确认。该确认只允许隔离验收，不授权正式发布。`release_ready` 必须保持 `false`。
