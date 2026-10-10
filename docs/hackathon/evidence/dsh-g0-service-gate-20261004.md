# D15 服务兼容结果接入候选与回退门禁

日期：2026-10-04。工作树 `codex/plugin-boundary-review`，本次先审查并提交前批验证器，再完成本地门禁。VERSION 与 DSH pin 未改，无 push、发布或杭州操作。

## 已提交基线与新增范围

- 前批兼容验证器/文档由 OCR delegate 选中 2 个 Python，补审 8 个文档，覆盖 10/10、无跳过。正常 hooks 提交为 `d321971f6d56b5148c5715ad0461410290665f66`，提交后工作树曾干净。
- 本次门禁为该提交后的未提交增量。新增 `service-compatibility.mjs`，复用 profile、candidate、release manifest 和 promotion journal；未引入第二套部署账本，未修改上游、业务数据或 UI。
- 显式 D15 profile 绑定精确服务源码、API/SQLite 状态合同、只读/可写访问和保留服务/状态的回退规则。实际兼容回执按原字节嵌入 candidate/manifest，校验完整观测及当前 runner/probe 摘要。
- receiver 核对 payload 内的 profile 与 proof；安装将绑定写入 marker 和 PREPARE_INTENT/PREPARED。激活/回退先检查绑定与 journal，再处理幂等、intent 和指针；本机证据不能放行现场激活。

## 本次真实验证

命令在本工作树运行，Node 24.19.0 / pnpm 11.7.0；共享 backend Python 3.14.4 位于 `/tmp/fuqing-fastapi141-v2-venv/bin/python`，B0 使用 `/tmp/dsh-b0-python314-0200/bin/python`。原始记录均在 `.context/checks/service-gate-review-20261004/`。

| 验证入口 | 本次结果 / 日志 |
|---|---|
| `service-save-compatibility.py --baseline 56198c32a52d9822c7a3338d92b0fa077d1c61bc --candidate a50bd42492195040efaa6989c90e4fe84030551c --output <audit>/compatibility` | 独立进程真实服务源码 **9/9 预期观测**；`compatibility.log`、`compatibility/receipt.json`。旧 writer 不兼容仍是 BLOCKED，不是可写通过。 |
| 同一验证器 CLI 负测 | 已验证 **4/4**，浮动 HEAD、缺失 commit、相同源码、已有输出目录均拒绝；`compatibility/cli-negative-tests.json`。 |
| `node scripts/dsh.mjs test` | 最终 **169 PASS / 0 SKIP**；`release-suite.log`。已验证错误版本、缺证据、篡改、未知字段、特殊文件、旧 writer、安装绑定丢失及 activation/rollback 重试。 |
| `node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python314-0200/bin/python` | **退出 0**；Python **665 PASS**，Node 各阶段合计 **1508 PASS / 1 SKIP**（含 clean 重跑）；`b0.log`、`b0-summary.json`。离线合同、类型、构建与 clean rebuild 通过。 |
| 实际 `pnpm dsh plugin candidate` 对应 CLI | workbench 包使用显式本地试验 profile 与真实 `--service-evidence` 生成成功；`candidate-cli.log`、`plugin-candidate/candidate.json`、`plugin-state.json`。 |
| 实际 `node scripts/release/host-control.mjs activate` | 自有隔离目录、真实兼容回执 **3/3 拒绝负测**：本地证据不足、旧 writer、绑定丢失；均退出 2，journal 未变、无 current 指针、锁释放；`host-cli-negative.json`。 |

B0 只读复用 `B0_BUILD_UPSTREAM=/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public/.context/dsh-b0/upstream-0.1.7-rc.2`；验证后上游 HEAD 仍为 `477b4f420553e8a52c2fbccc464d7561b239c443`，tracked source 干净。B0 唯一 skip 为 `real standalone example keeps filters, chart and edited KPI label` 的既有外部样例条件；不是本轮门禁跳过。Python 有 23 条 warning，不能把此结果称为无告警。

实际候选命令（Node 24 PATH，`<audit>` 为上述证据目录绝对路径）：

```bash
node scripts/dsh.mjs plugin candidate \
  --plugin "$PWD/dsh-plugins/analytics-workbench" \
  --output-dir <audit>/plugin-candidate \
  --state-path <audit>/plugin-state.json \
  --profile .context/checks/service-gate-review-20261004/profile.json \
  --service-evidence <audit>/compatibility/receipt.json
```

本机包为 `@shine-mage/dsh-analytics-workbench-b0@0.0.0-b0`，插件 source SHA 为 `d321971f6d56b5148c5715ad0461410290665f66`；包 SHA-256 为 `5efdbec5d0239bdd5ead109442a30430163b867d684bf0168cc31ca59a44321d`，421582 bytes。candidate digest 为 `0df675b839885286da2880ee8656b3757c82aac3e36ffdcac53a9881e7c8031d`。门禁构建器本身是本次未提交源码，不能把该包描述成最终 reviewed release；最终交付仍需从干净提交重建。

## 审查与失败修复

OCR delegate 最终覆盖 **23/23** 路径：12 个代码/合同文件，补审 11 个文档，0 跳过。`gate-preview-final.json`、`gate-rules.json`、`gate-coverage.json` 和 `gate-summary.json` 记录规则及源码摘要；主 Agent 审查，不调用外部模型。下述缺陷已修复，没有未关闭的本轮代码发现；末节的产品/现场门禁仍开放。没有将测试夹具当作生产证据。11 个 JS 文件语法、Markdown 本地链接和 `git diff --check` 均通过。

1. 严格观测字段校验上线后，缺少 `database_unchanged` 会更早返回 `SERVICE_CASE_SHAPE`；首轮 release suite **167 PASS / 1 FAIL** 的旧断言不匹配。保留 `release-suite-before.log`，修正断言，并另验证字段存在但值为 false 的拒绝路径。
2. 已验证安装后删掉 marker 的 service binding 可落入 legacy activation。`marker-loss-before.log` 先复现 `Missing expected rejection`；修复安装 journal 持久绑定及目标/历史要求核对后，`marker-loss-after.log` 和最终 release suite 通过。真实 CLI 也验证丢失绑定后不改 journal/指针。

## 仍然开放

- `LOCAL_COMPATIBLE`、`release_ready=false`；签名/来源信任、最终服务包与独立依赖安装、主机身份和实际写权限尚未证明。当前服务声明的 activation/rollback 明确返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`，没有 override；此阶段只实现安全拒绝，尚未实现现场放行。
- 兼容回执是本机 POSIX 合成 SQLite/ASGI 源码观测，不是完整服务 artifact、WSL、真实 CRM、生产 RPO/RTO 或认证证明；JSON 摘要不是数字签名。
- DSH 保存 UI/provider/生产 profile 仍未启用。生产形状时限/UNKNOWN、浏览器、目标平台与 canary/现场回退仍 NOT_RUN。物理分仓继续等待 G0/stop-go。
- 未声明服务的历史 release 保留原行为，不追认其通过 D15 状态兼容。普通插件无需新增业务服务依赖。

当前计划、待办、接口与运行边界分别见 [STATUS](../../../STATUS.md)、[TODOS](../TODOS.md)、[兼容合同](../../architecture/first-purchase-service-compatibility.md)与[拆分计划](../../plans/shinemage-plugin-platform-split.md)。
