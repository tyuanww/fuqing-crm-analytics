# M2-07 alpha4 安全风险处置草稿（待项目负责人确认）

## 当前状态

```text
status=PROPOSED_RISK_ACCEPTANCE_PENDING_APPROVAL
release_ready=false
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

## 待确认字段

- [ ] 是否接受上述有限范围风险。
- [ ] 风险接受有效期。
- [ ] 责任人：项目负责人本人。
- [ ] 复查日期。
- [ ] 是否允许进入公司 clean machine 验收。
- [ ] 是否需要在正式发布前重新构建 artifact。

## 结论

在待确认字段完成前，本草稿不能作为正式风险接受。`release_ready` 必须保持 `false`。
