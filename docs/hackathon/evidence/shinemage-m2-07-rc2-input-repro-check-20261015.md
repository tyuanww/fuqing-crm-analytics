# M2-07 rc2 输入复验（2026-10-15）

本轮复验当前工作树是否仍能直接作为 rc2 SDK 的构建输入。检查只读，不修改 DSH 上游、工具链、凭据或受保护目录，也没有启动服务、访问 registry、生成 artifact 或发布。

## 命令与结果

第一次使用相对路径调用检查器，按合同被拒绝：

```text
node dsh-plugins/plugin-kit/check.mjs \
  --upstream .context/dsh-b0/upstream-0.1.7-rc.2 \
  --build-tools dsh-plugins/plugin-kit/build-tools
exit=2
code=KIT_ARGUMENTS_INVALID
```

改用绝对路径后，参数检查通过，但当前 source checkout 缺少检查器要求的已编译 SDK main/types 和一致的 build-tools 输入：

```text
node dsh-plugins/plugin-kit/check.mjs \
  --upstream /Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics/.context/dsh-b0/upstream-0.1.7-rc.2 \
  --build-tools /Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics/dsh-plugins/plugin-kit/build-tools
exit=2
code=KIT_INPUTS_UNAVAILABLE
release_ready=false
```

该结果只说明当前 checkout 是 source-only 或构建产物未保留；它不否定此前隔离临时目录中 `preparation.json` 的 `READY` 回执。此前回执绑定的是已准备的独立输入目录，不能反向证明当前 checkout 仍可直接复用。

同一工作树的供应链合同回归仍通过：

```text
node --test scripts/release/sdk-supply-chain.test.mjs \
  scripts/release/sdk-closure.test.mjs \
  scripts/release/sdk-content-audit.test.mjs \
  scripts/release/attestation-binding.test.mjs

50 tests / 50 pass / 0 fail / 0 skipped
```

`git diff --check` 通过；工作树唯一未跟踪内容仍是受保护目录 `security-audit-skill/`。

## 结论

当前 rc2 的本地检查器输入不能从 source checkout 直接复验为 `READY`，需要在独立目录按固定 source/lock/Node/toolchain 重新准备并保留输入闭包。该复验没有新增正式材料，也没有改变此前 29 个 OSV 公告、17 个 rc2 coverage gaps、缺少 immutable artifact、publisher identity、签名、撤销、干净机器安装/回退和 current-SHA attestation 的结论。

M2-07 继续为 `BLOCKED`，`release_ready=false`；本轮没有代码修改或提交发布动作。
