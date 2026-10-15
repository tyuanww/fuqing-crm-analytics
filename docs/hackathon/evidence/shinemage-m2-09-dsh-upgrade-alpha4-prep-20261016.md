# M2-09 DSH alpha4 升级候选准备（2026-10-16）

## 当前结论

官方仓库最新发布是 `v0.2.1-alpha.4`，发布提交为：

```text
86a402200d95fecef4529d969836f1fe13c6cb0d
```

本轮已经在隔离目录准备 alpha4 候选。主仓仍固定：

```ini
DSH=0.1.7-rc.2
upstream=477b4f420553e8a52c2fbccc464d7561b239c443
```

本轮没有修改主仓 DSH pin，没有发布，没有部署，也没有执行 M2-08。

## 固定输入

| 输入 | 值 |
|---|---|
| 官方标签 | `dsh-v0.2.1-alpha.4` |
| 官方源码 SHA | `86a402200d95fecef4529d969836f1fe13c6cb0d` |
| 官方 npm 包 | `@deepseek-ai/dsh@0.2.1-alpha.4` |
| npm artifact SHA-256 | `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6` |
| 候选 source commit | `50d241cbd23aa2a9d188fe84c3864528a2206917` |
| Node | `v24.19.0` |
| upstream pnpm | `11.28.5` |
| 插件 pnpm | `11.28.2` |
| TypeScript | `6.0.3` |
| esbuild | `0.25.12` |

## 本地执行结果

1. alpha4 官方源码 frozen install 通过，lockfile 为 `1725` 个条目。
2. alpha4 官方 host SDK 构建通过。
3. alpha4 官方 client SDK 构建通过。
4. 九个插件构建全部通过。
5. analytics-workbench 测试为 `34 pass / 1 skipped`。
6. analytics-workbench HTML 编辑和浏览器边界测试为 `130 pass`。
7. CRM 完整测试在补齐候选证据目录的仓库级只读路径，并设置 `B0_BUILD_UPSTREAM` 为固定 alpha4 checkout 后通过：`108 pass / 0 fail`。测试日志为 `crm-alpha4-tests-r5.log`。该结果只证明候选代码在固定本地环境通过，不替代公司 clean machine 验收。
8. alpha4 本地运行检查通过：`version`、`help`、入口导入、`katex/dist/katex.min.css`、卸载，以及 rc2 回退。
9. 本地最终预检通过：SDK artifact、upstream lock、toolchain、9 个插件包、provenance、attestation 输入和主仓 pin gate 共 9 项检查全部 `PASS`。回执为 `formal-packs-r2/local-final-preflight-r1.json`，SHA-256 为 `b2421e08c8230aaabaa74360fdea37c1898159052394aae351c3ce9b1c3f26d6`。

官方 kit 的重新 fetch 阶段曾遇到 `fatal: unable to access 'https://github.com/deepseek-ai/deepseek-harness.git/': Error in the HTTP2 framing layer`。本轮使用同一官方 tag 的独立 clone，已校验源码 SHA、lock SHA，并完成 host/client 构建。该网络错误保留为环境记录，不改变已校验 checkout 的内容结论。

alpha4 与 alpha3 的两个兼容点保持相同方向：

- `analytics-workbench` 使用精确的 `RowToast` keyed/factory 类型适配。
- `crm-knowledge` 声明 `katex:^0.18.7` runtime 依赖。

alpha4 官方 `ui-primitives` 仍把 KaTeX 放在 `devDependencies`。候选 overlay 可以解析 CSS，但不能证明官方包 closure 已修复。

## 发布材料状态

已生成候选材料：

- 9 个插件 tarball 和 pack manifest。
- 9/9 pack reader verification。
- CycloneDX SBOM 候选输入。
- provenance 候选输入。
- attestation 输入。
- alpha4 npm closure 和 audit 记录。
- alpha4 本地 runtime 模拟回执。

当前仍为：

```text
release_ready=false
```

alpha4 npm audit 结果为 `8 moderate / 0 high / 0 critical`。直接依赖 `@deepseek-ai/dsh` 的审计项为 `fixAvailable=false`。官方依赖图仍为 `NOT_RESOLVED`。正式 publisher identity、signature、independent verification、revocation 和 final attestation 仍由发布责任方提供。

## 证据路径

- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/npm-official-r1/deepseek-ai-dsh-0.2.1-alpha.4.tgz`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/runtime-check.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/clean-machine-sim-r1/receipt.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/npm-audit-alpha4-r1-summary.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/summary-alpha4-r2.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/verification-alpha4-r2.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/sbom-alpha4-r1.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/provenance-alpha4-r1.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/attestation-inputs-alpha4-r1.json`
- `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/local-final-preflight-r1.json`
- `docs/hackathon/evidence/shinemage-m2-07-alpha4-external-handoff-checklist-20261016.md`

## 下一步顺序

1. 发布责任方提供同一 alpha4 artifact 的正式 SBOM、provenance、publisher identity、signature、verification、revocation 和 final attestation。
2. 安全责任方处理或书面接受 8 个 moderate 漏洞。
3. 公司 clean machine 按“接收 → SHA → SBOM closure → 安装 → import/最小功能 → 卸载 → rc2 回退 → 旧版启动”执行。
4. 材料和正式验收一致后，才评审关闭 M2-07。
5. M2-07 关闭后，才进入 M2-08。
