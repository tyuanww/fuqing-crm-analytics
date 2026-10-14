# M2-08 release 门禁复核（2026-10-14）

本轮只运行本地 release-readiness 检查，没有 push、receive、部署、激活、canary、rollback 或 live 切换。

## 实际命令

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs verify --scope release
```

环境检查通过：Node `24.19.0`、pnpm `11.28.2`、Python `3.14.4`、zstd、rc2 upstream SHA `477b4f42…` 和 release schemas 均匹配。

## 当前阻塞

检查器报告 3 个 release blocker：

```text
RELEASE_BLOCKED_DIRTY_WORKTREE
PREFLIGHT_PLUGIN_PACKS_INVALID
RELEASE_UPSTREAM_RUNTIME_REQUIRED
```

具体事实：

1. 工作树有 1 个未跟踪目录 `security-audit-skill/`。它是项目规则标记的任务外受保护目录，不能删除或加入当前提交；正式 release 需要从干净 reviewed commit 建立独立 checkout，不能修改该目录来伪造 clean tree。
2. 当前 release scope 没有通过 `DSH_PROFILE_PACK_INPUTS` 提供与选定 profile 绑定的正式 pack inputs。已有 `.context` 候选 pack 是验收证据，不会自动成为 release 输入。
3. 缺少名称为 `shinemage-dsh-upstream-runtime-477b4f420553e8a52c2fbccc464d7561b239c443.tar.zst` 的固定 rc2 upstream runtime bundle；不能用工作树 checkout 或 alpha2 candidate SDK 代替。

此外，release scope 的 WSL2 cold runtime/WAL、host HTTP 和 15 分钟 SLI 证据仍为 `NOT_RUN`。因此本轮结果为：

```text
release-readiness=BLOCKED
activation=NOT_RUN
release_ready=false
```

## 下一步

需要先准备独立 clean reviewed checkout、正式 profile pack inputs 和固定 rc2 runtime bundle，再重跑 release preflight。M2-05 的 Aside Computer Use 焦点证据不会绕过 M2-08 的供应链、runtime、WSL2 和 SLI 门禁。
