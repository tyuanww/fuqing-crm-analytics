# M2-07 alpha4 外部交接清单（2026-10-16）

## 目的

本清单用于关闭 M2-07 的外部门禁。它不改变主仓 pin，不执行 production activation，也不执行 canary。

主仓当前必须保持：

```ini
DSH=0.1.7-rc.2
upstream=477b4f420553e8a52c2fbccc464d7561b239c443
```

本清单只针对 alpha4 隔离候选：

| 项目 | 固定值 |
|---|---|
| SDK | `@deepseek-ai/dsh@0.2.1-alpha.4` |
| upstream SHA | `86a402200d95fecef4529d969836f1fe13c6cb0d` |
| SDK artifact SHA-256 | `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6` |
| candidate source SHA | `50d241cbd23aa2a9d188fe84c3864528a2206917` |
| upstream lock SHA-256 | `ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317` |
| Node | `v24.19.0` |
| upstream pnpm | `11.28.5` |
| 插件 pnpm | `11.28.2` |

## 当前本地交付物

本地候选已经完成：

- 官方 host/client SDK 构建。
- 9 个插件构建。
- 9 个 pack reader 验证。
- analytics 测试：`34 pass / 1 skipped`。
- analytics HTML 测试：`130 pass`。
- CRM 全量测试：`108 pass / 0 fail`。
- alpha4 安装、入口导入、最小运行、卸载和 rc2 回退模拟。
- 本地最终预检：9 项一致性检查全部 `PASS`。

本地最终预检回执：

```text
file=.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/local-final-preflight-r1.json
sha256=b2421e08c8230aaabaa74360fdea37c1898159052394aae351c3ce9b1c3f26d6
release_ready=false
```

本地结果仍然是候选结果。它不能代替公司发布身份、签名、吊销检查和 clean machine。

## A. 发布责任方

### 输入

1. 同一个 alpha4 SDK artifact。
2. 上表中的 source SHA、lock SHA、Node 和 pnpm。
3. 9 个插件 pack manifest 和 tarball。
4. 本地候选 SBOM、provenance 和 attestation 输入。

### 必须执行

1. 从固定 source 和 lock 重新生成或确认正式 SDK artifact。
2. 计算正式 artifact SHA-256。
3. 生成正式完整 SBOM。
4. 生成正式 provenance。
5. 写入 publisher identity。
6. 对 artifact 和材料生成 signature。
7. 在独立环境执行 verification。
8. 执行 revocation check。
9. 生成 final attestation。

### 必须交付

- SDK artifact。
- artifact SHA-256。
- 完整 SBOM。
- provenance。
- publisher identity。
- signature。
- independent verification result。
- revocation result。
- final attestation。

### 完成标准

- 正式 artifact SHA 与接收文件一致。
- provenance 的 source、lock、toolchain 与固定值一致。
- SBOM subject 与正式 artifact 一致。
- signature 能在独立环境验证。
- publisher identity 可回溯到公司发布身份。
- revocation result 明确为有效或已批准的状态。
- final attestation 明确绑定 artifact、SBOM、provenance 和 verification。

当前状态：`未完成`。

## B. 安全责任方

### 输入

```text
moderate=8
high=0
critical=0
direct @deepseek-ai/dsh fixAvailable=false
```

审计摘要：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/npm-audit-alpha4-r1-summary.json
```

### 必须执行

1. 检查 8 个 moderate 的影响范围。
2. 检查是否影响当前插件功能和正式部署范围。
3. 选择修复或风险接受。
4. 如果修复，重新构建 artifact、SBOM、provenance 和 signature。
5. 如果接受风险，出具书面批准。

### 风险接受文件必须包含

- advisory 标识。
- 受影响包和版本。
- 影响范围。
- 风险原因。
- 补偿控制措施。
- 有效期。
- 责任人。
- 复查日期。
- 批准人。

### 额外闭包问题

官方 `ui-primitives` 仍把 KaTeX 放在 `devDependencies`。安全责任方和发布责任方必须明确：

1. 这是上游缺陷，还是本次正式包缺陷。
2. 正式运行时是否必须包含 KaTeX。
3. 如果必须包含，正式 SBOM 如何证明 KaTeX 已进入 runtime closure。

当前状态：`未完成`。

## C. clean machine 责任方

### 前置输入

1. 正式 SDK artifact。
2. artifact SHA-256。
3. 正式 SBOM。
4. provenance、signature、verification 和 revocation 材料。
5. 可用的旧版 rc2 artifact。

### 必须执行的顺序

1. 接收正式 artifact。
2. 计算并校验 artifact SHA-256。
3. 校验 SBOM subject 和 closure。
4. 安装 alpha4 SDK。
5. 执行 `dsh --version`。
6. 执行 `dsh --help`。
7. 导入 SDK 入口。
8. 运行最小插件功能。
9. 校验 `katex/dist/katex.min.css`。
10. 卸载 alpha4 SDK。
11. 安装 rc2。
12. 执行 rc2 版本和 `--help` 检查。
13. 验证旧版本可以启动。
14. 保存完整命令、输出、退出码和时间。

### clean machine 回执必须包含

- machine 标识。
- OS 和架构。
- Node 版本。
- pnpm 版本。
- artifact SHA-256。
- SBOM SHA-256。
- 每一步的命令和退出码。
- 安装、卸载和回退结果。
- 失败时的完整原文。

### 完成标准

- 所有步骤通过。
- alpha4 安装成功。
- alpha4 最小功能成功。
- alpha4 卸载成功。
- rc2 回退成功。
- 旧版启动成功。
- 回执中的 artifact SHA 与正式材料一致。

当前状态：`未完成`。本地只有 `LOCAL_SIMULATION_ONLY`。

## D. M2-07 release review

release review 只能在 A、B、C 全部完成后执行。

审核人需要逐项确认：

- [ ] artifact SHA 一致。
- [ ] SBOM closure 完整。
- [ ] npm audit 已修复或已批准风险接受。
- [ ] publisher identity 已验证。
- [ ] signature 已验证。
- [ ] independent verification 已完成。
- [ ] revocation check 已完成。
- [ ] clean machine 已通过。
- [ ] final attestation 已生成。
- [ ] 主仓仍保持 rc2 pin，未混入 alpha4。

审核通过后，M2-07 才能标记为 `CLOSED`，`release_ready` 才能改为 `true`。

## E. 后续任务边界

M2-07 关闭后，才可以执行 M2-08：

1. 15 分钟 SLI。
2. production activation。
3. canary。
4. rollback。

M2-09 继续使用独立 alpha2 candidate。它还需要独立 runner 上的 target browser 和 target recovery 证据。M2-09 不改变主仓 rc2 pin。
